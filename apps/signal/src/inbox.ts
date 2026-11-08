import type { Env } from "./env";

// Um objeto por conta. O socket fica hibernando e só acorda para entregar o aviso.
export class Inbox implements DurableObject {
  constructor(private state: DurableObjectState) {
    this.state.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname === "/poke") {
      const message = JSON.stringify({ t: "refresh" });
      for (const socket of this.state.getWebSockets()) {
        try {
          socket.send(message);
        } catch {
          /* o socket já caiu */
        }
      }
      return new Response(null, { status: 204 });
    }
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Esperava WebSocket.", { status: 426 });
    }
    const pair = new WebSocketPair();
    this.state.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  webSocketClose(socket: WebSocket, code: number, reason: string) {
    try {
      socket.close(code, reason);
    } catch {
      /* já fechou */
    }
  }
}

export async function poke(env: Env, userId: string): Promise<void> {
  try {
    const stub = env.INBOX.get(env.INBOX.idFromName(userId));
    await stub.fetch("https://inbox/poke", { method: "POST" });
  } catch (error) {
    console.error(error);
  }
}

export async function pokeAll(env: Env, userIds: string[]): Promise<void> {
  const seen = new Set<string>();
  await Promise.all(userIds.map((id) => {
    if (!id || seen.has(id)) return Promise.resolve();
    seen.add(id);
    return poke(env, id);
  }));
}
