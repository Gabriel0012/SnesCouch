export interface InputFrame {
  frame: number;
  buttons: number;
}

export interface StateChunk {
  frame: number;
  delay: number;
  hash: number;
  total: number;
  offset: number;
  bytes: Uint8Array;
}

const INPUT = 1;
const STATE = 2;

export function encodeInputs(frames: InputFrame[]): ArrayBuffer {
  const buf = new ArrayBuffer(2 + frames.length * 6);
  const view = new DataView(buf);
  view.setUint8(0, INPUT);
  view.setUint8(1, frames.length);
  frames.forEach((entry, index) => {
    const at = 2 + index * 6;
    view.setUint32(at, entry.frame, true);
    view.setUint16(at + 4, entry.buttons & 0xffff, true);
  });
  return buf;
}

export function decodeInputs(buf: ArrayBuffer): InputFrame[] | null {
  if (buf.byteLength < 2) return null;
  const view = new DataView(buf);
  if (view.getUint8(0) !== INPUT) return null;
  const count = view.getUint8(1);
  if (buf.byteLength < 2 + count * 6) return null;
  const frames: InputFrame[] = [];
  for (let index = 0; index < count; index++) {
    const at = 2 + index * 6;
    frames.push({
      frame: view.getUint32(at, true),
      buttons: view.getUint16(at + 4, true),
    });
  }
  return frames;
}

export function encodeStateChunks(frame: number, delay: number, hash: number, bytes: Uint8Array, chunkSize = 12000): ArrayBuffer[] {
  const parts: ArrayBuffer[] = [];
  for (let offset = 0; offset < bytes.length || (offset === 0 && bytes.length === 0); offset += chunkSize) {
    const slice = bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize));
    const buf = new ArrayBuffer(19 + slice.length);
    const view = new DataView(buf);
    view.setUint8(0, STATE);
    view.setUint32(1, frame, true);
    view.setUint16(5, delay, true);
    view.setUint32(7, hash, true);
    view.setUint32(11, bytes.length, true);
    view.setUint32(15, offset, true);
    new Uint8Array(buf, 19).set(slice);
    parts.push(buf);
    if (bytes.length === 0) break;
  }
  return parts;
}

export function decodeStateChunk(buf: ArrayBuffer): StateChunk | null {
  if (buf.byteLength < 19) return null;
  const view = new DataView(buf);
  if (view.getUint8(0) !== STATE) return null;
  const total = view.getUint32(11, true);
  const offset = view.getUint32(15, true);
  const bytes = new Uint8Array(buf, 19);
  if (offset + bytes.length > total) return null;
  return {
    frame: view.getUint32(1, true),
    delay: view.getUint16(5, true),
    hash: view.getUint32(7, true),
    total,
    offset,
    bytes,
  };
}

export class StateAssembler {
  private frame = -1;
  private delay = 0;
  private hash = 0;
  private total = 0;
  private got = 0;
  private buf: Uint8Array | null = null;

  push(chunk: StateChunk): { frame: number; delay: number; hash: number; bytes: Uint8Array } | null {
    if (chunk.frame !== this.frame || !this.buf) {
      this.frame = chunk.frame;
      this.delay = chunk.delay;
      this.hash = chunk.hash;
      this.total = chunk.total;
      this.buf = new Uint8Array(chunk.total);
      this.got = 0;
    }
    this.buf.set(chunk.bytes, chunk.offset);
    this.got = Math.max(this.got, chunk.offset + chunk.bytes.length);
    if (this.got < this.total) return null;
    return { frame: this.frame, delay: this.delay, hash: this.hash, bytes: this.buf };
  }
}
