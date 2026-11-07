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

const DEAD = 0.5;

export interface PadLike {
  id: string;
  mapping: string;
  buttons: ReadonlyArray<{ pressed: boolean; value?: number }>;
  axes: ReadonlyArray<number>;
  connected?: boolean;
}

function pressed(pad: PadLike, index: number): boolean {
  return !!pad.buttons[index]?.pressed;
}

function trigger(axis: number | undefined): boolean {
  return axis !== undefined && axis > 0;
}

/** One-axis hat: -1 is up and the value grows clockwise. Above 1 means released. */
export function hatBits(dir: number): number {
  if (dir === 0 || dir > 1 || dir < -1) return 0;
  let bits = 0;
  if ((dir >= -1 && dir < -0.7) || (dir >= 0.95 && dir <= 1)) bits |= UP;
  if (dir >= -0.75 && dir < -0.1) bits |= RIGHT;
  if (dir >= -0.2 && dir < 0.45) bits |= DOWN;
  if (dir >= 0.4 && dir <= 1) bits |= LEFT;
  return bits;
}

function stickBits(x: number | undefined, y: number | undefined): number {
  let bits = 0;
  if ((y ?? 0) < -DEAD) bits |= UP;
  if ((y ?? 0) > DEAD) bits |= DOWN;
  if ((x ?? 0) < -DEAD) bits |= LEFT;
  if ((x ?? 0) > DEAD) bits |= RIGHT;
  return bits;
}

function idOf(pad: PadLike): string {
  return pad.id.toLowerCase();
}

function isOfficialSnes(id: string): boolean {
  return (id.includes("057e") && id.includes("2017")) || id.includes("snes controller");
}

function isBuffalo(id: string): boolean {
  return id.includes("buffalo") || (id.includes("0583") && id.includes("2060"));
}

function isPlayStation(id: string): boolean {
  return id.includes("054c") || id.includes("dualshock") || id.includes("dualsense") || id.includes("wireless controller");
}

function isDragonRise(id: string): boolean {
  return id.includes("dragonrise") || id.includes("2axes") || (id.includes("0079") && (id.includes("0011") || id.includes("0006")));
}

function isArcade(id: string): boolean {
  if (id.includes("0079") && id.includes("0006")) return true;
  return /arcade|fliperama|fight\s*stick|fighting stick|qanba|mayflash|brook|xin-?mo|zero\s*delay|hitbox|joystick|gp2040/.test(id);
}

type Layout = "standard" | "ps" | "dragon" | "buffalo" | "snes";

function layoutOf(pad: PadLike): Layout {
  if (pad.mapping === "standard") return "standard";
  const id = idOf(pad);
  if (isOfficialSnes(id) || id.includes("snes") || id.includes("sfc30")) return "snes";
  if (isBuffalo(id)) return "buffalo";
  if (isPlayStation(id)) return "ps";
  if (isArcade(id) || isDragonRise(id) || pad.buttons.length <= 12) return "dragon";
  return "standard";
}

function standardBits(pad: PadLike): number {
  let bits = 0;
  if (pressed(pad, 0)) bits |= B;
  if (pressed(pad, 1)) bits |= A;
  if (pressed(pad, 2)) bits |= Y;
  if (pressed(pad, 3)) bits |= X;
  if (pressed(pad, 4) || pressed(pad, 6)) bits |= L;
  if (pressed(pad, 5)) bits |= R;
  if (pressed(pad, 8)) bits |= SELECT;
  if (pressed(pad, 9)) bits |= START;
  if (pressed(pad, 12)) bits |= UP;
  if (pressed(pad, 13)) bits |= DOWN;
  if (pressed(pad, 14)) bits |= LEFT;
  if (pressed(pad, 15)) bits |= RIGHT;
  bits |= stickBits(pad.axes[0], pad.axes[1]);
  return bits;
}

function psBits(pad: PadLike): number {
  let bits = 0;
  if (pressed(pad, 1)) bits |= B;
  if (pressed(pad, 2)) bits |= A;
  if (pressed(pad, 0)) bits |= Y;
  if (pressed(pad, 3)) bits |= X;
  if (pressed(pad, 4) || trigger(pad.axes[3])) bits |= L;
  if (pressed(pad, 5)) bits |= R;
  if (pressed(pad, 8)) bits |= SELECT;
  if (pressed(pad, 9)) bits |= START;
  bits |= stickBits(pad.axes[0], pad.axes[1]);
  bits |= hatBits(pad.axes[9] ?? 0);
  return bits;
}

