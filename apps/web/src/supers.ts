const B = 1 << 0;
const Y = 1 << 1;
const UP = 1 << 4;
const DOWN = 1 << 5;
export const LEFT = 1 << 6;
export const RIGHT = 1 << 7;
export const SELECT = 1 << 2;
/** SNES X. Final Fight 3 leaves it unused, so the special shortcut takes it. */
export const X = 1 << 9;

export type Fighter = "haggar" | "lucia" | "dean";

export const FIGHTERS: Fighter[] = ["haggar", "lucia", "dean"];

export function fighterLabel(fighter: Fighter): string {
  if (fighter === "lucia") return "Lucia";
  if (fighter === "dean") return "Dean";
  return "Haggar e Guy";
}

function hold(bits: number, frames: number): number[] {
  return Array.from({ length: frames }, () => bits & 0xffff);
}

/** One frame per entry. Forward follows the side the player is facing. */
export function superSteps(fighter: Fighter | "guy", forward: number): number[] {
  const face = forward & LEFT ? LEFT : RIGHT;
  const downForward = DOWN | face;
  if (fighter === "lucia") return [...hold(DOWN, 5), ...hold(0, 4), ...hold(DOWN, 5), ...hold(face | Y, 8)];
  if (fighter === "dean") return [...hold(DOWN, 5), ...hold(UP | Y, 8)];
  if (fighter === "guy") return [...hold(face, 3), ...hold(DOWN, 3), ...hold(face | Y, 8)];
  return [...hold(face, 3), ...hold(downForward, 3), ...hold(DOWN | Y, 8)];
}

function quarter(face: number): number[] {
  return [...hold(DOWN, 3), ...hold(DOWN | face, 3), ...hold(face | Y, 8)];
}

/**
 * One frame per entry. X alone plays the first special.
 * Down with X is Dean's grab. Up with X is Lucia's air kick, which jumps first.
 */
export function specialSteps(fighter: Fighter | "guy", forward: number, held = 0): number[] {
  const face = forward & LEFT ? LEFT : RIGHT;
  const downForward = DOWN | face;
  if (fighter === "dean") {
    if ((held & DOWN) !== 0) return quarter(face);
    return [...hold(face, 3), ...hold(UP | face, 3), ...hold(UP, 3), ...hold(UP | Y, 8)];
  }
  if (fighter === "lucia") {
    if ((held & UP) !== 0) return [...hold(B, 4), ...hold(0, 16), ...quarter(face)];
    return [...hold(face, 3), ...hold(DOWN, 3), ...hold(downForward | Y, 8)];
  }
  return quarter(face);
}

/**
 * Pad bits 12-15 have no SNES button, so the core ignores them. A move
 * request rides on them through the lockstep: every emulator sees it on the
 * same frame and writes the same motion into the game's pad history.
 */
export const SUPER_BIT = 1 << 12;
export const SPECIAL_BIT = 1 << 13;
export const FACE_LEFT_BIT = 1 << 14;
export const DOWN_HELD_BIT = 1 << 15;
export const MOVE_BITS = SUPER_BIT | SPECIAL_BIT | FACE_LEFT_BIT | DOWN_HELD_BIT;
/** P2 reads its command a frame later than P1, so one frame of punch is not enough for both. */
export const PRESS_FRAMES = 4;

/** Final Fight 3 RAM: one 0x100 block per player, and a pad history per player. */
export const FIGHTER_RAM = [0x0501, 0x0601] as const;
export const HISTORY_RAM = [0x6000, 0x6080] as const;

export type MoveKind = "super" | "special";

const DIRECTIONS = UP | DOWN | LEFT | RIGHT;

/** The motion before the final press, or null when it needs more than directions (Lucia jumps first). */
export function splitMove(steps: number[]): { motion: number[]; press: number } | null {
  const press = steps.at(-1) ?? 0;
  const start = steps.indexOf(press);
  if (start <= 0) return null;
  const motion = steps.slice(0, start);
  if (motion.some((step) => (step & ~DIRECTIONS) !== 0)) return null;
  return { motion, press };
}

/** The game keeps one word per frame, newest first: 0x00, then right 1, left 2, down 4, up 8. */
export function historyBytes(motion: number[]): number[] {
  const bytes: number[] = [];
  for (const step of [...motion].reverse()) {
    const dir = (step & RIGHT ? 0x01 : 0) | (step & LEFT ? 0x02 : 0) | (step & DOWN ? 0x04 : 0) | (step & UP ? 0x08 : 0);
    bytes.push(0, dir);
  }
  return bytes;
}

function moveSteps(kind: MoveKind, fighter: Fighter | "guy", forward: number, held: number): number[] {
  return kind === "super" ? superSteps(fighter, forward) : specialSteps(fighter, forward, held);
}

/** What the player's own pad sends: the request plus the press, then the press alone. Null falls back to the full macro. */
export function quickMove(kind: MoveKind, fighter: Fighter | "guy", forward: number, held = 0): number[] | null {
  const split = splitMove(moveSteps(kind, fighter, forward, held));
  if (!split) return null;
  const request = (kind === "super" ? SUPER_BIT : SPECIAL_BIT)
    | (forward & LEFT ? FACE_LEFT_BIT : 0)
    | (held & DOWN ? DOWN_HELD_BIT : 0);
  return [split.press | request, ...hold(split.press, PRESS_FRAMES - 1)];
}

/** The motion a request asks for, read back from the pad on every emulator. */
export function requestedMotion(pad: number, fighter: Fighter | "guy"): number[] | null {
  if ((pad & (SUPER_BIT | SPECIAL_BIT)) === 0) return null;
  const kind: MoveKind = pad & SUPER_BIT ? "super" : "special";
  const forward = pad & FACE_LEFT_BIT ? LEFT : RIGHT;
  const held = pad & DOWN_HELD_BIT ? DOWN : 0;
  return splitMove(moveSteps(kind, fighter, forward, held))?.motion ?? null;
}
