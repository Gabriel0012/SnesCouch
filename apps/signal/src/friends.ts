import { FRIEND_CODE, ROOM_CODE } from "./codes";
import type { Env } from "./env";
import { json, problem } from "./http";
import type { UserRow } from "./users";

const ROOM_TTL = 8 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface LinkRow {
  id: string;
  name: string;
  friend_code: string;
  avatar: string | null;
  room_code: string | null;
  room_at: number | null;
  status: string;
  from_id: string;
}

export interface PublicFriend {
  id: string;
  name: string;
  friendCode: string;
  roomCode: string | null;
  hasAvatar: boolean;
}

function liveRoom(code: string | null, at: number | null): string | null {
  if (!code || at === null || !ROOM_CODE.test(code)) return null;
  if (Date.now() - at > ROOM_TTL) return null;
  return code;
}

function present(row: LinkRow, room: boolean): PublicFriend {
  return {
    id: row.id,
    name: row.name,
    friendCode: row.friend_code,
    roomCode: room ? liveRoom(row.room_code, row.room_at) : null,
    hasAvatar: Boolean(row.avatar),
  };
}

export async function listFriends(env: Env, user: UserRow): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT
       CASE WHEN f.from_id = ? THEN f.to_id ELSE f.from_id END AS id,
       u.name AS name,
       u.friend_code AS friend_code,
       u.avatar AS avatar,
       u.room_code AS room_code,
       u.room_at AS room_at,
       f.status AS status,
       f.from_id AS from_id
     FROM friendships f
     JOIN users u ON u.id = CASE WHEN f.from_id = ? THEN f.to_id ELSE f.from_id END
     WHERE f.from_id = ? OR f.to_id = ?`,
  ).bind(user.id, user.id, user.id, user.id).all<LinkRow>();
  const friends: PublicFriend[] = [];
  const incoming: PublicFriend[] = [];
  const outgoing: PublicFriend[] = [];
  for (const row of rows.results ?? []) {
    if (row.status === "accepted") friends.push(present(row, true));
    else if (row.status === "pending" && row.from_id === user.id) outgoing.push(present(row, false));
    else if (row.status === "pending") incoming.push(present(row, false));
  }
  return json({ friends, incoming, outgoing });
}

export async function requestFriend(request: Request, env: Env, user: UserRow): Promise<Response> {
  let body: { code?: unknown };
  try {
    body = await request.json() as { code?: unknown };
  } catch {
    return problem("Código inválido.", 400);
  }
  const code = String(body.code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!FRIEND_CODE.test(code)) return problem("O código de amigo tem 6 letras, sem I, O, 0 ou 1.", 400);
  if (code === user.friend_code) return problem("Esse código é o seu.", 400);
  const other = await env.DB.prepare(
    "SELECT id FROM users WHERE friend_code = ?",
  ).bind(code).first<{ id: string }>();
  if (!other) return problem("Não achei esse código.", 404);
  const existing = await env.DB.prepare(
    `SELECT from_id, to_id, status FROM friendships
     WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)`,
  ).bind(user.id, other.id, other.id, user.id).first<{ from_id: string; to_id: string; status: string }>();
  if (existing?.status === "accepted") return problem("Vocês já são amigos.", 409);
  if (existing?.status === "pending" && existing.from_id === user.id) return problem("O pedido já foi enviado.", 409);
  if (existing?.status === "pending" && existing.from_id === other.id) {
    await env.DB.prepare(
      "UPDATE friendships SET status = 'accepted' WHERE from_id = ? AND to_id = ?",
    ).bind(other.id, user.id).run();
    return json({ status: "accepted" });
  }
  await env.DB.prepare(
    "INSERT INTO friendships (from_id, to_id, status, created_at) VALUES (?, ?, 'pending', ?)",
  ).bind(user.id, other.id, Date.now()).run();
  return json({ status: "pending" }, 201);
}

export async function acceptFriend(env: Env, user: UserRow, otherId: string): Promise<Response> {
  if (!UUID.test(otherId)) return problem("Pedido inválido.", 400);
  const result = await env.DB.prepare(
    "UPDATE friendships SET status = 'accepted' WHERE from_id = ? AND to_id = ? AND status = 'pending'",
  ).bind(otherId, user.id).run();
  if (!result.meta.changes) return problem("Não achei esse pedido.", 404);
  return json({ ok: true });
}

export async function declineFriend(env: Env, user: UserRow, otherId: string): Promise<Response> {
  if (!UUID.test(otherId)) return problem("Pedido inválido.", 400);
  const result = await env.DB.prepare(
    "DELETE FROM friendships WHERE from_id = ? AND to_id = ? AND status = 'pending'",
  ).bind(otherId, user.id).run();
  if (!result.meta.changes) return problem("Não achei esse pedido.", 404);
  return json({ ok: true });
}

export async function removeFriend(env: Env, user: UserRow, otherId: string): Promise<Response> {
  if (!UUID.test(otherId) || otherId === user.id) return problem("Amigo inválido.", 400);
  await env.DB.prepare(
    "DELETE FROM friendships WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)",
  ).bind(user.id, otherId, otherId, user.id).run();
  return json({ ok: true });
}

export async function setOpenRoom(request: Request, env: Env, user: UserRow): Promise<Response> {
  let body: { code?: unknown };
  try {
    body = await request.json() as { code?: unknown };
  } catch {
    return problem("Código inválido.", 400);
  }
  const code = String(body.code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!ROOM_CODE.test(code)) return problem("Código inválido.", 400);
  await env.DB.prepare("UPDATE users SET room_code = ?, room_at = ? WHERE id = ?")
    .bind(code, Date.now(), user.id).run();
  return json({ ok: true });
}

export async function clearOpenRoom(env: Env, user: UserRow): Promise<Response> {
  await env.DB.prepare("UPDATE users SET room_code = NULL, room_at = NULL WHERE id = ?").bind(user.id).run();
  return json({ ok: true });
}

export async function sharesAvatar(env: Env, user: UserRow, otherId: string): Promise<boolean> {
  if (otherId === user.id) return true;
  const row = await env.DB.prepare(
    `SELECT status FROM friendships
     WHERE status = 'accepted' AND ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?))`,
  ).bind(user.id, otherId, otherId, user.id).first();
  return Boolean(row);
}
