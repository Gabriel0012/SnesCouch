import assert from "node:assert/strict";
import test from "node:test";
import { RIGHT, superSteps } from "../apps/web/src/supers.ts";

const Y = 1 << 1;
const UP = 1 << 4;
const DOWN = 1 << 5;
const LEFT = 1 << 6;

test("o super de Haggar e Guy é frente, baixo, frente, baixo e ataque", () => {
  const steps = superSteps("haggar", LEFT);
  assert.equal(steps[0], LEFT);
  assert.equal(steps[5], DOWN);
  assert.equal(steps[10], LEFT);
  assert.equal(steps[15], DOWN | Y);
  assert.equal(steps.at(-1), DOWN | Y);
  assert.equal(steps.includes(RIGHT), false);
});

test("o super da Lucia é baixo, baixo, frente e ataque", () => {
  const steps = superSteps("lucia", RIGHT);
  assert.equal(steps[0], DOWN);
  assert.equal(steps[5], 0);
  assert.equal(steps[9], DOWN);
  assert.equal(steps.at(-1), RIGHT | Y);
});

test("o super do Dean é baixo e depois cima com ataque", () => {
  const steps = superSteps("dean", RIGHT);
  assert.equal(steps[0], DOWN);
  assert.equal(steps[5], UP | Y);
  assert.equal(steps.at(-1), UP | Y);
});
