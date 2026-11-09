import {
  StateAssembler,
  decodeInputs,
  decodeSaveChunk,
  decodeStateChunk,
  encodeInputs,
  encodeSaveChunks,
  encodeStateChunks,
  type InputFrame,
} from "../../../packages/net/codec.ts";
import { delayFromRtt } from "../../../packages/net/lockstep.ts";

export type Role = "host" | "guest";

interface SignalOffer { kind: "offer"; sdp: string; gen?: number }
interface SignalAnswer { kind: "answer"; sdp: string; gen?: number }
interface SignalIce { kind: "ice"; candidate: RTCIceCandidateInit | null; gen?: number }
interface SignalReady { kind: "ready"; gen?: number }
type Signal = SignalOffer | SignalAnswer | SignalIce | SignalReady;

export interface Snapshot {
  frame: number;
  state: Uint8Array;
  delay: number;
}

export interface ChatLine {
  from: Role;
  name?: string;
  text: string;
  at: number;
}

export interface Seat {
  here: boolean;
  control: string;
  name: string;
}

interface SessionOptions {
  code: string;
  role: Role;
  gameId: string;
  sha1: string;
  onStatus: (text: string) => void;
  onStart: (slot: 0 | 1, delay: number) => void;
  onRemote: (frames: InputFrame[]) => void;
  onPause: () => void;
  onResume: (snapshot: Snapshot) => void;
  onCheck: (frame: number, hash: number) => void;
  onClose: (reason: string) => void;
  onReset: (net: { slot: 0 | 1; delay: number } | null) => void;
  onResetAsk: (name: string) => void;
  onResetAnswer: (yes: boolean) => void;
  onChat: (line: ChatLine) => void;
  onChatLog: (lines: ChatLine[]) => void;
  onTyping: (from: Role, on: boolean) => void;
  onRoster: (roster: { host: Seat; guest: Seat }) => void;
  onSaveOffer: (offer: { id: number; name: string; label: string; state: Uint8Array }) => void;
  onSaveAnswer: (id: number, yes: boolean) => void;
  onSwap: (slot: 0 | 1) => void;
  onSwapBusy: () => void;
  checkpoint: () => Promise<Snapshot>;
}

