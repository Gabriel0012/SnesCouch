import catalog from "../../../packages/catalog/games.json";
import type { Env } from "./index";

interface SocketState {
  role: "host" | "guest";
}

const sockets = new WeakMap<WebSocket, SocketState>();

interface ChatLine {
  from: "host" | "guest";
  name: string;
  text: string;
  at: number;
}

export class Room implements DurableObject {
  private host: WebSocket | null = null;
  private guest: WebSocket | null = null;
  private gameId = "";
  private sha1 = "";
  private hostControl = "Teclado";
  private guestControl = "Teclado";
  private hostName = "";
  private guestName = "";
  private chat: ChatLine[] = [];

  constructor(private state: DurableObjectState, private env: Env) {}

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Esperava WebSocket.", { status: 426 });
    }
    const url = new URL(request.url);
    const role = url.searchParams.get("role");
    const gameId = url.searchParams.get("game") ?? "";
    const sha1 = (url.searchParams.get("sha1") ?? "").toLowerCase();
    const game = catalog.games.find((entry) => entry.id === gameId);
    if (role !== "host" && role !== "guest") {
      return new Response("Papel inválido.", { status: 400 });
    }
    if (!game || sha1 !== game.sha1) {
      return new Response("Jogo ou hash recusado.", { status: 400 });
    }
    if (role === "guest" && !this.alive(this.host)) {
      return new Response("A sala ainda não existe.", { status: 404 });
    }
    if (role === "guest" && (gameId !== this.gameId || sha1 !== this.sha1)) {
      return new Response("A ROM não é a mesma da sala.", { status: 409 });
    }
    if (role === "host" && this.alive(this.host)) {
      if (this.alive(this.guest)) return new Response("Sala ocupada.", { status: 409 });
      const previous = this.host;
      this.host = null;
      try { previous.close(4000, "Nova conexão."); } catch { /* o socket antigo já caiu */ }
    }
    if (role === "guest" && this.alive(this.guest)) {
      return new Response("Sala cheia.", { status: 409 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    sockets.set(server, { role });
    if (role === "host") {
      this.host = server;
      this.gameId = gameId;
      this.sha1 = sha1;
    } else {
      this.guest = server;
    }
    server.addEventListener("message", (event) => this.onMessage(server, event));
    server.addEventListener("close", () => this.onClose(server));
    server.addEventListener("error", () => this.onClose(server));
    this.send(server, { t: "chat-log", messages: this.chat });
    if (role === "guest" && this.alive(this.host)) {
      this.send(this.host, { t: "peer" });
      this.send(server, { t: "peer" });
    } else if (role === "host" && this.alive(this.guest)) {
      this.send(server, { t: "peer" });
      this.send(this.guest, { t: "peer" });
    }
    this.broadcastRoster();
    return new Response(null, { status: 101, webSocket: client });
  }

  private roster() {
    return {
      t: "roster",
      host: { here: this.alive(this.host), control: this.hostControl, name: this.hostName },
      guest: { here: this.alive(this.guest), control: this.guestControl, name: this.guestName },
    };
  }

  private broadcastRoster() {
    const message = this.roster();
    this.send(this.host, message);
    this.send(this.guest, message);
  }

  private alive(socket: WebSocket | null): socket is WebSocket {
    return socket !== null && socket.readyState === WebSocket.OPEN;
  }

  private other(socket: WebSocket): WebSocket | null {
    if (socket === this.host) return this.alive(this.guest) ? this.guest : null;
    if (socket === this.guest) return this.alive(this.host) ? this.host : null;
    return null;
  }

  private send(socket: WebSocket | null, message: unknown) {
    if (!this.alive(socket)) return;
    socket.send(JSON.stringify(message));
  }

  private onMessage(socket: WebSocket, event: MessageEvent) {
    let message: { t?: string; data?: unknown };
    try {
      message = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (message.t === "ping") {
      this.send(socket, { t: "pong" });
      return;
    }
    if (message.t === "signal") {
      this.send(this.other(socket), { t: "signal", data: message.data });
      return;
    }
    const role = sockets.get(socket)?.role;
    if (!role) return;
    if (message.t === "profile") {
      const body = message as { control?: unknown; name?: unknown };
      let changed = false;
      if (typeof body.control === "string") {
        const control = body.control.slice(0, 40);
        if (role === "host") this.hostControl = control;
        else this.guestControl = control;
        changed = true;
      }
      if (typeof body.name === "string") {
        const name = body.name.replace(/\s+/g, " ").trim().slice(0, 20);
        if (role === "host") this.hostName = name;
        else this.guestName = name;
        changed = true;
      }
      if (changed) this.broadcastRoster();
      return;
    }
    if (message.t === "chat" && typeof (message as { text?: unknown }).text === "string") {
      const text = (message as { text: string }).text.trim().slice(0, 200);
      if (!text) return;
      const entry: ChatLine = {
        from: role,
        name: role === "host" ? this.hostName : this.guestName,
        text,
        at: Date.now(),
      };
      this.chat.push(entry);
      if (this.chat.length > 40) this.chat.shift();
      this.send(this.host, { t: "chat", ...entry });
      this.send(this.guest, { t: "chat", ...entry });
    }
  }

  private onClose(socket: WebSocket) {
    const role = sockets.get(socket)?.role;
    if (role === "host" && this.host === socket) {
      this.host = null;
      this.send(this.guest, { t: "peer-left" });
    }
    if (role === "guest" && this.guest === socket) {
      this.guest = null;
      this.send(this.host, { t: "peer-left" });
    }
    this.broadcastRoster();
  }
}
