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

/**
 * Which match a window of buttons belongs to: the sender's player slot and
 * the frame both sides resumed from. Packets from before a swap or resync
 * carry a different line and are dropped.
 */
export interface InputLine {
  slot: 0 | 1;
  base: number;
}

const INPUT = 1;
const STATE = 2;
const SAVE = 3;
const LINED_INPUT = 4;

export function encodeInputs(frames: InputFrame[], line?: InputLine): ArrayBuffer {
  const head = line ? 7 : 2;
  const buf = new ArrayBuffer(head + frames.length * 6);
  const view = new DataView(buf);
  view.setUint8(0, line ? LINED_INPUT : INPUT);
  view.setUint8(1, frames.length);
  if (line) {
    view.setUint8(2, line.slot);
    view.setUint32(3, line.base, true);
  }
  frames.forEach((entry, index) => {
    const at = head + index * 6;
    view.setUint32(at, entry.frame, true);
    view.setUint16(at + 4, entry.buttons & 0xffff, true);
  });
  return buf;
}

function inputHead(buf: ArrayBuffer): number {
  if (buf.byteLength < 2) return 0;
  const type = new DataView(buf).getUint8(0);
  if (type === INPUT) return 2;
  if (type === LINED_INPUT && buf.byteLength >= 7) return 7;
  return 0;
}

export function decodeInputs(buf: ArrayBuffer): InputFrame[] | null {
  const head = inputHead(buf);
  if (!head) return null;
  const view = new DataView(buf);
  const count = view.getUint8(1);
  if (buf.byteLength < head + count * 6) return null;
  const frames: InputFrame[] = [];
  for (let index = 0; index < count; index++) {
    const at = head + index * 6;
    frames.push({
      frame: view.getUint32(at, true),
      buttons: view.getUint16(at + 4, true),
    });
  }
  return frames;
}

export function decodeInputLine(buf: ArrayBuffer): InputLine | null {
  if (inputHead(buf) !== 7) return null;
  const view = new DataView(buf);
  return { slot: view.getUint8(2) === 1 ? 1 : 0, base: view.getUint32(3, true) };
}

export function encodeSaveChunks(id: number, hash: number, bytes: Uint8Array, chunkSize = 12000): ArrayBuffer[] {
  return encodeStateChunks(id, 0, hash, bytes, chunkSize).map((part) => {
    new Uint8Array(part)[0] = SAVE;
    return part;
  });
}

export function decodeSaveChunk(buf: ArrayBuffer): StateChunk | null {
  if (buf.byteLength < 19 || new DataView(buf).getUint8(0) !== SAVE) return null;
  const copy = buf.slice(0);
  new DataView(copy).setUint8(0, STATE);
  return decodeStateChunk(copy);
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
