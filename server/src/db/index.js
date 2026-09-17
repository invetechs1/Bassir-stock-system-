import Database from 'better-sqlite3';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { config } from '../config.js';
import { SCHEMA_SQL } from './schema.js';
import { applyMigrations } from './migrations.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveDbPath() {
  if (config.DATABASE_PATH === ':memory:') return ':memory:';
  const abs = isAbsolute(config.DATABASE_PATH)
    ? config.DATABASE_PATH
    : resolve(__dirname, '../../', config.DATABASE_PATH);
  mkdirSync(dirname(abs), { recursive: true });
  return abs;
}

// Single shared connection. better-sqlite3 is synchronous, which keeps the
// trading logic simple and transactional.
export const db = new Database(resolveDbPath());
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Apply the schema eagerly on connection so that prepared statements created
// at service module-load time always have their tables available.
db.exec(SCHEMA_SQL);

// Upgrade any pre-existing tables to the latest shape (no-op for fresh DBs).
applyMigrations(db);
