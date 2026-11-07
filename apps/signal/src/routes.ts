import { beginLogin, clearSessionCookie, finishLogin, type Provider } from "./auth";
import { proxyAvatar } from "./avatar";
import type { Env } from "./env";
import {
  acceptFriend,
  answerInvite,
  clearOpenRoom,
  declineFriend,
  inviteToRoom,
  listFriends,
  listInvites,
  removeFriend,
  requestFriend,
  setOpenRoom,
  sharesAvatar,
} from "./friends";
import { json, problem, text } from "./http";
import { getSave, getShot, listSaves, putSave, putShot } from "./saves";
import { deleteSession, userFromRequest, type UserRow } from "./users";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function publicUser(user: UserRow) {
  const provider: Provider | null = user.provider === "discord" || user.provider === "google" ? user.provider : null;
  return {
    id: user.id,
    name: user.name,
    provider,
    friendCode: user.friend_code,
    hasAvatar: Boolean(user.avatar),
  };
}

async function requireUser(request: Request, env: Env): Promise<UserRow | Response> {
  try {
    const user = await userFromRequest(request, env);
    if (!user) return problem("Entre na conta para continuar.", 401);
    return user;
  } catch (error) {
    console.error(error);
    return problem("A conta não respondeu.", 503);
  }
}

export async function routeAccount(request: Request, env: Env): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path === "/api/health" || path === "/api/ice" || path === "/api/coffee" || path.startsWith("/api/rooms/")) return null;
  const account = path.startsWith("/api/auth")
    || path.startsWith("/api/saves")
    || path.startsWith("/api/friends")
    || path.startsWith("/api/invites")
    || path.startsWith("/api/avatars/")
    || path === "/api/me"
    || path.startsWith("/api/me/")
    || path === "/api/logout";
  if (!account) return null;

  if (path === "/api/auth/discord" && request.method === "GET") return beginLogin(request, env, "discord");
  if (path === "/api/auth/google" && request.method === "GET") return beginLogin(request, env, "google");
  if (path === "/api/auth/discord/callback" && request.method === "GET") return finishLogin(request, env, "discord");
  if (path === "/api/auth/google/callback" && request.method === "GET") return finishLogin(request, env, "google");

  if (path === "/api/me" && request.method === "GET") {
    try {
      const user = await userFromRequest(request, env);
      return json({ user: user ? publicUser(user) : null });
    } catch (error) {
      console.error(error);
      return problem("A conta não respondeu.", 503);
    }
  }

  if (path === "/api/logout" && request.method === "POST") {
    const user = await requireUser(request, env);
    if (user instanceof Response) return user;
    await deleteSession(env, request, user.id);
    return json({ ok: true }, 200, [clearSessionCookie(request)]);
  }

  if (path === "/api/me/avatar" && request.method === "GET") {
    const user = await requireUser(request, env);
    if (user instanceof Response) return user;
    return proxyAvatar(user.avatar);
  }

  if (path === "/api/me/room" && request.method === "POST") {
    const user = await requireUser(request, env);
    if (user instanceof Response) return user;
    return setOpenRoom(request, env, user);
  }

  if (path === "/api/me/room" && request.method === "DELETE") {
    const user = await requireUser(request, env);
    if (user instanceof Response) return user;
    return clearOpenRoom(env, user);
  }

  const avatar = path.match(/^\/api\/avatars\/([0-9a-f-]+)$/);
  if (avatar && request.method === "GET") {
    if (!UUID.test(avatar[1])) return text("Não encontrado.", 404);
    const user = await requireUser(request, env);
    if (user instanceof Response) return user;
    if (!await sharesAvatar(env, user, avatar[1])) return text("Não encontrado.", 404);
    if (avatar[1] === user.id) return proxyAvatar(user.avatar);
    const other = await env.DB.prepare("SELECT avatar FROM users WHERE id = ?")
      .bind(avatar[1]).first<{ avatar: string | null }>();
    return proxyAvatar(other?.avatar ?? null);
  }

  if (path === "/api/saves" && request.method === "GET") {
    const user = await requireUser(request, env);
    if (user instanceof Response) return user;
    return listSaves(request, env, user);
  }

  const save = path.match(/^\/api\/saves\/([a-z0-9-]+)\/([123])(\/shot)?$/);
  if (save) {
    const user = await requireUser(request, env);
    if (user instanceof Response) return user;
    const gameId = save[1];
    const slot = Number(save[2]);
    const shot = Boolean(save[3]);
    if (request.method === "PUT" && shot) return putShot(request, env, user, gameId, slot);
    if (request.method === "PUT") return putSave(request, env, user, gameId, slot);
    if (request.method === "GET" && shot) return getShot(env, user, gameId, slot);
    if (request.method === "GET") return getSave(env, user, gameId, slot);
  }

  if (path === "/api/friends" && request.method === "GET") {
    const user = await requireUser(request, env);
    if (user instanceof Response) return user;
    return listFriends(env, user);
  }
  if (path === "/api/friends" && request.method === "POST") {
    const user = await requireUser(request, env);
    if (user instanceof Response) return user;
    return requestFriend(request, env, user);
  }

  if (path === "/api/invites" && request.method === "GET") {
    const user = await requireUser(request, env);
    if (user instanceof Response) return user;
    return listInvites(env, user);
  }

  const inviteAnswer = path.match(/^\/api\/invites\/([a-f0-9]{32})\/(accept|decline)$/);
  if (inviteAnswer && request.method === "POST") {
    const user = await requireUser(request, env);
    if (user instanceof Response) return user;
    return answerInvite(env, user, inviteAnswer[1], inviteAnswer[2] === "accept");
  }

  const call = path.match(/^\/api\/friends\/([0-9a-f-]+)\/invite$/);
  if (call && request.method === "POST" && UUID.test(call[1])) {
    const user = await requireUser(request, env);
    if (user instanceof Response) return user;
    return inviteToRoom(env, user, call[1]);
  }

  const friend = path.match(/^\/api\/friends\/([0-9a-f-]+)\/(accept|decline)$/);
  if (friend && request.method === "POST" && UUID.test(friend[1])) {
    const user = await requireUser(request, env);
    if (user instanceof Response) return user;
    return friend[2] === "accept" ? acceptFriend(env, user, friend[1]) : declineFriend(env, user, friend[1]);
  }

  const remove = path.match(/^\/api\/friends\/([0-9a-f-]+)$/);
  if (remove && request.method === "DELETE" && UUID.test(remove[1])) {
    const user = await requireUser(request, env);
    if (user instanceof Response) return user;
    return removeFriend(env, user, remove[1]);
  }

  return text("Não encontrado.", 404);
}
