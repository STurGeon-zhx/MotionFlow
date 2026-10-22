'use client';

import {useEffect, useState} from 'react';
import {Download, FolderOpen, LoaderCircle} from 'lucide-react';
import type {DownloadMode} from '@/lib/package-mode';

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: {mode?: 'readwrite'}) => Promise<FileSystemDirectoryHandle>;
  motionFlowDesktop?: {
    selectDownloadDirectory: () => Promise<{path: string; name: string} | null>;
    saveDownloadFile: (input: {directoryPath: string; url: string; filename: string}) => Promise<{filename: string}>;
  };
};
type DownloadItem = {downloadUrl: string | null; downloadFilename: string | null};
type SelectedDirectory = {
  name: string;
  nativePath?: string;
  browserHandle?: FileSystemDirectoryHandle;
};

let modeRequest: Promise<DownloadMode> | null = null;

function loadDownloadMode() {
  modeRequest ??= fetch('/api/runtime-config', {cache: 'no-store'})
    .then(async (response) => {
      const data = await response.json() as {success?: boolean; downloadMode?: DownloadMode};
      return response.ok && data.success && data.downloadMode === 'mp4' ? 'mp4' : 'zip';
    })
    .catch(() => 'zip' as const);
  return modeRequest;
}

function getUniqueFilename(filename: string, counts: Map<string, number>) {
  const key = filename.toLocaleLowerCase();
  const duplicateIndex = (counts.get(key) ?? 0) + 1;
  counts.set(key, duplicateIndex);
  if (duplicateIndex === 1) return filename;
  const extensionIndex = filename.toLocaleLowerCase().lastIndexOf('.mp4');
  const stem = extensionIndex > 0 ? filename.slice(0, extensionIndex) : filename;
  return `${stem}_${duplicateIndex}.mp4`;
}

export function BulkDownloadButton({jobId, count, compact = false}: {jobId: string; count: number; compact?: boolean}) {
  const [mode, setMode] = useState<DownloadMode | null>(null);
  const [directory, setDirectory] = useState<SelectedDirectory | null>(null);
  const [exporting, setExporting] = useState(false);
  const [completed, setCompleted] = useState(0);

  useEffect(() => {
    void loadDownloadMode().then(setMode);
  }, []);

  async function chooseDirectory(): Promise<SelectedDirectory | null> {
    const desktop = (window as DirectoryPickerWindow).motionFlowDesktop;
    if (desktop) {
      const selected = await desktop.selectDownloadDirectory();
      if (!selected) return null;
      const directory: SelectedDirectory = {name: selected.name, nativePath: selected.path};
      setDirectory(directory);
      return directory;
    }
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (!picker) throw new Error('当前环境不支持选择文件夹，请使用最新的桌面版');
    const selected = await picker({mode: 'readwrite'});
    const directory: SelectedDirectory = {name: selected.name, browserHandle: selected};
    setDirectory(directory);
    return directory;
  }

  async function exportMp4(preselectedDirectory?: SelectedDirectory | null) {
    setExporting(true);
    setCompleted(0);
    try {
      const targetDirectory = preselectedDirectory ?? directory ?? await chooseDirectory();
      if (!targetDirectory) return;
      const response = await fetch(`/api/video-jobs/${jobId}`, {cache: 'no-store'});
      const data = await response.json() as {success?: boolean; error?: string; job?: {items: DownloadItem[]}};
      if (!response.ok || !data.success || !data.job) throw new Error(data.error ?? '读取任务失败');
      const items = data.job.items.filter((item) => item.downloadUrl && item.downloadFilename);
      const filenameCounts = new Map<string, number>();

      for (let index = 0; index < items.length; index++) {
        const item = items[index];
        const filename = getUniqueFilename(item.downloadFilename!, filenameCounts);
        const desktop = (window as DirectoryPickerWindow).motionFlowDesktop;
        if (targetDirectory.nativePath && desktop) {
          await desktop.saveDownloadFile({directoryPath: targetDirectory.nativePath, url: item.downloadUrl!, filename});
        } else if (targetDirectory.browserHandle) {
          const videoResponse = await fetch(item.downloadUrl!);
          if (!videoResponse.ok) throw new Error(`第 ${index + 1} 条视频读取失败`);
          const fileHandle = await targetDirectory.browserHandle.getFileHandle(filename, {create: true});
          const writable = await fileHandle.createWritable();
          await writable.write(await videoResponse.blob());
          await writable.close();
        } else {
          throw new Error('下载位置不可用，请重新选择');
        }
        setCompleted(index + 1);
      }
      window.alert(`已将 ${items.length} 条 MP4 保存到“${targetDirectory.name}”文件夹`);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      window.alert(error instanceof Error ? error.message : '导出失败');
    } finally {
      setExporting(false);
    }
  }

  if (mode === null) {
    return compact
      ? <button disabled title="正在准备下载"><LoaderCircle className="spin" size={16} /></button>
      : <button className="primary-action one-click-download" disabled><LoaderCircle className="spin" size={17} />正在准备下载…</button>;
  }

  if (mode === 'zip') {
    return compact
      ? <a href={`/api/video-jobs/${jobId}/download-zip`} title="下载全部成片 ZIP" aria-label="下载全部成片 ZIP"><Download size={16} /></a>
      : <a className="primary-action one-click-download" href={`/api/video-jobs/${jobId}/download-zip`}><Download size={17} />下载全部 {count} 条（ZIP）</a>;
  }

  if (compact) {
    return <button disabled={exporting} onClick={() => void exportMp4()} title="选择位置并导出全部 MP4" aria-label="选择位置并导出全部 MP4">{exporting ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}</button>;
  }

  return <div className="bulk-download-controls">
    <button className="download-location-action" disabled={exporting} onClick={() => void chooseDirectory().catch((error) => {
      if (!(error instanceof DOMException && error.name === 'AbortError')) window.alert(error instanceof Error ? error.message : '选择文件夹失败');
    })}><FolderOpen size={15} /><span>{directory ? `保存到：${directory.name}` : '选择下载位置'}</span></button>
    <button className="primary-action one-click-download" disabled={exporting} onClick={() => void exportMp4()}>{exporting ? <LoaderCircle className="spin" size={17} /> : <Download size={17} />}{exporting ? `正在导出 ${completed}/${count}` : `导出全部 ${count} 条 MP4`}</button>
  </div>;
}
