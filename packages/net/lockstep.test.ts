import assert from "node:assert/strict";
import test from "node:test";
import { delayFromRtt, Lockstep } from "./lockstep.ts";

function pair(delay = 2) {
  const host = new Lockstep(0, delay);
  const guest = new Lockstep(1, delay);
  const hostSent = host.prime(0x0010);
  const guestSent = guest.prime(0x0100);
  for (const frame of hostSent) guest.pushRemote(frame, 0x0010);
  for (const frame of guestSent) host.pushRemote(frame, 0x0100);
  return { host, guest };
}

test("os dois lados rodam o mesmo frame com os mesmos botões", () => {
  const { host, guest } = pair();
  const a = host.advance(0x0020);
  const b = guest.advance(0x0200);
  assert.ok(a && b);
  assert.equal(a.frame, 0);
  assert.deepEqual(a.pads, [0x0010, 0x0100]);
  assert.deepEqual(b.pads, a.pads);
  assert.equal(a.sendFrame, 2);
  assert.equal(b.sendFrame, 2);
});

test("sem o botão remoto a simulação espera", () => {
  const host = new Lockstep(0, 2);
  host.prime(1);
  assert.equal(host.advance(1), null);
  assert.equal(host.simFrame, 0);
});

test("cem frames com atraso de rede continuam iguais", () => {
  const delay = 3;
  const host = new Lockstep(0, delay);
  const guest = new Lockstep(1, delay);
  const pipe: { to: "host" | "guest"; frame: number; buttons: number }[] = [];
  const send = (to: "host" | "guest", frames: number[], buttons: number) => {
    for (const frame of frames) pipe.push({ to, frame, buttons });
  };
  send("guest", host.prime(0), 0);
  send("host", guest.prime(0), 0);
  const played: number[][] = [];
  for (let tick = 0; tick < 100; tick++) {
    for (let i = pipe.length - 1; i >= 0; i--) {
      if (tick < 2) break;
      const msg = pipe[i];
      if ((tick + msg.frame) % 3 !== 0) continue;
      (msg.to === "host" ? host : guest).pushRemote(msg.frame, msg.buttons);
      pipe.splice(i, 1);
    }
    const hostButtons = tick & 1 ? 0x0080 : 0x0040;
    const guestButtons = tick % 5 === 0 ? 0x0001 : 0;
    const a = host.advance(hostButtons);
    const b = guest.advance(guestButtons);
    if (!a || !b) continue;
    assert.deepEqual(a.pads, b.pads);
    played.push(a.pads);
    send("guest", [a.sendFrame], a.sendButtons);
    send("host", [b.sendFrame], b.sendButtons);
  }
  assert.ok(played.length >= 90);
});

test("retomada depois de um save recomeça no frame combinado", () => {
  const { host, guest } = pair();
  host.advance(1);
  guest.advance(1);
  const frame = host.simFrame;
  const again = host.resume(frame, 0x0008);
  guest.resume(frame, 0x0004);
  for (const f of again) guest.pushRemote(f, 0x0008);
  host.pushRemote(frame, 0x0004);
  const step = host.advance(0);
  assert.ok(step);
  assert.equal(step.frame, frame);
  assert.deepEqual(step.pads, [0x0008, 0x0004]);
});

test("atraso de input acompanha a latência", () => {
  assert.equal(delayFromRtt(20), 2);
  assert.equal(delayFromRtt(80), 3);
  assert.equal(delayFromRtt(500), 8);
});
