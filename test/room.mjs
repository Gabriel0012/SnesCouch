import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const port = 8799;
const sha1 = "09d542fbb06dcafec26602bdc626bcdaf56b23cb";
const base = `http://127.0.0.1:${port}`;
const signalDir = fileURLToPath(new URL("../apps/signal/", import.meta.url));

function startServer() {
  const child = spawn("npx", ["wrangler", "dev", "--port", String(port), "--ip", "127.0.0.1"], {
    cwd: signalDir,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(log || "a sala não subiu")), 45000);
    const watch = (chunk) => {
      log += chunk.toString();
      if (log.includes("Ready") || log.includes(`:${port}`)) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout.on("data", watch);
    child.stderr.on("data", watch);
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`wrangler saiu com ${code}\n${log}`));
    });
  });
  return { child, ready };
}

function socket(code, role, hash = sha1) {
  return new WebSocket(`ws://127.0.0.1:${port}/api/rooms/${code}?role=${role}&game=final-fight-3&sha1=${hash}`);
}

function opened(ws) {
  return new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve());
    ws.addEventListener("error", () => reject(new Error("websocket recusado")));
  });
}

function waitFor(ws, pattern) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeEventListener("message", onMessage);
      reject(new Error(`não chegou ${pattern}`));
    }, 4000);
    const onMessage = (event) => {
      const text = String(event.data);
      if (!pattern.test(text)) return;
      clearTimeout(timer);
      ws.removeEventListener("message", onMessage);
      resolve(text);
    };
    ws.addEventListener("message", onMessage);
  });
}

test("a sala apresenta os dois jogadores e recusa hash diferente", async () => {
  const server = startServer();
  try {
    await server.ready;
    const health = await fetch(`${base}/api/health`);
    assert.equal(health.status, 200);
    const live = await fetch(`${base}/api/live`);
    assert.equal(live.status, 401);
    const iceBody = await (await fetch(`${base}/api/ice`)).json();
    assert.ok(iceBody.iceServers.some((entry) => String(entry.urls).startsWith("stun:")));

    const code = "PLAY2";
    const host = socket(code, "host");
    const hostJoined = waitFor(host, /"roster"/);
    await opened(host);
    await hostJoined;
    const guest = socket(code, "guest");
    const guestPeer = waitFor(guest, /"peer"/);
    const hostPeer = waitFor(host, /"peer"/);
    await opened(guest);
    assert.match(await hostPeer, /"peer"/);
    assert.match(await guestPeer, /"peer"/);

    const echoed = waitFor(guest, /v=0/);
    host.send(JSON.stringify({ t: "signal", data: { kind: "offer", sdp: "v=0" } }));
    assert.match(await echoed, /v=0/);

    const named = waitFor(guest, /"name":"Lia"/);
    host.send(JSON.stringify({ t: "profile", control: "Fliperama", name: "Lia" }));
    assert.match(await named, /Fliperama/);

    const guestChat = waitFor(guest, /manda ver/);
    const hostChat = waitFor(host, /manda ver/);
    host.send(JSON.stringify({ t: "chat", text: "manda ver" }));
    const guestLine = await guestChat;
    assert.match(guestLine, /manda ver/);
    assert.match(guestLine, /"name":"Lia"/);
    assert.match(await hostChat, /manda ver/);

    const refused = socket(code, "guest", "0".repeat(40));
    await new Promise((resolve) => {
      refused.addEventListener("close", () => resolve());
      refused.addEventListener("error", () => resolve());
    });
    assert.notEqual(refused.readyState, WebSocket.OPEN);
    host.close();
    guest.close();
  } finally {
    const child = server.child;
    if (process.platform === "win32" && child.pid) {
      spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    } else {
      child.kill("SIGKILL");
    }
    child.stdout?.destroy();
    child.stderr?.destroy();
    child.unref();
  }
});
