import fs from 'node:fs';
import path from 'node:path';
import {getDb} from './db';
import {allocateEffects, getEffectPool, resolvedRandomParams} from './effect-allocation';
import {createJobSchema, type CreateJobInput, type EffectPreset} from './schema';
import {outputsDir, tempDir} from './storage';
import {getFriendlyRenderError, getRenderErrorMessage} from './render-retry';
import {getMusicTrackForIndex, listMusicTracks} from './music';

type ImageRow = {
  id: string; original_name: string; stored_name: string; file_path: string; mime_type: string;
  width: number; height: number; size_bytes: number; created_at: string;
};
type JobRow = {
  id: string; owner_ip: string | null; status: string; request_json: string; total_count: number; completed_count: number;
  failed_count: number; created_at: string; updated_at: string;
};
export type ItemRow = {
  id: string; job_id: string; image_id: string; effect_id: string; effect_name: string;
  effect_snapshot_json: string; seed: number; params_json: string; status: string; progress: number;
  music_name: string | null; music_path: string | null;
  output_path: string | null; error_message: string | null; created_at: string; updated_at: string;
};

const makeId = (prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`;

export function createVideoJob(rawInput: unknown, ownerIp: string) {
  if (!ownerIp || ownerIp === 'unknown') throw new Error('无法识别当前设备 IP，请通过项目启动地址重新访问');
  const input = createJobSchema.parse(rawInput);
  const db = getDb();
  const placeholders = input.imageIds.map(() => '?').join(',');
  const imageRows = db.prepare(`SELECT * FROM images WHERE id IN (${placeholders})`).all(...input.imageIds) as ImageRow[];
  if (imageRows.length !== input.imageIds.length) throw new Error('部分图片不存在或已被删除');
  const pool = getEffectPool(input);
  if (pool.length === 0) throw new Error('当前筛选条件下没有可用特效');

  const jobId = makeId('job');
  const now = new Date().toISOString();
  const total = input.imageIds.length * input.countPerImage;
  const seedBase = Math.floor(Math.random() * 2_000_000_000);
  const musicTracks = listMusicTracks();
  if (musicTracks.length === 0) throw new Error('音乐库为空，请先在 assets/music 中添加支持的音频文件');
  let musicIndex = 0;

  db.transaction(() => {
    db.prepare(`INSERT INTO video_jobs
      (id, owner_ip, status, request_json, total_count, completed_count, failed_count, created_at, updated_at)
      VALUES (?, ?, 'pending', ?, ?, 0, 0, ?, ?)`)
      .run(jobId, ownerIp, JSON.stringify(input), total, now, now);
    const insertItem = db.prepare(`INSERT INTO video_job_items
      (id, job_id, image_id, effect_id, effect_name, effect_snapshot_json, seed, params_json, music_name, music_path, status, progress, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'waiting', 0, ?, ?)`);
    input.imageIds.forEach((imageId, imageIndex) => {
      const effectsForImage = allocateEffects(pool, input.countPerImage, input.allowDuplicate, seedBase + imageIndex * 997);
      effectsForImage.forEach((effect, itemIndex) => {
        const seed = seedBase + imageIndex * 1009 + itemIndex * 37;
        const music = getMusicTrackForIndex(musicIndex, musicTracks);
        musicIndex += 1;
        insertItem.run(
          makeId('item'), jobId, imageId, effect.id, effect.name, JSON.stringify(effect), seed,
          JSON.stringify(resolvedRandomParams(seed)), music?.name ?? null, music?.filePath ?? null, now, now,
        );
      });
    });
  })();
  return {jobId, totalCount: total, repeatsRequired: !input.allowDuplicate && input.countPerImage > pool.length};
}

function serializeItem(row: ItemRow) {
  return {
    id: row.id,
    imageId: row.image_id,
    effectId: row.effect_id,
    effectName: row.effect_name,
    musicName: row.music_name,
    status: row.status,
    progress: row.progress,
    previewUrl: row.status === 'completed' ? `/api/video-files/${row.id}` : null,
    downloadUrl: row.status === 'completed' ? `/api/video-files/${row.id}?download=1` : null,
    errorMessage: row.error_message,
  };
}

function serializeJob(row: JobRow, withItems = false) {
  const input = JSON.parse(row.request_json) as CreateJobInput;
  const base = {
    id: row.id,
    status: row.status,
    totalCount: row.total_count,
    completedCount: row.completed_count,
    failedCount: row.failed_count,
    imageCount: input.imageIds.length,
    ratio: input.ratio,
    resolution: input.resolution,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (!withItems) return base;
  const items = getDb().prepare('SELECT * FROM video_job_items WHERE job_id = ? ORDER BY created_at, id').all(row.id) as ItemRow[];
  return {...base, request: input, items: items.map(serializeItem)};
}

export function getJob(jobId: string, ownerIp: string) {
  const row = getDb().prepare('SELECT * FROM video_jobs WHERE id = ? AND owner_ip = ?').get(jobId, ownerIp) as JobRow | undefined;
  return row ? serializeJob(row, true) : null;
}

export function listJobs(ownerIp: string, page = 1, pageSize = 12) {
  const db = getDb();
  const safeSize = Math.min(Math.max(pageSize, 1), 50);
  const safePage = Math.max(page, 1);
  const total = (db.prepare('SELECT COUNT(*) AS count FROM video_jobs WHERE owner_ip = ?').get(ownerIp) as {count: number}).count;
  const rows = db.prepare('SELECT * FROM video_jobs WHERE owner_ip = ? ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .all(ownerIp, safeSize, (safePage - 1) * safeSize) as JobRow[];
  return {jobs: rows.map((row) => serializeJob(row)), total, page: safePage, pageSize: safeSize};
}

export function retryFailedItems(jobId: string, ownerIp: string) {
  const db = getDb();
  const exists = db.prepare('SELECT id FROM video_jobs WHERE id = ? AND owner_ip = ?').get(jobId, ownerIp);
  if (!exists) return null;
  const now = new Date().toISOString();
  const result = db.prepare(`UPDATE video_job_items
    SET status = 'waiting', progress = 0, error_message = NULL, output_path = NULL, updated_at = ?
    WHERE job_id = ? AND status = 'failed'`).run(now, jobId);
  recomputeJob(jobId);
  return {retriedCount: result.changes};
}

export function retryFailedItem(itemId: string, ownerIp: string) {
  const db = getDb();
  const item = db.prepare(`SELECT item.id, item.job_id, item.status
    FROM video_job_items item
    JOIN video_jobs job ON job.id = item.job_id
    WHERE item.id = ? AND job.owner_ip = ?`).get(itemId, ownerIp) as {id: string; job_id: string; status: string} | undefined;
  if (!item) return null;
  if (item.status !== 'failed') return {jobId: item.job_id, retried: false};
  const result = db.prepare(`UPDATE video_job_items
    SET status = 'waiting', progress = 0, error_message = NULL, output_path = NULL, updated_at = ?
    WHERE id = ? AND status = 'failed'`).run(new Date().toISOString(), itemId);
  recomputeJob(item.job_id);
  return {jobId: item.job_id, retried: result.changes === 1};
}

export function recomputeJob(jobId: string) {
  const db = getDb();
  const counts = db.prepare(`SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN status = 'rendering' THEN 1 ELSE 0 END) AS rendering
    FROM video_job_items WHERE job_id = ?`).get(jobId) as {total: number; completed: number; failed: number; rendering: number};
  let status = 'pending';
  if (counts.completed + counts.failed === counts.total) {
    status = counts.failed === 0 ? 'completed' : counts.completed === 0 ? 'failed' : 'partial_failed';
  } else if (counts.rendering > 0 || counts.completed > 0 || counts.failed > 0) {
    status = 'running';
  }
  db.prepare(`UPDATE video_jobs SET status = ?, completed_count = ?, failed_count = ?, updated_at = ? WHERE id = ?`)
    .run(status, counts.completed, counts.failed, new Date().toISOString(), jobId);
}

export function recoverInterruptedItems() {
  const db = getDb();
  const interrupted = db.prepare("SELECT id, job_id FROM video_job_items WHERE status = 'rendering'").all() as Array<{id: string; job_id: string}>;
  if (interrupted.length === 0) return 0;
  const now = new Date().toISOString();
  db.prepare("UPDATE video_job_items SET status = 'waiting', progress = 0, error_message = NULL, output_path = NULL, updated_at = ? WHERE status = 'rendering'").run(now);
  for (const item of interrupted) {
    for (const candidate of [path.join(tempDir, `${item.id}.mp4`), path.join(outputsDir, `${item.id}.mp4`)]) {
      fs.rmSync(candidate, {force: true});
    }
    recomputeJob(item.job_id);
  }
  return interrupted.length;
}

export type ClaimedRenderItem = ItemRow & {image: ImageRow; request: CreateJobInput; effect: EffectPreset; params: Record<string, number>};

export function claimNextItem(): ClaimedRenderItem | null {
  const db = getDb();
  return db.transaction(() => {
    const row = db.prepare("SELECT * FROM video_job_items WHERE status = 'waiting' ORDER BY created_at, id LIMIT 1").get() as ItemRow | undefined;
    if (!row) return null;
    const now = new Date().toISOString();
    const changed = db.prepare("UPDATE video_job_items SET status = 'rendering', progress = 0, updated_at = ? WHERE id = ? AND status = 'waiting'").run(now, row.id);
    if (changed.changes !== 1) return null;
    const image = db.prepare('SELECT * FROM images WHERE id = ?').get(row.image_id) as ImageRow;
    const job = db.prepare('SELECT request_json FROM video_jobs WHERE id = ?').get(row.job_id) as {request_json: string};
    recomputeJob(row.job_id);
    return {
      ...row,
      status: 'rendering',
      image,
      request: JSON.parse(job.request_json),
      effect: JSON.parse(row.effect_snapshot_json),
      params: JSON.parse(row.params_json),
    };
  })();
}

export function updateItemProgress(itemId: string, progress: number) {
  getDb().prepare("UPDATE video_job_items SET progress = ?, updated_at = ? WHERE id = ? AND status = 'rendering'")
    .run(Math.max(0, Math.min(1, progress)), new Date().toISOString(), itemId);
}

export function recordAutomaticRetry(itemId: string, retryNumber: number, maxRetries: number, error: unknown) {
  const detail = getRenderErrorMessage(error).slice(0, 500);
  getDb().prepare("UPDATE video_job_items SET progress = 0, error_message = ?, updated_at = ? WHERE id = ? AND status = 'rendering'")
    .run(`临时渲染异常，正在自动重试 ${retryNumber}/${maxRetries}：${detail}`, new Date().toISOString(), itemId);
}

export function completeItem(item: ItemRow, outputPath: string) {
  getDb().prepare("UPDATE video_job_items SET status = 'completed', progress = 1, output_path = ?, error_message = NULL, updated_at = ? WHERE id = ?")
    .run(outputPath, new Date().toISOString(), item.id);
  recomputeJob(item.job_id);
}

export function failItem(item: ItemRow, error: unknown) {
  const message = getFriendlyRenderError(error);
  getDb().prepare("UPDATE video_job_items SET status = 'failed', progress = 0, error_message = ?, updated_at = ? WHERE id = ?")
    .run(message.slice(0, 1000), new Date().toISOString(), item.id);
  recomputeJob(item.job_id);
}

export function getCompletedItem(itemId: string, ownerIp: string) {
  return getDb().prepare(`SELECT item.* FROM video_job_items item
    JOIN video_jobs job ON job.id = item.job_id
    WHERE item.id = ? AND item.status = 'completed' AND job.owner_ip = ?`).get(itemId, ownerIp) as ItemRow | undefined;
}

export function getCompletedItems(jobId: string, ownerIp: string) {
  return getDb().prepare(`SELECT item.* FROM video_job_items item
    JOIN video_jobs job ON job.id = item.job_id
    WHERE item.job_id = ? AND item.status = 'completed' AND job.owner_ip = ?
    ORDER BY item.created_at, item.id`).all(jobId, ownerIp) as ItemRow[];
}
