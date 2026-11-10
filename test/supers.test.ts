import assert from "node:assert/strict";
import test from "node:test";
import { RIGHT, specialSteps, superSteps } from "../apps/web/src/supers.ts";

const B = 1 << 0;
const Y = 1 << 1;
const UP = 1 << 4;
const DOWN = 1 << 5;
const LEFT = 1 << 6;

test("o super do Haggar é frente, diagonal e baixo com ataque", () => {
  const steps = superSteps("haggar", LEFT);
  assert.equal(steps[0], LEFT);
  assert.equal(steps[3], LEFT | DOWN);
  assert.equal(steps[6], DOWN | Y);
  assert.equal(steps.at(-1), DOWN | Y);
  assert.equal(steps.includes(RIGHT), false);
});

test("o super do Guy é frente, baixo e frente com ataque", () => {
  const steps = superSteps("guy", LEFT);
  assert.equal(steps[0], LEFT);
  assert.equal(steps[3], DOWN);
  assert.equal(steps[6], LEFT | Y);
  assert.equal(steps.at(-1), LEFT | Y);
  assert.equal(steps.includes(DOWN | Y), false);
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

test("o golpe do Dean é frente, diagonal, cima e soco", () => {
  const steps = specialSteps("dean", LEFT);
  assert.equal(steps[0], LEFT);
  assert.equal(steps[3], LEFT | UP);
  assert.equal(steps[6], UP);
  assert.equal(steps[9], UP | Y);
  assert.equal(steps.at(-1), UP | Y);
});

test("o Dean com baixo puxa: meia-lua para frente e soco", () => {
  const steps = specialSteps("dean", RIGHT, DOWN);
  assert.equal(steps[0], DOWN);
  assert.equal(steps[3], RIGHT | DOWN);
  assert.equal(steps[6], RIGHT | Y);
  assert.equal(steps.at(-1), RIGHT | Y);
  assert.equal(steps.some((step) => (step & UP) !== 0), false);
});

test("o golpe do Guy e do Haggar é meia-lua para frente e soco", () => {
  for (const fighter of ["guy", "haggar"] as const) {
    const steps = specialSteps(fighter, LEFT, UP);
    assert.equal(steps[0], DOWN);
    assert.equal(steps[3], LEFT | DOWN);
    assert.equal(steps[6], LEFT | Y);
    assert.equal(steps.at(-1), LEFT | Y);
    assert.equal(steps.includes(RIGHT), false);
  }
});

test("o golpe da Lucia é frente, baixo e diagonal com soco", () => {
  const steps = specialSteps("lucia", RIGHT);
  assert.equal(steps[0], RIGHT);
  assert.equal(steps[3], DOWN);
  assert.equal(steps[6], RIGHT | DOWN | Y);
  assert.equal(steps.at(-1), RIGHT | DOWN | Y);
  assert.equal(steps.includes(B), false);
});

test("a Lucia no ar pula e depois faz a meia-lua com soco", () => {
  const steps = specialSteps("lucia", LEFT, UP);
  assert.equal(steps[0], B);
  assert.equal(steps[4], 0);
  assert.equal(steps[19], 0);
  assert.equal(steps[20], DOWN);
  assert.equal(steps[23], LEFT | DOWN);
  assert.equal(steps[26], LEFT | Y);
  assert.equal(steps.at(-1), LEFT | Y);
  assert.equal(steps.includes(RIGHT), false);
});
