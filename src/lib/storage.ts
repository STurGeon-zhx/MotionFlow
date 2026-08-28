import fs from 'node:fs';
import path from 'node:path';

export const dataRoot = path.resolve(/* turbopackIgnore: true */ process.env.MOTION_DATA_DIR ?? '.data');
export const uploadsDir = path.join(dataRoot, 'uploads');
export const outputsDir = path.join(dataRoot, 'outputs');
export const tempDir = path.join(dataRoot, 'temp');
export const binariesDir = path.join(dataRoot, 'binaries');

export function ensureStorage() {
  for (const directory of [dataRoot, uploadsDir, outputsDir, tempDir, binariesDir]) {
    fs.mkdirSync(directory, {recursive: true});
  }
}

export function safeStoredPath(root: string, storedName: string) {
  const resolved = path.resolve(root, storedName);
  if (!resolved.startsWith(`${path.resolve(root)}${path.sep}`)) {
    throw new Error('非法文件路径');
  }
  return resolved;
}

export function extensionForMime(mime: string) {
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  throw new Error('仅支持 JPG、PNG 和 WebP 图片');
}