function dragonBits(pad: PadLike): number {
  let bits = 0;
  if (pressed(pad, 2)) bits |= B;
  if (pressed(pad, 1)) bits |= A;
  if (pressed(pad, 3)) bits |= Y;
  if (pressed(pad, 0)) bits |= X;
  if (pressed(pad, 4)) bits |= L;
  if (pressed(pad, 5)) bits |= R;
  if (pressed(pad, 6)) bits |= SELECT;
  if (pressed(pad, 7)) bits |= START;
  bits |= stickBits(pad.axes[0], pad.axes[1]);
  return bits;
}

function buffaloBits(pad: PadLike): number {
  let bits = 0;
  if (pressed(pad, 1)) bits |= B;
  if (pressed(pad, 0)) bits |= A;
  if (pressed(pad, 3)) bits |= Y;
  if (pressed(pad, 2)) bits |= X;
  if (pressed(pad, 4)) bits |= L;
  if (pressed(pad, 5)) bits |= R;
  if (pressed(pad, 6)) bits |= SELECT;
  if (pressed(pad, 7)) bits |= START;
  bits |= stickBits(pad.axes[0], pad.axes[1]);
  return bits;
}

function snesBitsRaw(pad: PadLike): number {
  let bits = 0;
  if (pressed(pad, 0)) bits |= B;
  if (pressed(pad, 1)) bits |= A;
  if (pressed(pad, 2)) bits |= Y;
  if (pressed(pad, 3)) bits |= X;
  if (pressed(pad, 4) || pressed(pad, 6)) bits |= L;
  if (pressed(pad, 5) || pressed(pad, 15)) bits |= R;
  if (pressed(pad, 8)) bits |= SELECT;
  if (pressed(pad, 9)) bits |= START;
  bits |= stickBits(pad.axes[0], pad.axes[1]);
  for (const axis of pad.axes) bits |= hatBits(axis);
  return bits;
}

/** SNES button bits for one physical pad. Position follows the Super Nintendo diamond. */
export function snesBits(pad: PadLike | null): number {
  if (!pad) return 0;
  switch (layoutOf(pad)) {
    case "ps":
      return psBits(pad);
    case "dragon":
      return dragonBits(pad);
    case "buffalo":
      return buffaloBits(pad);
    case "snes":
      return snesBitsRaw(pad);
    default:
      return standardBits(pad);
  }
}

function analogDown(pad: PadLike, index: number): boolean {
  const button = pad.buttons[index];
  return !!button && (button.pressed || (button.value ?? 0) > 0.2);
}

function axisDown(pad: PadLike, index: number): boolean {
  const axis = pad.axes[index];
  return axis !== undefined && axis > 0.2;
}

/** R2 is the Final Fight super, so it stays off the SNES R button. */
export function superPressed(pad: PadLike | null): boolean {
  if (!pad) return false;
  const kind = layoutOf(pad);
  if (kind === "dragon" || kind === "buffalo" || kind === "snes") return false;
  if (analogDown(pad, 7)) return true;
  return axisDown(pad, 4) || axisDown(pad, 5);
}

export function padLabel(pad: PadLike): string {
  const id = idOf(pad);
  if (isOfficialSnes(id) || id.includes("snes") || id.includes("sfc30")) return "Super Nintendo";
  if (isArcade(id)) return "Fliperama";
  if (id.includes("xbox") || id.includes("045e") || id.includes("xinput")) return "Xbox";
  if (id.includes("0ce6") || id.includes("0df2") || id.includes("dualsense")) return "PS5";
  if (isPlayStation(id)) return "PS4";
  return "Controle USB";
}

export function assignPlayers<T extends { connected?: boolean }>(pads: ReadonlyArray<T | null>): [T | null, T | null] {
  const connected = pads.filter((pad): pad is T => !!pad && pad.connected !== false);
  return [connected[0] ?? null, connected[1] ?? null];
}
