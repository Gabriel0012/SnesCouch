import catalog from "../../../packages/catalog/games.json";
import { Room } from "./room";

export { Room };

export interface Env {
  ROOMS: DurableObjectNamespace;
  TURN_URL?: string;
  TURN_USERNAME?: string;
  TURN_CREDENTIAL?: string;
}

const CODE = /^[A-HJ-NP-Z2-9]{5}$/;

function headers(extra?: HeadersInit) {
  return {
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Cross-Origin-Resource-Policy": "same-origin",
    ...Object.fromEntries(new Headers(extra)),
  };
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
    if (url.pathname === "/api/health") {
      return Response.json({ ok: true, games: catalog.games.length }, { headers: headers() });
    }
    if (url.pathname === "/api/ice") {
      return Response.json({ iceServers: ice(env) }, { headers: headers() });
    }
    const match = url.pathname.match(/^\/api\/rooms\/([A-HJ-NP-Z2-9]{5})$/);
    if (match) {
      if (!CODE.test(match[1])) return new Response("Código inválido.", { status: 400, headers: headers() });
      const id = env.ROOMS.idFromName(match[1]);
      const room = env.ROOMS.get(id);
      return room.fetch(request);
    }
    return new Response("Não encontrado.", { status: 404, headers: headers() });
  },
};
