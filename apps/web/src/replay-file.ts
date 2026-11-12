/**
 * Arquivo de replay: o state de cada trecho e os botões dos dois controles em cada frame.
 * O cabeçalho fica sem compressão para a lista ler só o começo do arquivo.
 */

export const REPLAY_EXTENSION = ".snesreplay";

const MAGIC = "SNCR1\n";
const HEADER_MAX = 64 * 1024;
const STATE_MAX = 8 * 1024 * 1024;
const FRAMES_MAX = 60 * 60 * 60 * 6;

export interface ReplayHeader {
  v: 1;
  gameId: string;
  title: string;
  sha1: string;
  fight: boolean;
  startedAt: number;
  firstFrame: number;
  frames: number;
}

export interface ReplaySegment {
  /** Posição no replay, em frames, em que o state entra no lugar do anterior. */
  at: number;
  state: Uint8Array;
}

export interface Replay {
  header: ReplayHeader;
  /** p0 e p1 intercalados, um par por frame. */
  pads: Uint16Array;
  segments: ReplaySegment[];
  /** Pares [posição, hash do state depois daquele frame]. */
  hashes: Uint32Array;
}

export async function encodeReplay(replay: Replay): Promise<Blob> {
  const frames = replay.pads.length >> 1;
  const header: ReplayHeader = { ...replay.header, v: 1, frames, title: replay.header.title.slice(0, 80) };
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  const lead = new Uint8Array(MAGIC.length + 4);
  lead.set(new TextEncoder().encode(MAGIC));
  new DataView(lead.buffer).setUint32(MAGIC.length, headerBytes.length, true);

  const stateBytes = replay.segments.reduce((sum, segment) => sum + 8 + segment.state.length, 0);
  const body = new Uint8Array(4 + frames * 4 + 4 + stateBytes + 4 + replay.hashes.length * 4);
  const view = new DataView(body.buffer);
  let at = 0;
  view.setUint32(at, frames, true);
  at += 4;
  for (let i = 0; i < frames * 2; i++, at += 2) view.setUint16(at, replay.pads[i], true);
  view.setUint32(at, replay.segments.length, true);
  at += 4;
  for (const segment of replay.segments) {
    view.setUint32(at, segment.at, true);
    view.setUint32(at + 4, segment.state.length, true);
    body.set(segment.state, at + 8);
    at += 8 + segment.state.length;
  }
  const pairs = replay.hashes.length >> 1;
  view.setUint32(at, pairs, true);
  at += 4;
  for (let i = 0; i < pairs * 2; i++, at += 4) view.setUint32(at, replay.hashes[i], true);

  const packed = await new Response(new Blob([body]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
  return new Blob([lead, headerBytes, packed], { type: "application/octet-stream" });
}

/** Lê só o cabeçalho, sem abrir o corpo comprimido. */
export async function readReplayHeader(file: Blob): Promise<ReplayHeader | null> {
  const lead = new Uint8Array(await file.slice(0, MAGIC.length + 4).arrayBuffer());
  const size = headerSize(lead);
  if (size === null) return null;
  const bytes = new Uint8Array(await file.slice(lead.length, lead.length + size).arrayBuffer());
  if (bytes.length !== size) return null;
  return parseHeader(bytes);
}

export async function decodeReplay(file: Blob): Promise<Replay | null> {
  const all = new Uint8Array(await file.arrayBuffer());
  const size = headerSize(all.subarray(0, MAGIC.length + 4));
  if (size === null) return null;
  const start = MAGIC.length + 4;
  const header = parseHeader(all.subarray(start, start + size));
  if (!header) return null;
  let body: Uint8Array;
  try {
    const packed = new Blob([all.subarray(start + size)]);
    body = new Uint8Array(await new Response(packed.stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
  } catch {
    return null;
  }
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  let at = 0;
  const need = (bytes: number) => at + bytes <= body.length;
  if (!need(4)) return null;
  const frames = view.getUint32(at, true);
  at += 4;
  if (frames !== header.frames || !need(frames * 4)) return null;
  const pads = new Uint16Array(frames * 2);
  for (let i = 0; i < frames * 2; i++, at += 2) pads[i] = view.getUint16(at, true);
  if (!need(4)) return null;
  const count = view.getUint32(at, true);
  at += 4;
  if (count === 0 || count > 10_000) return null;
  const segments: ReplaySegment[] = [];
  for (let i = 0; i < count; i++) {
    if (!need(8)) return null;
    const segmentAt = view.getUint32(at, true);
    const length = view.getUint32(at + 4, true);
    at += 8;
    if (length === 0 || length > STATE_MAX || !need(length)) return null;
    if (segmentAt > frames || (segments.length && segmentAt < segments[segments.length - 1].at)) return null;
    segments.push({ at: segmentAt, state: body.slice(at, at + length) });
    at += length;
  }
  if (segments[0].at !== 0) return null;
  if (!need(4)) return null;
  const pairs = view.getUint32(at, true);
  at += 4;
  if (!need(pairs * 8)) return null;
  const hashes = new Uint32Array(pairs * 2);
  for (let i = 0; i < pairs * 2; i++, at += 4) hashes[i] = view.getUint32(at, true);
  return { header, pads, segments, hashes };
}

export function replayFileName(title: string, startedAt: number): string {
  const date = new Date(startedAt);
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  const name = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 40) || "replay";
  return `${name}-${stamp}${REPLAY_EXTENSION}`;
}

function headerSize(lead: Uint8Array): number | null {
  if (lead.length < MAGIC.length + 4) return null;
  for (let i = 0; i < MAGIC.length; i++) if (lead[i] !== MAGIC.charCodeAt(i)) return null;
  const size = new DataView(lead.buffer, lead.byteOffset, lead.byteLength).getUint32(MAGIC.length, true);
  return size > 0 && size <= HEADER_MAX ? size : null;
}

function parseHeader(bytes: Uint8Array): ReplayHeader | null {
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (row.v !== 1) return null;
  if (typeof row.sha1 !== "string" || !/^[0-9a-f]{40}$/.test(row.sha1)) return null;
  if (typeof row.gameId !== "string" || !row.gameId) return null;
  if (typeof row.frames !== "number" || !Number.isInteger(row.frames) || row.frames < 1 || row.frames > FRAMES_MAX) return null;
  const startedAt = typeof row.startedAt === "number" && row.startedAt > 0 && row.startedAt < 4e12 ? row.startedAt : 0;
  const firstFrame = typeof row.firstFrame === "number" && Number.isInteger(row.firstFrame) && row.firstFrame >= 0 ? row.firstFrame : 0;
  return {
    v: 1,
    gameId: row.gameId.slice(0, 120),
    title: typeof row.title === "string" ? row.title.slice(0, 80) : "",
    sha1: row.sha1,
    fight: row.fight === true,
    startedAt,
    firstFrame,
    frames: row.frames,
  };
}
