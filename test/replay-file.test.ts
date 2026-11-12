import assert from "node:assert/strict";
import test from "node:test";
import { decodeReplay, encodeReplay, readReplayHeader, replayFileName, type Replay } from "../apps/web/src/replay-file.ts";

const sha1 = "cd".repeat(20);

function sample(): Replay {
  const frames = 500;
  const pads = new Uint16Array(frames * 2);
  for (let i = 0; i < frames; i++) {
    pads[i * 2] = i & 0xffff;
    pads[i * 2 + 1] = (0xffff - i) & 0xffff;
  }
  return {
    header: { v: 1, gameId: "test-rom", title: "ROM de teste", sha1, fight: true, startedAt: 1_700_000_000_000, firstFrame: 42, frames },
    pads,
    segments: [
      { at: 0, state: Uint8Array.from([1, 2, 3, 4]) },
      { at: 300, state: new Uint8Array(70_000).fill(7) },
    ],
    hashes: Uint32Array.from([59, 0xdeadbeef, 119, 1, 479, 0xffffffff]),
  };
}

test("um replay gravado volta igual, com os trechos e os hashes", async () => {
  const original = sample();
  const back = await decodeReplay(await encodeReplay(original));
  assert.ok(back);
  assert.deepEqual(back.header, original.header);
  assert.deepEqual(back.pads, original.pads);
  assert.equal(back.segments.length, 2);
  assert.equal(back.segments[1].at, 300);
  assert.deepEqual(back.segments[0].state, original.segments[0].state);
  assert.deepEqual(back.segments[1].state, original.segments[1].state);
  assert.deepEqual(back.hashes, original.hashes);
});

test("a lista lê o cabeçalho sem abrir o corpo", async () => {
  const file = await encodeReplay(sample());
  const header = await readReplayHeader(file);
  assert.equal(header?.title, "ROM de teste");
  assert.equal(header?.frames, 500);
  assert.equal(header?.sha1, sha1);
  const cut = file.slice(0, 200);
  assert.equal((await readReplayHeader(cut))?.frames, 500);
  assert.equal(await decodeReplay(cut), null);
});

test("arquivo que não é replay é recusado", async () => {
  assert.equal(await readReplayHeader(new Blob(["qualquer coisa"])), null);
  assert.equal(await decodeReplay(new Blob([new Uint8Array(3)])), null);
  const replay = sample();
  replay.header.sha1 = "nada";
  assert.equal(await readReplayHeader(await encodeReplay(replay)), null);
});

test("o nome do arquivo tira acentos e leva a data", () => {
  const name = replayFileName("Pocky & Rocky 2: Ação", new Date(2026, 10, 12, 9, 5, 7).getTime());
  assert.equal(name, "pocky-rocky-2-acao-2026-11-12-090507.snesreplay");
});
