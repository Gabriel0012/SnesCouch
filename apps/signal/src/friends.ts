import { FRIEND_CODE, ROOM_CODE, randomHex } from "./codes";
import type { Env } from "./env";
import { json, problem } from "./http";
import { poke, pokeAll } from "./inbox";
import { deviceKind, presenceMode, presenceStatus, type DeviceKind, type PresenceStatus } from "./presence";
import type { UserRow } from "./users";

const ROOM_TTL = 8 * 60 * 60 * 1000;
const INVITE_TTL = 3 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface LinkRow {
  id: string;
  name: string;
  friend_code: string;
  avatar: string | null;
  room_code: string | null;
  room_at: number | null;
  seen_at: number | null;
  live_at: number | null;
  presence: string | null;
  device: string | null;
  status: string;
  from_id: string;
}

export interface PublicFriend {
  id: string;
  name: string;
  friendCode: string;
  roomCode: string | null;
  hasAvatar: boolean;
  status: PresenceStatus;
  device: DeviceKind | null;
  inviteExpiresAt: number | null;
}

function liveRoom(code: string | null, at: number | null): string | null {
  if (!code || at === null || !ROOM_CODE.test(code)) return null;
  if (Date.now() - at > ROOM_TTL) return null;
  return code;
}

function present(row: LinkRow, room: boolean, inviteExpiresAt: number | null): PublicFriend {
  const status = presenceStatus(row.presence, row.seen_at, row.live_at);
  return {
    id: row.id,
    name: row.name,
    friendCode: row.friend_code,
    roomCode: room ? liveRoom(row.room_code, row.room_at) : null,
    hasAvatar: Boolean(row.avatar),
    status,
    device: status === "offline" ? null : deviceKind(row.device),
    inviteExpiresAt,
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
       u.seen_at AS seen_at,
       u.live_at AS live_at,
       u.presence AS presence,
       u.device AS device,
       f.status AS status,
       f.from_id AS from_id
     FROM friendships f
     JOIN users u ON u.id = CASE WHEN f.from_id = ? THEN f.to_id ELSE f.from_id END
     WHERE f.from_id = ? OR f.to_id = ?`,
  ).bind(user.id, user.id, user.id, user.id).all<LinkRow>();
  const now = Date.now();
  const room = liveRoom(user.room_code, user.room_at);
  const sent = await env.DB.prepare(
    "SELECT to_id, created_at, room_code FROM room_invites WHERE from_id = ? AND created_at >= ?",
  ).bind(user.id, now - INVITE_TTL).all<{ to_id: string; created_at: number; room_code: string }>();
  const pendingInvite = new Map<string, number>();
  if (room) {
    for (const invite of sent.results ?? []) {
      if (invite.room_code !== room) continue;
      const expires = invite.created_at + INVITE_TTL;
      const prev = pendingInvite.get(invite.to_id);
      if (prev === undefined || expires > prev) pendingInvite.set(invite.to_id, expires);
    }
  }
  const friends: PublicFriend[] = [];
  const incoming: PublicFriend[] = [];
  const outgoing: PublicFriend[] = [];
  for (const row of rows.results ?? []) {
    if (row.status === "accepted") friends.push(present(row, true, pendingInvite.get(row.id) ?? null));
    else if (row.status === "pending" && row.from_id === user.id) outgoing.push(present(row, false, null));
    else if (row.status === "pending") incoming.push(present(row, false, null));
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
    await poke(env, other.id);
    return json({ status: "accepted" });
  }
  await env.DB.prepare(
    "INSERT INTO friendships (from_id, to_id, status, created_at) VALUES (?, ?, 'pending', ?)",
  ).bind(user.id, other.id, Date.now()).run();
  await poke(env, other.id);
  return json({ status: "pending" }, 201);
}

export async function acceptFriend(env: Env, user: UserRow, otherId: string): Promise<Response> {
  if (!UUID.test(otherId)) return problem("Pedido inválido.", 400);
  const result = await env.DB.prepare(
    "UPDATE friendships SET status = 'accepted' WHERE from_id = ? AND to_id = ? AND status = 'pending'",
  ).bind(otherId, user.id).run();
  if (!result.meta.changes) return problem("Não achei esse pedido.", 404);
  await poke(env, otherId);
  return json({ ok: true });
}

export async function declineFriend(env: Env, user: UserRow, otherId: string): Promise<Response> {
  if (!UUID.test(otherId)) return problem("Pedido inválido.", 400);
  const result = await env.DB.prepare(
    "DELETE FROM friendships WHERE from_id = ? AND to_id = ? AND status = 'pending'",
  ).bind(otherId, user.id).run();
  if (!result.meta.changes) return problem("Não achei esse pedido.", 404);
  await poke(env, otherId);
  return json({ ok: true });
}

export async function removeFriend(env: Env, user: UserRow, otherId: string): Promise<Response> {
  if (!UUID.test(otherId) || otherId === user.id) return problem("Amigo inválido.", 400);
  await env.DB.prepare(
    "DELETE FROM friendships WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)",
  ).bind(user.id, otherId, otherId, user.id).run();
  await poke(env, otherId);
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
  await pokeAll(env, await listeners(env, user.id));
  return json({ ok: true });
}

export async function clearOpenRoom(env: Env, user: UserRow): Promise<Response> {
  const watchers = await listeners(env, user.id);
  await env.DB.prepare("UPDATE users SET room_code = NULL, room_at = NULL WHERE id = ?").bind(user.id).run();
  await env.DB.prepare("DELETE FROM room_invites WHERE from_id = ?").bind(user.id).run();
  await pokeAll(env, watchers);
  return json({ ok: true });
}

export async function pokeListeners(env: Env, userId: string): Promise<void> {
  await pokeAll(env, await listeners(env, userId));
}

interface PresenceRow {
  seen_at: number | null;
  live_at: number | null;
  presence: string | null;
  device: string | null;
}

export async function setPresence(request: Request, env: Env, user: UserRow): Promise<Response> {
  let body: { beat?: unknown; mode?: unknown; device?: unknown };
  try {
    body = await request.json() as { beat?: unknown; mode?: unknown; device?: unknown };
  } catch {
    return problem("Presença inválida.", 400);
  }
  const before = await env.DB.prepare(
    "SELECT seen_at, live_at, presence, device FROM users WHERE id = ?",
  ).bind(user.id).first<PresenceRow>();
  const device = body.device === "phone" || body.device === "desktop" ? body.device : null;
  if (body.mode !== undefined) {
    if (body.mode !== "auto" && body.mode !== "away" && body.mode !== "offline") return problem("Presença inválida.", 400);
    const mode = body.mode === "auto" ? null : body.mode;
    await env.DB.prepare("UPDATE users SET presence = ? WHERE id = ?").bind(mode, user.id).run();
  }
  if (body.beat !== undefined) {
    if (body.beat !== "active" && body.beat !== "live" && body.beat !== "gone") return problem("Presença inválida.", 400);
    const now = Date.now();
    if (body.beat === "gone") {
      await env.DB.prepare("UPDATE users SET live_at = NULL WHERE id = ?").bind(user.id).run();
    } else if (body.beat === "active") {
      await env.DB.prepare("UPDATE users SET seen_at = ?, live_at = ?, device = COALESCE(?, device) WHERE id = ?")
        .bind(now, now, device, user.id).run();
    } else {
      await env.DB.prepare("UPDATE users SET live_at = ?, device = COALESCE(?, device) WHERE id = ?")
        .bind(now, device, user.id).run();
    }
  }
  if (body.mode === undefined && body.beat === undefined) return problem("Presença inválida.", 400);
  const after = await env.DB.prepare(
    "SELECT seen_at, live_at, presence, device FROM users WHERE id = ?",
  ).bind(user.id).first<PresenceRow>();
  const oldStatus = presenceStatus(before?.presence ?? null, before?.seen_at ?? null, before?.live_at ?? null);
  const nextStatus = presenceStatus(after?.presence ?? null, after?.seen_at ?? null, after?.live_at ?? null);
  const oldDevice = oldStatus === "offline" ? null : deviceKind(before?.device ?? null);
  const nextDevice = nextStatus === "offline" ? null : deviceKind(after?.device ?? null);
  if (oldStatus !== nextStatus || oldDevice !== nextDevice) await pokeListeners(env, user.id);
  return json({
    status: nextStatus,
    mode: presenceMode(after?.presence ?? null),
    device: deviceKind(after?.device ?? null),
  });
}

async function listeners(env: Env, userId: string): Promise<string[]> {
  const friends = await env.DB.prepare(
    `SELECT CASE WHEN from_id = ? THEN to_id ELSE from_id END AS id
     FROM friendships
     WHERE status = 'accepted' AND (from_id = ? OR to_id = ?)`,
  ).bind(userId, userId, userId).all<{ id: string }>();
  const invited = await env.DB.prepare(
    "SELECT to_id AS id FROM room_invites WHERE from_id = ?",
  ).bind(userId).all<{ id: string }>();
  return [...(friends.results ?? []), ...(invited.results ?? [])].map((row) => row.id);
}

async function acceptedFriend(env: Env, userId: string, otherId: string): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT status FROM friendships
     WHERE status = 'accepted' AND ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?))`,
  ).bind(userId, otherId, otherId, userId).first();
  return Boolean(row);
}

