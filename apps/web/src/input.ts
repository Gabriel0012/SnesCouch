import { assignPlayers, keyboardScheme, padLabel, snesBits, superPressed, type PadLike } from "./pads.ts";

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
let touchBits = 0;

export function setTouchBits(bits: number) {
  touchBits = bits & 0xfff;
}

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
window.addEventListener("blur", () => {
  down.clear();
  touchBits = 0;
});

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

function schemeBits(slot: 0 | 1, seats: [PadLike | null, PadLike | null], blocked: boolean): number {
  if (blocked) return 0;
  const scheme = keyboardScheme(slot, seats);
  return scheme === null ? 0 : fromKeys(PLAYER_KEYS[scheme]);
}

function schemeSuper(slot: 0 | 1, seats: [PadLike | null, PadLike | null], blocked: boolean): boolean {
  if (blocked) return false;
  const scheme = keyboardScheme(slot, seats);
  return scheme !== null && down.has(SUPER_KEYS[scheme]);
}

export function readSupers(mode: "local" | "online" = "local"): [boolean, boolean] {
  if (!document.hasFocus()) return [false, false];
  const seats = livePads();
  const blocked = typing(document.activeElement);
  if (mode === "online") {
    return [blocked ? superPressed(seats[0]) : down.has(SUPER_KEYS[0]) || superPressed(seats[0]), false];
  }
  return [schemeSuper(0, seats, blocked) || superPressed(seats[0]), schemeSuper(1, seats, blocked) || superPressed(seats[1])];
}

export function readPads(mode: "local" | "online" = "local", gameId = ""): [number, number] {
  if (!document.hasFocus()) return [0, 0];
  const seats = livePads();
  const blocked = typing(document.activeElement);
  if (mode === "online") {
    const keys = blocked ? 0 : fromKeys(PLAYER_KEYS[0]);
    return [keys | snesBits(seats[0], gameId) | touchBits, 0];
  }
  return [
    schemeBits(0, seats, blocked) | snesBits(seats[0], gameId) | touchBits,
    schemeBits(1, seats, blocked) | snesBits(seats[1], gameId),
  ];
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
    { button: "C", does: "Segura o histórico" },
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
