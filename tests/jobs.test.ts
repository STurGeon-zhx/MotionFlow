import fs from 'node:fs';
import path from 'node:path';
import {beforeEach, describe, expect, it} from 'vitest';
import {getDb} from '@/lib/db';
import {createVideoJob, getJob, recomputeJob, retryFailedItems} from '@/lib/jobs';
import {ensureStorage, uploadsDir} from '@/lib/storage';

beforeEach(() => {
  const db = getDb();
  db.exec('DELETE FROM video_job_items; DELETE FROM video_jobs; DELETE FROM images;');
  ensureStorage();
  const filePath = path.join(uploadsDir, 'test.jpg');
  fs.writeFileSync(filePath, Buffer.from('test'));
  const insert = db.prepare(`INSERT INTO images (id, original_name, stored_name, file_path, mime_type, width, height, size_bytes, created_at)
    VALUES (?, 'test.jpg', ?, ?, 'image/jpeg', 1920, 1080, 4, ?)`);
  for (let index = 1; index <= 3; index++) insert.run(`img_test_${index}`, `test_${index}.jpg`, filePath, new Date().toISOString());
});

describe('任务服务', () => {
  it('创建父任务与指定数量的子任务', () => {
    const created = createVideoJob({imageIds: ['img_test_1'], ratio: 'source', durationSec: 5, countPerImage: 1, effectMode: 'basic_only', selectedCategories: [], selectedEffectIds: [], allowDuplicate: false, introDurationSec: .8, intensity: 'medium', enableBreathing: true, resolution: '720p'});
    const job = getJob(created.jobId) as unknown as {totalCount: number; items: unknown[]};
    expect(job.totalCount).toBe(1);
    expect(job.items).toHaveLength(1);
  });

  it('聚合部分失败状态并可重新排队失败项', () => {
    const created = createVideoJob({imageIds: ['img_test_1', 'img_test_2', 'img_test_3'], ratio: 'source', durationSec: 5, countPerImage: 1, effectMode: 'all_random', selectedCategories: [], selectedEffectIds: [], allowDuplicate: false, introDurationSec: 1, intensity: 'strong', enableBreathing: false, resolution: '720p'});
    const db = getDb();
    const rows = db.prepare('SELECT id FROM video_job_items WHERE job_id = ? ORDER BY id').all(created.jobId) as Array<{id: string}>;
    db.prepare("UPDATE video_job_items SET status = 'completed' WHERE id = ?").run(rows[0].id);
    db.prepare("UPDATE video_job_items SET status = 'failed' WHERE id IN (?, ?)").run(rows[1].id, rows[2].id);
    recomputeJob(created.jobId);
    expect((getJob(created.jobId) as {status: string}).status).toBe('partial_failed');
    expect(retryFailedItems(created.jobId)?.retriedCount).toBe(2);
    expect((getJob(created.jobId) as {status: string}).status).toBe('running');
  });
});
