import fs from 'node:fs';
import path from 'node:path';
import {getDb} from './db';
import {allocateEffects, getEffectPool, resolvedRandomParams} from './effect-allocation';
import {
  singleIntroJobSchema, threeImageMotionJobSchema, type CreateJobInput, type EffectPreset,
  type SingleIntroJobInput, type ThreeImageMotionJobInput, type ToolType,
} from './schema';
import {outputsDir, tempDir} from './storage';
import {getFriendlyRenderError, getRenderErrorMessage} from './render-retry';
import {getMusicTrackForIndex, listMusicTracks} from './music';
import {getVideoDownloadFilename} from './download-filename';

export type ImageRow = {
  id: string; owner_id: string; original_name: string; stored_name: string; file_path: string; mime_type: string;
  width: number; height: number; size_bytes: number; created_at: string;
};
type JobRow = {
  id: string; owner_ip: string | null; tool_type: ToolType | null; status: string; request_json: string;
  total_count: number; completed_count: number; failed_count: number; created_at: string; updated_at: string;
};
export type ItemRow = {
  id: string; job_id: string; image_id: string; effect_id: string; effect_name: string;
  effect_snapshot_json: string; seed: number; params_json: string; status: string; progress: number;
  music_name: string | null; music_path: string | null; position: number;
  output_path: string | null; error_message: string | null; created_at: string; updated_at: string;
};

export type CompletedItemRow = ItemRow & {original_name: string};

export type ClaimedSingleIntroItem = ItemRow & {
  toolType: 'single_intro'; image: ImageRow; images: [ImageRow]; request: SingleIntroJobInput;
  effect: EffectPreset; params: Record<string, number>;
};
export type ClaimedThreeImageMotionItem = ItemRow & {
  toolType: 'three_image_motion'; image: ImageRow; images: [ImageRow, ImageRow, ImageRow];
  request: ThreeImageMotionJobInput; effect: null; params: Record<string, number | string | boolean>;
};
export type ClaimedRenderItem = ClaimedSingleIntroItem | ClaimedThreeImageMotionItem;

