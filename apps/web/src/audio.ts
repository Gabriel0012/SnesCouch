const worklet = `
class SnesAudio extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunks = [];
    this.offset = 0;
    this.queued = 0;
    this.primed = false;
    this.port.onmessage = (event) => {
      this.chunks.push(event.data);
      this.queued += event.data.left.length;
      while (this.queued > sampleRate * 0.15 && this.chunks.length > 1) {
        const old = this.chunks.shift();
        this.queued -= old.left.length - this.offset;
        this.offset = 0;
      }
    };
  }
  process(_inputs, outputs) {
    const left = outputs[0][0];
    const right = outputs[0][1];
    if (!left) return true;
    if (!this.primed && this.queued >= sampleRate * 0.035) this.primed = true;
    for (let i = 0; i < left.length; i++) {
      const chunk = this.primed ? this.chunks[0] : null;
      if (!chunk) {
        this.primed = false;
        left[i] = 0;
        if (right) right[i] = 0;
        continue;
      }
      left[i] = chunk.left[this.offset] || 0;
      if (right) right[i] = chunk.right[this.offset] || 0;
      this.offset += 1;
      this.queued -= 1;
      if (this.offset >= chunk.left.length) {
        this.chunks.shift();
        this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor("snes-audio", SnesAudio);
`;

export class Speaker {
  private context: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private gain: GainNode | null = null;
  private fromRate = 32040;
  private level = 1;

  async resume() {
    if (!this.context) {
      this.context = new AudioContext();
      const url = URL.createObjectURL(new Blob([worklet], { type: "text/javascript" }));
      await this.context.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      this.node = new AudioWorkletNode(this.context, "snes-audio", { outputChannelCount: [2] });
      this.gain = this.context.createGain();
      this.gain.gain.value = this.level;
      this.node.connect(this.gain);
      this.gain.connect(this.context.destination);
    }
    if (this.context.state !== "running") await this.context.resume();
  }

  setVolume(level: number) {
    this.level = Math.min(1, Math.max(0, level));
    if (!this.gain || !this.context) return;
    const now = this.context.currentTime;
    const param = this.gain.gain;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(this.level, now + 0.03);
  }

  setRate(rate: number) {
    if (rate > 0) this.fromRate = rate;
  }

  push(samples: Int16Array) {
    if (!this.node || !this.context || samples.length < 2) return;
    const frames = samples.length / 2;
    const outFrames = Math.max(1, Math.round(frames * this.context.sampleRate / this.fromRate));
    const left = new Float32Array(outFrames);
    const right = new Float32Array(outFrames);
    for (let i = 0; i < outFrames; i++) {
      const src = Math.min(frames - 1, i * this.fromRate / this.context.sampleRate);
      const i0 = Math.floor(src);
      const i1 = Math.min(frames - 1, i0 + 1);
      const mix = src - i0;
      const l0 = samples[i0 * 2] / 32768;
      const l1 = samples[i1 * 2] / 32768;
      const r0 = samples[i0 * 2 + 1] / 32768;
      const r1 = samples[i1 * 2 + 1] / 32768;
      left[i] = l0 + (l1 - l0) * mix;
      right[i] = r0 + (r1 - r0) * mix;
    }
    this.node.port.postMessage({ left, right });
  }
}
