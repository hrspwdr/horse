import Database from 'better-sqlite3';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || './data';
const dbPath = path.join(DATA_DIR, 'horse.db');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    reference_audio_path TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS recordings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chunk_id INTEGER NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
    contributor_name TEXT NOT NULL,
    audio_path TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Seed default settings
const seedIfMissing = (key, value) => {
  const row = db.prepare('SELECT 1 FROM settings WHERE key = ?').get(key);
  if (!row) db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, value);
};
seedIfMissing('contributor_name', 'Friend');
seedIfMissing('id_mode', 'admin');     // "admin" or "self"
seedIfMissing('language', 'en');        // "en" or "fr"

export default db;