const makeId = (prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`;

function parseCreateJobInput(rawInput: unknown): CreateJobInput {
  const toolType = rawInput && typeof rawInput === 'object' && 'toolType' in rawInput
    ? (rawInput as {toolType?: unknown}).toolType
    : 'single_intro';
  return toolType === 'three_image_motion'
    ? threeImageMotionJobSchema.parse(rawInput)
    : singleIntroJobSchema.parse(rawInput);
}

function requireImages(imageIds: string[], ownerId: string) {
  const db = getDb();
  const placeholders = imageIds.map(() => '?').join(',');
  const rows = db.prepare(`SELECT * FROM images WHERE id IN (${placeholders}) AND owner_id = ?`).all(...imageIds, ownerId) as ImageRow[];
  if (rows.length !== imageIds.length) throw new Error('部分图片不存在、不属于当前设备、重复或已被删除');
}

export function createVideoJob(rawInput: unknown, ownerIp: string) {
  if (!ownerIp || ownerIp === 'unknown') throw new Error('无法识别当前设备，请刷新页面后重试');
  const input = parseCreateJobInput(rawInput);
  requireImages(input.imageIds, ownerIp);
  return input.toolType === 'three_image_motion'
    ? createThreeImageMotionJob(input, ownerIp)
    : createSingleIntroJob(input, ownerIp);
}

function createSingleIntroJob(input: SingleIntroJobInput, ownerIp: string) {
  const db = getDb();
  const pool = getEffectPool(input);
  if (pool.length === 0) throw new Error('当前筛选条件下没有可用特效');
  const jobId = makeId('job');
  const now = new Date().toISOString();
  const seedBase = Math.floor(Math.random() * 2_000_000_000);
  const musicTracks = listMusicTracks();
  if (musicTracks.length === 0) throw new Error('音乐库为空，请先在 assets/music 中添加支持的音频文件');

  db.transaction(() => {
    db.prepare(`INSERT INTO video_jobs
      (id, owner_ip, tool_type, status, request_json, total_count, completed_count, failed_count, created_at, updated_at)
      VALUES (?, ?, 'single_intro', 'pending', ?, ?, 0, 0, ?, ?)`)
      .run(jobId, ownerIp, JSON.stringify(input), input.imageIds.length, now, now);
    const insertItem = db.prepare(`INSERT INTO video_job_items
      (id, job_id, image_id, effect_id, effect_name, effect_snapshot_json, seed, params_json, music_name, music_path, position, status, progress, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'waiting', 0, ?, ?)`);
    input.imageIds.forEach((imageId, imageIndex) => {
      const effect = allocateEffects(pool, 1, false, seedBase + imageIndex * 997)[0];
      const seed = seedBase + imageIndex * 1009;
      const music = getMusicTrackForIndex(imageIndex, musicTracks);
      insertItem.run(
        makeId('item'), jobId, imageId, effect.id, effect.name, JSON.stringify(effect), seed,
        JSON.stringify(resolvedRandomParams(seed)), music?.name ?? null, music?.filePath ?? null,
        imageIndex, now, now,
      );
    });
  })();
  return {jobId, totalCount: input.imageIds.length, repeatsRequired: false};
}

function createThreeImageMotionJob(input: ThreeImageMotionJobInput, ownerIp: string) {
  const db = getDb();
  const jobId = makeId('job');
  const now = new Date().toISOString();
  const groupCount = input.imageIds.length / 3;
  const musicTracks = input.enableMusic ? listMusicTracks() : [];
  if (input.enableMusic && musicTracks.length === 0) throw new Error('音乐库为空，请关闭自动配乐或添加支持的音乐');
  const insertItem = db.prepare(`INSERT INTO video_job_items
    (id, job_id, image_id, effect_id, effect_name, effect_snapshot_json, seed, params_json, music_name, music_path, position, status, progress, created_at, updated_at)
    VALUES (?, ?, ?, 'three_image_motion', '三图缓慢移动', ?, ?, ?, ?, ?, ?, 'waiting', 0, ?, ?)`);
  const insertRelation = db.prepare('INSERT INTO video_job_item_images (item_id, image_id, position) VALUES (?, ?, ?)');

  db.transaction(() => {
    db.prepare(`INSERT INTO video_jobs
      (id, owner_ip, tool_type, status, request_json, total_count, completed_count, failed_count, created_at, updated_at)
      VALUES (?, ?, 'three_image_motion', 'pending', ?, ?, 0, 0, ?, ?)`)
      .run(jobId, ownerIp, JSON.stringify(input), groupCount, now, now);
    for (let groupIndex = 0; groupIndex < groupCount; groupIndex++) {
      const groupImageIds = input.imageIds.slice(groupIndex * 3, groupIndex * 3 + 3);
      const itemId = makeId('item');
      const seed = Math.floor(Math.random() * 2_000_000_000);
      const music = input.enableMusic ? getMusicTrackForIndex(groupIndex, musicTracks) : null;
      const snapshot = {motionPath: input.motionPath, edgeMode: input.edgeMode, transition: input.transition};
      const params = {motionSpeed: input.motionSpeed, motionAmplitude: input.motionAmplitude, enableMusic: input.enableMusic};
      insertItem.run(itemId, jobId, groupImageIds[0], JSON.stringify(snapshot), seed, JSON.stringify(params),
        music?.name ?? null, music?.filePath ?? null, groupIndex, now, now);
      groupImageIds.forEach((imageId, position) => insertRelation.run(itemId, imageId, position));
    }
  })();
  return {jobId, totalCount: groupCount, repeatsRequired: false};
}

function getItemImageIds(row: ItemRow, toolType: ToolType) {
  if (toolType === 'single_intro') return [row.image_id];
  return (getDb().prepare('SELECT image_id FROM video_job_item_images WHERE item_id = ? ORDER BY position').all(row.id) as Array<{image_id: string}>)
    .map((relation) => relation.image_id);
}

function serializeItem(row: ItemRow & {original_name: string}, toolType: ToolType) {
  return {
    id: row.id, imageId: row.image_id, imageIds: getItemImageIds(row, toolType), effectId: row.effect_id,
    effectName: row.effect_name, musicName: row.music_name, status: row.status, progress: row.progress,
    previewUrl: row.status === 'completed' ? `/api/video-files/${row.id}` : null,
    downloadUrl: row.status === 'completed' ? `/api/video-files/${row.id}?download=1` : null,
    downloadFilename: row.status === 'completed' ? getVideoDownloadFilename(row.original_name) : null,
    errorMessage: row.error_message,
  };
}

function serializeJob(row: JobRow, withItems = false) {
  const rawInput = JSON.parse(row.request_json) as Record<string, unknown>;
  const toolType: ToolType = row.tool_type === 'three_image_motion' || rawInput.toolType === 'three_image_motion'
    ? 'three_image_motion'
    : 'single_intro';
  const input = parseCreateJobInput({...rawInput, toolType});
  const base = {
    id: row.id, toolType, status: row.status, totalCount: row.total_count,
    completedCount: row.completed_count, failedCount: row.failed_count, imageCount: input.imageIds.length,
    groupCount: toolType === 'three_image_motion' ? input.imageIds.length / 3 : input.imageIds.length,
    durationSec: input.durationSec, ratio: input.ratio, resolution: input.resolution,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
  if (!withItems) return base;
  const items = getDb().prepare(`SELECT item.*, image.original_name
    FROM video_job_items item JOIN images image ON image.id = item.image_id
    WHERE item.job_id = ? ORDER BY item.position, item.created_at, item.id`).all(row.id) as Array<ItemRow & {original_name: string}>;
  return {...base, request: input, items: items.map((item) => serializeItem(item, toolType))};
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

function isPathInside(root: string, candidate: string) {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  return resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`);
}

