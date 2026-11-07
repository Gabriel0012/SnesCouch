import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildTestRom } from "../core/fixtures/test-rom.mjs";
import catalog from "../packages/catalog/games.json" with { type: "json" };
import createSnes from "../apps/web/src/generated/snes.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const wasmFile = path.join(root, "../apps/web/src/generated/snes.wasm");

async function openCore() {
  const core = await createSnes({
    locateFile: () => wasmFile,
    print: () => {},
    printErr: () => {},
  });
  return {
    load(rom) {
      const heap = new Uint8Array(core.wasmMemory.buffer);
      const ptr = core._malloc(rom.length);
      new Uint8Array(core.wasmMemory.buffer).set(rom, ptr);
      const ok = core._snes_load(ptr, rom.length);
      core._free(ptr);
      if (!ok) throw new Error("a ROM não carregou");
      void heap;
    },
    frame(p0, p1) {
      core._snes_set_input(0, p0 & 0xffff);
      core._snes_set_input(1, p1 & 0xffff);
      core._snes_run_frame();
      return core._snes_state_hash() >>> 0;
    },
    save() {
      const size = core._snes_state_size();
      const ptr = core._malloc(size);
      const wrote = core._snes_save_state(ptr, size);
      if (!wrote) throw new Error("save state falhou");
      const bytes = new Uint8Array(core.wasmMemory.buffer, ptr, wrote).slice();
      core._free(ptr);
      return bytes;
    },
    restore(bytes) {
      const ptr = core._malloc(bytes.length);
      new Uint8Array(core.wasmMemory.buffer).set(bytes, ptr);
      const ok = core._snes_load_state(ptr, bytes.length);
      core._free(ptr);
      if (!ok) throw new Error("load state falhou");
    },
  };
}

function script(frame) {
  const p0 = frame & 1 ? 0x0010 : 0x0020;
  const p1 = frame % 7 === 0 ? 0x0100 : 0x0000;
  return [p0, p1];
}

async function prove(rom, frames) {
  const left = await openCore();
  const right = await openCore();
  left.load(rom);
  right.load(rom);
  let snapshot = null;
  let snapshotAt = -1;
  const hashes = [];
  for (let frame = 0; frame < frames; frame++) {
    const [p0, p1] = script(frame);
    const a = left.frame(p0, p1);
    const b = right.frame(p0, p1);
    assert.equal(a, b, `hash divergiu no frame ${frame}`);
    hashes.push(a);
    if (frame === Math.floor(frames / 2)) {
      snapshot = left.save();
      snapshotAt = frame + 1;
    }
  }
  assert.ok(snapshot);
  const fresh = await openCore();
  fresh.load(rom);
  for (let frame = 0; frame < snapshotAt; frame++) {
    const [p0, p1] = script(frame);
    fresh.frame(p0, p1);
  }
  fresh.restore(snapshot);
  for (let frame = snapshotAt; frame < frames; frame++) {
    const [p0, p1] = script(frame);
    const replay = fresh.frame(p0, p1);
    assert.equal(replay, hashes[frame], `save state divergiu no frame ${frame}`);
  }
  const changed = await openCore();
  changed.load(rom);
  let diverged = false;
  for (let frame = 0; frame < Math.min(frames, 40); frame++) {
    const [p0, p1] = script(frame);
    const buttons = frame > 10 ? (p0 | 0x0080) : p0;
    const hash = changed.frame(buttons, p1);
    if (frame > 15 && hash !== hashes[frame]) diverged = true;
  }
  assert.equal(diverged, true, "um botão diferente não mudou o estado");
}

test("dois núcleos e um save state repetem o hash da ROM de teste", async () => {
  await prove(buildTestRom(), 120);
});

test("recarregar a ROM volta ao mesmo começo", async () => {
  const rom = buildTestRom();
  const again = await openCore();
  const fresh = await openCore();
  again.load(rom);
  fresh.load(rom);
  for (let frame = 0; frame < 40; frame++) again.frame(0x0080, 0);
  again.load(rom);
  for (let frame = 0; frame < 30; frame++) {
    const [p0, p1] = script(frame);
    assert.equal(again.frame(p0, p1), fresh.frame(p0, p1), `hash divergiu no frame ${frame} depois do reset`);
  }
});

test("núcleos que andaram sozinhos coincidem depois do estado do anfitrião", async () => {
  const rom = buildTestRom();
  const host = await openCore();
  const guest = await openCore();
  host.load(rom);
  guest.load(rom);
  for (let frame = 0; frame < 25; frame++) host.frame(0, 0);
  for (let frame = 0; frame < 70; frame++) guest.frame(0, 0);
  const drifted = host.frame(0, 0);
  assert.notEqual(drifted, guest.frame(0, 0));
  const state = host.save();
  host.restore(state);
  guest.restore(state);
  for (let frame = 0; frame < 60; frame++) {
    const [p0, p1] = script(frame);
    assert.equal(host.frame(p0, p1), guest.frame(p0, p1), `hash divergiu no frame ${frame} depois do alinhamento`);
  }
});

async function findOwnedRoms(dir) {
  const found = new Map();
  let names = [];
  try {
    names = await readdir(dir);
  } catch {
    return found;
  }
  for (const name of names) {
    if (!/\.(sfc|smc)$/i.test(name)) continue;
    const bytes = await readFile(path.join(dir, name));
    const candidates = [bytes];
    if (bytes.length > 512) candidates.push(bytes.subarray(512));
    for (const body of candidates) {
      const sha1 = createHash("sha1").update(body).digest("hex");
      const game = catalog.games.find((entry) => entry.sha1 === sha1 && entry.bytes === body.length);
      if (game) found.set(game.id, { game, rom: new Uint8Array(body) });
    }
  }
  return found;
}

test("os jogos do catálogo repetem o mesmo hash quando a ROM local existe", async (t) => {
  const dirs = [
    path.join(root, "../local-roms"),
    process.env.SNES_ROM_DIR,
  ].filter(Boolean);
  const owned = new Map();
  for (const dir of dirs) {
    for (const [id, value] of await findOwnedRoms(dir)) owned.set(id, value);
  }
  for (const id of catalog.games.map((game) => game.id)) {
    const hit = owned.get(id);
    if (!hit) {
      t.diagnostic(`${id}: ROM local ausente, o harness fica pronto e o núcleo já foi provado`);
      continue;
    }
    await t.test(hit.game.title, async () => {
      await prove(hit.rom, 90);
    });
  }
});
