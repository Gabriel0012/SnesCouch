export type StepDir = "up" | "down" | "left" | "right" | "modal";

const TICK = 34;
const IN_FRAMES: Record<StepDir, number> = { up: 5, down: 5, left: 5, right: 5, modal: 8 };
const OUT_FRAMES: Record<StepDir, number> = { up: 4, down: 4, left: 4, right: 4, modal: 5 };
const DIRS: StepDir[] = ["up", "down", "left", "right", "modal"];

function reduced() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function clearMotion(el: HTMLElement) {
  el.classList.remove("step-in", "step-out");
  for (const dir of DIRS) el.classList.remove(`move-${dir}`);
}

function bump(el: HTMLElement) {
  const token = (Number(el.dataset.step) || 0) + 1;
  el.dataset.step = String(token);
  return String(token);
}

export function reveal(el: HTMLElement, dir: StepDir, replay = false) {
  const leaving = el.classList.contains("step-out");
  if (!replay && !el.hidden && !leaving) return;
  const token = bump(el);
  const restart = el.classList.contains("step-in") || leaving;
  el.hidden = false;
  clearMotion(el);
  if (restart) void el.offsetWidth;
  el.classList.add("step-in", `move-${dir}`);
  const wait = reduced() ? 0 : IN_FRAMES[dir] * TICK + 40;
  window.setTimeout(() => {
    if (el.dataset.step !== token) return;
    clearMotion(el);
  }, wait);
}

export function conceal(el: HTMLElement, dir: StepDir) {
  if (el.hidden) return;
  const token = bump(el);
  clearMotion(el);
  void el.offsetWidth;
  el.classList.add("step-out", `move-${dir}`);
  const wait = reduced() ? 0 : OUT_FRAMES[dir] * TICK + 40;
  window.setTimeout(() => {
    if (el.dataset.step !== token) return;
    el.hidden = true;
    clearMotion(el);
  }, wait);
}

export function shown(el: HTMLElement, on: boolean, dir: StepDir) {
  if (on) reveal(el, dir);
  else conceal(el, dir);
}
