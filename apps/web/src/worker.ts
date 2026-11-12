import createSnes from "./generated/snes.js";
import wasmUrl from "./generated/snes.wasm?url";
import { Lockstep, type Slot } from "../../../packages/net/lockstep.ts";
import {
  FIGHTER_RAM,
  HISTORY_RAM,
  LEFT,
  MOVE_BITS,
  RIGHT,
  historyBytes,
  quickMove,
  requestedMotion,
  specialSteps,
  superSteps,
  type Fighter,
} from "./supers.ts";

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
interface LoadMessage { t: "load"; rom: ArrayBuffer; canvas: OffscreenCanvas; sab: SharedArrayBuffer; net?: { slot: Slot; delay: number }; plain?: boolean; watch?: boolean; probe?: boolean; fight?: boolean }
interface NetStart { t: "net-start"; slot: Slot; delay: number }
interface NetRemote { t: "net-remote"; frames: { frame: number; buttons: number }[] }
interface NetResume { t: "net-resume"; slot: Slot; delay: number; frame: number; state: ArrayBuffer }
interface RestoreMessage { t: "restore"; state: ArrayBuffer }
interface ResetMessage { t: "reset"; slot?: Slot; delay?: number }
interface Simple {
  t: "local" | "pause" | "checkpoint" | "stop" | "save" | "net-arm" | "watch-start" | "watch-stop" | "watch-snapshot" | "watch-mode" | "probe"
    | "rec-start" | "rec-stop" | "replay-play" | "replay-pause" | "replay-step" | "replay-exit";
}
interface ReplayLoad {
  t: "replay-load";
  pads: ArrayBuffer;
  segments: { at: number; state: ArrayBuffer }[];
  hashes: ArrayBuffer;
  firstFrame: number;
  fight: boolean;
}
interface ReplaySeek { t: "replay-seek"; pos: number }
interface ReplaySpeed { t: "replay-speed"; speed: number }
interface SuperMessage { t: "super"; port: 0 | 1; steps: number[] }
interface SpecialMessage { t: "special"; port: 0 | 1; held: number; steps: number[] }
interface WatchLoad { t: "watch-load"; frame: number; state: ArrayBuffer }
interface WatchFrames { t: "watch-frames"; frames: number[] }

type Incoming = LoadMessage | NetStart | NetRemote | NetResume | RestoreMessage | ResetMessage | Simple | SuperMessage | SpecialMessage | WatchLoad | WatchFrames
  | ReplayLoad | ReplaySeek | ReplaySpeed;

let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let pads: Uint16Array | null = null;
let mode: "local" | "net" | "paused" | "watch" | "replay" = "paused";
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
let fight = false;
const probeRing: [number, number][] = [];
const WATCH_PRIME = 8;
const WATCH_BEHIND = 30;
const pendingRemote: { frame: number; buttons: number }[] = [];
let recording = false;
let recPads: number[] = [];
let recHashes: number[] = [];
let recAt = 0;
let recSentAt = 0;
const REC_HASH_EVERY = 60;
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

/** One emulated frame with nothing shown: seeking and indexing a replay. */
function quiet(p0: number, p1: number) {
  if (!core) return;
  if (fight) applyMoves(p0, p1);
  core._snes_set_input(0, p0 & ~MOVE_BITS);
  core._snes_set_input(1, p1 & ~MOVE_BITS);
  core._snes_run_frame();
}

