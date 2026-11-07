export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar TEXT,
  friend_code TEXT NOT NULL UNIQUE,
  room_code TEXT,
  room_at INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE(provider, provider_id)
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS saves (
  user_id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  slot INTEGER NOT NULL,
  sha1 TEXT NOT NULL,
  saved_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, game_id, slot)
);
CREATE TABLE IF NOT EXISTS friendships (
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (from_id, to_id)
);
CREATE INDEX IF NOT EXISTS friendships_to ON friendships (to_id);
CREATE TABLE IF NOT EXISTS room_invites (
  id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  room_code TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS room_invites_to ON room_invites (to_id);
`;
