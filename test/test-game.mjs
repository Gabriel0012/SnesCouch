import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { buildTestRom } from "../core/fixtures/test-rom.mjs";
import entry from "../packages/catalog/test-game.json" with { type: "json" };
import catalog from "../packages/catalog/games.json" with { type: "json" };

test("o jogo de teste do E2E bate com a ROM caseira", () => {
  const rom = buildTestRom();
  assert.equal(entry.bytes, rom.length);
  assert.equal(entry.sha1, createHash("sha1").update(rom).digest("hex"));
});

test("o jogo de teste não entra no catálogo de verdade", () => {
  assert.ok(!catalog.games.some((game) => game.id === entry.id || game.sha1 === entry.sha1));
});
