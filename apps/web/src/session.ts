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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export class OnlineSession {
  private ws: WebSocket | null = null;
  private peerHere = false;
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
  private syncTimer = 0;
  private syncSends = 0;
  private syncedFrame = -1;
  private synced = false;
  private swapBusy = false;
  private swapAsked = false;

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
    return this.started && this.peerHere && this.ws?.readyState === WebSocket.OPEN;
  }

  inputDelay(): number {
    return Math.min(8, Math.max(2, this.delay || 2));
  }

  proposeSave(label: string, state: Uint8Array): number {
    const id = ++this.saveSeq;
    this.sendJson({ t: "save-ask", id, name: this.name, label });
    if (this.peerHere && this.ws?.readyState === WebSocket.OPEN) {
      for (const chunk of encodeSaveChunks(id, fnv(state), state)) this.relayBytes(chunk);
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
    if (this.closed || !this.linked() || this.resetOffer) return false;
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
    this.peerHere = false;
    window.clearInterval(this.pingTimer);
    window.clearInterval(this.resendTimer);
    window.clearTimeout(this.syncTimer);
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
        from?: Role;
        name?: string;
        text?: string;
        at?: number;
        messages?: ChatLine[];
        host?: Seat;
        guest?: Seat;
        on?: boolean;
        data?: string;
        bin?: string;
      };
      if (message.t === "peer") this.onPeer();
      if (message.t === "peer-left") this.onPeerLeft();
      if (message.t === "relay") {
        if (typeof message.bin === "string") {
          try { this.onPlay(base64ToBytes(message.bin)); } catch { /* pedaço inválido */ }
        } else if (typeof message.data === "string") this.onPlay(message.data);
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
    socket.onclose = (event) => {
      window.clearTimeout(giveUp);
      if (this.closed || this.ws !== socket) return;
      this.peerHere = false;
      const reason = event.reason?.trim();
      if (reason) {
        this.opts.onClose(reason);
        this.close();
        return;
      }
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

  private relay(body: { data?: string; bin?: string }): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.socketSend({ t: "relay", ...body });
    return true;
  }

  private relayBytes(buf: ArrayBuffer): boolean {
    return this.relay({ bin: bytesToBase64(new Uint8Array(buf)) });
  }

  private onPeer() {
    if (this.closed) return;
    this.peerHere = true;
    this.awaitingSync = false;
    this.resumed = false;
    this.assembler = new StateAssembler();
    window.clearInterval(this.resendTimer);
    this.resendTimer = window.setInterval(() => this.flushInputs(), 50);
    this.reconnectUntil = 0;
    this.opts.onPause();
    this.opts.onStatus("Alinhando a partida…");
    if (!this.started) {
      if (this.opts.role !== "host") return;
      this.pingAt = performance.now();
      this.sendJson({ t: "ping", ms: this.pingAt });
      window.setTimeout(() => {
        if (!this.started && !this.closed && this.peerHere) void this.align(3);
      }, 1000);
      return;
    }
    if (this.opts.role === "host") void this.pushCheckpoint();
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
    if (!this.peerHere || this.ws?.readyState !== WebSocket.OPEN) return;
    if (!state.byteLength || this.delay < 1) {
      this.fail("Não deu para alinhar a partida.");
      return;
    }
    this.lastSnapshot = { frame, state, delay: this.delay };
    this.awaitingSync = true;
    const hash = fnv(state);
    let sent = true;
    for (const chunk of encodeStateChunks(frame, this.delay, hash, state)) {
      if (!this.relayBytes(chunk)) sent = false;
    }
    if (!sent) {
      this.fail("Não deu para alinhar a partida.");
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
      if (this.closed || !this.awaitingSync || !this.lastSnapshot) return;
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
    this.opts.onResume({ frame: done.frame, state: done.bytes, delay: done.delay });
    this.sendJson({ t: "sync-ok" });
  }

  private onPeerLeft() {
    this.peerHere = false;
    this.swapBusy = false;
    this.swapAsked = false;
    this.awaitingSync = false;
    this.resumed = false;
    this.opts.onPause();
    this.opts.onStatus("O outro lado saiu. A sala fica aberta por um instante.");
    this.reconnectUntil = performance.now() + 15000;
  }

  private flushInputs() {
    if (!this.peerHere || this.ws?.readyState !== WebSocket.OPEN || this.outgoing.size === 0) return;
    const frames = [...this.outgoing.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([frame, buttons]) => ({ frame, buttons }));
    this.relayBytes(encodeInputs(frames));
  }

  private sendJson(message: unknown) {
    this.relay({ data: JSON.stringify(message) });
  }
}
