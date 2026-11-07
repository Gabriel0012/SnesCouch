import {
  StateAssembler,
  decodeInputs,
  decodeStateChunk,
  encodeInputs,
  encodeStateChunks,
  type InputFrame,
} from "../../../packages/net/codec.ts";
import { delayFromRtt } from "../../../packages/net/lockstep.ts";

export type Role = "host" | "guest";

interface SignalOffer { kind: "offer"; sdp: string }
interface SignalAnswer { kind: "answer"; sdp: string }
interface SignalIce { kind: "ice"; candidate: RTCIceCandidateInit | null }
type Signal = SignalOffer | SignalAnswer | SignalIce;

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
  onChat: (line: ChatLine) => void;
  onChatLog: (lines: ChatLine[]) => void;
  onTyping: (from: Role, on: boolean) => void;
  onRoster: (roster: { host: Seat; guest: Seat }) => void;
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
  private pendingIce: RTCIceCandidateInit[] = [];
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
  private resetGen = 0;
  private control = "Teclado";
  private name = "";
  private opened = false;
  private attempts = 0;

  constructor(private opts: SessionOptions) {
    this.slot = opts.role === "host" ? 0 : 1;
  }

  get role(): Role {
    return this.opts.role;
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

  requestReset() {
    if (this.closed) return;
    if (this.channel?.readyState === "open" && this.started) {
      if (this.opts.role === "host") this.broadcastReset();
      else {
        this.sendJson({ t: "reset-ask" });
        this.opts.onStatus("Reiniciando nos dois…");
      }
      return;
    }
    this.opts.onReset(null);
  }

  setProfile(control: string, name: string) {
    this.control = control.slice(0, 40);
    this.name = name.slice(0, 20);
    this.socketSend({ t: "profile", control: this.control, name: this.name });
  }

  close() {
    this.closed = true;
    window.clearInterval(this.pingTimer);
    window.clearInterval(this.resendTimer);
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
      if (message.t === "peer") void this.attachPeer();
      if (message.t === "peer-left") this.onPeerLeft();
      if (message.t === "signal" && message.data) void this.onSignal(message.data);
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

  private async attachPeer() {
    this.pc?.close();
    this.pendingIce = [];
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.pc = pc;
    pc.onicecandidate = (event) => {
      this.signal({ kind: "ice", candidate: event.candidate?.toJSON() ?? null });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" && this.opts.role === "host") void this.restartIce();
    };
    pc.ondatachannel = (event) => this.bindChannel(event.channel);
    if (this.opts.role === "host") {
      this.bindChannel(pc.createDataChannel("play", { ordered: true }));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.signal({ kind: "offer", sdp: offer.sdp ?? "" });
    }
  }

  private async restartIce() {
    if (!this.pc) return;
    const offer = await this.pc.createOffer({ iceRestart: true });
    await this.pc.setLocalDescription(offer);
    this.signal({ kind: "offer", sdp: offer.sdp ?? "" });
  }

  private async onSignal(data: Signal) {
    if (!this.pc) return;
    if (data.kind === "offer") {
      await this.pc.setRemoteDescription({ type: "offer", sdp: data.sdp });
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      this.signal({ kind: "answer", sdp: answer.sdp ?? "" });
      await this.flushIce();
    } else if (data.kind === "answer") {
      await this.pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
      await this.flushIce();
    } else if (data.candidate) {
      if (!this.pc.remoteDescription) this.pendingIce.push(data.candidate);
      else await this.pc.addIceCandidate(data.candidate);
    }
  }

  private async flushIce() {
    const queued = this.pendingIce.splice(0);
    for (const candidate of queued) {
      if (this.pc) await this.pc.addIceCandidate(candidate);
    }
  }

  private bindChannel(channel: RTCDataChannel) {
    channel.binaryType = "arraybuffer";
    channel.onopen = () => {
      this.channel = channel;
      this.awaitingSync = false;
      this.resumed = false;
      window.clearInterval(this.resendTimer);
      this.resendTimer = window.setInterval(() => this.flushInputs(), 50);
      this.reconnectUntil = 0;
      this.opts.onPause();
      if (!this.started) {
        this.opts.onStatus("Alinhando a partida…");
        if (this.opts.role === "host") {
          this.pingAt = performance.now();
          this.sendJson({ t: "ping", ms: this.pingAt });
          window.setTimeout(() => {
            if (!this.started && !this.closed) void this.align(3);
          }, 1000);
        }
      } else if (this.opts.role === "host") {
        void this.pushCheckpoint();
      }
    };
    channel.onmessage = (event) => this.onPlay(event.data);
    channel.onclose = () => {
      if (this.channel === channel) {
        this.awaitingSync = false;
        this.resumed = false;
      }
      if (this.closed || this.channel !== channel) return;
      this.opts.onPause();
      this.opts.onStatus("Conexão caiu. Tentando de novo por 15s.");
      this.reconnectUntil = performance.now() + 15000;
      if (this.opts.role === "host") void this.restartIce();
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
    const snapshot = await this.opts.checkpoint();
    if (this.closed || epoch !== this.epoch) return;
    this.sendSnapshot(0, snapshot.state);
  }

  private broadcastReset() {
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

  private async pushCheckpoint() {
    const epoch = this.epoch;
    const snapshot = await this.opts.checkpoint();
    if (this.closed || epoch !== this.epoch) return;
    this.sendSnapshot(snapshot.frame, snapshot.state);
  }

  private sendSnapshot(frame: number, state: Uint8Array) {
    if (!this.channel || this.channel.readyState !== "open") return;
    if (!state.byteLength || this.delay < 1) {
      this.fail("Não deu para alinhar a partida.");
      return;
    }
    this.lastSnapshot = { frame, state, delay: this.delay };
    this.awaitingSync = true;
    const hash = fnv(state);
    try {
      for (const chunk of encodeStateChunks(frame, this.delay, hash, state)) {
        this.channel.send(chunk);
      }
    } catch {
      this.fail("Não deu para alinhar a partida.");
    }
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
      };
      if (message.t === "reset-ask" && this.opts.role === "host" && this.started) this.broadcastReset();
      if (message.t === "reset" && typeof message.n === "number" && message.n > this.resetGen) {
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
      if (message.t === "check" && typeof message.frame === "number" && typeof message.hash === "number") {
        this.opts.onCheck(message.frame, message.hash);
      }
      if (message.t === "sync-ok" && this.awaitingSync && this.lastSnapshot && !this.resumed) {
        this.awaitingSync = false;
        this.resumed = true;
        this.started = true;
        this.opts.onResume(this.lastSnapshot);
      }
      return;
    }
    if (!(data instanceof ArrayBuffer)) return;
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
    if (done.delay < 1 || this.resumed) return;
    this.started = true;
    this.resumed = true;
    this.delay = done.delay;
    this.opts.onResume({ frame: done.frame, state: done.bytes, delay: done.delay });
    this.sendJson({ t: "sync-ok" });
  }

  private onPeerLeft() {
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
