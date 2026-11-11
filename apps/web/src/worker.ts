import createSnes from "./generated/snes.js";
import wasmUrl from "./generated/snes.wasm?url";
import { Lockstep, type Slot } from "../../../packages/net/lockstep.ts";
import { LEFT, RIGHT, specialSteps, superSteps, type Fighter } from "./supers.ts";

type Core = {
  wasmMemory: WebAssembly.Memory;
  _malloc(size: number): number;
  _free(ptr: number): void;
  _snes_load(ptr: number, size: number): number;
  _snes_set_input(port: number, buttons: number): void;
  _snes_run_frame(): void;
  _snes_width(): number;
  _snes_height(): number;
  _snes_framebuffer(): number;
  _snes_frame_bytes(): number;
  _snes_audiobuffer(): number;
  _snes_audio_frames(): number;
  _snes_sample_rate(): number;
  _snes_state_size(): number;
  _snes_save_state(ptr: number, cap: number): number;
  _snes_load_state(ptr: number, len: number): number;
  _snes_state_hash(): number;
};

let core: Core | null = null;
interface LoadMessage { t: "load"; rom: ArrayBuffer; canvas: OffscreenCanvas; sab: SharedArrayBuffer; net?: { slot: Slot; delay: number }; plain?: boolean; watch?: boolean; probe?: boolean }
interface NetStart { t: "net-start"; slot: Slot; delay: number }
interface NetRemote { t: "net-remote"; frames: { frame: number; buttons: number }[] }
interface NetResume { t: "net-resume"; slot: Slot; delay: number; frame: number; state: ArrayBuffer }
interface RestoreMessage { t: "restore"; state: ArrayBuffer }
interface ResetMessage { t: "reset"; slot?: Slot; delay?: number }
interface Simple { t: "local" | "pause" | "checkpoint" | "stop" | "save" | "net-arm" | "watch-start" | "watch-stop" | "watch-snapshot" | "watch-mode" | "probe" }
interface SuperMessage { t: "super"; port: 0 | 1; steps: number[] }
interface SpecialMessage { t: "special"; port: 0 | 1; held: number; steps: number[] }
interface WatchLoad { t: "watch-load"; frame: number; state: ArrayBuffer }
interface WatchFrames { t: "watch-frames"; frames: number[] }

type Incoming = LoadMessage | NetStart | NetRemote | NetResume | RestoreMessage | ResetMessage | Simple | SuperMessage | SpecialMessage | WatchLoad | WatchFrames;

let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let pads: Uint16Array | null = null;
let mode: "local" | "net" | "paused" | "watch" = "paused";
let lockstep: Lockstep | null = null;
let checkpoint: Uint8Array | null = null;
let checkpointFrame = 0;
let rom: Uint8Array | null = null;
let image: ImageData | null = null;
let looping = false;
const FRAME_MS = 1000 / 60.0988;
const EARLY_MS = FRAME_MS / 4;
const MAX_CATCH_UP = 3;
let due = 0;
let lastRaf = 0;
let fpsFrames = 0;
let fpsSince = 0;
let fpsShown = 0;
let frameNo = 0;
let watching = false;
let watchDirty = false;
let watchOut: number[] = [];
let watchSentAt = 0;
let watchFrame = -1;
let watchPrimed = false;
const watchQueue = new Map<number, [number, number]>();
let probing = false;
const probeRing: [number, number][] = [];
const WATCH_PRIME = 8;
const WATCH_BEHIND = 30;
const pendingRemote: { frame: number; buttons: number }[] = [];
const macro: [number[] | null, number[] | null] = [null, null];
const macroAt = [0, 0];

function clearMacros() {
  macro[0] = null;
  macro[1] = null;
  macroAt[0] = 0;
  macroAt[1] = 0;
}

function peekMacro(port: 0 | 1, buttons: number): number {
  const steps = macro[port];
  if (!steps) return buttons & 0xffff;
  return (steps[macroAt[port]] ?? 0) & 0xffff;
}

