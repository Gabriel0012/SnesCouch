import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildTestRom } from "../core/fixtures/test-rom.mjs";

const rom = buildTestRom();
const entry = {
  id: "test-rom",
  title: "ROM de teste",
  region: "USA",
  sha1: createHash("sha1").update(rom).digest("hex"),
  bytes: rom.length,
  players: 2,
};
const target = fileURLToPath(new URL("../packages/catalog/test-game.json", import.meta.url));
await writeFile(target, `${JSON.stringify(entry, null, 2)}\n`);
console.log(`${target}: ${entry.sha1}`);
