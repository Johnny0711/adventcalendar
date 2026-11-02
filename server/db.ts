import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
export const hash = (s: string) => createHash('sha256').update(s).digest('hex');
export const secret = () => randomBytes(32).toString('base64url');
export function database(dir: string) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path.join(dir, 'advent.sqlite'));
  chmodSync(path.join(dir, 'advent.sqlite'), 0o600);
  const version = Number(db.prepare('PRAGMA user_version').get()?.user_version);
  if (version > 1) {
    db.close();
    throw Error('Database schema is newer than this application supports');
  }
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS days(day INTEGER PRIMARY KEY CHECK(day BETWEEN 1 AND 24), token_hash TEXT NOT NULL UNIQUE, enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN(0,1)), created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(id_hash TEXT PRIMARY KEY,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS session_unlocks(session_hash TEXT NOT NULL REFERENCES sessions(id_hash) ON DELETE CASCADE,day INTEGER NOT NULL REFERENCES days(day),unlocked_at INTEGER NOT NULL,PRIMARY KEY(session_hash,day));
 CREATE INDEX IF NOT EXISTS session_expiry ON sessions(expires_at); PRAGMA user_version=1;`);
  return db;
}
export type DB = ReturnType<typeof database>;
