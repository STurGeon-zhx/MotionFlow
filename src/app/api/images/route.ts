import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {ok, errorResponse} from '@/lib/api';
import {getDb} from '@/lib/db';
import {ensureStorage, extensionForMime, uploadsDir} from '@/lib/storage';
import {MAX_WORKSPACE_IMAGES} from '@/lib/limits';

export const runtime = 'nodejs';

const accepted = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function GET() {
  const rows = getDb().prepare(`SELECT i.id, i.original_name, i.stored_name, i.file_path, i.mime_type, i.width, i.height, i.size_bytes, i.created_at
    FROM workspace_images w JOIN images i ON i.id = w.image_id
    ORDER BY w.position, w.selected_at`).all() as Array<{
      id: string; original_name: string; stored_name: string; file_path: string; mime_type: string;
      width: number; height: number; size_bytes: number; created_at: string;
    }>;
  return ok({images: rows.map((row) => ({
    id: row.id, originalName: row.original_name, storedName: row.stored_name, filePath: row.file_path,
    mimeType: row.mime_type, width: row.width, height: row.height, sizeBytes: row.size_bytes,
    createdAt: row.created_at, previewUrl: `/api/images/${row.id}`,
  }))});
}

export async function POST(request: Request) {
  const savedPaths: string[] = [];
  const savedImageIds: string[] = [];
  try {
    ensureStorage();
    const form = await request.formData();
    const files = form.getAll('files').filter((value): value is File => value instanceof File);
    if (files.length === 0) throw new Error('请选择图片');
    if (files.length > MAX_WORKSPACE_IMAGES) throw new Error(`单次最多上传 ${MAX_WORKSPACE_IMAGES} 张图片`);
    const db = getDb();
    const selectedCount = (db.prepare('SELECT COUNT(*) AS count FROM workspace_images').get() as {count: number}).count;
    if (selectedCount + files.length > MAX_WORKSPACE_IMAGES) throw new Error(`当前工作区最多保留 ${MAX_WORKSPACE_IMAGES} 张图片`);
    let nextPosition = (db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS position FROM workspace_images').get() as {position: number}).position;
    const now = new Date().toISOString();
    const rows = [];
    for (const file of files) {
      if (!accepted.has(file.type)) throw new Error(`${file.name} 不是支持的图片格式`);
      if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name} 超过 20MB`);
      const buffer = Buffer.from(await file.arrayBuffer());
      const metadata = await sharp(buffer).metadata();
      if (!metadata.width || !metadata.height) throw new Error(`${file.name} 无法读取`);
      const id = `img_${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`;
      const storedName = `${id}${extensionForMime(file.type)}`;
      const filePath = path.join(uploadsDir, storedName);
      await fs.writeFile(filePath, buffer, {flag: 'wx'});
      savedPaths.push(filePath);
      const row = {id, originalName: file.name, storedName, filePath, mimeType: file.type, width: metadata.width, height: metadata.height, sizeBytes: file.size, createdAt: now};
      db.prepare(`INSERT INTO images (id, original_name, stored_name, file_path, mime_type, width, height, size_bytes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, file.name, storedName, filePath, file.type, metadata.width, metadata.height, file.size, now);
      db.prepare('INSERT INTO workspace_images (image_id, position, selected_at) VALUES (?, ?, ?)').run(id, nextPosition++, now);
      savedImageIds.push(id);
      rows.push({...row, previewUrl: `/api/images/${id}`});
    }
    return ok({images: rows});
  } catch (error) {
    await Promise.all(savedPaths.map((filePath) => fs.rm(filePath, {force: true})));
    if (savedImageIds.length > 0) {
      const placeholders = savedImageIds.map(() => '?').join(',');
      getDb().prepare(`DELETE FROM images WHERE id IN (${placeholders})`).run(...savedImageIds);
    }
    return errorResponse(error);
  }
}
