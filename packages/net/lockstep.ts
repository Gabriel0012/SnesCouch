export type Slot = 0 | 1;

export interface LockstepStep {
  frame: number;
  pads: [number, number];
  sendFrame: number;
  sendButtons: number;
}

/**
 * Input-delay lockstep.
 * Each side keeps its own buttons and the other side's buttons, keyed by
 * the simulation frame they apply to. Frame F runs only when both exist.
 * The first sample fills the delay window so the run does not stall on frame 0.
 */
export class Lockstep {
  readonly localSlot: Slot;
  readonly delay: number;
  simFrame = 0;
  private primed = false;
  private readonly local = new Map<number, number>();
  private readonly remote = new Map<number, number>();

  constructor(localSlot: Slot, delay: number) {
    if (delay < 1) throw new Error("delay");
    this.localSlot = localSlot;
    this.delay = delay;
  }

  prime(buttons: number): number[] {
    const sent: number[] = [];
    const sample = buttons & 0xffff;
    for (let i = 0; i < this.delay; i++) {
      const frame = this.simFrame + i;
      this.local.set(frame, sample);
      sent.push(frame);
    }
    this.primed = true;
    return sent;
  }

  resume(frame: number, buttons: number): number[] {
    this.simFrame = frame;
    this.local.clear();
    this.remote.clear();
    this.primed = false;
    return this.prime(buttons);
  }

  pushRemote(frame: number, buttons: number) {
    if (frame < this.simFrame) return;
    this.remote.set(frame, buttons & 0xffff);
  }

  advance(sampled: number): LockstepStep | null {
    if (!this.primed) throw new Error("prime antes de avançar");
    const frame = this.simFrame;
    if (!this.local.has(frame) || !this.remote.has(frame)) return null;
    const mine = this.local.get(frame)!;
    const theirs = this.remote.get(frame)!;
    const pads: [number, number] = this.localSlot === 0 ? [mine, theirs] : [theirs, mine];
    this.local.delete(frame);
    this.remote.delete(frame);
    this.simFrame = frame + 1;
    const sendFrame = this.simFrame + this.delay - 1;
    const sendButtons = sampled & 0xffff;
    this.local.set(sendFrame, sendButtons);
    return { frame, pads, sendFrame, sendButtons };
  }
}

/** Half the round trip, in SNES frames, clamped to the range the match uses. */
export function delayFromRtt(rttMs: number): number {
  const oneWayFrames = Math.ceil(rttMs / 2 / (1000 / 60));
  return Math.min(8, Math.max(2, oneWayFrames));
}
