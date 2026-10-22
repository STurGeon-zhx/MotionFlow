import fs from 'node:fs';
import fsp from 'node:fs/promises';
import {Readable} from 'node:stream';
import {errorResponse} from '@/lib/api';
import {getClientOwnerId} from '@/lib/client-identity';
import {getCompletedItem} from '@/lib/jobs';
import {getAttachmentDisposition, getVideoDownloadFilename} from '@/lib/download-filename';

export const runtime = 'nodejs';
type Context = {params: Promise<{itemId: string}>};

export async function GET(request: Request, {params}: Context) {
  const {itemId} = await params;
  const item = getCompletedItem(itemId, getClientOwnerId(request));
  if (!item?.output_path) return errorResponse(new Error('视频不存在或尚未生成'), 404);
  try {
    const stat = await fsp.stat(item.output_path);
    const range = request.headers.get('range');
    const download = new URL(request.url).searchParams.get('download') === '1';
    const common = {
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
      ...(download ? {'Content-Disposition': getAttachmentDisposition(getVideoDownloadFilename(item.original_name))} : {}),
    };
    if (range) {
      const match = /bytes=(\d+)-(\d*)/.exec(range);
      if (!match) return new Response(null, {status: 416});
      const start = Number(match[1]);
      const end = match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
      if (start > end || start >= stat.size) return new Response(null, {status: 416});
      const stream = fs.createReadStream(item.output_path, {start, end});
      return new Response(Readable.toWeb(stream) as ReadableStream, {status: 206, headers: {...common, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${stat.size}`}});
    }
    const stream = fs.createReadStream(item.output_path);
    return new Response(Readable.toWeb(stream) as ReadableStream, {headers: {...common, 'Content-Length': String(stat.size)}});
  } catch {
    return errorResponse(new Error('视频文件不存在'), 404);
  }
}
