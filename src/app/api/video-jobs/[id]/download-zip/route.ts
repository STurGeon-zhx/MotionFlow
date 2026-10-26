import {ZipArchive} from 'archiver';
import path from 'node:path';
import {PassThrough, Readable} from 'node:stream';
import {errorResponse} from '@/lib/api';
import {getClientOwnerId} from '@/lib/client-identity';
import {getVideoDownloadFilename} from '@/lib/download-filename';
import {getCompletedItems, getJob} from '@/lib/jobs';

export const runtime = 'nodejs';
type Context = {params: Promise<{id: string}>};

export async function GET(request: Request, {params}: Context) {
  const {id} = await params;
  const ownerId = getClientOwnerId(request);
  if (!getJob(id, ownerId)) return errorResponse(new Error('任务不存在'), 404);
  const selection = new URL(request.url).searchParams.get('items');
  const selectedIds = selection ? new Set(selection.split(',')) : null;
  const items = getCompletedItems(id, ownerId).filter((item) => item.output_path && (!selectedIds || selectedIds.has(item.id)));
  if (items.length === 0) return errorResponse(new Error('当前没有可下载的视频'), 409);
  const pass = new PassThrough();
  const archive = new ZipArchive({zlib: {level: 6}});
  archive.on('error', (error: Error) => pass.destroy(error));
  archive.pipe(pass);
  const filenameCounts = new Map<string, number>();
  items.forEach((item) => {
    const preferredName = getVideoDownloadFilename(item.original_name);
    const filenameKey = preferredName.toLocaleLowerCase();
    const duplicateIndex = (filenameCounts.get(filenameKey) ?? 0) + 1;
    filenameCounts.set(filenameKey, duplicateIndex);
    const parsedName = path.parse(preferredName);
    const archiveName = duplicateIndex === 1 ? preferredName : `${parsedName.name}_${duplicateIndex}${parsedName.ext}`;
    archive.file(item.output_path!, {name: archiveName});
  });
  void archive.finalize();
  return new Response(Readable.toWeb(pass) as ReadableStream, {
    headers: {'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${id}.zip"`},
  });
}
