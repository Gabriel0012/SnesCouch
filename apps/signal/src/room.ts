import { catalogGames } from "./catalog";
import type { Env } from "./index";

type Role = "host" | "guest" | "spectator";

interface SocketState {
  role: Role;
  id: string;
  cid: string;
}

const sockets = new WeakMap<WebSocket, SocketState>();

interface ChatLine {
  from: Role;
  name: string;
  text: string;
  at: number;
  slot?: 0 | 1;
}

interface Watcher {
  socket: WebSocket;
  name: string;
  cid: string;
}

const SEAT_TAKEN = 4001;
const KICKED = 4002;

export class Room implements DurableObject {
  private host: WebSocket | null = null;
  private guest: WebSocket | null = null;
  private spectators = new Map<string, Watcher>();
  private bans = new Map<string, string>();
  private gameId = "";
  private sha1 = "";
  private hostControl = "Teclado";
  private guestControl = "Teclado";
  private hostName = "";
  private guestName = "";
  private hostSlot: 0 | 1 = 0;
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
    const cid = (url.searchParams.get("cid") ?? "").slice(0, 40);
    const games = catalogGames(this.env);
    const game = games.find((entry) => entry.id === gameId);
    if (role !== "host" && role !== "guest" && role !== "spectator") {
      return new Response("Papel inválido.", { status: 400 });
    }
    if (!game || sha1 !== game.sha1) return this.refuse("Jogo ou hash recusado.");
    if (role !== "host" && !this.alive(this.host)) return this.refuse("A sala ainda não existe.");
    if (role !== "host" && (gameId !== this.gameId || sha1 !== this.sha1)) {
      const roomGame = games.find((entry) => entry.id === this.gameId);
      const title = roomGame?.title ?? "outro jogo";
      return this.refuse(`A sala está em ${title}. Abre esse jogo antes de entrar.`);
    }
    if (role !== "host" && cid && this.bans.has(cid)) return this.refuse("Você foi removido desta sala.", KICKED);
    if (role === "guest" && this.alive(this.guest) && (!cid || this.cidOf(this.guest) !== cid)) {
      return this.refuse("O lugar de jogador está ocupado.", SEAT_TAKEN);
    }
    if (role === "host") this.replace("host");
    if (role === "guest") this.replace("guest");
    if (role === "spectator" && cid && this.cidOf(this.guest) === cid) this.replace("guest");
    if (cid) this.dropWatchers(cid);

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    const id = crypto.randomUUID().slice(0, 8);
    sockets.set(server, { role, id, cid });
    if (role === "host") {
      this.host = server;
      this.gameId = gameId;
      this.sha1 = sha1;
    } else if (role === "guest") {
      this.guest = server;
    } else {
      this.spectators.set(id, { socket: server, name: "", cid });
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
    if (role === "spectator") this.send(this.host, { t: "spectator-joined", id });
    if (role === "host" && this.spectators.size) this.send(server, { t: "spectator-joined" });
    this.broadcastRoster();
    return new Response(null, { status: 101, webSocket: client });
  }

  private cidOf(socket: WebSocket | null): string {
    return socket ? sockets.get(socket)?.cid ?? "" : "";
  }

  private idOf(socket: WebSocket | null): string {
    return socket ? sockets.get(socket)?.id ?? "" : "";
  }

  private dropWatchers(cid: string) {
    for (const [id, watcher] of this.spectators) {
      if (watcher.cid !== cid) continue;
      this.spectators.delete(id);
      try { watcher.socket.close(4000, "A sala abriu em outro lugar."); } catch { /* já caiu */ }
    }
  }

  private roster() {
    return {
      t: "roster",
      hostSlot: this.hostSlot,
      host: { here: this.alive(this.host), control: this.hostControl, name: this.hostName },
      guest: { here: this.alive(this.guest), control: this.guestControl, name: this.guestName, id: this.idOf(this.guest) },
      spectators: [...this.spectators].filter(([, watcher]) => this.alive(watcher.socket)).map(([id, watcher]) => ({ id, name: watcher.name })),
    };
  }

  private everyone(): WebSocket[] {
    const list = [this.host, this.guest, ...[...this.spectators.values()].map((watcher) => watcher.socket)];
    return list.filter((socket): socket is WebSocket => this.alive(socket));
  }

  private broadcast(message: unknown) {
    for (const socket of this.everyone()) this.send(socket, message);
  }

  private broadcastRoster() {
    this.broadcast(this.roster());
  }