function playMacro(port: 0 | 1, steps: number[]) {
  if (steps.length === 0 || steps.length > 90) return;
  macro[port] = steps.map((step) => Number(step) & 0xffff);
  macroAt[port] = 0;
}

function commitMacro(port: 0 | 1) {
  const steps = macro[port];
  if (!steps) return;
  macroAt[port] += 1;
  if (macroAt[port] >= steps.length) {
    macro[port] = null;
    macroAt[port] = 0;
  }
}

function post(message: unknown, transfer: Transferable[] = []) {
  const scope = self as unknown as { postMessage(message: unknown, transfer: Transferable[]): void };
  scope.postMessage(message, transfer);
}

function heap() {
  if (!core) throw new Error("núcleo ausente");
  return new Uint8Array(core.wasmMemory.buffer);
}

function paint() {
  if (!core || !canvas || !ctx) return;
  const width = core._snes_width();
  const height = core._snes_height();
  const bytes = core._snes_frame_bytes();
  const ptr = core._snes_framebuffer();
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    post({ t: "aspect", w: width, h: height });
  }
  if (!image || image.width !== width || image.height !== height) image = new ImageData(width, height);
  const size = Math.min(bytes, image.data.length);
  image.data.set(new Uint8ClampedArray(heap().buffer, ptr, size));
  ctx.putImageData(image, 0, 0);
}

function emitAudio() {
  if (!core) return;
  const frames = core._snes_audio_frames();
  if (frames <= 0) return;
  const ptr = core._snes_audiobuffer();
  const samples = new Int16Array(heap().buffer, ptr, frames * 2).slice();
  post({ t: "audio", rate: core._snes_sample_rate(), samples }, [samples.buffer]);
}

function run(p0: number, p1: number) {
  if (!core) return;
  core._snes_set_input(0, p0);
  core._snes_set_input(1, p1);
  core._snes_run_frame();
  paint();
  emitAudio();
  fpsFrames += 1;
  if (watching) watchOut.push(frameNo, p0 & 0xffff, p1 & 0xffff);
  if (probing) {
    probeRing.push([frameNo, core._snes_state_hash() >>> 0]);
    if (probeRing.length > 600) probeRing.shift();
  }
  frameNo += 1;
}

function flushWatch(now: number) {
  if (!watching) return;
  if (watchDirty) {
    watchDirty = false;
    watchOut = [];
    const state = saveState();
    if (state) {
      const copy = state.slice();
      post({ t: "watch-state", frame: frameNo, state: copy.buffer }, [copy.buffer]);
    }
    watchSentAt = now;
    return;
  }
  if (watchOut.length === 0) return;
  if (watchOut.length < 18 && now - watchSentAt < 100) return;
  post({ t: "watch-frames", frames: watchOut });
  watchOut = [];
  watchSentAt = now;
}

function watchTick() {
  if (watchFrame < 0) return;
  let ahead = 0;
  while (watchQueue.has(watchFrame + ahead)) ahead += 1;
  if (!watchPrimed) {
    if (ahead < WATCH_PRIME) return;
    watchPrimed = true;
  }
  if (ahead === 0) {
    watchPrimed = false;
    return;
  }
  const steps = ahead > WATCH_BEHIND ? 2 : 1;
  for (let i = 0; i < steps; i++) {
    const pads = watchQueue.get(watchFrame);
    if (!pads) break;
    watchQueue.delete(watchFrame);
    run(pads[0], pads[1]);
    watchFrame += 1;
  }
}

async function frameShot(): Promise<Uint8Array | null> {
  if (!canvas || canvas.width < 2 || canvas.height < 2) return null;
  try {
    const blob = await canvas.convertToBlob({ type: "image/png" });
    return new Uint8Array(await blob.arrayBuffer());
  } catch {
    return null;
  }
}