function run(p0: number, p1: number, sound = true) {
  if (!core) return;
  quiet(p0, p1);
  paint();
  if (sound) emitAudio();
  fpsFrames += 1;
  if (watching) watchOut.push(frameNo, p0 & 0xffff, p1 & 0xffff);
  if (recording) {
    recPads.push(p0 & 0xffff, p1 & 0xffff);
    if (recAt % REC_HASH_EVERY === REC_HASH_EVERY - 1) recHashes.push(recAt, core._snes_state_hash() >>> 0);
    recAt += 1;
  }
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

function flushRec(now: number, force = false) {
  if (!recording || recPads.length === 0) return;
  if (!force && recPads.length < 120 && now - recSentAt < 250) return;
  post({ t: "rec-frames", pads: recPads, hashes: recHashes });
  recPads = [];
  recHashes = [];
  recSentAt = now;
}

/** The state changed outside the button stream: the frames so far close the old segment and a new one starts here. */
function recBoundary() {
  if (!recording) return;
  flushRec(performance.now(), true);
  const state = saveState();
  if (!state) return;
  post({ t: "rec-state", at: recAt, frame: frameNo, fight, state: state.buffer }, [state.buffer]);
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

interface ReplayData {
  pads: Uint16Array;
  segments: Map<number, Uint8Array>;
  segmentAts: number[];
  hashes: Map<number, number>;
  total: number;
  firstFrame: number;
}

let replay: ReplayData | null = null;
/** Frames already shown: the picture is frame `replayPos - 1`. */
let replayPos = 0;
let replayPlaying = false;
let replaySpeed = 1;
let replayCredit = 0;
let replayBusy = false;
let replaySeekToken = 0;
let replayPendingSeek = -1;
let replayPostAt = 0;
let replayPosted = "";
let replayDesync = false;
let replayFightBefore = false;
let replayFrameBefore = 0;
let keyStep = 180;
/** Compressed states, each taken before the frame of its key runs. */
const keyframes = new Map<number, Promise<Blob>>();
let keyAts: number[] = [];
let indexAt = 0;
let indexState: Uint8Array | null = null;
const REPLAY_SPEEDS = new Set([0.25, 0.5, 1, 2, 4, 8]);

function pack(bytes: Uint8Array): Promise<Blob> {
  return new Response(new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream("gzip"))).blob();
}

async function unpack(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await new Response(blob.stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
}

function checkReplayHash(at: number) {
  if (!replay || replayDesync || !core) return;
  const want = replay.hashes.get(at);
  if (want === undefined || want === core._snes_state_hash() >>> 0) return;
  replayDesync = true;
  post({ t: "replay-desync", at });
}

/** `fresh` means the state for `at` was just loaded, so its segment is already in place. */
function replayFrame(at: number, show: boolean, fresh: boolean, sound = false) {
  if (!replay) return;
  const segment = fresh ? undefined : replay.segments.get(at);
  if (segment) loadState(segment, true);
  const p0 = replay.pads[at * 2];
  const p1 = replay.pads[at * 2 + 1];
  if (show) {
    frameNo = replay.firstFrame + at;
    run(p0, p1, sound);
  } else quiet(p0, p1);
  checkReplayHash(at);
}

function nearestKey(at: number): number {
  if (!replay) return 0;
  let best = 0;
  for (const key of replay.segmentAts) if (key <= at && key > best) best = key;
  for (const key of keyAts) if (key <= at && key > best) best = key;
  return best;
}

async function keyState(at: number): Promise<Uint8Array | null> {
  if (!replay) return null;
  const segment = replay.segments.get(at);
  if (segment) return segment;
  const packed = keyframes.get(at);
  return packed ? unpack(await packed) : null;
}

function postReplay(force = false) {
  if (!replay) return;
  const now = performance.now();
  if (!force && now - replayPostAt < 100) return;
  const busy = replayBusy || replayPendingSeek >= 0;
  const key = `${replayPos}|${indexAt}|${replayPlaying}|${busy}`;
  if (!force && key === replayPosted) return;
  replayPostAt = now;
  replayPosted = key;
  post({ t: "replay-pos", pos: replayPos, total: replay.total, indexed: indexAt, playing: replayPlaying, busy });
}

async function seekReplay(target: number) {
  if (!replay) return;
  const goal = Math.max(1, Math.min(replay.total, Math.round(target)));
  const last = goal - 1;
  const token = ++replaySeekToken;
  const key = nearestKey(last);
  if (last - key > keyStep && indexAt < last) {
    replayPendingSeek = goal;
    postReplay(true);
    return;
  }
  replayPendingSeek = -1;
  replayBusy = true;
  const state = await keyState(key);
  if (token !== replaySeekToken || !replay) return;
  if (!state || !loadState(state, true)) {
    replayBusy = false;
    post({ t: "error", message: "Não deu para voltar a esse ponto do replay." });
    return;
  }
  for (let at = key; at < last; at++) replayFrame(at, false, at === key);
  replayFrame(last, true, last === key);
  replayPos = goal;
  replayCredit = 0;
  replayBusy = false;
  postReplay(true);
}

/** Runs ahead on its own copy of the state and leaves a keyframe every `keyStep` frames. */
function indexReplay(budgetMs: number) {
  if (!replay || !indexState || indexAt >= replay.total || replayBusy) return;
  const current = saveState();
  if (!loadState(indexState, true)) return;
  const until = performance.now() + budgetMs;
  while (indexAt < replay.total && performance.now() < until) {
    if (indexAt > 0 && indexAt % keyStep === 0 && !replay.segments.has(indexAt) && !keyframes.has(indexAt)) {
      const state = saveState();
      if (state) {
        keyframes.set(indexAt, pack(state));
        keyAts.push(indexAt);
      }
    }
    replayFrame(indexAt, false, false);
    indexAt += 1;
  }
  indexState = saveState();
  if (current) loadState(current, true);
  if (replayPendingSeek >= 0 && (indexAt >= replayPendingSeek - 1 || indexAt >= replay.total)) {
    const goal = replayPendingSeek;
    replayPendingSeek = -1;
    void seekReplay(goal);
  }
}

function replayTick() {
  if (!replay || !replayPlaying || replayBusy || replayPendingSeek >= 0) return;
  replayCredit += replaySpeed;
  let steps = Math.floor(replayCredit);
  replayCredit -= steps;
  while (steps > 0 && replayPos < replay.total) {
    replayFrame(replayPos, steps === 1, false, replaySpeed === 1);
    replayPos += 1;
    steps -= 1;
  }
  if (replayPos >= replay.total) {
    replayPlaying = false;
    replayCredit = 0;
    postReplay(true);
  }
}

function startReplay(message: ReplayLoad) {
  recording = false;
  clearMacros();
  lockstep = null;
  pendingRemote.length = 0;
  watchQueue.clear();
  const pads = new Uint16Array(message.pads);
  const total = pads.length >> 1;
  const segments = new Map<number, Uint8Array>();
  for (const segment of message.segments) segments.set(segment.at, new Uint8Array(segment.state));
  const flat = new Uint32Array(message.hashes);
  const hashes = new Map<number, number>();
  for (let i = 0; i + 1 < flat.length; i += 2) hashes.set(flat[i], flat[i + 1]);
  if (total < 1 || !segments.has(0)) {
    post({ t: "error", message: "Esse replay está vazio." });
    return;
  }
  if (mode !== "replay") {
    replayFightBefore = fight;
    replayFrameBefore = frameNo;
  }
  fight = message.fight;
  replay = { pads, segments, segmentAts: [...segments.keys()].sort((a, b) => a - b), hashes, total, firstFrame: message.firstFrame };
  keyStep = Math.max(180, Math.ceil(total / 600));
  keyframes.clear();
  keyAts = [];
  indexAt = 0;
  indexState = segments.get(0)!;
  replayPos = 0;
  replaySpeed = 1;
  replayCredit = 0;
  replayBusy = false;
  replayPendingSeek = -1;
  replayDesync = false;
  probeRing.length = 0;
  mode = "replay";
  replayPlaying = true;
  void seekReplay(1);
}

function endReplay() {
  replaySeekToken += 1;
  replay = null;
  replayPlaying = false;
  replayBusy = false;
  replayPendingSeek = -1;
  keyframes.clear();
  keyAts = [];
  indexState = null;
  fight = replayFightBefore;
  frameNo = replayFrameBefore;
  clearMacros();
  mode = "paused";
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

/** Online, the local pad and its macro are always port 0, but the fighter in RAM is the player's real slot. */
function readFighterByte(macroPort: 0 | 1): number | null {
  const port = mode === "net" && lockstep ? lockstep.localSlot : macroPort;
  const state = saveState();
  if (!state) return null;
  const ram = blockStart(state, "RAM", 0x20000);
  if (ram < 0) return null;
  return state[ram + FIGHTER_RAM[port]];
}

/**
 * Runs on every emulator with the same pads, so the write is identical
 * everywhere: the requested motion goes into that player's pad history and
 * the game reads the press on this frame as the full command.
 */
function applyMoves(p0: number, p1: number) {
  if (((p0 | p1) & MOVE_BITS) === 0) return;
  const state = saveState();
  if (!state) return;
  const ram = blockStart(state, "RAM", 0x20000);
  if (ram < 0) return;
  let wrote = false;
  for (const port of [0, 1] as const) {
    const fighter = fighterByte(state[ram + FIGHTER_RAM[port]]);
    const motion = fighter ? requestedMotion(port === 0 ? p0 : p1, fighter) : null;
    if (!motion) continue;
    state.set(historyBytes(motion), ram + HISTORY_RAM[port]);
    wrote = true;
  }
  if (wrote) loadState(state, true);
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
  if (ok === 1) recBoundary();
  return ok === 1;
}

/** `inPlace` edits the running game; spectators repeat the same edit, so they need no new snapshot. */
function loadState(bytes: Uint8Array, inPlace = false) {
  if (!core) return false;
  const ptr = core._malloc(bytes.length);
  heap().set(bytes, ptr);
  const ok = core._snes_load_state(ptr, bytes.length);
  core._free(ptr);
  if (ok === 1 && watching && !inPlace) watchDirty = true;
  if (ok === 1 && !inPlace) recBoundary();
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
  if (mode === "replay") {
    replayTick();
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
  if (mode === "replay") {
    indexReplay(replayPendingSeek >= 0 ? 14 : replayPlaying ? 4 : 10);
    postReplay();
  }
  flushWatch(now);
  flushRec(now);
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
    fight = message.fight === true;
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
  if (message.t === "super" || message.t === "special") {
    const port = message.port === 1 ? 1 : 0;
    const incoming = Array.isArray(message.steps) ? message.steps : [];
    const fighter = fighterByte(readFighterByte(port) ?? -1);
    if (!fighter) {
      playMacro(port, incoming);
      return;
    }
    const forward = incoming.some((step) => (Number(step) & LEFT) !== 0) ? LEFT : RIGHT;
    const held = message.t === "special" ? Number(message.held) & 0xffff : 0;
    const quick = fight ? quickMove(message.t, fighter, forward, held) : null;
    playMacro(port, quick ?? (message.t === "super" ? superSteps(fighter, forward) : specialSteps(fighter, forward, held)));
    return;
  }
  if (message.t === "rec-start") {
    recording = true;
    recPads = [];
    recHashes = [];
    recAt = 0;
    recSentAt = performance.now();
    recBoundary();
    return;
  }
  if (message.t === "rec-stop") {
    flushRec(performance.now(), true);
    recording = false;
    post({ t: "rec-done", frames: recAt });
    return;
  }
  if (message.t === "replay-load") {
    startReplay(message);
    return;
  }
  if (message.t === "replay-exit") {
    endReplay();
    return;
  }
  if (mode === "replay" && replay) {
    if (message.t === "replay-play") {
      if (replayPos >= replay.total) void seekReplay(1);
      replayPlaying = true;
      replayCredit = 0;
      postReplay(true);
      return;
    }
    if (message.t === "replay-pause") {
      replayPlaying = false;
      postReplay(true);
      return;
    }
    if (message.t === "replay-step") {
      replayPlaying = false;
      if (!replayBusy && replayPendingSeek < 0 && replayPos < replay.total) {
        replayFrame(replayPos, true, false);
        replayPos += 1;
      }
      postReplay(true);
      return;
    }
    if (message.t === "replay-seek") {
      void seekReplay(Number(message.pos));
      return;
    }
    if (message.t === "replay-speed") {
      if (REPLAY_SPEEDS.has(message.speed)) replaySpeed = message.speed;
      replayCredit = 0;
      return;
    }
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
