import assert from "node:assert/strict";
import test from "node:test";
import { IDLE_MS, LIVE_MS, presenceStatus } from "../apps/signal/src/presence.ts";

const now = 1_000_000_000_000;

test("online enquanto a aba está aberta e houve atividade nos últimos 15 minutos", () => {
  assert.equal(presenceStatus(null, now - 1000, now - 1000, now), "online");
  assert.equal(presenceStatus(null, now - IDLE_MS + 1, now, now), "online");
});

test("ausente com a aba aberta e sem atividade, ou quando a pessoa escolhe", () => {
  assert.equal(presenceStatus(null, now - IDLE_MS - 1, now, now), "away");
  assert.equal(presenceStatus("away", now, now, now), "away");
});

test("offline sem aba, ao sair, ou quando a pessoa escolhe aparecer offline", () => {
  assert.equal(presenceStatus(null, now, null, now), "offline");
  assert.equal(presenceStatus(null, now, now - LIVE_MS - 1, now), "offline");
  assert.equal(presenceStatus("offline", now, now, now), "offline");
  assert.equal(presenceStatus("away", now, null, now), "offline");
});
