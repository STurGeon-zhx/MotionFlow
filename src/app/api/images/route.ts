import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {ok, errorResponse} from '@/lib/api';
import {getDb} from '@/lib/db';
import {ensureStorage, extensionForMime, uploadsDir} from '@/lib/storage';
import {MAX_SEQUENCE_IMAGES, MAX_WORKSPACE_IMAGES} from '@/lib/limits';
import type {ToolType} from '@/lib/schema';
import {getClientOwnerId} from '@/lib/client-identity';

export const runtime = 'nodejs';

const accepted = new Set(['image/jpeg', 'image/png', 'image/webp']);
const workspaceTypes = new Set<ToolType>(['single_intro', 'three_image_motion']);

function getWorkspaceType(request?: Request): ToolType {
  const value = request ? new URL(request.url).searchParams.get('workspaceType') : null;
  return workspaceTypes.has(value as ToolType) ? value as ToolType : 'single_intro';
}

export async function GET(request: Request) {
  const workspaceType = getWorkspaceType(request);
  const ownerId = getClientOwnerId(request);
  const rows = getDb().prepare(`SELECT i.id, i.original_name, i.stored_name, i.file_path, i.mime_type, i.width, i.height, i.size_bytes, i.created_at
    FROM workspace_images w JOIN images i ON i.id = w.image_id
    WHERE w.workspace_type = ? AND i.owner_id = ?
    ORDER BY w.position, w.selected_at`).all(workspaceType, ownerId) as Array<{
      id: string; original_name: string; stored_name: string; file_path: string; mime_type: string;
      width: number; height: number; size_bytes: number; created_at: string;
    }>;
  return ok({images: rows.map((row) => ({
    id: row.id, originalName: row.original_name, storedName: row.stored_name, filePath: row.file_path,
    mimeType: row.mime_type, width: row.width, height: row.height, sizeBytes: row.size_bytes,
    createdAt: row.created_at, previewUrl: `/api/images/${row.id}`,
  }))});
}

export async function DELETE(request: Request) {
  const workspaceType = getWorkspaceType(request);
  const ownerId = getClientOwnerId(request);
  const db = getDb();
  const selected = db.prepare(`SELECT i.id, i.file_path,
      (EXISTS(SELECT 1 FROM video_job_items item WHERE item.image_id = i.id)
       OR EXISTS(SELECT 1 FROM video_job_item_images relation WHERE relation.image_id = i.id)) AS used
    FROM workspace_images workspace
    JOIN images i ON i.id = workspace.image_id
    WHERE workspace.workspace_type = ? AND i.owner_id = ?`).all(workspaceType, ownerId) as Array<{id: string; file_path: string; used: number}>;
  const unused = selected.filter((image) => image.used === 0);
  db.transaction(() => {
    if (selected.length > 0) {
      const selectedPlaceholders = selected.map(() => '?').join(',');
      db.prepare(`DELETE FROM workspace_images WHERE workspace_type = ? AND image_id IN (${selectedPlaceholders})`)
        .run(workspaceType, ...selected.map((image) => image.id));
      if (unused.length > 0) {
        const unusedPlaceholders = unused.map(() => '?').join(',');
        db.prepare(`DELETE FROM images WHERE owner_id = ? AND id IN (${unusedPlaceholders})`).run(ownerId, ...unused.map((image) => image.id));
      }
    }
  })();
  await Promise.allSettled(unused.map((image) => fs.rm(image.file_path, {force: true})));
  return ok({clearedCount: selected.length, retainedForHistoryCount: selected.length - unused.length});
}

export async function POST(request: Request) {
  const savedPaths: string[] = [];
  const savedImageIds: string[] = [];
  try {
    ensureStorage();
    const form = await request.formData();
    const workspaceTypeValue = form.get('workspaceType');
    const workspaceType = workspaceTypes.has(workspaceTypeValue as ToolType) ? workspaceTypeValue as ToolType : 'single_intro';
    const ownerId = getClientOwnerId(request);
    if (ownerId === 'unknown') throw new Error('无法识别当前设备，请刷新页面后重试');
    const workspaceLimit = workspaceType === 'three_image_motion' ? MAX_SEQUENCE_IMAGES : MAX_WORKSPACE_IMAGES;
    const files = form.getAll('files').filter((value): value is File => value instanceof File);
    if (files.length === 0) throw new Error('请选择图片');
    if (files.length > workspaceLimit) throw new Error(`单次最多上传 ${workspaceLimit} 张图片`);
    const db = getDb();
    const selectedCount = (db.prepare(`SELECT COUNT(*) AS count FROM workspace_images workspace
      JOIN images image ON image.id = workspace.image_id WHERE workspace.workspace_type = ? AND image.owner_id = ?`)
      .get(workspaceType, ownerId) as {count: number}).count;
    if (selectedCount + files.length > workspaceLimit) throw new Error(`当前工作区最多保留 ${workspaceLimit} 张图片`);
    let nextPosition = (db.prepare(`SELECT COALESCE(MAX(workspace.position), -1) + 1 AS position FROM workspace_images workspace
      JOIN images image ON image.id = workspace.image_id WHERE workspace.workspace_type = ? AND image.owner_id = ?`)
      .get(workspaceType, ownerId) as {position: number}).position;
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
      db.prepare(`INSERT INTO images (id, owner_id, original_name, stored_name, file_path, mime_type, width, height, size_bytes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, ownerId, file.name, storedName, filePath, file.type, metadata.width, metadata.height, file.size, now);
      db.prepare('INSERT INTO workspace_images (image_id, workspace_type, position, selected_at) VALUES (?, ?, ?, ?)').run(id, workspaceType, nextPosition++, now);
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

export async function PATCH(request: Request) {
  try {
    const workspaceType = getWorkspaceType(request);
    const ownerId = getClientOwnerId(request);
    const body = await request.json() as {imageIds?: unknown};
    if (!Array.isArray(body.imageIds) || body.imageIds.some((id) => typeof id !== 'string')) throw new Error('图片顺序无效');
    const imageIds = body.imageIds as string[];
    const db = getDb();
    const current = db.prepare(`SELECT workspace.image_id FROM workspace_images workspace JOIN images image ON image.id = workspace.image_id
      WHERE workspace.workspace_type = ? AND image.owner_id = ? ORDER BY workspace.position`)
      .all(workspaceType, ownerId) as Array<{image_id: string}>;
    if (imageIds.length !== current.length || new Set(imageIds).size !== imageIds.length || current.some((row) => !imageIds.includes(row.image_id))) {
      throw new Error('图片顺序与当前工作区不一致');
    }
    const update = db.prepare(`UPDATE workspace_images SET position = ? WHERE image_id = ? AND workspace_type = ?
      AND image_id IN (SELECT id FROM images WHERE owner_id = ?)`);
    db.transaction(() => imageIds.forEach((id, position) => update.run(position, id, workspaceType, ownerId)))();
    return ok({updatedCount: imageIds.length});
  } catch (error) {
    return errorResponse(error);
  }
}
