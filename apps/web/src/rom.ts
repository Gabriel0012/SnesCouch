import catalog from "../../../packages/catalog/games.json";

export type Game = (typeof catalog.games)[number];

export const games: Game[] = catalog.games;

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
