import fs from 'node:fs';
import path from 'node:path';
import {beforeEach, describe, expect, it} from 'vitest';
import {getDb} from '@/lib/db';
import {claimNextItem, createVideoJob, deleteVideoJob, getCompletedItem, getJob, listJobs, recomputeJob, retryFailedItem, retryFailedItems} from '@/lib/jobs';
import {ensureStorage, outputsDir, uploadsDir} from '@/lib/storage';
import {DELETE as clearWorkspaceImages, GET as listWorkspaceImages, PATCH as reorderWorkspaceImages} from '@/app/api/images/route';
import {DELETE as removeWorkspaceImage} from '@/app/api/images/[id]/route';
import {createJobSchema} from '@/lib/schema';

const ownerA = `device_${'a'.repeat(32)}`;
const ownerB = `device_${'b'.repeat(32)}`;

function deviceRequest(url: string, init: RequestInit = {}, ownerId = ownerA) {
  const headers = new Headers(init.headers);
  headers.set('x-motion-device-id', ownerId);
  return new Request(url, {...init, headers});
}

beforeEach(() => {
  const db = getDb();
  db.exec('DELETE FROM video_job_items; DELETE FROM video_jobs; DELETE FROM images;');
  ensureStorage();
  const filePath = path.join(uploadsDir, 'test.jpg');
  fs.writeFileSync(filePath, Buffer.from('test'));
  const insert = db.prepare(`INSERT INTO images (id, owner_id, original_name, stored_name, file_path, mime_type, width, height, size_bytes, created_at)
    VALUES (?, ?, 'test.jpg', ?, ?, 'image/jpeg', 1920, 1080, 4, ?)`);
  for (let index = 1; index <= 6; index++) insert.run(`img_test_${index}`, ownerA, `test_${index}.jpg`, filePath, new Date().toISOString());
});

