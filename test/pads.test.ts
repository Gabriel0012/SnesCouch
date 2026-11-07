import assert from "node:assert/strict";
import test from "node:test";
import { assignPlayers, hatBits, padLabel, snesBits, type PadLike } from "../apps/web/src/pads.ts";

const B = 1 << 0;
const Y = 1 << 1;
const SELECT = 1 << 2;
const START = 1 << 3;
const UP = 1 << 4;
const DOWN = 1 << 5;
const LEFT = 1 << 6;
const RIGHT = 1 << 7;
const A = 1 << 8;
const X = 1 << 9;
const L = 1 << 10;
const R = 1 << 11;

function pad(partial: Partial<PadLike> & Pick<PadLike, "id">): PadLike {
  return {
    mapping: "",
    buttons: [],
    axes: [],
    ...partial,
  };
}

function hold(indexes: number[], count = 16): PadLike["buttons"] {
  return Array.from({ length: count }, (_, index) => ({ pressed: indexes.includes(index) }));
}

test("o hat do direcional cobre as oito direções", () => {
  assert.equal(hatBits(0), 0);
  assert.equal(hatBits(1.3), 0);
  assert.equal(hatBits(-1), UP);
  assert.equal(hatBits(-0.714), UP | RIGHT);
  assert.equal(hatBits(-0.429), RIGHT);
  assert.equal(hatBits(0.143), DOWN);
  assert.equal(hatBits(0.714), LEFT);
  assert.equal(hatBits(1), UP | LEFT);
});

test("Xbox no mapeamento padrão usa a posição dos botões do Super Nintendo", () => {
  const xbox = pad({
    id: "Xbox Series Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b12)",
    mapping: "standard",
    buttons: hold([0, 4, 12]),
    axes: [0, 0.8, 0, 0],
  });
  assert.equal(snesBits(xbox), B | L | UP | DOWN);
  assert.equal(padLabel(xbox), "Xbox");
});

test("PS4 sem mapeamento padrão lê os botões crus e o hat", () => {
  const ps4 = pad({
    id: "Wireless Controller (Vendor: 054c Product: 09cc)",
    buttons: hold([0, 1]),
    axes: [0, 0, 0, 0.8, 0, 0, 0, 0, 0, -1],
  });
  assert.equal(snesBits(ps4), Y | B | L | UP);
  assert.equal(padLabel(ps4), "PS4");
});

test("fliperama zero delay usa o mapa do encoder", () => {
  const stick = pad({
    id: "USB Joystick (Vendor: 0079 Product: 0006)",
    buttons: hold([0, 2, 6]),
    axes: [1, 0],
  });
  assert.equal(snesBits(stick), X | B | SELECT | RIGHT);
  assert.equal(padLabel(stick), "Fliperama");
});

test("fliperama reconhecido pelo navegador segue o diamante padrão", () => {
  const stick = pad({
    id: "Mayflash Arcade Stick (STANDARD GAMEPAD Vendor: 0e6f Product: 1112)",
    mapping: "standard",
    buttons: hold([0, 1, 12]),
    axes: [0, 0],
  });
  assert.equal(snesBits(stick), B | A | UP);
  assert.equal(padLabel(stick), "Fliperama");
});

test("controle USB genérico de oito botões usa o mapa DragonRise", () => {
  const usb = pad({
    id: "USB Gamepad (Vendor: 0079 Product: 0011)",
    buttons: hold([0, 2, 6]),
    axes: [1, 0],
  });
  assert.equal(snesBits(usb), X | B | SELECT | RIGHT);
  assert.equal(padLabel(usb), "Controle USB");
});

test("Super Nintendo oficial não trata ZR como direita", () => {
  const snes = pad({
    id: "SNES Controller (Vendor: 057e Product: 2017)",
    buttons: hold([0, 9, 15], 16),
    axes: [0, 0, 0, 0, 0, 0, 0, 0, 0, -0.429],
  });
  assert.equal(snesBits(snes), B | START | R | RIGHT);
  assert.equal(snesBits(snes) & LEFT, 0);
  assert.equal(padLabel(snes), "Super Nintendo");
});

test("iBuffalo clássico segue o próprio mapa", () => {
  const buffalo = pad({
    id: "USB,2-axis 8-button gamepad (Vendor: 0583 Product: 2060)",
    buttons: hold([0, 5, 7]),
    axes: [0, -1],
  });
  assert.equal(snesBits(buffalo), A | R | START | UP);
});

test("dois controles ocupam jogador 1 e jogador 2, pulando buraco", () => {
  const first = pad({ id: "xbox", connected: true });
  const second = pad({ id: "ps4", connected: true });
  const [p1, p2] = assignPlayers([null, first, null, second]);
  assert.equal(p1, first);
  assert.equal(p2, second);
});
