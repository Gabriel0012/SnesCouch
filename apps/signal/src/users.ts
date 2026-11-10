import { makeCode, randomHex } from "./codes";
import type { Env } from "./env";
import { SCHEMA } from "./schema";
import { readCookie } from "./http";

export interface Profile {
  provider: "discord" | "google";
  providerId: string;
  name: string;
  avatar: string | null;
}

export interface UserRow {
  id: string;
  provider: string;
  name: string;
  avatar: string | null;
  friend_code: string;
  room_code: string | null;
  room_at: number | null;
  presence: string | null;
}

let schemaReady: Promise<void> | null = null;

async function applySchema(env: Env) {
  const statements = SCHEMA.split(";").map((sql) => sql.trim()).filter(Boolean);
  for (const sql of statements) await env.DB.prepare(sql).run();
  const info = await env.DB.prepare("PRAGMA table_info(users)").all<{ name: string }>();
  const names = new Set((info.results ?? []).map((row) => row.name));
  const columns: [string, string][] = [
    ["seen_at", "INTEGER"],
    ["live_at", "INTEGER"],
    ["presence", "TEXT"],
    ["device", "TEXT"],
  ];
  for (const [name, type] of columns) {
    if (!names.has(name)) await env.DB.prepare(`ALTER TABLE users ADD COLUMN ${name} ${type}`).run();
  }
}

export function ensureSchema(env: Env): Promise<void> {
  if (!schemaReady) {
    schemaReady = applySchema(env).catch((error: unknown) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

export async function userFromRequest(request: Request, env: Env): Promise<UserRow | null> {
  await ensureSchema(env);
  const id = readCookie(request, "session");
  if (!id || !/^[a-f0-9]{64}$/.test(id)) return null;
  return env.DB.prepare(
    `SELECT u.id, u.provider, u.name, u.avatar, u.friend_code, u.room_code, u.room_at, u.presence
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > ?`,
  ).bind(id, Date.now()).first<UserRow>();
}

export async function upsertUser(env: Env, profile: Profile): Promise<string> {
  await ensureSchema(env);
  const found = await findProvider(env, profile);
  if (found) {
    await env.DB.prepare("UPDATE users SET name = ?, avatar = ? WHERE id = ?")
      .bind(profile.name, profile.avatar, found).run();
    return found;
  }
  const id = crypto.randomUUID();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await env.DB.prepare(
        `INSERT INTO users (id, provider, provider_id, name, avatar, friend_code, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(id, profile.provider, profile.providerId, profile.name, profile.avatar, makeCode(6), Date.now()).run();
      return id;
    } catch (error) {
      const again = await findProvider(env, profile);
      if (again) {
        await env.DB.prepare("UPDATE users SET name = ?, avatar = ? WHERE id = ?")
          .bind(profile.name, profile.avatar, again).run();
        return again;
      }
      if (attempt === 4) throw error;
    }
  }
  throw new Error("Não deu para criar a conta.");
}

async function findProvider(env: Env, profile: Profile): Promise<string | null> {
  const row = await env.DB.prepare("SELECT id FROM users WHERE provider = ? AND provider_id = ?")
    .bind(profile.provider, profile.providerId).first<{ id: string }>();
  return row?.id ?? null;
}

const MONTH = 60 * 60 * 24 * 30;

export async function createSession(env: Env, userId: string): Promise<{ id: string; maxAge: number }> {
  const id = randomHex(32);
  const maxAge = MONTH;
  await env.DB.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(id, userId, Date.now() + maxAge * 1000).run();
  return { id, maxAge };
}

export async function deleteSession(env: Env, request: Request, userId: string): Promise<void> {
  const id = readCookie(request, "session");
  await env.DB.prepare("UPDATE users SET room_code = NULL, room_at = NULL, live_at = NULL WHERE id = ?").bind(userId).run();
  if (id) await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(id).run();
}