export async function deleteVideoJob(jobId: string, ownerIp: string) {
  const db = getDb();
  const job = db.prepare('SELECT id FROM video_jobs WHERE id = ? AND owner_ip = ?').get(jobId, ownerIp) as {id: string} | undefined;
  if (!job) return null;
  const active = db.prepare("SELECT 1 FROM video_job_items WHERE job_id = ? AND status IN ('waiting', 'rendering') LIMIT 1").get(jobId);
  if (active) return {deleted: false as const, reason: 'active' as const};

  const items = db.prepare('SELECT id, output_path FROM video_job_items WHERE job_id = ?').all(jobId) as Array<{id: string; output_path: string | null}>;
  const files = new Set<string>();
  for (const item of items) {
    if (item.output_path && isPathInside(outputsDir, item.output_path)) files.add(path.resolve(item.output_path));
    files.add(path.join(outputsDir, `${item.id}.mp4`));
    files.add(path.join(tempDir, `${item.id}.mp4`));
  }
  await Promise.all([...files].map((filePath) => fs.promises.rm(filePath, {force: true})));
  const deleted = db.prepare('DELETE FROM video_jobs WHERE id = ? AND owner_ip = ?').run(jobId, ownerIp);
  return {deleted: deleted.changes === 1};
}

export function retryFailedItems(jobId: string, ownerIp: string) {
  const db = getDb();
  if (!db.prepare('SELECT id FROM video_jobs WHERE id = ? AND owner_ip = ?').get(jobId, ownerIp)) return null;
  const result = db.prepare(`UPDATE video_job_items SET status = 'waiting', progress = 0, error_message = NULL,
    output_path = NULL, updated_at = ? WHERE job_id = ? AND status = 'failed'`).run(new Date().toISOString(), jobId);
  recomputeJob(jobId);
  return {retriedCount: result.changes};
}

export function retryFailedItem(itemId: string, ownerIp: string) {
  const db = getDb();
  const item = db.prepare(`SELECT item.id, item.job_id, item.status FROM video_job_items item
    JOIN video_jobs job ON job.id = item.job_id WHERE item.id = ? AND job.owner_ip = ?`)
    .get(itemId, ownerIp) as {id: string; job_id: string; status: string} | undefined;
  if (!item) return null;
  if (item.status !== 'failed') return {jobId: item.job_id, retried: false};
  const result = db.prepare(`UPDATE video_job_items SET status = 'waiting', progress = 0, error_message = NULL,
    output_path = NULL, updated_at = ? WHERE id = ? AND status = 'failed'`).run(new Date().toISOString(), itemId);
  recomputeJob(item.job_id);
  return {jobId: item.job_id, retried: result.changes === 1};
}

