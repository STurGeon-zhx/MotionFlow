import Database from 'better-sqlite3';
import path from 'node:path';
import {dataRoot, ensureStorage} from './storage';
import {MAX_WORKSPACE_IMAGES} from './limits';

type DatabaseHolder = {db?: Database.Database};
const holder = globalThis as typeof globalThis & DatabaseHolder;

export function getDb() {
  if (holder.db) return holder.db;
  ensureStorage();
  const db = new Database(path.join(dataRoot, 'motion-studio.sqlite'));
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS images (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
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
      owner_ip TEXT NOT NULL,
      tool_type TEXT NOT NULL DEFAULT 'single_intro',
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
      music_name TEXT,
      music_path TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      progress REAL NOT NULL DEFAULT 0,
      output_path TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workspace_images (
      image_id TEXT PRIMARY KEY REFERENCES images(id) ON DELETE CASCADE,
      workspace_type TEXT NOT NULL DEFAULT 'single_intro',
      position INTEGER NOT NULL,
      selected_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS video_job_item_images (
      item_id TEXT NOT NULL REFERENCES video_job_items(id) ON DELETE CASCADE,
      image_id TEXT NOT NULL REFERENCES images(id),
      position INTEGER NOT NULL,
      PRIMARY KEY (item_id, position)
    );
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_items_job ON video_job_items(job_id);
    CREATE INDEX IF NOT EXISTS idx_items_status ON video_job_items(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_jobs_created ON video_jobs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_workspace_images_position ON workspace_images(position);
    CREATE INDEX IF NOT EXISTS idx_item_images_image ON video_job_item_images(image_id);
  `);
  const imageColumns = db.prepare('PRAGMA table_info(images)').all() as Array<{name: string}>;
  if (!imageColumns.some((column) => column.name === 'owner_id')) {
    db.exec("ALTER TABLE images ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'legacy'");
  }
  const jobColumns = db.prepare('PRAGMA table_info(video_jobs)').all() as Array<{name: string}>;
  if (!jobColumns.some((column) => column.name === 'owner_ip')) {
    db.exec('ALTER TABLE video_jobs ADD COLUMN owner_ip TEXT');
  }
  if (!jobColumns.some((column) => column.name === 'tool_type')) {
    db.exec("ALTER TABLE video_jobs ADD COLUMN tool_type TEXT NOT NULL DEFAULT 'single_intro'");
  }
  const itemColumns = db.prepare('PRAGMA table_info(video_job_items)').all() as Array<{name: string}>;
  if (!itemColumns.some((column) => column.name === 'music_name')) {
    db.exec('ALTER TABLE video_job_items ADD COLUMN music_name TEXT');
  }
  if (!itemColumns.some((column) => column.name === 'music_path')) {
    db.exec('ALTER TABLE video_job_items ADD COLUMN music_path TEXT');
  }
  if (!itemColumns.some((column) => column.name === 'position')) {
    db.exec('ALTER TABLE video_job_items ADD COLUMN position INTEGER NOT NULL DEFAULT 0');
  }
  for (const [name, definition] of Object.entries({run_token: 'TEXT', heartbeat_at: 'TEXT', stage: "TEXT NOT NULL DEFAULT 'waiting'"})) {
    if (!itemColumns.some((column) => column.name === name)) db.exec(`ALTER TABLE video_job_items ADD COLUMN ${name} ${definition}`);
  }
  const workspaceColumns = db.prepare('PRAGMA table_info(workspace_images)').all() as Array<{name: string}>;
  if (!workspaceColumns.some((column) => column.name === 'workspace_type')) {
    db.exec("ALTER TABLE workspace_images ADD COLUMN workspace_type TEXT NOT NULL DEFAULT 'single_intro'");
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_jobs_owner_created ON video_jobs(owner_ip, created_at DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_images_owner_created ON images(owner_id, created_at DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_workspace_type_position ON workspace_images(workspace_type, position)');
  const workspaceInitialized = db.prepare("SELECT value FROM app_meta WHERE key = 'workspace_images_initialized'").get();
  if (!workspaceInitialized) {
    const latestJob = db.prepare('SELECT request_json FROM video_jobs ORDER BY created_at DESC LIMIT 1').get() as {request_json: string} | undefined;
    let imageIds: string[] = [];
    try {
      imageIds = latestJob ? (JSON.parse(latestJob.request_json) as {imageIds?: string[]}).imageIds ?? [] : [];
    } catch {
      imageIds = [];
    }
    if (imageIds.length === 0) {
      const recent = db.prepare(`SELECT id FROM images ORDER BY created_at DESC LIMIT ${MAX_WORKSPACE_IMAGES}`).all() as Array<{id: string}>;
      imageIds = recent.reverse().map((image) => image.id);
    }
    const insertWorkspaceImage = db.prepare('INSERT OR IGNORE INTO workspace_images (image_id, position, selected_at) VALUES (?, ?, ?)');
    const now = new Date().toISOString();
    imageIds.slice(0, MAX_WORKSPACE_IMAGES).forEach((imageId, position) => insertWorkspaceImage.run(imageId, position, now));
    db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('workspace_images_initialized', '1')").run();
  }
  holder.db = db;
  return db;
}

export function closeDbForTests() {
  holder.db?.close();
  holder.db = undefined;
}
