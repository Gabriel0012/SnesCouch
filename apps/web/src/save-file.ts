/** Arquivo para levar um save a outro navegador. A ROM não entra nele. */

export const SAVE_FILE_FORMAT = "snes-couch-save";

export interface PortableSave {
  sha1: string;
  title: string;
  savedAt: number;
  state: Uint8Array;
  shot: Uint8Array | null;
}

const STATE_MAX = 8 * 1024 * 1024;
const SHOT_MAX = Math.floor(1.5 * 1024 * 1024);

export function encodeSaveFile(file: PortableSave): string {
  return JSON.stringify({
    format: SAVE_FILE_FORMAT,
    version: 1,
    sha1: file.sha1,
    title: file.title.slice(0, 80),
    savedAt: file.savedAt,
    state: bytesToBase64(file.state),
    shot: file.shot ? bytesToBase64(file.shot) : null,
  });
}

export function decodeSaveFile(text: string): PortableSave | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (row.format !== SAVE_FILE_FORMAT || row.version !== 1) return null;
  if (typeof row.sha1 !== "string" || !/^[0-9a-f]{40}$/.test(row.sha1)) return null;
  if (typeof row.state !== "string") return null;
  const state = base64ToBytes(row.state);
  if (!state || state.byteLength === 0 || state.byteLength > STATE_MAX) return null;
  let shot: Uint8Array | null = null;
  if (row.shot != null) {
    if (typeof row.shot !== "string") return null;
    const bytes = base64ToBytes(row.shot);
    if (!bytes || bytes.byteLength > SHOT_MAX) return null;
    shot = bytes.byteLength >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 ? bytes : null;
  }
  const savedAt = typeof row.savedAt === "number" && row.savedAt > 0 && row.savedAt < 4e12 ? row.savedAt : Date.now();
  const title = typeof row.title === "string" ? row.title.slice(0, 80) : "";
  return { sha1: row.sha1, title, savedAt, state, shot };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array | null {
  if (value.length === 0 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return null;
  }
}
