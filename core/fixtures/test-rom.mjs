/**
 * Homebrew LoROM used only to prove the core is deterministic.
 * It is not a Nintendo game. Each frame it stores both controllers and
 * increments a counter in RAM, which the savestate hash has to follow.
 */
export function buildTestRom() {
  const rom = new Uint8Array(0x20000);
  let pc = 0x8000;
  const labels = new Map();
  const fixups = [];

  function emit(...bytes) {
    for (const byte of bytes) {
      if (pc < 0x8000 || pc >= 0x8000 + 0x8000) throw new Error("código passou do primeiro banco");
      rom[pc - 0x8000] = byte & 0xff;
      pc += 1;
    }
  }

  function mark(name) {
    labels.set(name, pc);
  }

  function branch(opcode, name) {
    emit(opcode, 0);
    fixups.push({ at: pc - 1, name });
  }

  emit(0x78, 0x18, 0xfb);
  emit(0xc2, 0x30);
  emit(0xa9, 0xff, 0x01);
  emit(0x1b);
  emit(0xa9, 0x00, 0x00);
  emit(0x5b);
  emit(0xe2, 0x20);
  emit(0xa9, 0x01);
  emit(0x8d, 0x00, 0x42);
  emit(0xc2, 0x30);

  mark("loop");
  emit(0xe2, 0x20);
  mark("waitVb");
  emit(0xad, 0x12, 0x42, 0x29, 0x80);
  branch(0xf0, "waitVb");
  mark("waitJoy");
  emit(0xad, 0x12, 0x42, 0x29, 0x01);
  branch(0xd0, "waitJoy");
  emit(0xc2, 0x30);
  emit(0xad, 0x18, 0x42, 0x85, 0x00);
  emit(0xad, 0x1a, 0x42, 0x85, 0x02);
  emit(0xe6, 0x04);
  branch(0x80, "loop");

  for (const fix of fixups) {
    const target = labels.get(fix.name);
    const relative = target - (fix.at + 1);
    if (relative < -128 || relative > 127) throw new Error(`salto ${fix.name} = ${relative}`);
    rom[fix.at - 0x8000] = relative & 0xff;
  }

  const title = "COUCH TEST ROM".padEnd(21, " ");
  for (let i = 0; i < title.length; i++) rom[0x7fc0 + i] = title.charCodeAt(i);
  rom[0x7fd5] = 0x20;
  rom[0x7fd6] = 0x00;
  rom[0x7fd7] = 0x07;
  rom[0x7fd8] = 0x00;
  rom[0x7fd9] = 0x01;
  rom[0x7fdc] = 0xcb;
  rom[0x7fdd] = 0xed;
  rom[0x7fde] = 0x34;
  rom[0x7fdf] = 0x12;
  rom[0x7ffc] = 0x00;
  rom[0x7ffd] = 0x80;
  return rom;
}
