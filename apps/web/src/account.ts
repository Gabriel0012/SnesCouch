/** Save na nuvem desligado por custo. O arquivo ficaria no R2. Ver AGENTS.md. */
export const cloudSaves = false;

export class AccountError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export interface AccountUser {
  id: string;
  name: string;
  provider: "discord" | "google";
  friendCode: string;
  hasAvatar: boolean;
}

export interface CloudSlot {
  slot: number;
  sha1: string;
  savedAt: number;
}

export interface FriendCard {
  id: string;
  name: string;
  friendCode: string;
  roomCode: string | null;
  hasAvatar: boolean;
}

export interface FriendLists {
  friends: FriendCard[];
  incoming: FriendCard[];
  outgoing: FriendCard[];
}

async function fail(response: Response): Promise<never> {
  let message = "A conta não respondeu.";
  try {
    const body = await response.json() as { error?: string };
    if (body.error) message = body.error;
  } catch {
    /* a resposta não era JSON */
  }
  throw new AccountError(message, response.status);
}

function asUser(value: unknown): AccountUser | null {
  if (!value || typeof value !== "object") return null;
  const user = value as Partial<AccountUser>;
  if (user.provider !== "discord" && user.provider !== "google") return null;
  if (typeof user.id !== "string" || typeof user.name !== "string" || typeof user.friendCode !== "string") return null;
  return {
    id: user.id,
    name: user.name,
    provider: user.provider,
    friendCode: user.friendCode,
    hasAvatar: Boolean(user.hasAvatar),
  };
}

function asFriend(value: unknown): FriendCard | null {
  if (!value || typeof value !== "object") return null;
  const friend = value as Partial<FriendCard>;
  if (typeof friend.id !== "string" || typeof friend.name !== "string" || typeof friend.friendCode !== "string") return null;
  return {
    id: friend.id,
    name: friend.name,
    friendCode: friend.friendCode,
    roomCode: typeof friend.roomCode === "string" ? friend.roomCode : null,
    hasAvatar: Boolean(friend.hasAvatar),
  };
}

export async function fetchAccount(): Promise<AccountUser | null> {
  const response = await fetch("/api/me");
  if (!response.ok) await fail(response);
  const body = await response.json() as { user?: unknown };
  return asUser(body.user);
}

export async function logoutAccount(): Promise<void> {
  const response = await fetch("/api/logout", { method: "POST" });
  if (!response.ok) await fail(response);
}

export async function listCloud(gameId: string): Promise<CloudSlot[]> {
  const response = await fetch(`/api/saves?game=${encodeURIComponent(gameId)}`);
  if (!response.ok) await fail(response);
  const body = await response.json() as { saves?: { slot?: unknown; sha1?: unknown; savedAt?: unknown }[] };
  return (body.saves ?? []).flatMap((slot) => {
    if (typeof slot.slot !== "number" || typeof slot.sha1 !== "string" || typeof slot.savedAt !== "number") return [];
    return [{ slot: slot.slot, sha1: slot.sha1, savedAt: slot.savedAt }];
  });
}

function bytesBody(bytes: Uint8Array): Blob {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy]);
}

export async function uploadSave(gameId: string, slot: number, sha1: string, state: Uint8Array, shot: Uint8Array | null): Promise<number> {
  const response = await fetch(`/api/saves/${gameId}/${slot}`, {
    method: "PUT",
    headers: { "content-type": "application/octet-stream", "x-sha1": sha1 },
    body: bytesBody(state),
  });
  if (!response.ok) await fail(response);
  const body = await response.json() as { savedAt?: unknown };
  if (shot) {
    const picture = await fetch(`/api/saves/${gameId}/${slot}/shot`, {
      method: "PUT",
      headers: { "content-type": "image/png" },
      body: bytesBody(shot),
    });
    if (!picture.ok) await fail(picture);
  }
  if (typeof body.savedAt !== "number") throw new AccountError("A nuvem não respondeu.", 502);
  return body.savedAt;
}

export async function downloadSave(gameId: string, slot: number): Promise<Uint8Array> {
  const response = await fetch(`/api/saves/${gameId}/${slot}`);
  if (!response.ok) await fail(response);
  return new Uint8Array(await response.arrayBuffer());
}

export async function downloadShot(gameId: string, slot: number): Promise<Uint8Array | null> {
  const response = await fetch(`/api/saves/${gameId}/${slot}/shot`);
  if (response.status === 404) return null;
  if (!response.ok) await fail(response);
  return new Uint8Array(await response.arrayBuffer());
}

export async function loadFriends(): Promise<FriendLists> {
  const response = await fetch("/api/friends");
  if (!response.ok) await fail(response);
  const body = await response.json() as { friends?: unknown[]; incoming?: unknown[]; outgoing?: unknown[] };
  const take = (list: unknown[] | undefined) => (list ?? []).flatMap((item) => {
    const friend = asFriend(item);
    return friend ? [friend] : [];
  });
  return { friends: take(body.friends), incoming: take(body.incoming), outgoing: take(body.outgoing) };
}

export async function askFriend(code: string): Promise<"pending" | "accepted"> {
  const response = await fetch("/api/friends", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!response.ok) await fail(response);
  const body = await response.json() as { status?: string };
  return body.status === "accepted" ? "accepted" : "pending";
}

export async function acceptFriend(id: string): Promise<void> {
  const response = await fetch(`/api/friends/${id}/accept`, { method: "POST" });
  if (!response.ok) await fail(response);
}

export async function declineFriend(id: string): Promise<void> {
  const response = await fetch(`/api/friends/${id}/decline`, { method: "POST" });
  if (!response.ok) await fail(response);
}

export async function removeFriend(id: string): Promise<void> {
  const response = await fetch(`/api/friends/${id}`, { method: "DELETE" });
  if (!response.ok) await fail(response);
}

export async function publishOpenRoom(code: string | null): Promise<void> {
  const response = code
    ? await fetch("/api/me/room", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    })
    : await fetch("/api/me/room", { method: "DELETE" });
  if (!response.ok) await fail(response);
}