function blockStart(state: Uint8Array, name: string, size: number): number {
  const header = `${name}:${String(size).padStart(6, "0")}:`;
  const width = header.length;
  for (let i = 0; i + width + size <= state.length; i++) {
    let match = true;
    for (let j = 0; j < width; j++) {
      if (state[i + j] !== header.charCodeAt(j)) {
        match = false;
        break;
      }
    }
    if (match) return i + width;
  }
  return -1;
}

function fighterByte(byte: number): (Fighter | "guy") | null {
  if (byte === 1) return "guy";
  if (byte === 2) return "haggar";
  if (byte === 3) return "lucia";
  if (byte === 4) return "dean";
  return null;
}

function readFighterByte(port: 0 | 1): number | null {
  const state = saveState();
  if (!state) return null;
  const ram = blockStart(state, "RAM", 0x20000);
  if (ram < 0) return null;
  return state[ram + (port === 0 ? 0x1f15 : 0x0f16)];
}

function saveState() {
  if (!core) return null;
  const size = core._snes_state_size();
  const ptr = core._malloc(size);
  const wrote = core._snes_save_state(ptr, size);
  if (!wrote) {
    core._free(ptr);
    return null;
  }
  const bytes = new Uint8Array(heap().buffer, ptr, wrote).slice();
  core._free(ptr);
  return bytes;
}

function loadRom(bytes: Uint8Array) {
  if (!core) return false;
  const ptr = core._malloc(bytes.length);
  heap().set(bytes, ptr);
  const ok = core._snes_load(ptr, bytes.length);
  core._free(ptr);
  if (ok === 1 && watching) watchDirty = true;
  return ok === 1;
}

function loadState(bytes: Uint8Array) {
  if (!core) return false;
  const ptr = core._malloc(bytes.length);
  heap().set(bytes, ptr);
  const ok = core._snes_load_state(ptr, bytes.length);
  core._free(ptr);
  if (ok === 1 && watching) watchDirty = true;
  return ok === 1;
}

function localButtons() {
  return pads ? pads[0] & 0xffff : 0;
}

function remember() {
  const bytes = saveState();
  if (!bytes) return;
  checkpoint = bytes;
  checkpointFrame = lockstep?.simFrame ?? 0;
}

function publishLocal(frames: number[], buttons: number) {
  post({ t: "local-input", frames: frames.map((frame) => ({ frame, buttons })) });
}

function flushPending() {
  if (!lockstep) return;
  const queued = pendingRemote.splice(0);
  for (const frame of queued) lockstep.pushRemote(frame.frame, frame.buttons);
}

function beginNet(slot: Slot, delay: number, atFrame: number | null) {
  if (delay < 1) {
    post({ t: "error", message: "Atraso da sala inválido." });
    return;
  }
  lockstep = new Lockstep(slot, delay);
  const buttons = localButtons();
  const frames = atFrame === null ? lockstep.prime(buttons) : lockstep.resume(atFrame, buttons);
  flushPending();
  mode = "net";
  publishLocal(frames, buttons);
}

function enterWatch() {
  mode = "watch";
  lockstep = null;
  pendingRemote.length = 0;
  clearMacros();
  watchFrame = -1;
  watchPrimed = false;
  watchQueue.clear();
}

function tick() {
  if (mode === "watch") {
    watchTick();
    return;
  }
  if (mode === "local" && pads) {
    const p0 = peekMacro(0, pads[0]);
    const p1 = peekMacro(1, pads[1]);
    commitMacro(0);
    commitMacro(1);
    run(p0, p1);
  }
  if (mode === "net" && lockstep) {
    const sampled = peekMacro(0, localButtons());
    const step = lockstep.advance(sampled);
    if (!step) {
      post({ t: "waiting", frame: lockstep.simFrame });
    } else {
      commitMacro(0);
      run(step.pads[0], step.pads[1]);
      post({ t: "local-input", frames: [{ frame: step.sendFrame, buttons: step.sendButtons }] });
      if (step.frame % 60 === 59) post({ t: "check", frame: step.frame, hash: core!._snes_state_hash() >>> 0 });
      remember();
    }
  }
}