  private refuse(reason: string, code = 4000): Response {
    const pair = new WebSocketPair();
    const server = pair[1];
    server.accept();
    server.close(code, reason.slice(0, 120));
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  private replace(role: "host" | "guest") {
    const current = role === "host" ? this.host : this.guest;
    if (role === "host") this.host = null;
    else this.guest = null;
    if (!this.alive(current)) return;
    try { current.close(4000, "A sala abriu em outro lugar."); } catch { /* o socket antigo já caiu */ }
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

  private sendBans() {
    this.send(this.host, { t: "bans", list: [...this.bans].map(([cid, name]) => ({ cid, name })) });
  }

  private kick(id: string) {
    if (id && id === this.idOf(this.guest) && this.alive(this.guest)) {
      const target = this.guest;
      const cid = this.cidOf(target);
      if (cid) this.bans.set(cid, this.guestName || "Convidado");
      this.guest = null;
      try { target.close(KICKED, "Você foi removido da sala."); } catch { /* já caiu */ }
      this.send(this.host, { t: "peer-left" });
    }
    const watcher = this.spectators.get(id);
    if (watcher) {
      if (watcher.cid) this.bans.set(watcher.cid, watcher.name || "Espectador");
      this.spectators.delete(id);
      try { watcher.socket.close(KICKED, "Você foi removido da sala."); } catch { /* já caiu */ }
    }
    this.sendBans();
    this.broadcastRoster();
  }

  private onMessage(socket: WebSocket, event: MessageEvent) {
    let message: { t?: string; data?: unknown };
    try {
      message = JSON.parse(String(event.data));
    } catch {
      return;
    }
    const me = sockets.get(socket);
    if (!me) return;
    const role = me.role;
    if (message.t === "ping") {
      this.send(socket, { t: "pong" });
      return;
    }
    if (message.t === "signal" && role !== "spectator") {
      this.send(this.other(socket), { t: "signal", data: message.data });
      return;
    }
    if (message.t === "relay" || message.t === "watch") {
      const body = message as { data?: unknown; bin?: unknown };
      const data = typeof body.data === "string" && body.data.length <= 8000 ? body.data : undefined;
      const bin = typeof body.bin === "string" && body.bin.length <= 20000 ? body.bin : undefined;
      if (!data && !bin) return;
      const out = data ? { t: message.t, data } : { t: message.t, bin };
      if (message.t === "relay" && role !== "spectator") this.send(this.other(socket), out);
      if (message.t === "watch" && role === "host") {
        for (const watcher of this.spectators.values()) this.send(watcher.socket, out);
      }
      return;
    }
    if (message.t === "profile") {
      const body = message as { control?: unknown; name?: unknown; slot?: unknown };
      let changed = false;
      if (typeof body.control === "string" && role !== "spectator") {
        const control = body.control.slice(0, 40);
        if (role === "host") this.hostControl = control;
        else this.guestControl = control;
        changed = true;
      }
      if (typeof body.name === "string") {
        const name = body.name.replace(/\s+/g, " ").trim().slice(0, 20);
        if (role === "host") this.hostName = name;
        else if (role === "guest") this.guestName = name;
        else {
          const watcher = this.spectators.get(me.id);
          if (watcher) watcher.name = name;
        }
        changed = true;
      }
      if (role === "host" && (body.slot === 0 || body.slot === 1)) {
        this.hostSlot = body.slot;
        changed = true;
      }
      if (changed) this.broadcastRoster();
      return;
    }
    if (message.t === "typing") {
      if (role === "spectator") return;
      this.send(this.other(socket), { t: "typing", from: role, on: Boolean((message as { on?: unknown }).on) });
      return;
    }
    if (message.t === "kick" && role === "host") {
      const id = (message as { id?: unknown }).id;
      if (typeof id === "string") this.kick(id);
      return;
    }
    if (message.t === "bans" && role === "host") {
      this.sendBans();
      return;
    }
    if (message.t === "unban" && role === "host") {
      const cid = (message as { cid?: unknown }).cid;
      if (typeof cid === "string") this.bans.delete(cid);
      this.sendBans();
      return;
    }
    if (message.t === "chat" && typeof (message as { text?: unknown }).text === "string") {
      const text = (message as { text: string }).text.trim().slice(0, 200);
      if (!text) return;
      const name = role === "host" ? this.hostName : role === "guest" ? this.guestName : this.spectators.get(me.id)?.name ?? "";
      const entry: ChatLine = { from: role, name, text, at: Date.now() };
      if (role === "host") entry.slot = this.hostSlot;
      if (role === "guest") entry.slot = this.hostSlot === 0 ? 1 : 0;
      this.chat.push(entry);
      if (this.chat.length > 40) this.chat.shift();
      this.broadcast({ t: "chat", ...entry });
    }
  }

  private onClose(socket: WebSocket) {
    const me = sockets.get(socket);
    if (!me) return;
    if (me.role === "host" && this.host === socket) {
      this.host = null;
      this.send(this.guest, { t: "peer-left" });
    }
    if (me.role === "guest" && this.guest === socket) {
      this.guest = null;
      this.send(this.host, { t: "peer-left" });
    }
    if (me.role === "spectator" && this.spectators.get(me.id)?.socket === socket) this.spectators.delete(me.id);
    this.broadcastRoster();
  }
}
