import catalog from "../../../packages/catalog/games.json";
import type { Env } from "./env";
import { json, problem } from "./http";
import type { UserRow } from "./users";

const STATE_MAX = 4 * 1024 * 1024;
const SHOT_MAX = 512 * 1024;

function gameOf(id: string) {
  return catalog.games.find((entry) => entry.id === id) ?? null;
}

function key(userId: string, gameId: string, slot: number, shot = false): string {
  return `saves/${userId}/${gameId}/${slot}${shot ? ".png" : ""}`;
}

function bucket(env: Env): R2Bucket | Response {
  if (env.SAVES) return env.SAVES;
  return problem("O save na nuvem está desligado.", 503);
}

export async function listSaves(request: Request, env: Env, user: UserRow): Promise<Response> {
  if (!env.SAVES) return problem("O save na nuvem está desligado.", 503);
  const gameId = new URL(request.url).searchParams.get("game") ?? "";
  if (!gameOf(gameId)) return problem("Jogo desconhecido.", 400);
  const rows = await env.DB.prepare(
    "SELECT slot, sha1, saved_at FROM saves WHERE user_id = ? AND game_id = ? ORDER BY slot",
  ).bind(user.id, gameId).all<{ slot: number; sha1: string; saved_at: number }>();
  const saves = (rows.results ?? []).map((row) => ({ slot: row.slot, sha1: row.sha1, savedAt: row.saved_at }));
  return json({ saves });
}

export async function putSave(request: Request, env: Env, user: UserRow, gameId: string, slot: number): Promise<Response> {
  const game = gameOf(gameId);
  if (!game) return problem("Jogo desconhecido.", 400);
  const sha1 = (request.headers.get("x-sha1") ?? "").toLowerCase();
  if (sha1 !== game.sha1) return problem("Esse save não é da ROM aberta.", 400);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > STATE_MAX) return problem("O save está grande demais.", 413);
  const store = bucket(env);
  if (store instanceof Response) return store;
  const savedAt = Date.now();
  await store.put(key(user.id, gameId, slot), bytes);
  await env.DB.prepare(
    `INSERT INTO saves (user_id, game_id, slot, sha1, saved_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, game_id, slot) DO UPDATE SET sha1 = excluded.sha1, saved_at = excluded.saved_at`,
  ).bind(user.id, gameId, slot, sha1, savedAt).run();
  return json({ slot, sha1, savedAt });
}

export async function putShot(request: Request, env: Env, user: UserRow, gameId: string, slot: number): Promise<Response> {
  if (!gameOf(gameId)) return problem("Jogo desconhecido.", 400);
  const row = await env.DB.prepare(
    "SELECT slot FROM saves WHERE user_id = ? AND game_id = ? AND slot = ?",
  ).bind(user.id, gameId, slot).first();
  if (!row) return problem("Grava o save antes do print.", 404);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > SHOT_MAX) return problem("O print está grande demais.", 413);
  const store = bucket(env);
  if (store instanceof Response) return store;
  await store.put(key(user.id, gameId, slot, true), bytes, { httpMetadata: { contentType: "image/png" } });
  return json({ ok: true });
}

export async function getSave(env: Env, user: UserRow, gameId: string, slot: number): Promise<Response> {
  if (!gameOf(gameId)) return problem("Jogo desconhecido.", 400);
  const row = await env.DB.prepare(
    "SELECT sha1 FROM saves WHERE user_id = ? AND game_id = ? AND slot = ?",
  ).bind(user.id, gameId, slot).first<{ sha1: string }>();
  if (!row) return problem("Save não encontrado.", 404);
  const store = bucket(env);
  if (store instanceof Response) return store;
  const object = await store.get(key(user.id, gameId, slot));
  if (!object) return problem("Save não encontrado.", 404);
  const headers = new Headers({ "content-type": "application/octet-stream", "cache-control": "no-store", "x-sha1": row.sha1 });
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  return new Response(object.body, { headers });
}

export async function getShot(env: Env, user: UserRow, gameId: string, slot: number): Promise<Response> {
  if (!gameOf(gameId)) return problem("Jogo desconhecido.", 400);
  const store = bucket(env);
  if (store instanceof Response) return store;
  const object = await store.get(key(user.id, gameId, slot, true));
  if (!object) return problem("Sem print.", 404);
  const headers = new Headers({ "content-type": "image/png", "cache-control": "private, max-age=60" });
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  return new Response(object.body, { headers });
}
