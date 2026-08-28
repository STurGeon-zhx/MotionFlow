import {ZipArchive} from 'archiver';
import path from 'node:path';
import {PassThrough, Readable} from 'node:stream';
import {errorResponse} from '@/lib/api';
import {getCompletedItems, getJob} from '@/lib/jobs';

export const runtime = 'nodejs';
type Context = {params: Promise<{id: string}>};

export async function GET(_request: Request, {params}: Context) {
  const {id} = await params;
  if (!getJob(id)) return errorResponse(new Error('任务不存在'), 404);
  const items = getCompletedItems(id).filter((item) => item.output_path);
  if (items.length === 0) return errorResponse(new Error('当前没有可下载的视频'), 409);
  const pass = new PassThrough();
  const archive = new ZipArchive({zlib: {level: 6}});
  archive.on('error', (error: Error) => pass.destroy(error));
  archive.pipe(pass);
  items.forEach((item, index) => {
    archive.file(item.output_path!, {name: `${String(index + 1).padStart(2, '0')}_${item.effect_id}_${path.basename(item.output_path!)}.mp4`.replace('.mp4.mp4', '.mp4')});
  });
  void archive.finalize();
  return new Response(Readable.toWeb(pass) as ReadableStream, {
    headers: {'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${id}.zip"`},
  });
}
