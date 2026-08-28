import Database from 'better-sqlite3';
import path from 'node:path';
import {dataRoot, ensureStorage} from './storage';

type DatabaseHolder = {db?: Database.Database};
const holder = globalThis as typeof globalThis & DatabaseHolder;

export function getDb() {
  if (holder.db) return holder.db;
  ensureStorage();
  const db = new Database(path.join(dataRoot, 'motion-studio.sqlite'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS images (
      id TEXT PRIMARY KEY,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL UNIQUE,
      file_path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS video_jobs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      request_json TEXT NOT NULL,
      total_count INTEGER NOT NULL,
      completed_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS video_job_items (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES video_jobs(id) ON DELETE CASCADE,
      image_id TEXT NOT NULL REFERENCES images(id),
      effect_id TEXT NOT NULL,
      effect_name TEXT NOT NULL,
      effect_snapshot_json TEXT NOT NULL,
      seed INTEGER NOT NULL,
      params_json TEXT NOT NULL,
      status TEXT NOT NULL,
      progress REAL NOT NULL DEFAULT 0,
      output_path TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_items_job ON video_job_items(job_id);
    CREATE INDEX IF NOT EXISTS idx_items_status ON video_job_items(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_jobs_created ON video_jobs(created_at DESC);
  `);
  holder.db = db;
  return db;
}

export function closeDbForTests() {
  holder.db?.close();
  holder.db = undefined;
}

