import assert from "node:assert/strict";
import test from "node:test";
import { StateAssembler, decodeInputs, decodeStateChunk, encodeInputs, encodeStateChunks } from "./codec.ts";

test("janela de botões sobrevive ida e volta", () => {
  const encoded = encodeInputs([
    { frame: 4, buttons: 0x0100 },
    { frame: 5, buttons: 0x00f0 },
  ]);
  assert.deepEqual(decodeInputs(encoded), [
    { frame: 4, buttons: 0x0100 },
    { frame: 5, buttons: 0x00f0 },
  ]);
});

test("estado grande junta os pedaços na ordem certa", () => {
  const bytes = new Uint8Array(25000);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i & 0xff;
  const parts = encodeStateChunks(12, 3, 0xabcde, bytes, 8000);
  assert.ok(parts.length > 1);
  const assembler = new StateAssembler();
  let done = null;
  for (const part of parts) {
    const chunk = decodeStateChunk(part);
    assert.ok(chunk);
    done = assembler.push(chunk);
  }
  assert.ok(done);
  assert.equal(done.frame, 12);
  assert.equal(done.delay, 3);
  assert.equal(done.hash, 0xabcde);
  assert.deepEqual(done.bytes, bytes);
});
