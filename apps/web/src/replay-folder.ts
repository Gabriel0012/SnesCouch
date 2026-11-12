import { readReplayHeader, REPLAY_EXTENSION, type ReplayHeader } from "./replay-file.ts";
import { readHandle, writeHandle } from "./store.ts";

type Permission = "granted" | "denied" | "prompt";

export interface ReplayFolder extends FileSystemDirectoryHandle {
  queryPermission?(options: { mode: "readwrite" }): Promise<Permission>;
  requestPermission?(options: { mode: "readwrite" }): Promise<Permission>;
  values(): AsyncIterableIterator<FileSystemDirectoryHandle | FileSystemFileHandle>;
}

type Picker = (options: { id?: string; mode?: "readwrite" }) => Promise<ReplayFolder>;

export interface ReplayEntry {
  name: string;
  header: ReplayHeader;
  size: number;
}

const KEY = "replay-folder";
let cached: ReplayFolder | null | undefined;

function picker(): Picker | null {
  const pick = (window as unknown as { showDirectoryPicker?: Picker }).showDirectoryPicker;
  return typeof pick === "function" ? pick.bind(window) : null;
}

export function canPickFolder(): boolean {
  return picker() !== null;
}

export async function replayFolder(): Promise<ReplayFolder | null> {
  if (cached === undefined) {
    try {
      cached = await readHandle<ReplayFolder>(KEY);
    } catch {
      cached = null;
    }
  }
  return cached;
}

/** Null quando a pessoa fecha o seletor sem escolher. */
export async function chooseFolder(): Promise<ReplayFolder | null> {
  const pick = picker();
  if (!pick) return null;
  let handle: ReplayFolder;
  try {
    handle = await pick({ id: "snes-couch-replays", mode: "readwrite" });
  } catch {
    return null;
  }
  cached = handle;
  try {
    await writeHandle(KEY, handle);
  } catch {
    /* a pasta vale só nesta visita */
  }
  return handle;
}

/** O navegador só abre o pedido de permissão dentro de um clique. */
export async function ensurePermission(handle: ReplayFolder): Promise<boolean> {
  if (!handle.queryPermission) return true;
  try {
    if ((await handle.queryPermission({ mode: "readwrite" })) === "granted") return true;
    if (!handle.requestPermission) return false;
    return (await handle.requestPermission({ mode: "readwrite" })) === "granted";
  } catch {
    return false;
  }
}

export async function writeReplay(handle: ReplayFolder, name: string, file: Blob) {
  const target = await handle.getFileHandle(name, { create: true });
  const writable = await target.createWritable();
  await writable.write(file);
  await writable.close();
}

/** Same name with -2, -3… when the folder already has a file called that. */
export async function freeName(handle: ReplayFolder, name: string): Promise<string> {
  const dot = name.toLowerCase().endsWith(REPLAY_EXTENSION) ? name.length - REPLAY_EXTENSION.length : name.length;
  const stem = name.slice(0, dot);
  const extension = name.slice(dot) || REPLAY_EXTENSION;
  for (let copy = 1; copy < 1000; copy++) {
    const candidate = copy === 1 ? `${stem}${extension}` : `${stem}-${copy}${extension}`;
    try {
      await handle.getFileHandle(candidate);
    } catch {
      return candidate;
    }
  }
  throw new Error("Pasta cheia de replays com esse nome.");
}

export async function listReplays(handle: ReplayFolder, sha1: string): Promise<ReplayEntry[]> {
  const found: ReplayEntry[] = [];
  for await (const entry of handle.values()) {
    if (entry.kind !== "file" || !entry.name.toLowerCase().endsWith(REPLAY_EXTENSION)) continue;
    try {
      const file = await (entry as FileSystemFileHandle).getFile();
      const header = await readReplayHeader(file);
      if (header && header.sha1 === sha1) found.push({ name: entry.name, header, size: file.size });
    } catch {
      /* arquivo que sumiu ou não abre fica fora da lista */
    }
  }
  return found.sort((a, b) => b.header.startedAt - a.header.startedAt || b.name.localeCompare(a.name));
}

export async function readReplay(handle: ReplayFolder, name: string): Promise<File> {
  return (await handle.getFileHandle(name)).getFile();
}

export async function deleteReplay(handle: ReplayFolder, name: string) {
  await handle.removeEntry(name);
}