describe('任务服务', () => {
  it('允许单个任务包含 100 张图片并拒绝第 101 张', () => {
    const input = {imageIds: Array.from({length: 100}, (_, index) => `img_${index}`), ratio: 'source', durationSec: 5, countPerImage: 1, effectMode: 'basic_only', selectedCategories: [], selectedEffectIds: [], allowDuplicate: false, introDurationSec: 1.2, intensity: 'medium', enableBreathing: true, resolution: '720p'};
    expect(createJobSchema.safeParse(input).success).toBe(true);
    expect(createJobSchema.safeParse({...input, imageIds: [...input.imageIds, 'img_100']}).success).toBe(false);
  });

  it('创建父任务与指定数量的子任务', () => {
    const created = createVideoJob({imageIds: ['img_test_1'], ratio: 'source', durationSec: 5, countPerImage: 1, effectMode: 'basic_only', selectedCategories: [], selectedEffectIds: [], allowDuplicate: false, introDurationSec: .8, intensity: 'medium', enableBreathing: true, resolution: '720p'}, ownerA);
    const job = getJob(created.jobId, ownerA) as unknown as {totalCount: number; items: Array<{musicName: string | null}>};
    expect(job.totalCount).toBe(1);
    expect(job.items).toHaveLength(1);
    expect(job.items[0].musicName).toBeTruthy();
  });

  it('连续领取两个等待任务时不会领取到同一子任务', () => {
    createVideoJob({imageIds: ['img_test_1', 'img_test_2'], ratio: 'source', durationSec: 5, countPerImage: 1, effectMode: 'basic_only', selectedCategories: [], selectedEffectIds: [], allowDuplicate: false, introDurationSec: 1.2, intensity: 'medium', enableBreathing: true, resolution: '720p'}, ownerA);
    const first = claimNextItem();
    const second = claimNextItem();
    expect(first?.id).toBeTruthy();
    expect(second?.id).toBeTruthy();
    expect(second?.id).not.toBe(first?.id);
  });

  it('已有三图任务渲染时可以跳过下一条三图并领取后续单图任务', () => {
    const sequenceJob = createVideoJob({
      toolType: 'three_image_motion', imageIds: ['img_test_1', 'img_test_2', 'img_test_3'], ratio: 'source', durationSec: 15,
      secondsPerImage: 5, transition: 'cut', motionPath: 'smooth_loop', edgeMode: 'auto_zoom', motionSpeed: .8,
      motionAmplitude: .025, enableMusic: false, resolution: '720p',
    }, ownerA);
    getDb().prepare("UPDATE video_job_items SET created_at = '2000-01-01T00:00:00.000Z' WHERE job_id = ?").run(sequenceJob.jobId);
    createVideoJob({imageIds: ['img_test_4'], ratio: 'source', durationSec: 5, countPerImage: 1, effectMode: 'basic_only', selectedCategories: [], selectedEffectIds: [], allowDuplicate: false, introDurationSec: 1.2, intensity: 'medium', enableBreathing: true, resolution: '720p'}, ownerA);
    const sequence = claimNextItem();
    const single = claimNextItem({allowThreeImageMotion: false});
    expect(sequence?.toolType).toBe('three_image_motion');
    expect(single?.toolType).toBe('single_intro');
  });

  it('三张生成一条、六张生成两条，并保存每组三张的顺序', () => {
    const input = (imageIds: string[]) => ({
      toolType: 'three_image_motion' as const, imageIds, ratio: 'source' as const, durationSec: 15 as const,
      secondsPerImage: 5 as const, transition: 'cut' as const, motionPath: 'smooth_loop' as const,
      edgeMode: 'auto_zoom' as const, motionSpeed: .8, motionAmplitude: .025, enableMusic: false,
      resolution: '720p' as const,
    });
    const one = createVideoJob(input(['img_test_1', 'img_test_2', 'img_test_3']), ownerA);
    expect(one.totalCount).toBe(1);
    const two = createVideoJob(input(['img_test_6', 'img_test_5', 'img_test_4', 'img_test_3', 'img_test_2', 'img_test_1']), ownerA);
    const job = getJob(two.jobId, ownerA) as unknown as {toolType: string; totalCount: number; imageCount: number; items: Array<{imageIds: string[]}>};
    expect(job).toMatchObject({toolType: 'three_image_motion', totalCount: 2, imageCount: 6});
    expect(job.items.map((item) => item.imageIds)).toEqual([
      ['img_test_6', 'img_test_5', 'img_test_4'],
      ['img_test_3', 'img_test_2', 'img_test_1'],
    ]);
  });

  it('拒绝非三倍数、超过 99 张及越界运动参数', () => {
    const base = {
      toolType: 'three_image_motion', ratio: 'source', durationSec: 15, secondsPerImage: 5, transition: 'cut',
      motionPath: 'smooth_loop', edgeMode: 'auto_zoom', motionSpeed: .8, motionAmplitude: .025,
      enableMusic: true, resolution: '1080p',
    };
    expect(createJobSchema.safeParse({...base, imageIds: ['a', 'b', 'c']}).success).toBe(true);
    expect(createJobSchema.safeParse({...base, imageIds: ['a', 'b', 'c', 'd']}).success).toBe(false);
    expect(createJobSchema.safeParse({...base, imageIds: Array.from({length: 102}, (_, index) => `img_${index}`)}).success).toBe(false);
    expect(createJobSchema.safeParse({...base, imageIds: ['a', 'b', 'c'], motionSpeed: .3}).success).toBe(true);
    expect(createJobSchema.safeParse({...base, imageIds: ['a', 'b', 'c'], motionSpeed: .2}).success).toBe(false);
    expect(createJobSchema.safeParse({...base, imageIds: ['a', 'b', 'c'], motionAmplitude: .15}).success).toBe(true);
    expect(createJobSchema.safeParse({...base, imageIds: ['a', 'b', 'c'], motionAmplitude: .155}).success).toBe(false);
  });

  it('两种工具的图片草稿互相隔离并持久化拖拽顺序', async () => {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare("INSERT INTO workspace_images (image_id, workspace_type, position, selected_at) VALUES (?, 'single_intro', 0, ?)").run('img_test_1', now);
    const addSequence = db.prepare("INSERT INTO workspace_images (image_id, workspace_type, position, selected_at) VALUES (?, 'three_image_motion', ?, ?)");
    addSequence.run('img_test_2', 0, now);
    addSequence.run('img_test_3', 1, now);
    addSequence.run('img_test_4', 2, now);

    const single = await (await listWorkspaceImages(deviceRequest('http://localhost/api/images'))).json() as {images: Array<{id: string}>};
    const sequenceRequest = deviceRequest('http://localhost/api/images?workspaceType=three_image_motion');
    const sequence = await (await listWorkspaceImages(sequenceRequest)).json() as {images: Array<{id: string}>};
    expect(single.images.map((image) => image.id)).toEqual(['img_test_1']);
    expect(sequence.images.map((image) => image.id)).toEqual(['img_test_2', 'img_test_3', 'img_test_4']);
    const otherDevice = await (await listWorkspaceImages(deviceRequest('http://localhost/api/images', {}, ownerB))).json() as {images: Array<{id: string}>};
    expect(otherDevice.images).toEqual([]);

    await reorderWorkspaceImages(deviceRequest('http://localhost/api/images?workspaceType=three_image_motion', {
      method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({imageIds: ['img_test_4', 'img_test_2', 'img_test_3']}),
    }));
    const reordered = await (await listWorkspaceImages(sequenceRequest)).json() as {images: Array<{id: string}>};
    expect(reordered.images.map((image) => image.id)).toEqual(['img_test_4', 'img_test_2', 'img_test_3']);
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
    const listResponse = await listWorkspaceImages(deviceRequest('http://localhost/api/images'));
    const listBody = await listResponse.json() as {images: Array<{id: string}>};
    expect(listBody.images.map((image) => image.id)).toEqual(['img_test_1']);

    createVideoJob({imageIds: ['img_test_1'], ratio: 'source', durationSec: 5, countPerImage: 1, effectMode: 'basic_only', selectedCategories: [], selectedEffectIds: [], allowDuplicate: false, introDurationSec: 1.2, intensity: 'medium', enableBreathing: true, resolution: '720p'}, ownerA);
    const deleteResponse = await removeWorkspaceImage(deviceRequest('http://localhost/api/images/img_test_1', {method: 'DELETE'}), {params: Promise.resolve({id: 'img_test_1'})});
    const deleteBody = await deleteResponse.json() as {retainedForHistory: boolean};
    expect(deleteBody.retainedForHistory).toBe(true);
    expect(db.prepare('SELECT id FROM images WHERE id = ?').get('img_test_1')).toBeTruthy();
    expect(db.prepare('SELECT image_id FROM workspace_images WHERE image_id = ?').get('img_test_1')).toBeUndefined();
  });

  it('创建新任务时清空工作区并保留历史任务使用的图片', async () => {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare('INSERT INTO workspace_images (image_id, position, selected_at) VALUES (?, ?, ?)').run('img_test_1', 0, now);
    db.prepare('INSERT INTO workspace_images (image_id, position, selected_at) VALUES (?, ?, ?)').run('img_test_2', 1, now);
    createVideoJob({imageIds: ['img_test_1'], ratio: 'source', durationSec: 5, countPerImage: 1, effectMode: 'basic_only', selectedCategories: [], selectedEffectIds: [], allowDuplicate: false, introDurationSec: 1.2, intensity: 'medium', enableBreathing: true, resolution: '720p'}, ownerA);

    const response = await clearWorkspaceImages(deviceRequest('http://localhost/api/images', {method: 'DELETE'}));
    const body = await response.json() as {clearedCount: number; retainedForHistoryCount: number};
    expect(body).toMatchObject({clearedCount: 2, retainedForHistoryCount: 1});
    expect(db.prepare('SELECT COUNT(*) AS count FROM workspace_images').get()).toEqual({count: 0});
    expect(db.prepare('SELECT id FROM images WHERE id = ?').get('img_test_1')).toBeTruthy();
    expect(db.prepare('SELECT id FROM images WHERE id = ?').get('img_test_2')).toBeUndefined();
  });

  it('三图历史任务使用的关联图片只取消选择，不删除源文件', async () => {
    const db = getDb();
    const now = new Date().toISOString();
    for (let index = 1; index <= 3; index++) {
      db.prepare("INSERT INTO workspace_images (image_id, workspace_type, position, selected_at) VALUES (?, 'three_image_motion', ?, ?)")
        .run(`img_test_${index}`, index - 1, now);
    }
    createVideoJob({
      toolType: 'three_image_motion', imageIds: ['img_test_1', 'img_test_2', 'img_test_3'], ratio: 'source', durationSec: 15,
      secondsPerImage: 5, transition: 'cut', motionPath: 'smooth_loop', edgeMode: 'auto_zoom', motionSpeed: .8,
      motionAmplitude: .025, enableMusic: false, resolution: '720p',
    }, ownerA);
    const response = await removeWorkspaceImage(deviceRequest('http://localhost/api/images/img_test_2?workspaceType=three_image_motion', {method: 'DELETE'}), {params: Promise.resolve({id: 'img_test_2'})});
    const body = await response.json() as {retainedForHistory: boolean};
    expect(body.retainedForHistory).toBe(true);
    expect(db.prepare('SELECT id FROM images WHERE id = ?').get('img_test_2')).toBeTruthy();
    expect(db.prepare('SELECT image_id FROM workspace_images WHERE image_id = ?').get('img_test_2')).toBeUndefined();
  });

  it('按设备 ID 隔离任务列表、详情、重试和视频访问', () => {
    const ownJob = createVideoJob({imageIds: ['img_test_1'], ratio: 'source', durationSec: 5, countPerImage: 1, effectMode: 'basic_only', selectedCategories: [], selectedEffectIds: [], allowDuplicate: false, introDurationSec: 1.2, intensity: 'medium', enableBreathing: true, resolution: '720p'}, ownerA);
    getDb().prepare('UPDATE images SET owner_id = ? WHERE id = ?').run(ownerB, 'img_test_2');
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

  it('不能使用其他设备上传的图片创建任务', () => {
    getDb().prepare('UPDATE images SET owner_id = ? WHERE id = ?').run(ownerB, 'img_test_1');
    expect(() => createVideoJob({imageIds: ['img_test_1'], ratio: 'source', durationSec: 5, countPerImage: 1, effectMode: 'basic_only', selectedCategories: [], selectedEffectIds: [], allowDuplicate: false, introDurationSec: 1.2, intensity: 'medium', enableBreathing: true, resolution: '720p'}, ownerA))
      .toThrow('不属于当前设备');
  });

  it('只能删除自己的已结束任务，并同步删除成品文件和子任务', async () => {
    const created = createVideoJob({imageIds: ['img_test_1'], ratio: 'source', durationSec: 5, countPerImage: 1, effectMode: 'basic_only', selectedCategories: [], selectedEffectIds: [], allowDuplicate: false, introDurationSec: 1.2, intensity: 'medium', enableBreathing: true, resolution: '720p'}, ownerA);
    const db = getDb();
    const item = db.prepare('SELECT id FROM video_job_items WHERE job_id = ?').get(created.jobId) as {id: string};
    const outputPath = path.join(outputsDir, `${item.id}.mp4`);
    fs.writeFileSync(outputPath, Buffer.from('video'));
    db.prepare("UPDATE video_job_items SET status = 'completed', progress = 1, output_path = ? WHERE id = ?").run(outputPath, item.id);
    recomputeJob(created.jobId);

    expect(await deleteVideoJob(created.jobId, ownerB)).toBeNull();
    expect(fs.existsSync(outputPath)).toBe(true);
    expect(await deleteVideoJob(created.jobId, ownerA)).toEqual({deleted: true});
    expect(fs.existsSync(outputPath)).toBe(false);
    expect(db.prepare('SELECT id FROM video_jobs WHERE id = ?').get(created.jobId)).toBeUndefined();
    expect(db.prepare('SELECT id FROM video_job_items WHERE id = ?').get(item.id)).toBeUndefined();
  });

  it('排队或生成中的任务不能删除', async () => {
    const created = createVideoJob({imageIds: ['img_test_1'], ratio: 'source', durationSec: 5, countPerImage: 1, effectMode: 'basic_only', selectedCategories: [], selectedEffectIds: [], allowDuplicate: false, introDurationSec: 1.2, intensity: 'medium', enableBreathing: true, resolution: '720p'}, ownerA);
    expect(await deleteVideoJob(created.jobId, ownerA)).toEqual({deleted: false, reason: 'active'});
    expect(getJob(created.jobId, ownerA)).toBeTruthy();
  });
});
