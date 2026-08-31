import fs from 'node:fs';
import path from 'node:path';
import {beforeEach, describe, expect, it} from 'vitest';
import {getDb} from '@/lib/db';
import {createVideoJob, getCompletedItem, getJob, listJobs, recomputeJob, retryFailedItem, retryFailedItems} from '@/lib/jobs';
import {ensureStorage, uploadsDir} from '@/lib/storage';
import {GET as listWorkspaceImages} from '@/app/api/images/route';
import {DELETE as removeWorkspaceImage} from '@/app/api/images/[id]/route';
import {createJobSchema} from '@/lib/schema';

const ownerA = '192.168.1.21';
const ownerB = '192.168.1.22';

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
  it('允许单个任务包含 100 张图片并拒绝第 101 张', () => {
    const input = {imageIds: Array.from({length: 100}, (_, index) => `img_${index}`), ratio: 'source', durationSec: 5, countPerImage: 1, effectMode: 'basic_only', selectedCategories: [], selectedEffectIds: [], allowDuplicate: false, introDurationSec: 1.2, intensity: 'medium', enableBreathing: true, resolution: '720p'};
    expect(createJobSchema.safeParse(input).success).toBe(true);
    expect(createJobSchema.safeParse({...input, imageIds: [...input.imageIds, 'img_100']}).success).toBe(false);
  });

  it('创建父任务与指定数量的子任务', () => {
    const created = createVideoJob({imageIds: ['img_test_1'], ratio: 'source', durationSec: 5, countPerImage: 1, effectMode: 'basic_only', selectedCategories: [], selectedEffectIds: [], allowDuplicate: false, introDurationSec: .8, intensity: 'medium', enableBreathing: true, resolution: '720p'}, ownerA);
    const job = getJob(created.jobId, ownerA) as unknown as {totalCount: number; items: unknown[]};
    expect(job.totalCount).toBe(1);
    expect(job.items).toHaveLength(1);
  });

  it('聚合部分失败状态并可重新排队失败项', () => {
    const created = createVideoJob({imageIds: ['img_test_1', 'img_test_2', 'img_test_3'], ratio: 'source', durationSec: 5, countPerImage: 1, effectMode: 'all_random', selectedCategories: [], selectedEffectIds: [], allowDuplicate: false, introDurationSec: 1, intensity: 'strong', enableBreathing: false, resolution: '720p'}, ownerA);
    const db = getDb();
    const rows = db.prepare('SELECT id FROM video_job_items WHERE job_id = ? ORDER BY id').all(created.jobId) as Array<{id: string}>;
    db.prepare("UPDATE video_job_items SET status = 'completed' WHERE id = ?").run(rows[0].id);
    db.prepare("UPDATE video_job_items SET status = 'failed' WHERE id IN (?, ?)").run(rows[1].id, rows[2].id);
    recomputeJob(created.jobId);
    expect((getJob(created.jobId, ownerA) as {status: string}).status).toBe('partial_failed');
    expect(retryFailedItems(created.jobId, ownerA)?.retriedCount).toBe(2);
    expect((getJob(created.jobId, ownerA) as {status: string}).status).toBe('running');
  });

  it('可以只重新排队一个失败视频', () => {
    const created = createVideoJob({imageIds: ['img_test_1', 'img_test_2'], ratio: 'source', durationSec: 5, countPerImage: 1, effectMode: 'all_random', selectedCategories: [], selectedEffectIds: [], allowDuplicate: false, introDurationSec: .8, intensity: 'medium', enableBreathing: true, resolution: '720p'}, ownerA);
    const db = getDb();
    const rows = db.prepare('SELECT id FROM video_job_items WHERE job_id = ? ORDER BY id').all(created.jobId) as Array<{id: string}>;
    db.prepare("UPDATE video_job_items SET status = 'failed', error_message = '临时错误' WHERE id IN (?, ?)").run(rows[0].id, rows[1].id);
    recomputeJob(created.jobId);
    expect(retryFailedItem(rows[0].id, ownerA)).toEqual({jobId: created.jobId, retried: true});
    const statuses = db.prepare('SELECT id, status FROM video_job_items WHERE job_id = ? ORDER BY id').all(created.jobId) as Array<{id: string; status: string}>;
    expect(statuses.find((item) => item.id === rows[0].id)?.status).toBe('waiting');
    expect(statuses.find((item) => item.id === rows[1].id)?.status).toBe('failed');
  });

  it('持久化工作区图片并在历史任务使用后安全取消选择', async () => {
    const db = getDb();
    db.prepare('INSERT INTO workspace_images (image_id, position, selected_at) VALUES (?, 0, ?)').run('img_test_1', new Date().toISOString());
    const listResponse = await listWorkspaceImages();
    const listBody = await listResponse.json() as {images: Array<{id: string}>};
    expect(listBody.images.map((image) => image.id)).toEqual(['img_test_1']);

    createVideoJob({imageIds: ['img_test_1'], ratio: 'source', durationSec: 5, countPerImage: 1, effectMode: 'basic_only', selectedCategories: [], selectedEffectIds: [], allowDuplicate: false, introDurationSec: 1.2, intensity: 'medium', enableBreathing: true, resolution: '720p'}, ownerA);
    const deleteResponse = await removeWorkspaceImage(new Request('http://localhost/api/images/img_test_1', {method: 'DELETE'}), {params: Promise.resolve({id: 'img_test_1'})});
    const deleteBody = await deleteResponse.json() as {retainedForHistory: boolean};
    expect(deleteBody.retainedForHistory).toBe(true);
    expect(db.prepare('SELECT id FROM images WHERE id = ?').get('img_test_1')).toBeTruthy();
    expect(db.prepare('SELECT image_id FROM workspace_images WHERE image_id = ?').get('img_test_1')).toBeUndefined();
  });

  it('按客户端 IP 隔离任务列表、详情、重试和视频访问', () => {
    const ownJob = createVideoJob({imageIds: ['img_test_1'], ratio: 'source', durationSec: 5, countPerImage: 1, effectMode: 'basic_only', selectedCategories: [], selectedEffectIds: [], allowDuplicate: false, introDurationSec: 1.2, intensity: 'medium', enableBreathing: true, resolution: '720p'}, ownerA);
    const otherJob = createVideoJob({imageIds: ['img_test_2'], ratio: 'source', durationSec: 5, countPerImage: 1, effectMode: 'basic_only', selectedCategories: [], selectedEffectIds: [], allowDuplicate: false, introDurationSec: 1.2, intensity: 'medium', enableBreathing: true, resolution: '720p'}, ownerB);
    const db = getDb();
    const otherItem = db.prepare('SELECT id FROM video_job_items WHERE job_id = ?').get(otherJob.jobId) as {id: string};
    db.prepare("UPDATE video_job_items SET status = 'completed', output_path = 'other.mp4' WHERE id = ?").run(otherItem.id);

    expect(listJobs(ownerA).jobs.map((job) => job.id)).toEqual([ownJob.jobId]);
    expect(listJobs(ownerB).jobs.map((job) => job.id)).toEqual([otherJob.jobId]);
    expect(getJob(otherJob.jobId, ownerA)).toBeNull();
    expect(retryFailedItems(otherJob.jobId, ownerA)).toBeNull();
    expect(retryFailedItem(otherItem.id, ownerA)).toBeNull();
    expect(getCompletedItem(otherItem.id, ownerA)).toBeUndefined();
    expect(getCompletedItem(otherItem.id, ownerB)?.id).toBe(otherItem.id);
  });
});
