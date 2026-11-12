import initSqlJs, { type Database } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";

export interface RomRecord {
  sha1: string;
  bytes: Uint8Array;
}

export interface LibraryRecord {
  id: string;
  title: string;
  sha1: string;
  savedAt: number;
  cover: Uint8Array | null;
  coverType: string | null;
}

export type SaveOrigin = "local" | "online";

export interface SaveSlot {
  slot: number;
  savedAt: number;
  origin: SaveOrigin;
  shot: Uint8Array | null;
}

const SLOTS = [1, 2, 3];

let opening: Promise<Database> | null = null;
let chain: Promise<unknown> = Promise.resolve();

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = chain.then(job, job);
  chain = run.then(() => undefined, () => undefined);
  return run;
}

function asBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (Array.isArray(value) && value.every((item) => typeof item === "number")) return Uint8Array.from(value);
  return null;
}

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("snes-couch", 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("sqlite")) request.result.createObjectStore("sqlite");
      if (!request.result.objectStoreNames.contains("handles")) request.result.createObjectStore("handles");
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}

async function readFile(): Promise<Uint8Array | null> {
  const database = await idb();
  return new Promise((resolve, reject) => {
    const request = database.transaction("sqlite", "readonly").objectStore("sqlite").get("db");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const value = request.result;
      resolve(value instanceof Uint8Array ? new Uint8Array(value) : value instanceof ArrayBuffer ? new Uint8Array(value) : null);
    };
  });
}

