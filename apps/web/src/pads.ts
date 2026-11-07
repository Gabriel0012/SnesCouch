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

export interface GuideRow {
  button: string;
  does: string;
}

function standardGuide(label: string): GuideRow[] {
  const play = label === "PS4" || label === "PS5";
  const plain = label === "Fliperama" || label === "Controle USB";
  const face = play ? ["X", "Círculo", "Quadrado", "Triângulo"] : plain ? ["Baixo", "Direita", "Esquerda", "Cima"] : ["A", "B", "X", "Y"];
  const shoulder = play ? ["L1", "R1", "L2", "R2"] : plain ? ["L", "R", "L2", "R2"] : ["LB", "RB", "LT", "RT"];
  const menu = play ? [label === "PS5" ? "Create" : "Share", "Options"] : plain ? ["Select", "Start"] : ["View", "Menu"];
  return [
    { button: "Direcional", does: "Direções" },
    { button: label === "Fliperama" ? "Alavanca" : "Analógico esquerdo", does: "Direções" },
    { button: face[0], does: "B" },
    { button: face[1], does: "A" },
    { button: face[2], does: "Y" },
    { button: face[3], does: "X" },
    { button: shoulder[0], does: "L" },
    { button: shoulder[1], does: "R" },
    { button: shoulder[2], does: "L" },
    { button: shoulder[3], does: "Super" },
    { button: menu[0], does: "Select" },
    { button: menu[1], does: "Start" },
  ];
}

/** Physical buttons of the connected pad, and the Super Nintendo action each one does. */
export function controlGuide(pad: PadLike): GuideRow[] {
  const label = padLabel(pad);
  switch (layoutOf(pad)) {
    case "ps":
      return [
        { button: "Direcional", does: "Direções" },
        { button: "Analógico esquerdo", does: "Direções" },
        { button: "X", does: "B" },
        { button: "Círculo", does: "A" },
        { button: "Quadrado", does: "Y" },
        { button: "Triângulo", does: "X" },
        { button: "L1", does: "L" },
        { button: "R1", does: "R" },
        { button: "L2", does: "L" },
        { button: "R2", does: "Super" },
        { button: label === "PS5" ? "Create" : "Share", does: "Select" },
        { button: "Options", does: "Start" },
      ];
    case "dragon":
      return [
        { button: "Analógico", does: "Direções" },
        { button: "Botão 1", does: "X" },
        { button: "Botão 2", does: "A" },
        { button: "Botão 3", does: "B" },
        { button: "Botão 4", does: "Y" },
        { button: "Botão 5", does: "L" },
        { button: "Botão 6", does: "R" },
        { button: "Botão 7", does: "Select" },
        { button: "Botão 8", does: "Start" },
      ];
    case "buffalo":
      return [
        { button: "Analógico", does: "Direções" },
        { button: "A", does: "A" },
        { button: "B", does: "B" },
        { button: "X", does: "X" },
        { button: "Y", does: "Y" },
        { button: "L", does: "L" },
        { button: "R", does: "R" },
        { button: "Select", does: "Select" },
        { button: "Start", does: "Start" },
      ];
    case "snes":
      return [
        { button: "Direcional", does: "Direções" },
        { button: "B", does: "B" },
        { button: "A", does: "A" },
        { button: "Y", does: "Y" },
        { button: "X", does: "X" },
        { button: "L", does: "L" },
        { button: "R", does: "R" },
        { button: "Select", does: "Select" },
        { button: "Start", does: "Start" },
      ];
    default:
      return standardGuide(label);
  }
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

/**
 * Keyboard scheme for a local seat.
 * No pads: seat 0 keeps the arrows, seat 1 keeps IJKL.
 * One pad: that seat is the pad, and the other seat takes the arrows.
 * Two pads: neither seat uses a keyboard.
 */
export function keyboardScheme(slot: 0 | 1, seats: readonly [unknown, unknown]): 0 | 1 | null {
  const count = (seats[0] ? 1 : 0) + (seats[1] ? 1 : 0);
  if (count >= 2) return null;
  if (count === 0) return slot;
  return seats[slot] ? null : 0;
}
