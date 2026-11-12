import { matchRom, type Game } from "./rom.ts";
import { readHandle, writeHandle } from "./store.ts";

type Permission = "granted" | "denied" | "prompt";

export interface RomFolder extends FileSystemDirectoryHandle {
  queryPermission?(options: { mode: "read" }): Promise<Permission>;
  requestPermission?(options: { mode: "read" }): Promise<Permission>;
  values(): AsyncIterableIterator<FileSystemDirectoryHandle | FileSystemFileHandle>;
}

type Picker = (options: { id?: string; mode?: "read" }) => Promise<RomFolder>;

const KEY = "rom-folder";
let cached: RomFolder | null | undefined;

function picker(): Picker | null {
  const pick = (window as unknown as { showDirectoryPicker?: Picker }).showDirectoryPicker;
  return typeof pick === "function" ? pick.bind(window) : null;
}

export function canPickRomFolder(): boolean {
  return picker() !== null;
}

export async function romFolder(): Promise<RomFolder | null> {
  if (cached === undefined) {
    try {
      cached = await readHandle<RomFolder>(KEY);
    } catch {
      cached = null;
    }
  }
  return cached;
}

/** Call from the folder button click so the browser can grant read permission. */
export async function chooseRomFolder(): Promise<RomFolder | null> {
  const pick = picker();
  if (!pick) return null;
  try {
    const handle = await pick({ id: "snes-couch-roms", mode: "read" });
    if (handle.requestPermission && (await handle.requestPermission({ mode: "read" })) !== "granted") return null;
    cached = handle;
    try {
      await writeHandle(KEY, handle);
    } catch {
      /* The folder remains usable until this page closes. */
    }
    return handle;
  } catch {
    return null;
  }
}

async function permission(handle: RomFolder): Promise<boolean> {
  try {
    return !handle.queryPermission || (await handle.queryPermission({ mode: "read" })) === "granted";
  } catch {
    return false;
  }
}

async function findInDirectory(folder: RomFolder, game: Game): Promise<Uint8Array | null> {
  for await (const entry of folder.values()) {
    try {
      if (entry.kind === "directory") {
        const found = await findInDirectory(entry as RomFolder, game);
        if (found) return found;
        continue;
      }
      const file = await (entry as FileSystemFileHandle).getFile();
      if (file.size !== game.bytes && file.size !== game.bytes + 512) continue;
      const match = await matchRom(new Uint8Array(await file.arrayBuffer()));
      if (match?.game.id === game.id) return match.rom;
    } catch {
      /* Ignore unreadable files and folders; another entry may still match. */
    }
  }
  return null;
}

export async function findRomInFolder(game: Game): Promise<Uint8Array | null> {
  const folder = await romFolder();
  if (!folder || !(await permission(folder))) return null;
  try {
    return await findInDirectory(folder, game);
  } catch {
    return null;
  }
}