export async function inviteToRoom(env: Env, user: UserRow, otherId: string): Promise<Response> {
  if (!UUID.test(otherId) || otherId === user.id) return problem("Amigo inválido.", 400);
  const room = liveRoom(user.room_code, user.room_at);
  if (!room) return problem("Crie a sala antes de chamar alguém.", 409);
  if (!await acceptedFriend(env, user.id, otherId)) return problem("Essa pessoa não está na sua lista.", 404);
  const now = Date.now();
  const rows = await env.DB.prepare(
    "SELECT id, created_at FROM room_invites WHERE from_id = ? AND to_id = ? ORDER BY created_at DESC",
  ).bind(user.id, otherId).all<{ id: string; created_at: number }>();
  const open = (rows.results ?? []).find((row) => now - row.created_at < INVITE_TTL);
  if (open) {
    await env.DB.prepare("UPDATE room_invites SET created_at = ?, room_code = ? WHERE id = ?")
      .bind(now, room, open.id).run();
    for (const extra of rows.results ?? []) {
      if (extra.id !== open.id) await env.DB.prepare("DELETE FROM room_invites WHERE id = ?").bind(extra.id).run();
    }
  } else {
    await env.DB.prepare("DELETE FROM room_invites WHERE from_id = ? AND to_id = ?").bind(user.id, otherId).run();
    await env.DB.prepare(
      "INSERT INTO room_invites (id, from_id, to_id, room_code, created_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(randomHex(16), user.id, otherId, room, now).run();
  }
  await poke(env, otherId);
  return json({ ok: true, expiresAt: now + INVITE_TTL }, open ? 200 : 201);
}

interface InviteRow {
  id: string;
  room_code: string;
  created_at: number;
  from_id: string;
  from_name: string;
  host_room: string | null;
  host_at: number | null;
}

export async function listInvites(env: Env, user: UserRow): Promise<Response> {
  const now = Date.now();
  await env.DB.prepare("DELETE FROM room_invites WHERE created_at < ?").bind(now - INVITE_TTL).run();
  const rows = await env.DB.prepare(
    `SELECT i.id AS id, i.room_code AS room_code, i.created_at AS created_at,
            u.id AS from_id, u.name AS from_name, u.room_code AS host_room, u.room_at AS host_at
     FROM room_invites i
     JOIN users u ON u.id = i.from_id
     WHERE i.to_id = ?
     ORDER BY i.created_at DESC`,
  ).bind(user.id).all<InviteRow>();
  const invites = [];
  for (const row of rows.results ?? []) {
    if (liveRoom(row.host_room, row.host_at) !== row.room_code) {
      await env.DB.prepare("DELETE FROM room_invites WHERE id = ?").bind(row.id).run();
      continue;
    }
    invites.push({
      id: row.id,
      fromId: row.from_id,
      fromName: row.from_name,
      roomCode: row.room_code,
      createdAt: row.created_at,
      expiresAt: row.created_at + INVITE_TTL,
    });
  }
  return json({ invites });
}

export async function answerInvite(env: Env, user: UserRow, inviteId: string, accept: boolean): Promise<Response> {
  if (!/^[a-f0-9]{32}$/.test(inviteId)) return problem("Convite inválido.", 400);
  const row = await env.DB.prepare(
    "SELECT id, room_code, created_at FROM room_invites WHERE id = ? AND to_id = ?",
  ).bind(inviteId, user.id).first<{ id: string; room_code: string; created_at: number }>();
  if (!row || Date.now() - row.created_at > INVITE_TTL) {
    if (row) await env.DB.prepare("DELETE FROM room_invites WHERE id = ?").bind(row.id).run();
    return problem("Esse convite já saiu.", 404);
  }
  await env.DB.prepare("DELETE FROM room_invites WHERE id = ?").bind(row.id).run();
  if (!accept) return json({ ok: true });
  return json({ roomCode: row.room_code });
}

export async function sharesAvatar(env: Env, user: UserRow, otherId: string): Promise<boolean> {
  if (otherId === user.id) return true;
  const row = await env.DB.prepare(
    `SELECT status FROM friendships
     WHERE (status = 'accepted' AND ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)))
        OR (status = 'pending' AND from_id = ? AND to_id = ?)`,
  ).bind(user.id, otherId, otherId, user.id, otherId, user.id).first();
  return Boolean(row);
}