function pump(now: number) {
  if (due === 0 || now - due > FRAME_MS * 6) due = now;
  let ran = 0;
  while (now + EARLY_MS >= due && ran < MAX_CATCH_UP) {
    tick();
    due += FRAME_MS;
    ran += 1;
  }
  flushWatch(now);
  if (now - fpsSince >= 500) {
    const sample = fpsSince ? (fpsFrames * 1000) / (now - fpsSince) : 0;
    fpsShown = fpsShown ? fpsShown * 0.6 + sample * 0.4 : sample;
    post({ t: "fps", fps: fpsShown });
    fpsFrames = 0;
    fpsSince = now;
  }
}

const vsync = (self as unknown as { requestAnimationFrame?: (fn: () => void) => number }).requestAnimationFrame?.bind(self);

function onVsync() {
  lastRaf = performance.now();
  pump(lastRaf);
  vsync!(onVsync);
}

// O rAF do worker para quando a aba some; o timer segue com a partida em rede.
function fallback() {
  const now = performance.now();
  const stale = !vsync || now - lastRaf > 100;
  if (stale) pump(now);
  self.setTimeout(fallback, stale ? Math.max(1, due - EARLY_MS - now) : 100);
}

function loop() {
  looping = true;
  if (vsync) vsync(onVsync);
  fallback();
}

