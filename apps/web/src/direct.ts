export type DirectSignal =
  | { kind: "offer"; sdp: string; gen: number }
  | { kind: "answer"; sdp: string; gen: number }
  | { kind: "ice"; candidate: RTCIceCandidateInit; gen: number };

interface DirectOptions {
  host: boolean;
  signal: (data: DirectSignal) => void;
  onOpen: () => void;
  onClose: () => void;
  onMessage: (data: string | ArrayBuffer) => void;
}

const FALLBACK_ICE: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
const DIAL_TRIES = 3;
const DIAL_WAIT = 10000;

let iceServers: Promise<RTCIceServer[]> | null = null;

function loadIceServers(): Promise<RTCIceServer[]> {
  iceServers ??= fetch("/api/ice")
    .then((response) => (response.ok ? response.json() : null))
    .then((body: { iceServers?: RTCIceServer[] } | null) => body?.iceServers?.length ? body.iceServers : FALLBACK_ICE)
    .catch(() => FALLBACK_ICE);
  return iceServers;
}

/**
 * Optional peer-to-peer path for buttons and ping. The room socket stays the
 * source of truth: when this never opens (CGNAT on both sides and no TURN),
 * the match keeps running through the room.
 */
export class DirectLink {
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private up = false;
  private gen = 0;
  private tries = 0;
  private timer = 0;
  private stopped = false;
  private pendingIce: { gen: number; candidate: RTCIceCandidateInit }[] = [];
  private gate: Promise<void> = Promise.resolve();

  constructor(private opts: DirectOptions) {}

  get open(): boolean {
    return this.up && this.channel?.readyState === "open" && this.pc?.connectionState !== "disconnected";
  }

  start() {
    if (!this.opts.host || typeof RTCPeerConnection === "undefined") return;
    this.tries = 0;
    this.queue(() => this.dial());
  }

  stop() {
    this.stopped = true;
    this.up = false;
    window.clearTimeout(this.timer);
    this.drop();
  }

  send(data: string | ArrayBuffer): boolean {
    const channel = this.channel;
    if (!this.up || !channel || channel.readyState !== "open") return false;
    try {
      if (typeof data === "string") channel.send(data);
      else channel.send(data);
      return true;
    } catch {
      return false;
    }
  }

  signal(data: DirectSignal) {
    if (this.stopped || typeof RTCPeerConnection === "undefined") return;
    if (data.kind === "offer" && !this.opts.host) this.queue(() => this.answer(data.sdp, data.gen));
    if (data.kind === "answer" && this.opts.host) this.queue(() => this.accept(data.sdp, data.gen));
    if (data.kind === "ice" && data.candidate) this.queue(() => this.addIce(data.gen, data.candidate));
  }

  private queue(task: () => Promise<void>) {
    this.gate = this.gate.then(task).then(() => undefined, () => undefined);
  }

  private async dial() {
    if (this.stopped || this.up) return;
    window.clearTimeout(this.timer);
    if (this.tries >= DIAL_TRIES) return;
    this.tries += 1;
    const gen = ++this.gen;
    const servers = await loadIceServers();
    if (this.stopped || gen !== this.gen) return;
    const pc = this.fresh(servers);
    this.watch(pc, pc.createDataChannel("play", { ordered: false, maxRetransmits: 0 }));
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (pc !== this.pc) return;
      this.opts.signal({ kind: "offer", sdp: pc.localDescription?.sdp || offer.sdp || "", gen });
    } catch {
      if (pc === this.pc) this.redial(1000);
      return;
    }
    this.timer = window.setTimeout(() => {
      if (pc === this.pc && !this.up) this.redial(0);
    }, DIAL_WAIT);
  }

  private redial(wait: number) {
    if (!this.opts.host || this.stopped) return;
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.queue(() => this.dial()), wait);
  }

  private async answer(sdp: string, gen: number) {
    if (this.stopped || !sdp || gen <= this.gen) return;
    this.gen = gen;
    const servers = await loadIceServers();
    if (this.stopped || gen !== this.gen) return;
    const pc = this.fresh(servers);
    pc.ondatachannel = (event) => {
      if (pc === this.pc) this.watch(pc, event.channel);
    };
    try {
      await pc.setRemoteDescription({ type: "offer", sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      if (pc !== this.pc) return;
      this.opts.signal({ kind: "answer", sdp: pc.localDescription?.sdp || answer.sdp || "", gen });
      await this.flushIce(pc, gen);
    } catch {
      /* o anfitrião tenta de novo */
    }
  }

  private async accept(sdp: string, gen: number) {
    const pc = this.pc;
    if (!pc || !sdp || gen !== this.gen || pc.signalingState !== "have-local-offer") return;
    try {
      await pc.setRemoteDescription({ type: "answer", sdp });
    } catch {
      if (pc === this.pc) this.redial(1000);
      return;
    }
    await this.flushIce(pc, gen);
  }

  private async addIce(gen: number, candidate: RTCIceCandidateInit) {
    if (gen < this.gen) return;
    const pc = this.pc;
    if (!pc || gen !== this.gen || !pc.remoteDescription) {
      this.pendingIce.push({ gen, candidate });
      if (this.pendingIce.length > 64) this.pendingIce.splice(0, this.pendingIce.length - 64);
      return;
    }
    try { await pc.addIceCandidate(candidate); }
    catch { /* candidato de uma tentativa anterior */ }
  }

  private async flushIce(pc: RTCPeerConnection, gen: number) {
    const mine = this.pendingIce.filter((item) => item.gen === gen);
    this.pendingIce = this.pendingIce.filter((item) => item.gen > gen);
    for (const item of mine) {
      if (pc !== this.pc) return;
      try { await pc.addIceCandidate(item.candidate); }
      catch { /* candidato de uma tentativa anterior */ }
    }
  }

  private fresh(servers: RTCIceServer[]): RTCPeerConnection {
    this.drop();
    const pc = new RTCPeerConnection({ iceServers: servers });
    this.pc = pc;
    const gen = this.gen;
    pc.onicecandidate = (event) => {
      if (pc !== this.pc || !event.candidate) return;
      this.opts.signal({ kind: "ice", candidate: event.candidate.toJSON(), gen });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") this.lost(pc);
    };
    return pc;
  }

  private watch(pc: RTCPeerConnection, channel: RTCDataChannel) {
    channel.binaryType = "arraybuffer";
    this.channel = channel;
    channel.onopen = () => {
      if (pc !== this.pc || this.stopped) return;
      this.channel = channel;
      this.up = true;
      this.tries = 0;
      window.clearTimeout(this.timer);
      this.opts.onOpen();
    };
    channel.onmessage = (event) => {
      if (pc === this.pc) this.opts.onMessage(event.data as string | ArrayBuffer);
    };
    channel.onclose = () => this.lost(pc);
  }

  private lost(pc: RTCPeerConnection) {
    if (pc !== this.pc || this.stopped) return;
    const wasUp = this.up;
    this.drop();
    if (wasUp) this.tries = 0;
    this.redial(wasUp ? 1000 : 2000);
  }

  private drop() {
    const pc = this.pc;
    const wasUp = this.up;
    this.pc = null;
    this.channel = null;
    this.up = false;
    if (pc) {
      pc.onicecandidate = null;
      pc.onconnectionstatechange = null;
      pc.ondatachannel = null;
      try { pc.close(); } catch { /* já fechou */ }
    }
    if (wasUp && !this.stopped) this.opts.onClose();
  }
}
