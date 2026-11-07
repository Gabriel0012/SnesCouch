import catalog from "../../../packages/catalog/games.json";
import { ROOM_CODE } from "./codes";
import type { Env } from "./env";
import { baseHeaders } from "./http";
import { Room } from "./room";
import { routeAccount } from "./routes";

export type { Env };
export { Room };

function headers(extra?: HeadersInit) {
  return Object.fromEntries(baseHeaders(extra));
}

function coffeeUrl(env: Env): string | null {
  const value = env.MERCADO_PAGO_URL?.trim();
  if (!value) return null;
  try {
    const target = new URL(value);
    if (target.protocol !== "https:") return null;
    return target.toString();
  } catch {
    return null;
  }
}

function ice(env: Env) {
  const iceServers: { urls: string; username?: string; credential?: string }[] = [
    { urls: "stun:stun.l.google.com:19302" },
  ];
  if (env.TURN_URL) {
    iceServers.push({
      urls: env.TURN_URL,
      username: env.TURN_USERNAME,
      credential: env.TURN_CREDENTIAL,
    });
  }
  return iceServers;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const account = await routeAccount(request, env);
    if (account) return account;
    if (url.pathname === "/api/health") {
      return Response.json({ ok: true, games: catalog.games.length }, { headers: headers() });
    }
    if (url.pathname === "/api/ice") {
      return Response.json({ iceServers: ice(env) }, { headers: headers() });
    }
    if (url.pathname === "/api/coffee") {
      return Response.json({ url: coffeeUrl(env) }, { headers: headers() });
    }
    const match = url.pathname.match(/^\/api\/rooms\/([A-HJ-NP-Z2-9]{5})$/);
    if (match) {
      if (!ROOM_CODE.test(match[1])) return new Response("Código inválido.", { status: 400, headers: headers() });
      const id = env.ROOMS.idFromName(match[1]);
      const room = env.ROOMS.get(id);
      return room.fetch(request);
    }
    return serveAsset(request, env);
  },
};

async function serveAsset(request: Request, env: Env): Promise<Response> {
  if (!env.ASSETS) return new Response("Não encontrado.", { status: 404, headers: headers() });
  const asset = await env.ASSETS.fetch(request);
  const out = new Headers(asset.headers);
  for (const [key, value] of Object.entries(headers())) out.set(key, value);
  return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers: out });
}
