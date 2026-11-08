import catalog from "../../../packages/catalog/games.json";

export const localGame = {
  id: "local",
  title: "Outro jogo",
  region: "Local",
  sha1: "",
  bytes: 0,
  players: 2,
} as const;

export type Game = (typeof catalog.games)[number] | typeof localGame;

export const games: Game[] = catalog.games;

const ROM_MIN = 128 * 1024;
const ROM_MAX = 8 * 1024 * 1024;

/** Tamanho de ROM de Super Nintendo, com ou sem o cabeçalho de 512 bytes do copiador. */
export function looksLikeSnesRom(size: number): boolean {
  if (size % 1024 !== 0 && size % 1024 !== 512) return false;
  const body = size % 1024 === 512 ? size - 512 : size;
  return body >= ROM_MIN && body <= ROM_MAX;
}

export async function sha1Of(bytes: Uint8Array): Promise<string> {
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-1", copy);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function matchRom(file: Uint8Array): Promise<{ game: Game; rom: Uint8Array } | null> {
  const full = await sha1Of(file);
  const exact = games.find((game) => game.sha1 === full && game.bytes === file.length);
  if (exact) return { game: exact, rom: file };
  if (file.length === 0 || file.length <= 512) return null;
  const body = file.subarray(512);
  const inner = await sha1Of(body);
  const stripped = games.find((game) => game.sha1 === inner && game.bytes === body.length);
  return stripped ? { game: stripped, rom: new Uint8Array(body) } : null;
}
