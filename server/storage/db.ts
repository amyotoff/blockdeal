import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { Database as SqliteDatabase } from 'better-sqlite3';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as {
  new (filename?: string | Buffer, options?: { readonly?: boolean; fileMustExist?: boolean; timeout?: number }): SqliteDatabase;
};

export const DEFAULT_SQLITE_PATH = path.join(process.cwd(), 'data', 'blockdeal.sqlite');

export function resolveDatabasePath(databasePath = process.env.SQLITE_PATH || DEFAULT_SQLITE_PATH): string {
  return databasePath;
}

export function openDatabase(databasePath = resolveDatabasePath()): SqliteDatabase {
  if (databasePath !== ':memory:') {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const db = new BetterSqlite3(databasePath);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  return db;
}

export function loadSchema(): string {
  return fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
}

export function initializeDatabase(db: SqliteDatabase): void {
  db.exec(loadSchema());
}