self.onmessage = async (event: MessageEvent<Incoming>) => {
  const message = event.data;
  if (message.t === "load") {
    canvas = message.canvas;
    probing = message.probe === true;
    ctx = canvas.getContext("2d", { alpha: false });
    pads = new Uint16Array(message.sab);
    core = await createSnes({ locateFile: (file: string) => (file.endsWith(".wasm") ? wasmUrl : file) }) as Core;
    rom = new Uint8Array(message.rom);
    const ok = loadRom(rom);
    if (!ok) {
      post({ t: "error", message: "O núcleo não aceitou essa ROM." });
      return;
    }
    clearMacros();
    lockstep = null;
    const net = message.net;
    if (message.watch) enterWatch();
    else if (net && (net.slot === 0 || net.slot === 1) && net.delay >= 1) beginNet(net.slot, net.delay, null);
    else mode = "local";
    if (mode !== "watch") run(0, 0);
    if (!looping) loop();
    post({ t: "loaded", rate: core._snes_sample_rate() });
    return;
  }
  if (message.t === "local") {
    mode = "local";
    lockstep = null;
    pendingRemote.length = 0;
    watchQueue.clear();
    clearMacros();
    return;
  }
  if (message.t === "probe") {
    post({ t: "probe", ring: probeRing.slice() });
    return;
  }
  if (message.t === "watch-start") {
    watching = true;
    watchDirty = true;
    return;
  }
  if (message.t === "watch-stop") {
    watching = false;
    watchDirty = false;
    watchOut = [];
    return;
  }
  if (message.t === "watch-snapshot") {
    if (watching) watchDirty = true;
    return;
  }
  if (message.t === "watch-mode") {
    enterWatch();
    return;
  }
  if (message.t === "watch-load") {
    if (mode !== "watch") return;
    if (!loadState(new Uint8Array(message.state))) return;
    watchFrame = message.frame;
    frameNo = message.frame;
    probeRing.length = 0;
    watchPrimed = false;
    for (const frame of [...watchQueue.keys()]) {
      if (frame < watchFrame) watchQueue.delete(frame);
    }
    return;
  }
  if (message.t === "watch-frames") {
    if (mode !== "watch" || !Array.isArray(message.frames)) return;
    const list = message.frames;
    for (let i = 0; i + 2 < list.length; i += 3) {
      const frame = Number(list[i]);
      if (watchFrame >= 0 && frame < watchFrame) continue;
      watchQueue.set(frame, [Number(list[i + 1]) & 0xffff, Number(list[i + 2]) & 0xffff]);
    }
    if (watchFrame < 0 && watchQueue.size > 600) watchQueue.clear();
    return;
  }
  if (message.t === "super") {
    const port = message.port === 1 ? 1 : 0;
    const incoming = Array.isArray(message.steps) ? message.steps : [];
    const fighter = fighterByte(readFighterByte(port) ?? -1);
    const forward = incoming.some((step) => (Number(step) & LEFT) !== 0) ? LEFT : RIGHT;
    const steps = fighter ? superSteps(fighter, forward) : incoming;
    playMacro(port, steps);
    return;
  }
  if (message.t === "special") {
    const port = message.port === 1 ? 1 : 0;
    const incoming = Array.isArray(message.steps) ? message.steps : [];
    const fighter = fighterByte(readFighterByte(port) ?? -1);
    const forward = incoming.some((step) => (Number(step) & LEFT) !== 0) ? LEFT : RIGHT;
    const held = Number(message.held) & 0xffff;
    const steps = fighter ? specialSteps(fighter, forward, held) : incoming;
    playMacro(port, steps);
    return;
  }
  if (message.t === "net-arm") {
    pendingRemote.length = 0;
    lockstep = null;
    checkpoint = null;
    checkpointFrame = 0;
    mode = "local";
    return;
  }
  if (message.t === "pause") {
    mode = "paused";
    pendingRemote.length = 0;
    remember();
    return;
  }
  if (message.t === "stop") {
    mode = "paused";
    return;
  }
  if (message.t === "save") {
    const bytes = saveState();
    if (!bytes) {
      post({ t: "error", message: "Não deu para gravar o save." });
      return;
    }
    const state = bytes.slice();
    const shot = await frameShot();
    if (shot) {
      const picture = shot.slice();
      post({ t: "saved", state: state.buffer, shot: picture.buffer }, [state.buffer, picture.buffer]);
    } else post({ t: "saved", state: state.buffer }, [state.buffer]);
    return;
  }
  if (message.t === "restore") {
    if (mode === "net") {
      post({ t: "error", message: "Durante a sala, o save local não entra no meio da partida." });
      return;
    }
    const state = new Uint8Array(message.state);
    if (!loadState(state)) {
      post({ t: "error", message: "Não deu para carregar o save." });
      return;
    }
    mode = "local";
    post({ t: "restored" });
    return;
  }
  if (message.t === "checkpoint") {
    mode = "paused";
    const bytes = saveState();
    if (!bytes) {
      const empty = new Uint8Array();
      post({ t: "checkpoint", frame: 0, state: empty.buffer }, [empty.buffer]);
      return;
    }
    checkpoint = bytes;
    checkpointFrame = lockstep?.simFrame ?? 0;
    const state = checkpoint.slice();
    post({ t: "checkpoint", frame: checkpointFrame, state: state.buffer }, [state.buffer]);
    return;
  }
  if (message.t === "reset") {
    if (!rom || !loadRom(rom)) {
      post({ t: "error", message: "Não deu para reiniciar o jogo." });
      return;
    }
    pendingRemote.length = 0;
    clearMacros();
    checkpoint = null;
    checkpointFrame = 0;
    const delay = message.delay ?? 0;
    if ((message.slot === 0 || message.slot === 1) && delay >= 1) beginNet(message.slot, delay, 0);
    else {
      lockstep = null;
      mode = "local";
    }
    run(0, 0);
    post({ t: "reset-done" });
    return;
  }
  if (message.t === "net-start") {
    beginNet(message.slot, message.delay, null);
    return;
  }
  if (message.t === "net-remote") {
    if (!lockstep) pendingRemote.push(...message.frames);
    else for (const frame of message.frames) lockstep.pushRemote(frame.frame, frame.buttons);
    return;
  }
  if (message.t === "net-resume") {
    clearMacros();
    const state = new Uint8Array(message.state);
    if (!loadState(state)) {
      post({ t: "error", message: "Não deu para retomar a partida." });
      return;
    }
    checkpoint = state;
    checkpointFrame = message.frame;
    beginNet(message.slot === 1 ? 1 : 0, message.delay, message.frame);
  }
};