export function recomputeJob(jobId: string) {
  const db = getDb();
  const counts = db.prepare(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN status = 'rendering' THEN 1 ELSE 0 END) AS rendering
    FROM video_job_items WHERE job_id = ?`).get(jobId) as {total: number; completed: number; failed: number; rendering: number};
  let status = 'pending';
  if (counts.completed + counts.failed === counts.total) {
    status = counts.failed === 0 ? 'completed' : counts.completed === 0 ? 'failed' : 'partial_failed';
  } else if (counts.rendering > 0 || counts.completed > 0 || counts.failed > 0) status = 'running';
  db.prepare('UPDATE video_jobs SET status = ?, completed_count = ?, failed_count = ?, updated_at = ? WHERE id = ?')
    .run(status, counts.completed, counts.failed, new Date().toISOString(), jobId);
}

export function recoverInterruptedItems() {
  const db = getDb();
  const interrupted = db.prepare("SELECT id, job_id FROM video_job_items WHERE status = 'rendering'").all() as Array<{id: string; job_id: string}>;
  if (interrupted.length === 0) return 0;
  db.prepare("UPDATE video_job_items SET status = 'waiting', progress = 0, error_message = NULL, output_path = NULL, updated_at = ? WHERE status = 'rendering'")
    .run(new Date().toISOString());
  for (const item of interrupted) {
    for (const candidate of [path.join(tempDir, `${item.id}.mp4`), path.join(outputsDir, `${item.id}.mp4`)]) fs.rmSync(candidate, {force: true});
    recomputeJob(item.job_id);
  }
  return interrupted.length;
}

export function claimNextItem(options: {allowThreeImageMotion?: boolean} = {}): ClaimedRenderItem | null {
  const db = getDb();
  return db.transaction(() => {
    const row = options.allowThreeImageMotion === false
      ? db.prepare(`SELECT item.* FROM video_job_items item JOIN video_jobs job ON job.id = item.job_id
          WHERE item.status = 'waiting' AND job.tool_type <> 'three_image_motion'
          ORDER BY item.created_at, item.position, item.id LIMIT 1`).get() as ItemRow | undefined
      : db.prepare("SELECT * FROM video_job_items WHERE status = 'waiting' ORDER BY created_at, position, id LIMIT 1").get() as ItemRow | undefined;
    if (!row) return null;
    const changed = db.prepare("UPDATE video_job_items SET status = 'rendering', progress = 0, updated_at = ? WHERE id = ? AND status = 'waiting'")
      .run(new Date().toISOString(), row.id);
    if (changed.changes !== 1) return null;
    const job = db.prepare('SELECT tool_type, request_json FROM video_jobs WHERE id = ?').get(row.job_id) as {tool_type: ToolType | null; request_json: string};
    const rawInput = JSON.parse(job.request_json) as Record<string, unknown>;
    const toolType: ToolType = job.tool_type === 'three_image_motion' || rawInput.toolType === 'three_image_motion' ? 'three_image_motion' : 'single_intro';
    const request = parseCreateJobInput({...rawInput, toolType});
    const imageIds = getItemImageIds(row, toolType);
    const placeholders = imageIds.map(() => '?').join(',');
    const unorderedImages = db.prepare(`SELECT * FROM images WHERE id IN (${placeholders})`).all(...imageIds) as ImageRow[];
    const imageMap = new Map(unorderedImages.map((image) => [image.id, image]));
    const images = imageIds.map((id) => imageMap.get(id)).filter((image): image is ImageRow => Boolean(image));
    if (images.length !== imageIds.length) throw new Error('渲染任务的图片不存在');
    recomputeJob(row.job_id);
    const common = {...row, status: 'rendering', image: images[0], params: JSON.parse(row.params_json)};
    if (toolType === 'three_image_motion') {
      if (images.length !== 3) throw new Error('三图微动任务必须包含三张图片');
      return {...common, toolType, images: images as [ImageRow, ImageRow, ImageRow], request: request as ThreeImageMotionJobInput, effect: null};
    }
    return {...common, toolType, images: [images[0]] as [ImageRow], request: request as SingleIntroJobInput, effect: JSON.parse(row.effect_snapshot_json)};
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
  getDb().prepare("UPDATE video_job_items SET status = 'failed', progress = 0, error_message = ?, updated_at = ? WHERE id = ?")
    .run(getFriendlyRenderError(error).slice(0, 1000), new Date().toISOString(), item.id);
  recomputeJob(item.job_id);
}

export function getCompletedItem(itemId: string, ownerIp: string) {
  return getDb().prepare(`SELECT item.*, image.original_name FROM video_job_items item
    JOIN video_jobs job ON job.id = item.job_id JOIN images image ON image.id = item.image_id
    WHERE item.id = ? AND item.status = 'completed' AND job.owner_ip = ?`).get(itemId, ownerIp) as CompletedItemRow | undefined;
}

export function getCompletedItems(jobId: string, ownerIp: string) {
  return getDb().prepare(`SELECT item.*, image.original_name FROM video_job_items item
    JOIN video_jobs job ON job.id = item.job_id JOIN images image ON image.id = item.image_id
    WHERE item.job_id = ? AND item.status = 'completed' AND job.owner_ip = ? ORDER BY item.position, item.created_at, item.id`)
    .all(jobId, ownerIp) as CompletedItemRow[];
}
