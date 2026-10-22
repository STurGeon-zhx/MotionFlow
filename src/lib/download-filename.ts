import path from 'node:path';

export function getVideoDownloadFilename(originalName: string) {
  const sourceName = path.basename(originalName.trim());
  const stem = path.parse(sourceName).name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim();
  return `${stem || 'video'}.mp4`;
}

export function getAttachmentDisposition(filename: string) {
  const fallback = filename
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(filename).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
