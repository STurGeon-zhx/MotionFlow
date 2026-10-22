export type DownloadMode = 'zip' | 'mp4';

export function getDownloadMode(): DownloadMode {
  return process.env.MOTION_DOWNLOAD_MODE === 'mp4' ? 'mp4' : 'zip';
}
