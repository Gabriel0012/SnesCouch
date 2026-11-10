import assert from "node:assert/strict";
import test from "node:test";
import { crossBits, dpadBits } from "../apps/web/src/touch.ts";

const UP = 1 << 4;
const DOWN = 1 << 5;
const LEFT = 1 << 6;
const RIGHT = 1 << 7;

test("a zona morta do direcional virtual não aperta nada", () => {
  assert.equal(dpadBits(0, 0, 8), 0);
  assert.equal(dpadBits(3, 4, 8), 0);
  assert.equal(dpadBits(8, 0, 8), RIGHT);
});

test("o direcional virtual cobre os quatro eixos e as quatro diagonais", () => {
  assert.equal(dpadBits(10, 0, 1), RIGHT);
  assert.equal(dpadBits(0, 10, 1), DOWN);
  assert.equal(dpadBits(-10, 0, 1), LEFT);
  assert.equal(dpadBits(0, -10, 1), UP);
  assert.equal(dpadBits(10, 10, 1), DOWN | RIGHT);
  assert.equal(dpadBits(-10, 10, 1), DOWN | LEFT);
  assert.equal(dpadBits(-10, -10, 1), UP | LEFT);
  assert.equal(dpadBits(10, -10, 1), UP | RIGHT);
});

test("a cruz inteira aperta a direção, não só a ponta", () => {
  assert.equal(crossBits(0, -0.9), UP);
  assert.equal(crossBits(0, -0.35), UP);
  assert.equal(crossBits(0.15, -0.4), UP);
  assert.equal(crossBits(0, 0.9), DOWN);
  assert.equal(crossBits(0, 0.35), DOWN);
  assert.equal(crossBits(-0.9, 0), LEFT);
  assert.equal(crossBits(-0.35, 0.1), LEFT);
  assert.equal(crossBits(0.9, 0), RIGHT);
  assert.equal(crossBits(0.4, -0.12), RIGHT);
  assert.equal(crossBits(0, 0), 0);
});

test("o direcional virtual não junta opostos", () => {
  for (let step = 0; step < 32; step++) {
    const angle = -Math.PI + (step / 32) * Math.PI * 2;
    const bits = dpadBits(Math.cos(angle) * 20, Math.sin(angle) * 20, 4);
    assert.ok((bits & UP) === 0 || (bits & DOWN) === 0);
    assert.ok((bits & LEFT) === 0 || (bits & RIGHT) === 0);
    assert.notEqual(bits, 0);
  }
});
