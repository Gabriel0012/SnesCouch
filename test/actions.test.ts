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
  assert.equal(rows.find((row) => row.keys[0]?.label === "S")?.action, "Sem uso");
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
  assert.equal(keyboardRows(keys, "local").some((row) => row.action === "Super"), false);
  assert.equal(extraKeys(keys, "local", null).length, 0);
  assert.equal(keyboardRows(keys, "local").find((row) => row.keys[0]?.label === "Z")?.action, "B");
});

test("Pocky & Rocky 2 não lista o Super", () => {
  assert.equal(actionFor("pocky-rocky-2", "Super"), null);
  assert.equal(keyboardRows(keys, "pocky-rocky-2").some((row) => row.action === "Super"), false);
  assert.equal(keyboardRows(keys, "pocky-rocky-2").find((row) => row.keys[0]?.label === "Z")?.action, "Varinha");
});

test("o diagrama do Xbox aponta o botão físico sem trocar a letra do Super Nintendo", () => {
  const xbox = pad({ id: "Xbox Series Controller (Vendor: 045e Product: 0b12)", mapping: "standard" });
  const guide = controlGuide(xbox);
  const spots = spotsFor(guide, "final-fight-3", "Xbox");
  assert.equal(spots.find((spot) => spot.id === "b")?.action, "Pulo");
  assert.equal(spots.find((spot) => spot.id === "b")?.hint, "botão A");
  assert.equal(spots.find((spot) => spot.id === "l")?.hint, "botões LB e LT");
  assert.equal(spots.some((spot) => spot.id === "super"), false);
  assert.deepEqual(extraKeys(guide, "final-fight-3", "F").map((key) => key.label), ["F", "RT"]);
});

test("o Super Nintendo não repete o nome do botão no texto", () => {
  const snes = pad({ id: "SNES Controller (Vendor: 057e Product: 2017)" });
  const spots = spotsFor(controlGuide(snes), "mighty-morphin-power-rangers-the-movie", "Super Nintendo");
  assert.equal(spots.find((spot) => spot.id === "y")?.action, "Ataque");
  assert.equal(spots.find((spot) => spot.id === "y")?.hint, "");
  assert.equal(spots.find((spot) => spot.id === "x")?.action, "Especial");
  assert.equal(extraKeys(controlGuide(snes), "final-fight-3", "F").map((key) => key.label).join(" "), "F");
});
