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
