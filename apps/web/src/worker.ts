import createSnes from "./generated/snes.js";
import wasmUrl from "./generated/snes.wasm?url";
import { Lockstep, type Slot } from "../../../packages/net/lockstep.ts";

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
interface LoadMessage { t: "load"; rom: ArrayBuffer; canvas: OffscreenCanvas; sab: SharedArrayBuffer }
interface NetStart { t: "net-start"; slot: Slot; delay: number }
interface NetRemote { t: "net-remote"; frames: { frame: number; buttons: number }[] }
interface NetResume { t: "net-resume"; slot: Slot; delay: number; frame: number; state: ArrayBuffer }
interface RestoreMessage { t: "restore"; state: ArrayBuffer }
interface ResetMessage { t: "reset"; slot?: Slot; delay?: number }
interface Simple { t: "local" | "pause" | "checkpoint" | "stop" | "save" | "net-arm" }
interface SuperMessage { t: "super"; port: 0 | 1; steps: number[] }

type Incoming = LoadMessage | NetStart | NetRemote | NetResume | RestoreMessage | ResetMessage | Simple | SuperMessage;

let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let pads: Uint16Array | null = null;
let mode: "local" | "net" | "paused" = "paused";
let lockstep: Lockstep | null = null;
let checkpoint: Uint8Array | null = null;
let checkpointFrame = 0;
let rom: Uint8Array | null = null;
let timer = 0;
const pendingRemote: { frame: number; buttons: number }[] = [];
const macro: [number[] | null, number[] | null] = [null, null];
const macroAt = [0, 0];
let seenFrames = 0;

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

function commitMacro(port: 0 | 1) {
  const steps = macro[port];
  if (!steps) return;
  macroAt[port] += 1;
  if (macroAt[port] >= steps.length) {
    macro[port] = null;
    macroAt[port] = 0;
  }
}

function findHeads(pixels: Uint8ClampedArray, w: number, h: number): { x: number; y: number }[] {
  const y0 = Math.floor(h * 0.4);
  const y1 = Math.floor(h * 0.94);
  const minH = Math.floor(h * 0.16);
  const maxH = Math.floor(h * 0.48);
  const columns: { x: number; y: number; s: number }[] = [];
  for (let x = 2; x < w; x += 2) {
    let runTop = -1;
    let runBottom = -1;
    let gap = 0;
    let bestTop = -1;
    let bestScore = 0;
    const close = (bottom: number) => {
      if (runTop < 0) return;
      const height = bottom - runTop;
      if (height < minH || height > maxH) return;
      const score = height + bottom;
      if (score > bestScore) {
        bestScore = score;
        bestTop = runTop;
      }
    };
    for (let y = y0; y < y1; y += 2) {
      const i = (y * w + x) * 4;
      const prev = (y * w + Math.max(0, x - 2)) * 4;
      const diff = Math.abs(pixels[i] - pixels[prev]) + Math.abs(pixels[i + 1] - pixels[prev + 1]) + Math.abs(pixels[i + 2] - pixels[prev + 2]);
      if (diff >= 72) {
        if (runTop < 0) runTop = y;
        runBottom = y;
        gap = 0;
      } else if (runTop >= 0) {
        gap += 2;
        if (gap > 8) {
          close(runBottom);
          runTop = -1;
          gap = 0;
        }
      }
    }
    close(runBottom);
    if (bestTop >= 0) columns.push({ x: x / w, y: bestTop / h, s: bestScore });
  }
  const peaks: { x: number; y: number; s: number }[] = [];
  for (let x = 0; x < columns.length; ) {
    const start = columns[x].x;
    let best = columns[x];
    let count = 0;
    while (x < columns.length && columns[x].x - start < 0.1) {
      count += 1;
      if (columns[x].s > best.s) best = columns[x];
      x += 1;
    }
    if (count >= 3) peaks.push(best);
  }
  peaks.sort((a, b) => b.s - a.s);
  const kept: { x: number; y: number }[] = [];
  for (const peak of peaks) {
    if (kept.some((spot) => Math.abs(spot.x - peak.x) < 0.12)) continue;
    kept.push({ x: peak.x, y: peak.y });
    if (kept.length === 2) break;
  }
  return kept;
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
  const pixels = new Uint8ClampedArray(heap().buffer, ptr, bytes);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    post({ t: "aspect", w: width, h: height });
  }
  seenFrames += 1;
  if (seenFrames % 8 === 0) {
    const spots = findHeads(pixels, width, height);
    if (spots.length) post({ t: "places", spots });
  }
  ctx.putImageData(new ImageData(pixels.slice(), width, height), 0, 0);
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
  return ok === 1;
}

function loadState(bytes: Uint8Array) {
  if (!core) return false;
  const ptr = core._malloc(bytes.length);
  heap().set(bytes, ptr);
  const ok = core._snes_load_state(ptr, bytes.length);
  core._free(ptr);
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

function tick() {
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

function loop() {
  tick();
  timer = self.setTimeout(loop, 1000 / 60) as unknown as number;
}

self.onmessage = async (event: MessageEvent<Incoming>) => {
  const message = event.data;
  if (message.t === "load") {
    canvas = message.canvas;
    ctx = canvas.getContext("2d", { alpha: false });
    pads = new Uint16Array(message.sab);
    core = await createSnes({ locateFile: (file: string) => (file.endsWith(".wasm") ? wasmUrl : file) }) as Core;
    rom = new Uint8Array(message.rom);
    const ok = loadRom(rom);
    if (!ok) {
      post({ t: "error", message: "O núcleo não aceitou essa ROM." });
      return;
    }
    mode = "local";
    clearMacros();
    if (!timer) loop();
    post({ t: "loaded", rate: core._snes_sample_rate() });
    return;
  }
  if (message.t === "local") {
    mode = "local";
    lockstep = null;
    pendingRemote.length = 0;
    clearMacros();
    return;
  }
  if (message.t === "super") {
    const port = message.port === 1 ? 1 : 0;
    if (!Array.isArray(message.steps) || message.steps.length === 0 || message.steps.length > 90) return;
    macro[port] = message.steps.map((step) => Number(step) & 0xffff);
    macroAt[port] = 0;
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
    post({ t: "saved", state: state.buffer }, [state.buffer]);
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
