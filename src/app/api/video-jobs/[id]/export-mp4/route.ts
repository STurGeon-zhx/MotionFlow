import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {errorResponse, ok} from '@/lib/api';
import {getClientOwnerId} from '@/lib/client-identity';
import {getVideoDownloadFilename} from '@/lib/download-filename';
import {getCompletedItems, getJob} from '@/lib/jobs';
import {getDownloadMode} from '@/lib/package-mode';

export const runtime = 'nodejs';
type Context = {params: Promise<{id: string}>};

export async function POST(request: Request, {params}: Context) {
  try {
    if (getDownloadMode() !== 'mp4') return errorResponse(new Error('当前版本未启用本机 MP4 导出'), 403);
    const {id} = await params;
    const ownerId = getClientOwnerId(request);
    if (!getJob(id, ownerId)) return errorResponse(new Error('任务不存在'), 404);
    const items = getCompletedItems(id, ownerId).filter((item) => item.output_path);
    if (items.length === 0) return errorResponse(new Error('当前没有可下载的视频'), 409);

    const exportRoot = path.resolve(/* turbopackIgnore: true */ process.env.MOTION_EXPORT_DIR ?? path.join(os.homedir(), 'Downloads', 'MotionFlow'));
    const exportDirectory = path.join(exportRoot, id);
    await fs.mkdir(exportDirectory, {recursive: true});
    const filenameCounts = new Map<string, number>();

    for (const item of items) {
      const preferredName = getVideoDownloadFilename(item.original_name);
      const filenameKey = preferredName.toLocaleLowerCase();
      const duplicateIndex = (filenameCounts.get(filenameKey) ?? 0) + 1;
      filenameCounts.set(filenameKey, duplicateIndex);
      const parsedName = path.parse(preferredName);
      const filename = duplicateIndex === 1 ? preferredName : `${parsedName.name}_${duplicateIndex}${parsedName.ext}`;
      await fs.copyFile(item.output_path!, path.join(exportDirectory, filename));
    }

    return ok({count: items.length, folder: exportDirectory});
  } catch (error) {
    return errorResponse(error);
  }
}
