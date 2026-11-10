import assert from "node:assert/strict";
import test from "node:test";
import { actionFor, extraKeys, keyboardRows, spotsFor } from "../apps/web/src/actions.ts";
import { controlGuide, type PadLike } from "../apps/web/src/pads.ts";

function pad(partial: Partial<PadLike> & Pick<PadLike, "id">): PadLike {
  return { mapping: "", buttons: [], axes: [], ...partial };
}

const keys = [
  { button: "Setas", does: "Direções" },
  { button: "Z", does: "B" },
  { button: "X", does: "Y" },
  { button: "S", does: "X" },
  { button: "F", does: "Super" },
  { button: "Enter", does: "Abre a conversa" },
];

test("o teclado do Final Fight 3 mostra a ação e esconde o que o jogo não usa", () => {
  const rows = keyboardRows(keys, "final-fight-3");
  assert.deepEqual(rows.find((row) => row.action === "Andar")?.keys.map((key) => key.arrow), ["up", "left", "down", "right"]);
  assert.equal(rows.find((row) => row.keys[0]?.label === "Z")?.action, "Pulo");
  assert.equal(rows.find((row) => row.keys[0]?.label === "X")?.action, "Soco");
  assert.equal(rows.find((row) => row.keys[0]?.label === "S")?.action, "Golpe");
  assert.equal(rows.find((row) => row.keys[0]?.label === "F")?.action, "Super");
  assert.equal(rows.find((row) => row.keys[0]?.label === "Enter")?.action, "Abre a conversa");
});

test("King of Dragons usa a arma no Y e a magia no X", () => {
  assert.equal(actionFor("king-of-dragons", "Y"), "Arma");
  assert.equal(actionFor("king-of-dragons", "X"), "Magia");
  assert.equal(actionFor("king-of-dragons", "B"), "Pulo");
  assert.equal(actionFor("king-of-dragons", "Super"), null);
});

test("Outro jogo não lista o Super", () => {
  assert.equal(actionFor("local", "Super"), null);
  assert.equal(actionFor("local:abc", "Super"), null);
  assert.equal(keyboardRows(keys, "local").some((row) => row.action === "Super"), false);
  assert.equal(extraKeys(keys, "local", null).length, 0);
  assert.equal(keyboardRows(keys, "local").find((row) => row.keys[0]?.label === "Z")?.action, "B");
});

test("Pocky & Rocky 2 não lista o Super", () => {
  assert.equal(actionFor("pocky-rocky-2", "Super"), null);
  assert.equal(keyboardRows(keys, "pocky-rocky-2").some((row) => row.action === "Super"), false);
  assert.equal(keyboardRows(keys, "pocky-rocky-2").find((row) => row.keys[0]?.label === "Z")?.action, "Varinha");
});

test("o golpe do Final Fight 3 sai no triângulo, que é o X", () => {
  const ps4 = pad({ id: "Wireless Controller (Vendor: 054c Product: 09cc)" });
  const spots = spotsFor(controlGuide(ps4), "final-fight-3", "PS4");
  assert.equal(spots.find((spot) => spot.id === "x")?.action, "Golpe");
  assert.equal(spots.find((spot) => spot.id === "x")?.hint, "botão Triângulo");
  assert.equal(spots.find((spot) => spot.id === "a")?.action, "Especial");
});

test("o diagrama do Xbox aponta o botão físico sem trocar a letra do Super Nintendo", () => {
  const xbox = pad({ id: "Xbox Series Controller (Vendor: 045e Product: 0b12)", mapping: "standard" });
  const guide = controlGuide(xbox);
  const spots = spotsFor(guide, "final-fight-3", "Xbox");
  assert.equal(spots.find((spot) => spot.id === "b")?.action, "Pulo");
  assert.equal(spots.find((spot) => spot.id === "b")?.hint, "botão A");
  assert.equal(spots.find((spot) => spot.id === "l")?.hint, "botão LB");
  assert.equal(spots.find((spot) => spot.id === "r")?.action, "Super");
  assert.equal(spots.find((spot) => spot.id === "r")?.hint, "botão RB");
  assert.equal(spots.some((spot) => /LT|RT|L2|R2/.test(spot.hint)), false);
  assert.equal(spots.some((spot) => spot.id === "super"), false);
  assert.deepEqual(extraKeys(guide, "final-fight-3", "F").map((key) => key.label), ["F"]);
});

test("nos outros jogos o ombro mostra o que LB e RB fazem", () => {
  const xbox = pad({ id: "Xbox Series Controller (Vendor: 045e Product: 0b12)", mapping: "standard" });
  const spots = spotsFor(controlGuide(xbox), "pocky-rocky-2", "Xbox");
  assert.equal(spots.find((spot) => spot.id === "l")?.hint, "botão LB");
  assert.equal(spots.find((spot) => spot.id === "l")?.action, "Sem uso");
  assert.equal(spots.find((spot) => spot.id === "r")?.hint, "botão RB");
  assert.equal(spots.find((spot) => spot.id === "r")?.action, "Joga o parceiro");
  assert.equal(spots.some((spot) => /LT|RT/.test(spot.hint)), false);
  const ps4 = spotsFor(controlGuide(pad({ id: "Wireless Controller (Vendor: 054c Product: 09cc)" })), "final-fight-3", "PS4");
  assert.equal(ps4.find((spot) => spot.id === "l")?.hint, "botão L1");
  assert.equal(ps4.find((spot) => spot.id === "r")?.action, "Super");
  assert.equal(ps4.find((spot) => spot.id === "r")?.hint, "botão R1");
});

test("o Super Nintendo não repete o nome do botão no texto", () => {
  const snes = pad({ id: "SNES Controller (Vendor: 057e Product: 2017)" });
  const spots = spotsFor(controlGuide(snes), "mighty-morphin-power-rangers-the-movie", "Super Nintendo");
  assert.equal(spots.find((spot) => spot.id === "y")?.action, "Ataque");
  assert.equal(spots.find((spot) => spot.id === "y")?.hint, "");
  assert.equal(spots.find((spot) => spot.id === "x")?.action, "Especial");
  assert.equal(spots.find((spot) => spot.id === "l")?.action, "Troca de fila");
  assert.equal(spots.find((spot) => spot.id === "r")?.action, "Troca de fila");
  assert.equal(spots.find((spot) => spot.id === "r")?.hint, "");
  const fight = spotsFor(controlGuide(snes), "final-fight-3", "Super Nintendo");
  assert.equal(fight.find((spot) => spot.id === "r")?.action, "Super");
  assert.equal(fight.find((spot) => spot.id === "r")?.hint, "");
  assert.equal(extraKeys(controlGuide(snes), "final-fight-3", "F").map((key) => key.label).join(" "), "F");
});
