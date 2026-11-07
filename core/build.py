#!/usr/bin/env python3
"""Compile the libretro snes9x core and the couch wrapper to WebAssembly."""

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CORE = ROOT / "core" / "third_party" / "snes9x"
OBJ = ROOT / "core" / "build" / "obj"
OUT = ROOT / "apps" / "web" / "src" / "generated"

SOURCES_C = [
    "c4emu.c",
    "msu1.c",
    "zipfile.c",
    "srtc.c",
    "obc1.c",
    "bsflash.c",
    "tile.c",
    "bsx.c",
    "spc7110.c",
    "fxemu.c",
    "sdd1.c",
    "seta.c",
    "sa1hw.c",
    "dsp.c",
    "filter/snes_ntsc.c",
]
SOURCES_CXX = [
    "apu/apu.cpp",
    "apu/bapu/dsp/sdsp.cpp",
    "apu/bapu/smp/smp.cpp",
    "apu/bapu/smp/smp_state.cpp",
    "cheats2.cpp",
    "clip.cpp",
    "controls.cpp",
    "cpu.cpp",
    "cpuexec.cpp",
    "cpuops.cpp",
    "crosshairs.cpp",
    "dma.cpp",
    "gfx.cpp",
    "globals.cpp",
    "loadzip.cpp",
    "memmap.cpp",
    "ppu.cpp",
    "sa1.cpp",
    "sa1cpu.cpp",
    "snapshot.cpp",
    "sha256.cpp",
    "bml.cpp",
    "fscompat.cpp",
    "libretro/libretro.cpp",
]

INCLUDES = [
    CORE / "libretro",
    CORE / "libretro" / "libretro-common" / "include",
    CORE,
    CORE / "apu",
    CORE / "apu" / "bapu",
]

COMMON = [
    "-O2",
    "-fno-strict-aliasing",
    "-fomit-frame-pointer",
    "-D__LIBRETRO__",
    "-DALLOW_CPU_OVERCLOCK",
    "-DSTATIC_LINKING",
    "-DHAVE_STRINGS_H",
    '-DGIT_VERSION="couch"',
]


def run(cmd):
    print("+", " ".join(cmd[:6]), "..." if len(cmd) > 6 else "")
    subprocess.check_call(cmd)


def main():
    emcc = shutil.which("emcc")
    empp = shutil.which("em++")
    if not emcc or not empp:
        sys.exit("emcc not on PATH. source emsdk_env.sh first.")
    if not (CORE / "libretro" / "libretro.cpp").exists():
        sys.exit(f"missing snes9x at {CORE}")

    OBJ.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    includes = [f"-I{path}" for path in INCLUDES]
    objects = []

    for name in SOURCES_C:
        src = CORE / name
        obj = OBJ / (name.replace("/", "_") + ".o")
        objects.append(obj)
        if obj.exists() and obj.stat().st_mtime >= src.stat().st_mtime:
            continue
        run([emcc, "-c", str(src), "-o", str(obj), *COMMON, *includes])

    for name in SOURCES_CXX:
        src = CORE / name
        obj = OBJ / (name.replace("/", "_") + ".o")
        objects.append(obj)
        if obj.exists() and obj.stat().st_mtime >= src.stat().st_mtime:
            continue
        run([
            empp, "-c", str(src), "-o", str(obj),
            "-std=gnu++17", "-fno-exceptions", "-fno-rtti",
            *COMMON, *includes,
        ])

    wrapper = ROOT / "core" / "wrapper.cpp"
    wrapper_obj = OBJ / "wrapper.o"
    run([
        empp, "-c", str(wrapper), "-o", str(wrapper_obj),
        "-std=gnu++17", "-fno-exceptions", "-O2",
        f"-I{CORE / 'libretro'}",
    ])
    objects.append(wrapper_obj)

    exported = [
        "_malloc", "_free",
        "_snes_load", "_snes_set_input", "_snes_run_frame",
        "_snes_width", "_snes_height", "_snes_framebuffer", "_snes_frame_bytes",
        "_snes_audiobuffer", "_snes_audio_frames", "_snes_sample_rate",
        "_snes_state_size", "_snes_save_state", "_snes_load_state", "_snes_state_hash",
    ]
    js = OUT / "snes.js"
    run([
        empp, "-O2", *[str(obj) for obj in objects], "-o", str(js),
        "-sMODULARIZE=1",
        "-sEXPORT_ES6=1",
        "-sENVIRONMENT=web,worker,node",
        "-sALLOW_MEMORY_GROWTH=1",
        "-sINITIAL_MEMORY=67108864",
        "-sSTACK_SIZE=8388608",
        "-sNO_EXIT_RUNTIME=1",
        "-sEXPORTED_RUNTIME_METHODS=HEAPU8,HEAP16,wasmMemory",
        f"-sEXPORTED_FUNCTIONS={json.dumps(exported)}",
    ])
    print(f"wrote {js}")


if __name__ == "__main__":
    main()