async function writeFile(bytes: Uint8Array) {
  const database = await idb();
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction("sqlite", "readwrite").objectStore("sqlite").put(bytes, "db");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/** Handles de arquivo do navegador não cabem no sql.js; ficam numa store própria do IndexedDB. */
export async function readHandle<T>(key: string): Promise<T | null> {
  const database = await idb();
  return new Promise((resolve, reject) => {
    const request = database.transaction("handles", "readonly").objectStore("handles").get(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
  });
}

export async function writeHandle(key: string, value: unknown) {
  const database = await idb();
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction("handles", "readwrite").objectStore("handles").put(value, key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

async function open(): Promise<Database> {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const saved = await readFile();
  const db = saved ? new SQL.Database(saved) : new SQL.Database();
  db.run(`
    CREATE TABLE IF NOT EXISTS roms (
      game_id TEXT PRIMARY KEY,
      sha1 TEXT NOT NULL,
      bytes BLOB NOT NULL,
      saved_at INTEGER NOT NULL,
      title TEXT,
      cover BLOB,
      cover_type TEXT
    );
    CREATE TABLE IF NOT EXISTS saves (
      game_id TEXT NOT NULL,
      slot INTEGER NOT NULL,
      state BLOB NOT NULL,
      saved_at INTEGER NOT NULL,
      PRIMARY KEY (game_id, slot)
    );
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  const saves = columnNames(db, "saves");
  if (!saves.has("shot")) db.run("ALTER TABLE saves ADD COLUMN shot BLOB");
  if (!saves.has("origin")) db.run("ALTER TABLE saves ADD COLUMN origin TEXT");
  const roms = columnNames(db, "roms");
  if (!roms.has("title")) db.run("ALTER TABLE roms ADD COLUMN title TEXT");
  if (!roms.has("cover")) db.run("ALTER TABLE roms ADD COLUMN cover BLOB");
  if (!roms.has("cover_type")) db.run("ALTER TABLE roms ADD COLUMN cover_type TEXT");
  const legacy = one(db, "SELECT sha1 FROM roms WHERE game_id = 'local'", []);
  if (legacy && typeof legacy.sha1 === "string" && legacy.sha1) {
    const next = `local:${legacy.sha1}`;
    db.run(
      "DELETE FROM saves WHERE game_id = 'local' AND slot IN (SELECT slot FROM saves WHERE game_id = ?)",
      [next],
    );
    db.run("UPDATE saves SET game_id = ? WHERE game_id = 'local'", [next]);
    if (one(db, "SELECT game_id FROM roms WHERE game_id = ?", [next])) {
      db.run("DELETE FROM roms WHERE game_id = 'local'");
    } else {
      db.run(
        "UPDATE roms SET game_id = ?, title = COALESCE(NULLIF(title, ''), 'Jogo local') WHERE game_id = 'local'",
        [next],
      );
    }
    db.run("UPDATE meta SET value = ? WHERE key = 'last-game' AND value = 'local'", [next]);
    await writeFile(db.export());
  }
  return db;
}

async function db(): Promise<Database> {
  opening ??= open();
  return opening;
}

async function persist(database: Database) {
  await writeFile(database.export());
}

function one(database: Database, sql: string, params: unknown[]): Record<string, unknown> | null {
  const statement = database.prepare(sql);
  try {
    statement.bind(params);
    if (!statement.step()) return null;
    return statement.getAsObject();
  } finally {
    statement.free();
  }
}

function columnNames(database: Database, table: string): Set<string> {
  return new Set(
    many(database, `PRAGMA table_info(${table})`, [])
      .map((row) => row.name)
      .filter((name): name is string => typeof name === "string"),
  );
}

function many(database: Database, sql: string, params: unknown[]): Record<string, unknown>[] {
  const statement = database.prepare(sql);
  const rows: Record<string, unknown>[] = [];
  try {
    statement.bind(params);
    while (statement.step()) rows.push(statement.getAsObject());
    return rows;
  } finally {
    statement.free();
  }
}

export const saveSlots = SLOTS;

export function saveRom(gameId: string, sha1: string, bytes: Uint8Array, title?: string) {
  return enqueue(async () => {
    const database = await db();
    database.run(
      `INSERT INTO roms (game_id, sha1, bytes, saved_at, title) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(game_id) DO UPDATE SET
         sha1 = excluded.sha1,
         bytes = excluded.bytes,
         saved_at = excluded.saved_at,
         title = COALESCE(roms.title, excluded.title)`,
      [gameId, sha1, bytes, Date.now(), title ?? null],
    );
    database.run(`INSERT INTO meta (key, value) VALUES ('last-game', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [gameId]);
    await persist(database);
  });
}

export function listLibrary(): Promise<LibraryRecord[]> {
  return enqueue(async () => {
    return many(
      await db(),
      `SELECT game_id, title, sha1, saved_at, cover, cover_type
       FROM roms WHERE game_id LIKE 'local:%' ORDER BY saved_at DESC`,
      [],
    )
      .filter((row) => typeof row.game_id === "string" && typeof row.sha1 === "string" && typeof row.saved_at === "number")
      .map((row) => ({
        id: row.game_id as string,
        title: typeof row.title === "string" && row.title.trim() ? row.title : "Jogo local",
        sha1: row.sha1 as string,
        savedAt: row.saved_at as number,
        cover: asBytes(row.cover),
        coverType: typeof row.cover_type === "string" ? row.cover_type : null,
      }));
  });
}

export function renameRom(gameId: string, title: string) {
  const name = title.replace(/\s+/g, " ").trim().slice(0, 40);
  return enqueue(async () => {
    const database = await db();
    database.run("UPDATE roms SET title = ? WHERE game_id = ?", [name, gameId]);
    await persist(database);
  });
}

export function setRomCover(gameId: string, cover: Uint8Array, coverType: string) {
  return enqueue(async () => {
    const database = await db();
    database.run("UPDATE roms SET cover = ?, cover_type = ? WHERE game_id = ?", [cover, coverType, gameId]);
    await persist(database);
  });
}

export function loadRom(gameId: string): Promise<RomRecord | null> {
  return enqueue(async () => {
    const row = one(await db(), "SELECT sha1, bytes FROM roms WHERE game_id = ?", [gameId]);
    if (!row || typeof row.sha1 !== "string") return null;
    const bytes = asBytes(row.bytes);
    return bytes ? { sha1: row.sha1, bytes } : null;
  });
}

export function storedGames(): Promise<string[]> {
  return enqueue(async () => {
    return many(await db(), "SELECT game_id FROM roms", [])
      .map((row) => row.game_id)
      .filter((id): id is string => typeof id === "string");
  });
}

export function lastGame(): Promise<string | null> {
  return enqueue(async () => {
    const row = one(await db(), "SELECT value FROM meta WHERE key = 'last-game'", []);
    return typeof row?.value === "string" ? row.value : null;
  });
}

export function setLastGame(gameId: string) {
  return enqueue(async () => {
    const database = await db();
    database.run(`INSERT INTO meta (key, value) VALUES ('last-game', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [gameId]);
    await persist(database);
  });
}

export function playerName(): Promise<string> {
  return enqueue(async () => {
    const row = one(await db(), "SELECT value FROM meta WHERE key = 'player-name'", []);
    return typeof row?.value === "string" ? row.value : "";
  });
}

export function setPlayerName(name: string) {
  return enqueue(async () => {
    const database = await db();
    database.run(
      `INSERT INTO meta (key, value) VALUES ('player-name', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [name.slice(0, 20)],
    );
    await persist(database);
  });
}

export function forgetRom(gameId: string) {
  return enqueue(async () => {
    const database = await db();
    database.run("DELETE FROM roms WHERE game_id = ?", [gameId]);
    database.run("DELETE FROM saves WHERE game_id = ?", [gameId]);
    await persist(database);
  });
}

export function saveState(
  gameId: string,
  slot: number,
  state: Uint8Array,
  shot: Uint8Array | null,
  origin: SaveOrigin,
  savedAt = Date.now(),
) {
  return enqueue(async () => {
    const database = await db();
    database.run(
      `INSERT INTO saves (game_id, slot, state, saved_at, shot, origin) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(game_id, slot) DO UPDATE SET
         state = excluded.state,
         saved_at = excluded.saved_at,
         shot = excluded.shot,
         origin = excluded.origin`,
      [gameId, slot, state, savedAt, shot, origin],
    );
    await persist(database);
  });
}

export function saveList(gameId: string): Promise<SaveSlot[]> {
  return enqueue(async () => {
    return many(await db(), "SELECT slot, saved_at, origin, shot FROM saves WHERE game_id = ? ORDER BY slot", [gameId])
      .filter((row) => typeof row.slot === "number" && typeof row.saved_at === "number")
      .map((row) => ({
        slot: row.slot as number,
        savedAt: row.saved_at as number,
        origin: row.origin === "online" ? "online" : "local",
        shot: asBytes(row.shot),
      }));
  });
}

export function loadState(gameId: string, slot: number): Promise<Uint8Array | null> {
  return enqueue(async () => {
    const row = one(await db(), "SELECT state FROM saves WHERE game_id = ? AND slot = ?", [gameId, slot]);
    return row ? asBytes(row.state) : null;
  });
}

export function forgetSlot(gameId: string, slot: number) {
  return enqueue(async () => {
    const database = await db();
    database.run("DELETE FROM saves WHERE game_id = ? AND slot = ?", [gameId, slot]);
    await persist(database);
  });
}
