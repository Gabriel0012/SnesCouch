import assert from "node:assert/strict";
import test from "node:test";
import { decodeSaveFile, encodeSaveFile } from "../apps/web/src/save-file.ts";

const sha1 = "ab".repeat(20);
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 200]);

test("um save baixado volta igual quando é importado", () => {
  const state = Uint8Array.from([0, 1, 127, 128, 255, 32]);
  const text = encodeSaveFile({ sha1, title: "Final Fight 3", savedAt: 1_700_000_000_000, state, shot: png });
  const back = decodeSaveFile(text);
  assert.ok(back);
  assert.equal(back.sha1, sha1);
  assert.equal(back.title, "Final Fight 3");
  assert.equal(back.savedAt, 1_700_000_000_000);
  assert.deepEqual(back.state, state);
  assert.deepEqual(back.shot, png);
});

test("save sem print continua sem print", () => {
  const text = encodeSaveFile({ sha1, title: "Jogo", savedAt: 10, state: Uint8Array.from([9]), shot: null });
  const back = decodeSaveFile(text);
  assert.equal(back?.shot, null);
  assert.deepEqual(back?.state, Uint8Array.from([9]));
});

test("arquivo que não é save deste emulador é recusado", () => {
  assert.equal(decodeSaveFile("{"), null);
  assert.equal(decodeSaveFile("{}"), null);
  assert.equal(decodeSaveFile(JSON.stringify({ format: "snes-couch-save", version: 2 })), null);
  const text = encodeSaveFile({ sha1, title: "Jogo", savedAt: 10, state: Uint8Array.from([1]), shot: null });
  const broken = JSON.parse(text) as { sha1: string };
  broken.sha1 = "não-é-sha1";
  assert.equal(decodeSaveFile(JSON.stringify(broken)), null);
});
