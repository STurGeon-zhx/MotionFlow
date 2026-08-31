import fs from 'node:fs/promises';
import {errorResponse, ok} from '@/lib/api';
import {getDb} from '@/lib/db';

export const runtime = 'nodejs';

type Context = {params: Promise<{id: string}>};

export async function GET(_request: Request, {params}: Context) {
  const {id} = await params;
  const row = getDb().prepare('SELECT file_path, mime_type FROM images WHERE id = ?').get(id) as {file_path: string; mime_type: string} | undefined;
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
  const used = db.prepare('SELECT COUNT(*) AS count FROM video_job_items WHERE image_id = ?').get(id) as {count: number};
  const row = db.prepare('SELECT file_path FROM images WHERE id = ?').get(id) as {file_path: string} | undefined;
  if (!row) return errorResponse(new Error('图片不存在'), 404);
  db.prepare('DELETE FROM workspace_images WHERE image_id = ?').run(id);
  if (used.count > 0) return ok({deleted: true, retainedForHistory: true});
  db.prepare('DELETE FROM images WHERE id = ?').run(id);
  await fs.rm(row.file_path, {force: true});
  return ok({deleted: true});
}
