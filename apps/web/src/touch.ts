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

const FACE: Record<string, number> = {
  b: B,
  y: Y,
  select: SELECT,
  start: START,
  a: A,
  x: X,
  l: L,
  r: R,
};

const SECTORS = [
  RIGHT,
  DOWN | RIGHT,
  DOWN,
  DOWN | LEFT,
  LEFT,
  UP | LEFT,
  UP,
  UP | RIGHT,
] as const;

const IDLE = 10000;

/** Eight-way direction from the pad center. dx grows right, dy grows down. */
export function dpadBits(dx: number, dy: number, dead: number): number {
  if (dx * dx + dy * dy < dead * dead) return 0;
  const step = Math.PI / 4;
  const index = Math.floor((Math.atan2(dy, dx) + step / 2) / step);
  return SECTORS[((index % 8) + 8) % 8] ?? 0;
}

interface Hold {
  bits: number;
  dpad: HTMLElement | null;
}

export function startTouch(opts: {
  stage: HTMLElement;
  overlay: HTMLElement;
  setBits: (bits: number) => void;
  onExit: () => void;
}) {
  const { stage, overlay, setBits, onExit } = opts;
  const dpad = overlay.querySelector<HTMLElement>("#dpad");
  const exit = overlay.querySelector<HTMLButtonElement>("#touch-exit");
  const held = new Map<number, Hold>();
  let timer = 0;

  function playing(): boolean {
    return document.fullscreenElement === stage && window.matchMedia("(pointer: coarse)").matches;
  }

  function paint(bits: number) {
    for (const button of overlay.querySelectorAll<HTMLElement>("[data-bit]")) {
      const bit = FACE[button.dataset.bit ?? ""];
      button.classList.toggle("held", bit !== undefined && (bits & bit) !== 0);
    }
    dpad?.classList.toggle("held-up", (bits & UP) !== 0);
    dpad?.classList.toggle("held-down", (bits & DOWN) !== 0);
    dpad?.classList.toggle("held-left", (bits & LEFT) !== 0);
    dpad?.classList.toggle("held-right", (bits & RIGHT) !== 0);
  }

  function publish() {
    let bits = 0;
    for (const hold of held.values()) bits |= hold.bits;
    setBits(bits);
    paint(bits);
    if (held.size > 0) window.clearTimeout(timer);
  }

  function hide() {
    window.clearTimeout(timer);
    overlay.hidden = true;
  }

  function arm() {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (held.size === 0) hide();
    }, IDLE);
  }

  function direction(pad: HTMLElement, event: PointerEvent): number {
    const rect = pad.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    return dpadBits(dx, dy, Math.min(rect.width, rect.height) * 0.18);
  }

  function releaseAll() {
    held.clear();
    publish();
  }

  stage.addEventListener("pointerdown", (event) => {
    if (!playing() || !overlay.hidden) return;
    const target = event.target;
    if (target instanceof Element && target.closest("button, a, input, label, #confirm")) return;
    event.preventDefault();
    overlay.hidden = false;
  });

  stage.addEventListener("pointerup", () => {
    if (!overlay.hidden && held.size === 0) arm();
  });

  stage.addEventListener("pointercancel", () => {
    if (!overlay.hidden && held.size === 0) arm();
  });

  overlay.addEventListener("pointerdown", (event) => {
    if (!playing() || overlay.hidden || event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    const exitHit = !!target?.closest("#touch-exit");
    const pad = target?.closest("#dpad");
    const button = pad ? null : target?.closest<HTMLElement>("[data-bit]");
    const cap = pad instanceof HTMLElement ? pad : button ?? overlay;
    if (!exitHit) event.preventDefault();
    cap.setPointerCapture(event.pointerId);
    const bits = pad instanceof HTMLElement ? direction(pad, event) : button ? (FACE[button.dataset.bit ?? ""] ?? 0) : 0;
    held.set(event.pointerId, { bits, dpad: pad instanceof HTMLElement ? pad : null });
    publish();
  });

  overlay.addEventListener("pointermove", (event) => {
    const hold = held.get(event.pointerId);
    if (!hold?.dpad) return;
    const bits = direction(hold.dpad, event);
    if (bits === hold.bits) return;
    hold.bits = bits;
    publish();
  });

  function release(event: PointerEvent) {
    if (!held.has(event.pointerId)) return;
    held.delete(event.pointerId);
    publish();
    if (held.size === 0) arm();
  }

  overlay.addEventListener("pointerup", release);
  overlay.addEventListener("pointercancel", release);
  overlay.addEventListener("contextmenu", (event) => event.preventDefault());

  exit?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onExit();
  });

  window.addEventListener("blur", () => {
    releaseAll();
    if (!overlay.hidden) arm();
  });

  document.addEventListener("fullscreenchange", () => {
    if (playing()) return;
    releaseAll();
    hide();
  });
}