function fnv(bytes: Uint8Array) {
  let hash = 2166136261;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export class OnlineSession {
  private ws: WebSocket | null = null;
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private iceServers: RTCIceServer[] = [];
  private pendingIce: { gen: number; candidate: RTCIceCandidateInit }[] = [];
  private outgoing = new Map<number, number>();
  private assembler = new StateAssembler();
  private started = false;
  private slot: 0 | 1 = 0;
  private delay = 2;
  private closed = false;
  private reconnectUntil = 0;
  private lastSnapshot: Snapshot | null = null;
  private pingTimer = 0;
  private resendTimer = 0;
  private awaitingSync = false;
  private resumed = false;
  private pingAt = 0;
  private epoch = 0;
  private saveSeq = 0;
  private saveAssembler = new StateAssembler();
  private saveMeta: { id: number; name: string; label: string } | null = null;
  private resetGen = 0;
  private resetOffer: "out" | "in" | null = null;
  private control = "Teclado";
  private name = "";
  private opened = false;
  private attempts = 0;
  private offerGen = 0;
  private offeredAt = 0;
  private retryNotBefore = 0;
  private linkTries = 0;
  private guestNudge = 0;
  private linkTimer = 0;
  private linkToken = 0;
  private syncTimer = 0;
  private syncSends = 0;
  private syncedFrame = -1;
  private synced = false;
  private swapBusy = false;
  private swapAsked = false;
  private gate: Promise<void> = Promise.resolve();

  constructor(private opts: SessionOptions) {
    this.slot = opts.role === "host" ? 0 : 1;
  }

  get role(): Role {
    return this.opts.role;
  }

  playSlot(): 0 | 1 {
    return this.slot;
  }

  requestSwap(): boolean {
    if (this.closed || !this.linked()) return false;
    if (this.opts.role === "host") {
      if (this.swapBusy) return false;
      this.beginSwap();
      return true;
    }
    if (this.swapAsked) return false;
    this.swapAsked = true;
    this.sendJson({ t: "swap-ask" });
    window.setTimeout(() => {
      this.swapAsked = false;
    }, 3000);
    return true;
  }

  async open() {
    const response = await fetch("/api/ice");
    if (!response.ok) throw new Error("O servidor de sala não respondeu.");
    const body = await response.json() as { iceServers: RTCIceServer[] };
    this.iceServers = body.iceServers;
    this.connectSocket();
  }

  noteInputs(frames: InputFrame[]) {
    for (const frame of frames) this.outgoing.set(frame.frame, frame.buttons);
    const keys = [...this.outgoing.keys()].sort((a, b) => a - b);
    for (const key of keys.slice(0, Math.max(0, keys.length - 24))) this.outgoing.delete(key);
    this.flushInputs();
  }

  sendCheck(frame: number, hash: number) {
    this.sendJson({ t: "check", frame, hash });
  }

  sendChat(text: string) {
    const trimmed = text.trim().slice(0, 200);
    if (!trimmed) return;
    this.socketSend({ t: "chat", text: trimmed });
  }

  sendTyping(on: boolean) {
    this.socketSend({ t: "typing", on });
  }

  linked(): boolean {
    return this.started && this.channel?.readyState === "open";
  }

  inputDelay(): number {
    return Math.min(8, Math.max(2, this.delay || 2));
  }

  proposeSave(label: string, state: Uint8Array): number {
    const id = ++this.saveSeq;
    this.sendJson({ t: "save-ask", id, name: this.name, label });
    if (this.channel?.readyState === "open") {
      for (const chunk of encodeSaveChunks(id, fnv(state), state)) this.channel.send(chunk);
    }
    return id;
  }

  answerSave(id: number, yes: boolean) {
    this.sendJson({ t: yes ? "save-yes" : "save-no", id });
  }

  acceptSave(state: Uint8Array) {
    this.epoch += 1;
    this.outgoing.clear();
    this.resumed = true;
    this.started = true;
    this.awaitingSync = false;
    const delay = this.inputDelay();
    this.delay = delay;
    this.opts.onResume({ frame: 0, state, delay });
  }

  proposeReset(): boolean {
    if (this.closed || this.channel?.readyState !== "open" || !this.started || this.resetOffer) return false;
    this.resetOffer = "out";
    this.sendJson({ t: "reset-ask", name: this.name || "O outro jogador" });
    return true;
  }

  answerReset(yes: boolean) {
    const offer = this.resetOffer;
    this.resetOffer = null;
    if (!yes) {
      this.sendJson({ t: "reset-no" });
      return;
    }
    if (offer !== "in" && offer !== "out") return;
    if (this.opts.role === "host") this.broadcastReset();
    else this.sendJson({ t: "reset-yes" });
  }

  cancelReset() {
    if (this.resetOffer) this.sendJson({ t: "reset-no" });
    this.resetOffer = null;
  }

  setProfile(control: string, name: string) {
    this.control = control.slice(0, 40);
    this.name = name.slice(0, 20);
    this.socketSend({ t: "profile", control: this.control, name: this.name });
  }

  close() {
    this.closed = true;
    this.resetOffer = null;
    this.swapBusy = false;
    this.swapAsked = false;
    window.clearInterval(this.pingTimer);
    window.clearInterval(this.resendTimer);
    window.clearTimeout(this.linkTimer);
    window.clearTimeout(this.syncTimer);
    this.channel?.close();
    this.pc?.close();
    this.ws?.close();
  }

  private connectSocket() {
    const params = new URLSearchParams({
      role: this.opts.role,
      game: this.opts.gameId,
      sha1: this.opts.sha1,
    });
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const previous = this.ws;
    if (previous) {
      previous.onclose = null;
      previous.close();
    }
    const socket = new WebSocket(`${proto}//${location.host}/api/rooms/${this.opts.code}?${params}`);
    this.ws = socket;
    const giveUp = window.setTimeout(() => {
      if (this.ws === socket && socket.readyState === WebSocket.CONNECTING) socket.close();
    }, 4000);
    socket.onopen = () => {
      window.clearTimeout(giveUp);
      this.opened = true;
      this.attempts = 0;
      this.socketSend({ t: "profile", control: this.control, name: this.name });
      this.opts.onStatus(this.opts.role === "host" ? `Sala ${this.opts.code}. Manda o código.` : "Entrou na sala. Conectando…");
    };
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as {
        t?: string;
        data?: Signal;
        from?: Role;
        name?: string;
        text?: string;
        at?: number;
        messages?: ChatLine[];
        host?: Seat;
        guest?: Seat;
        on?: boolean;
      };
      if (message.t === "peer") this.onPeer();
      if (message.t === "peer-left") this.onPeerLeft();
      if (message.t === "signal" && message.data) {
        const data = message.data;
        this.kick(() => this.onSignal(data));
      }
      if (message.t === "typing" && (message.from === "host" || message.from === "guest")) {
        this.opts.onTyping(message.from, message.on === true);
      }
      if (message.t === "chat" && message.from && message.text) {
        this.opts.onChat({
          from: message.from,
          name: message.name?.trim() || undefined,
          text: message.text,
          at: message.at ?? Date.now(),
        });
      }
      if (message.t === "chat-log" && message.messages) this.opts.onChatLog(message.messages);
      if (message.t === "roster" && message.host && message.guest) {
        this.opts.onRoster({ host: message.host, guest: message.guest });
      }
    };
    socket.onclose = () => {
      window.clearTimeout(giveUp);
      if (this.closed || this.ws !== socket) return;
      if (!this.opened) {
        this.attempts += 1;
        if (this.attempts < 4) {
          this.opts.onStatus(`Sala ${this.opts.code}. Conectando…`);
          window.setTimeout(() => {
            if (!this.closed) this.connectSocket();
          }, 200 * this.attempts);
          return;
        }
        this.opts.onClose("Não deu para abrir a sala. Tenta de novo.");
        this.close();
        return;
      }
      this.reconnectUntil = this.reconnectUntil || performance.now() + 15000;
      if (performance.now() > this.reconnectUntil) {
        this.opts.onClose("A sala caiu.");
        return;
      }
      this.opts.onPause();
      this.opts.onStatus("A sala caiu. Tentando de novo…");
      window.setTimeout(() => {
        if (!this.closed) this.connectSocket();
      }, 700);
    };
  }

  private socketSend(message: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
  }

  private signal(data: Signal) {
    this.socketSend({ t: "signal", data });
  }

  private kick(task: () => Promise<void>) {
    this.gate = this.gate.then(task).then(() => undefined, () => undefined);
  }

  private onPeer() {
    this.linkTries = 0;
    this.guestNudge = 0;
    this.retryNotBefore = 0;
    this.offeredAt = 0;
    if (this.opts.role === "host") this.kick(() => this.startOffer());
    else this.armRetry();
  }

  private dialing(): boolean {
    const pc = this.pc;
    if (!pc || this.offeredAt <= 0 || performance.now() - this.offeredAt >= 8000) return false;
    if (pc.connectionState === "failed" || pc.connectionState === "closed" || pc.iceConnectionState === "failed") return false;
    const state = this.channel?.readyState;
    return state == null || state === "connecting";
  }

  private requestRetry() {
    if (this.closed || this.opts.role !== "host" || this.channel?.readyState === "open") return;
    if (performance.now() < this.retryNotBefore) return;
    if (this.linkTries >= 4) {
      this.opts.onStatus("Não deu para ligar a partida.");
      return;
    }
    this.linkTries += 1;
    this.retryNotBefore = performance.now() + 8000;
    this.opts.onStatus("Ligando a partida de novo…");
    this.kick(() => this.startOffer());
  }

  private armRetry() {
    window.clearTimeout(this.linkTimer);
    const token = ++this.linkToken;
    const wait = this.opts.role === "guest" && this.offerGen === 0 ? 3000 : 8000;
    this.linkTimer = window.setTimeout(() => {
      if (token !== this.linkToken || this.closed || this.channel?.readyState === "open") return;
      if (this.opts.role === "host") {
        this.retryNotBefore = 0;
        this.requestRetry();
        return;
      }
      if (this.guestNudge >= 4) {
        this.opts.onStatus("Não deu para ligar a partida.");
        return;
      }
      this.guestNudge += 1;
      this.opts.onStatus("Ligando a partida de novo…");
      this.signal({ kind: "ready", gen: this.offerGen });
      this.armRetry();
    }, wait);
  }

  private waitIce(pc: RTCPeerConnection): Promise<void> {
    if (pc.iceGatheringState === "complete" || pc.connectionState === "closed") return Promise.resolve();
    return new Promise((resolve) => {
      const finish = () => {
        pc.removeEventListener("icegatheringstatechange", onState);
        window.clearTimeout(timer);
        resolve();
      };
      const onState = () => {
        if (pc.iceGatheringState === "complete") finish();
      };
      pc.addEventListener("icegatheringstatechange", onState);
      const timer = window.setTimeout(finish, 2000);
    });
  }

  private newPeer(gen: number): RTCPeerConnection {
    const previous = this.pc;
    this.channel = null;
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.pc = pc;
    previous?.close();
    pc.onicecandidate = (event) => {
      if (gen !== this.offerGen || pc !== this.pc) return;
      this.signal({ kind: "ice", candidate: event.candidate?.toJSON() ?? null, gen });
    };
    const failed = () => {
      if (pc !== this.pc || this.closed) return;
      if (pc.connectionState !== "failed" && pc.iceConnectionState !== "failed") return;
      this.offeredAt = 0;
      this.retryNotBefore = 0;
      if (this.opts.role === "host") this.requestRetry();
      else this.signal({ kind: "ready", gen });
    };
    pc.onconnectionstatechange = failed;
    pc.oniceconnectionstatechange = failed;
    pc.ondatachannel = (event) => {
      if (pc !== this.pc) return;
      this.bindChannel(event.channel);
    };
    return pc;
  }

  private async startOffer() {
    if (this.closed || this.opts.role !== "host" || this.channel?.readyState === "open" || this.dialing()) return;
    const gen = ++this.offerGen;
    if (!this.synced) {
      this.started = false;
      this.resumed = false;
      this.awaitingSync = false;
      this.epoch += 1;
    }
    this.assembler = new StateAssembler();
    this.retryNotBefore = performance.now() + 8000;
    const pc = this.newPeer(gen);
    this.bindChannel(pc.createDataChannel("play", { ordered: true }));
    try {
      const offer = await pc.createOffer();
      if (gen !== this.offerGen || this.closed || pc !== this.pc) return;
      await pc.setLocalDescription(offer);
      await this.waitIce(pc);
      if (gen !== this.offerGen || this.closed || pc !== this.pc) return;
      const sdp = pc.localDescription?.sdp || offer.sdp || "";
      if (!sdp) throw new Error("sdp");
      this.offeredAt = performance.now();
      this.signal({ kind: "offer", sdp, gen });
    } catch {
      if (gen !== this.offerGen || this.closed) return;
      this.offeredAt = 0;
      this.retryNotBefore = 0;
      this.requestRetry();
      return;
    }
    this.armRetry();
  }

  private async onSignal(data: Signal) {
    const gen = typeof data.gen === "number" ? data.gen : 0;
    if (data.kind === "ready") {
      if (this.opts.role !== "host" || this.channel?.readyState === "open" || this.dialing()) return;
      this.offeredAt = 0;
      this.retryNotBefore = 0;
      if (this.offerGen === 0) {
        await this.startOffer();
        return;
      }
      this.requestRetry();
      return;
    }
    if (data.kind === "offer") {
      await this.acceptOffer(data.sdp, gen);
      return;
    }
    if (data.kind === "answer") {
      await this.acceptAnswer(data.sdp, gen);
      return;
    }
    if (data.kind === "ice") await this.applyIce(gen, data.candidate);
  }

  private async acceptOffer(sdp: string, gen: number) {
    if (this.opts.role !== "guest" || this.closed || !sdp || gen < this.offerGen) return;
    if (gen === this.offerGen && (this.channel?.readyState === "open" || this.dialing())) return;
    this.offerGen = gen;
    if (!this.synced) {
      this.started = false;
      this.resumed = false;
      this.awaitingSync = false;
    }
    this.assembler = new StateAssembler();
    const pc = this.newPeer(gen);
    await pc.setRemoteDescription({ type: "offer", sdp });
    if (gen !== this.offerGen || pc !== this.pc || this.closed) return;
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await this.waitIce(pc);
    if (gen !== this.offerGen || pc !== this.pc || this.closed) return;
    this.offeredAt = performance.now();
    this.signal({ kind: "answer", sdp: pc.localDescription?.sdp || answer.sdp || "", gen });
    await this.flushIce(gen);
    this.armRetry();
  }

  private async acceptAnswer(sdp: string, gen: number) {
    if (this.opts.role !== "host" || this.closed || !this.pc || !sdp || gen !== this.offerGen) return;
    if (this.pc.signalingState !== "have-local-offer") return;
    await this.pc.setRemoteDescription({ type: "answer", sdp });
    await this.flushIce(gen);
  }

  private async applyIce(gen: number, candidate: RTCIceCandidateInit | null) {
    if (!candidate || (this.offerGen !== 0 && gen < this.offerGen)) return;
    const pc = this.pc;
    if (!pc || pc.signalingState === "closed" || gen !== this.offerGen || !pc.remoteDescription) {
      this.pendingIce.push({ gen, candidate });
      if (this.pendingIce.length > 64) this.pendingIce.splice(0, this.pendingIce.length - 64);
      return;
    }
    try { await pc.addIceCandidate(candidate); }
    catch { /* o candidato já entrou no anúncio, ou é de uma tentativa anterior */ }
  }

  private async flushIce(gen: number) {
    const mine = this.pendingIce.filter((item) => item.gen === gen);
    this.pendingIce = this.pendingIce.filter((item) => item.gen > gen);
    for (const item of mine) {
      if (!this.pc || this.pc.signalingState === "closed") return;
      try { await this.pc.addIceCandidate(item.candidate); }
      catch { /* o candidato já entrou no anúncio */ }
    }
  }

  private bindChannel(channel: RTCDataChannel) {
    const gen = this.offerGen;
    channel.binaryType = "arraybuffer";
    channel.onopen = () => {
      if (gen !== this.offerGen || this.closed) return;
      this.channel = channel;
      this.awaitingSync = false;
      this.resumed = false;
      this.linkTries = 0;
      this.guestNudge = 0;
      window.clearInterval(this.resendTimer);
      this.resendTimer = window.setInterval(() => this.flushInputs(), 50);
      window.clearTimeout(this.linkTimer);
      this.reconnectUntil = 0;
      this.opts.onPause();
      if (!this.started) {
        this.opts.onStatus("Alinhando a partida…");
        if (this.opts.role === "host") {
          this.pingAt = performance.now();
          this.sendJson({ t: "ping", ms: this.pingAt });
          window.setTimeout(() => {
            if (!this.started && !this.closed && gen === this.offerGen) void this.align(3);
          }, 1000);
        }
      } else if (this.opts.role === "host") {
        void this.pushCheckpoint();
      }
    };
    channel.onmessage = (event) => {
      if (gen !== this.offerGen) return;
      this.onPlay(event.data);
    };
    channel.onclose = () => {
      if (gen !== this.offerGen || this.closed) return;
      if (this.channel && this.channel !== channel) return;
      this.awaitingSync = false;
      this.resumed = false;
      this.offeredAt = 0;
      this.opts.onPause();
      this.opts.onStatus("Conexão caiu. Tentando de novo…");
      this.reconnectUntil = performance.now() + 15000;
      this.retryNotBefore = 0;
      if (this.opts.role === "host") this.requestRetry();
      else this.signal({ kind: "ready", gen });
    };
  }

  private fail(reason: string) {
    this.sendJson({ t: "fail", text: reason });
    this.opts.onClose(reason);
    this.close();
  }

  private async align(delay: number) {
    if (this.started || this.closed || this.opts.role !== "host") return;
    this.started = true;
    const chosen = Number.isFinite(delay) ? Math.round(delay) : 2;
    this.delay = Math.min(8, Math.max(2, chosen));
    const epoch = this.epoch;
    this.syncSends = 0;
    const snapshot = await this.opts.checkpoint();
    if (this.closed || epoch !== this.epoch) return;
    this.sendSnapshot(0, snapshot.state);
  }

  private broadcastReset() {
    this.resetOffer = null;
    this.epoch += 1;
    this.resetGen += 1;
    this.outgoing.clear();
    this.resumed = true;
    this.awaitingSync = false;
    const delay = Math.min(8, Math.max(2, this.delay || 2));
    this.delay = delay;
    this.sendJson({ t: "reset", n: this.resetGen, delay });
    this.opts.onReset({ slot: this.slot, delay });
  }

  private prepareResync() {
    this.resumed = false;
    this.syncedFrame = -1;
    this.awaitingSync = false;
    this.assembler = new StateAssembler();
    window.clearTimeout(this.syncTimer);
  }

  private beginSwap() {
    if (this.swapBusy || this.closed || !this.linked()) return;
    this.swapBusy = true;
    this.slot = this.slot === 0 ? 1 : 0;
    this.epoch += 1;
    this.outgoing.clear();
    this.prepareResync();
    this.sendJson({ t: "swap", slot: this.slot });
    this.opts.onPause();
    this.opts.onSwap(this.slot);
    const epoch = this.epoch;
    void this.pushCheckpoint().finally(() => {
      if (this.closed || this.epoch !== epoch || !this.awaitingSync) this.swapBusy = false;
    });
  }

  private async pushCheckpoint() {
    const epoch = this.epoch;
    this.syncSends = 0;
    const snapshot = await this.opts.checkpoint();
    if (this.closed || epoch !== this.epoch) return;
    this.sendSnapshot(snapshot.frame, snapshot.state);
  }

  private sendSnapshot(frame: number, state: Uint8Array) {
    const channel = this.channel;
    const gen = this.offerGen;
    if (!channel || channel.readyState !== "open") return;
    if (!state.byteLength || this.delay < 1) {
      this.fail("Não deu para alinhar a partida.");
      return;
    }
    this.lastSnapshot = { frame, state, delay: this.delay };
    this.awaitingSync = true;
    const hash = fnv(state);
    try {
      for (const chunk of encodeStateChunks(frame, this.delay, hash, state)) channel.send(chunk);
    } catch {
      if (this.offerGen === gen && this.channel === channel) this.fail("Não deu para alinhar a partida.");
      return;
    }
    this.syncSends += 1;
    window.clearTimeout(this.syncTimer);
    if (this.syncSends >= 3) {
      if (!this.swapBusy) return;
      this.syncTimer = window.setTimeout(() => {
        if (this.closed || this.resumed || !this.awaitingSync) return;
        this.fail("Não deu para trocar os jogadores.");
      }, 2000);
      return;
    }
    this.syncTimer = window.setTimeout(() => {
      if (this.closed || !this.awaitingSync || !this.lastSnapshot || this.offerGen !== gen) return;
      this.sendSnapshot(this.lastSnapshot.frame, this.lastSnapshot.state);
    }, 2000);
  }

  private onPlay(data: unknown) {
    if (typeof data === "string") {
      const message = JSON.parse(data) as {
        t: string;
        ms?: number;
        text?: string;
        frame?: number;
        hash?: number;
        n?: number;
        delay?: number;
        id?: number;
        name?: string;
        label?: string;
        slot?: number;
      };
      if (message.t === "swap-ask" && this.opts.role === "host") {
        if (this.swapBusy || !this.linked()) this.sendJson({ t: "swap-busy" });
        else this.beginSwap();
      }
      if (message.t === "swap-busy" && this.opts.role === "guest") {
        this.swapAsked = false;
        this.opts.onSwapBusy();
      }
      if (message.t === "swap" && this.opts.role === "guest" && (message.slot === 0 || message.slot === 1)) {
        this.swapAsked = false;
        this.slot = message.slot === 0 ? 1 : 0;
        this.outgoing.clear();
        this.prepareResync();
        this.opts.onPause();
        this.opts.onSwap(this.slot);
      }
      if (message.t === "reset-ask" && this.started) {
        const name = message.name?.trim() || "O outro jogador";
        if (this.resetOffer === "out") {
          this.resetOffer = null;
          if (this.opts.role === "host") this.broadcastReset();
          else this.sendJson({ t: "reset-yes" });
        } else if (!this.resetOffer) {
          this.resetOffer = "in";
          this.opts.onResetAsk(name);
        }
      }
      if (message.t === "reset-yes" && this.resetOffer === "out" && this.opts.role === "host") {
        this.resetOffer = null;
        this.broadcastReset();
      }
      if (message.t === "reset-no") {
        this.resetOffer = null;
        this.opts.onResetAnswer(false);
      }
      if (message.t === "reset" && typeof message.n === "number" && message.n > this.resetGen) {
        this.resetOffer = null;
        this.resetGen = message.n;
        this.epoch += 1;
        this.outgoing.clear();
        this.resumed = true;
        this.awaitingSync = false;
        const delay = typeof message.delay === "number" ? Math.min(8, Math.max(2, Math.round(message.delay))) : this.delay;
        this.delay = delay;
        this.started = true;
        this.opts.onReset({ slot: this.slot, delay });
      }
      if (message.t === "ping") this.sendJson({ t: "pong", ms: message.ms });
      if (message.t === "pong" && this.opts.role === "host" && !this.started) {
        void this.align(delayFromRtt(performance.now() - this.pingAt));
      }
      if (message.t === "fail") {
        this.opts.onClose(message.text ?? "Não deu para alinhar a partida.");
        this.close();
        return;
      }
      if (message.t === "save-ask" && typeof message.id === "number") {
        this.saveMeta = { id: message.id, name: message.name?.trim() || "O outro jogador", label: message.label?.trim() || "agora" };
        this.saveAssembler = new StateAssembler();
      }
      if ((message.t === "save-yes" || message.t === "save-no") && typeof message.id === "number") {
        this.opts.onSaveAnswer(message.id, message.t === "save-yes");
      }
      if (message.t === "check" && typeof message.frame === "number" && typeof message.hash === "number") {
        this.opts.onCheck(message.frame, message.hash);
      }
      if (message.t === "sync-ok" && this.awaitingSync && this.lastSnapshot && !this.resumed) {
        window.clearTimeout(this.syncTimer);
        this.awaitingSync = false;
        this.resumed = true;
        this.started = true;
        this.synced = true;
        this.swapBusy = false;
        this.linkTries = 0;
        this.opts.onResume(this.lastSnapshot);
      }
      return;
    }
    if (!(data instanceof ArrayBuffer)) return;
    const save = decodeSaveChunk(data);
    if (save) {
      const done = this.saveAssembler.push(save);
      if (!done || !this.saveMeta || done.frame !== this.saveMeta.id) return;
      if (fnv(done.bytes) !== done.hash) {
        this.sendJson({ t: "save-no", id: done.frame });
        this.saveMeta = null;
        return;
      }
      const offer = { id: this.saveMeta.id, name: this.saveMeta.name, label: this.saveMeta.label, state: done.bytes };
      this.saveMeta = null;
      this.opts.onSaveOffer(offer);
      return;
    }
    const inputs = decodeInputs(data);
    if (inputs) {
      this.opts.onRemote(inputs);
      return;
    }
    const chunk = decodeStateChunk(data);
    if (!chunk) return;
    const done = this.assembler.push(chunk);
    if (!done) return;
    if (fnv(done.bytes) !== done.hash) {
      this.fail("O estado da partida chegou incompleto.");
      return;
    }
    if (done.delay < 1) return;
    if (this.resumed) {
      if (done.frame === this.syncedFrame) this.sendJson({ t: "sync-ok" });
      return;
    }
    this.syncedFrame = done.frame;
    this.started = true;
    this.resumed = true;
    this.synced = true;
    this.delay = done.delay;
    this.linkTries = 0;
    this.guestNudge = 0;
    window.clearTimeout(this.linkTimer);
    this.opts.onResume({ frame: done.frame, state: done.bytes, delay: done.delay });
    this.sendJson({ t: "sync-ok" });
  }

  private onPeerLeft() {
    window.clearTimeout(this.linkTimer);
    this.swapBusy = false;
    this.swapAsked = false;
    this.offeredAt = 0;
    this.awaitingSync = false;
    this.resumed = false;
    this.opts.onPause();
    this.opts.onStatus("O outro lado saiu. A sala fica aberta por um instante.");
    this.reconnectUntil = performance.now() + 15000;
  }

  private flushInputs() {
    if (!this.channel || this.channel.readyState !== "open" || this.outgoing.size === 0) return;
    const frames = [...this.outgoing.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([frame, buttons]) => ({ frame, buttons }));
    this.channel.send(encodeInputs(frames));
  }

  private sendJson(message: unknown) {
    if (this.channel?.readyState === "open") this.channel.send(JSON.stringify(message));
  }
}
