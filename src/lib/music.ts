import fs from 'node:fs';
import path from 'node:path';

const supportedMusicExtensions = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg']);

export type MusicTrack = {
  name: string;
  filePath: string;
};

export const musicDir = path.resolve(/* turbopackIgnore: true */ process.env.MOTION_MUSIC_DIR ?? path.join(process.cwd(), 'assets', 'music'));

export function listMusicTracks(): MusicTrack[] {
  if (!fs.existsSync(/* turbopackIgnore: true */ musicDir)) return [];
  return fs.readdirSync(/* turbopackIgnore: true */ musicDir, {withFileTypes: true})
    .filter((entry) => entry.isFile() && supportedMusicExtensions.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => ({name: path.parse(entry.name).name, filePath: path.join(/* turbopackIgnore: true */ musicDir, entry.name)}))
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN', {numeric: true, sensitivity: 'base'}));
}

export function getMusicTrackForIndex(index: number, tracks = listMusicTracks()) {
  if (tracks.length === 0) return null;
  return tracks[index % tracks.length];
}

export function getMusicMimeType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.mp3') return 'audio/mpeg';
  if (extension === '.wav') return 'audio/wav';
  if (extension === '.m4a') return 'audio/mp4';
  if (extension === '.aac') return 'audio/aac';
  if (extension === '.ogg') return 'audio/ogg';
  throw new Error(`不支持的音乐格式：${extension || '未知格式'}`);
}
