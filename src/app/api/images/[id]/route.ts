import fs from 'node:fs/promises';
import {errorResponse, ok} from '@/lib/api';
import {getDb} from '@/lib/db';
import {getClientOwnerId} from '@/lib/client-identity';

export const runtime = 'nodejs';

type Context = {params: Promise<{id: string}>};

export async function GET(request: Request, {params}: Context) {
  const {id} = await params;
  const row = getDb().prepare('SELECT file_path, mime_type FROM images WHERE id = ? AND owner_id = ?')
    .get(id, getClientOwnerId(request)) as {file_path: string; mime_type: string} | undefined;
  if (!row) return errorResponse(new Error('图片不存在'), 404);
  try {
    const file = await fs.readFile(row.file_path);
    return new Response(file, {headers: {'Content-Type': row.mime_type, 'Cache-Control': 'private, max-age=3600'}});
  } catch {
    return errorResponse(new Error('图片文件不存在'), 404);
  }
}

export async function DELETE(_request: Request, {params}: Context) {
  const {id} = await params;
  const db = getDb();
  const ownerId = getClientOwnerId(_request);
  const workspaceTypeValue = new URL(_request.url).searchParams.get('workspaceType');
  const workspaceType = workspaceTypeValue === 'three_image_motion' ? 'three_image_motion' : 'single_intro';
  const selected = db.prepare(`SELECT 1 FROM workspace_images workspace JOIN images image ON image.id = workspace.image_id
    WHERE workspace.image_id = ? AND workspace.workspace_type = ? AND image.owner_id = ?`).get(id, workspaceType, ownerId);
  if (!selected) return errorResponse(new Error('图片不在当前工具的工作区中'), 404);
  const used = db.prepare(`SELECT
    (EXISTS(SELECT 1 FROM video_job_items WHERE image_id = ?)
     OR EXISTS(SELECT 1 FROM video_job_item_images WHERE image_id = ?)) AS used`).get(id, id) as {used: number};
  const row = db.prepare('SELECT file_path FROM images WHERE id = ? AND owner_id = ?').get(id, ownerId) as {file_path: string} | undefined;
  if (!row) return errorResponse(new Error('图片不存在'), 404);
  db.prepare('DELETE FROM workspace_images WHERE image_id = ? AND workspace_type = ?').run(id, workspaceType);
  if (used.used > 0) return ok({deleted: true, retainedForHistory: true});
  db.prepare('DELETE FROM images WHERE id = ? AND owner_id = ?').run(id, ownerId);
  await fs.rm(row.file_path, {force: true});
  return ok({deleted: true});
}
