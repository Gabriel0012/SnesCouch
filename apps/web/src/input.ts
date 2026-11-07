import { assignPlayers, padLabel, snesBits, superPressed, type PadLike } from "./pads.ts";

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

const PLAYER_KEYS = [
  {
    ArrowUp: UP, ArrowDown: DOWN, ArrowLeft: LEFT, ArrowRight: RIGHT,
    KeyZ: B, KeyX: Y, KeyA: A, KeyS: X, KeyQ: L, KeyW: R,
    Space: START, ShiftLeft: SELECT,
  },
  {
    KeyI: UP, KeyK: DOWN, KeyJ: LEFT, KeyL: RIGHT,
    KeyN: B, KeyM: Y, KeyG: A, KeyH: X, KeyU: L, KeyO: R,
    KeyP: START, KeyV: SELECT,
  },
] as const;

const down = new Set<string>();

function typing(target: EventTarget | null): boolean {
  const tour = document.querySelector("#tour");
  if (tour instanceof HTMLElement && !tour.hidden) return true;
  const manual = document.querySelector("#manual");
  if (manual instanceof HTMLElement && !manual.hidden) return true;
  return target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
}

window.addEventListener("keydown", (event) => {
  if (typing(event.target)) return;
  down.add(event.code);
  if (event.code.startsWith("Arrow") || event.code === "Space") event.preventDefault();
});
window.addEventListener("keyup", (event) => down.delete(event.code));
window.addEventListener("blur", () => down.clear());

function fromKeys(map: Record<string, number>): number {
  let bits = 0;
  for (const [code, bit] of Object.entries(map)) {
    if (down.has(code)) bits |= bit;
  }
  return bits;
}

function livePads(): [PadLike | null, PadLike | null] {
  const pads = navigator.getGamepads?.() ?? [];
  return assignPlayers([...pads]);
}

const SUPER_KEYS = ["KeyF", "Semicolon"] as const;

export function readSupers(): [boolean, boolean] {
  if (!document.hasFocus()) return [false, false];
  const [first, second] = livePads();
  const keys = typing(document.activeElement);
  return [(keys ? false : down.has(SUPER_KEYS[0])) || superPressed(first), (keys ? false : down.has(SUPER_KEYS[1])) || superPressed(second)];
}

export function readPads(): [number, number] {
  if (!document.hasFocus()) return [0, 0];
  const [first, second] = livePads();
  const keys: [number, number] = typing(document.activeElement) ? [0, 0] : [fromKeys(PLAYER_KEYS[0]), fromKeys(PLAYER_KEYS[1])];
  return [keys[0] | snesBits(first), keys[1] | snesBits(second)];
}

export function padStatus(): [string | null, string | null] {
  const [first, second] = livePads();
  return [first ? padLabel(first) : null, second ? padLabel(second) : null];
}

export function connectedPads(): [PadLike | null, PadLike | null] {
  return livePads();
}

export const KEYBOARD_GUIDE: { button: string; does: string }[][] = [
  [
    { button: "Setas", does: "Direções" },
    { button: "Z", does: "B" },
    { button: "X", does: "Y" },
    { button: "A", does: "A" },
    { button: "S", does: "X" },
    { button: "Q", does: "L" },
    { button: "W", does: "R" },
    { button: "Espaço", does: "Start" },
    { button: "Shift esquerdo", does: "Select" },
    { button: "F", does: "Super" },
    { button: "Enter", does: "Abre a conversa" },
  ],
  [
    { button: "I", does: "Cima" },
    { button: "K", does: "Baixo" },
    { button: "J", does: "Esquerda" },
    { button: "L", does: "Direita" },
    { button: "N", does: "B" },
    { button: "M", does: "Y" },
    { button: "G", does: "A" },
    { button: "H", does: "X" },
    { button: "U", does: "L" },
    { button: "O", does: "R" },
    { button: "P", does: "Start" },
    { button: "V", does: "Select" },
    { button: ";", does: "Super" },
  ],
];
