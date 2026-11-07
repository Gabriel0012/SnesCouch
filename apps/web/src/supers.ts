const Y = 1 << 1;
const UP = 1 << 4;
const DOWN = 1 << 5;
export const LEFT = 1 << 6;
export const RIGHT = 1 << 7;
export const SELECT = 1 << 2;

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
export function superSteps(fighter: Fighter, forward: number): number[] {
  const face = forward & LEFT ? LEFT : RIGHT;
  if (fighter === "lucia") return [...hold(DOWN, 5), ...hold(0, 4), ...hold(DOWN, 5), ...hold(face | Y, 8)];
  if (fighter === "dean") return [...hold(DOWN, 5), ...hold(UP | Y, 8)];
  return [...hold(face, 5), ...hold(DOWN, 5), ...hold(face, 5), ...hold(DOWN | Y, 8)];
}
