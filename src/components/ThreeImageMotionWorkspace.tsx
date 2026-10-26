'use client';
/* eslint-disable @next/next/no-img-element */

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  AlertCircle, Film, GripVertical, ImagePlus,
  LoaderCircle, Sparkles, Trash2, UploadCloud, X,
} from 'lucide-react';
import type {ImageRecord, Resolution, ThreeImageMotionJobInput} from '@/lib/schema';
import {MAX_SEQUENCE_IMAGES} from '@/lib/limits';
import {ThreeImageMotionPreview} from './ThreeImageMotionPreview';
import {useRenderBusy} from './useRenderBusy';
import {CurrentTask, RecentTasks} from './TaskCenter';

type JobItem = {id: string; imageIds: string[]; effectName: string; status: string; progress: number; previewUrl: string | null; downloadUrl: string | null; errorMessage: string | null};
type Job = {id: string; toolType: 'single_intro' | 'three_image_motion'; status: string; totalCount: number; completedCount: number; failedCount: number; items: JobItem[]};
type Settings = {resolution: Resolution; motionSpeed: number; motionAmplitude: number; enableMusic: boolean};

const WORKSPACE_QUERY = 'workspaceType=three_image_motion';
const SETTINGS_KEY = 'motionflow:three-image-motion-settings';
const defaultSettings: Settings = {resolution: '720p', motionSpeed: 0.8, motionAmplitude: 0.025, enableMusic: true};

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(data.error ?? '请求失败');
  return data as T;
}

export function ThreeImageMotionWorkspace() {
  const renderBusy = useRenderBusy();
  const fileRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [selectedGroup, setSelectedGroup] = useState(0);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [settingsReady, setSettingsReady] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [clearingImages, setClearingImages] = useState(false);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [message, setMessage] = useState<{kind: 'error' | 'info'; text: string} | null>(null);

  useEffect(() => {
    const settingsTimer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(SETTINGS_KEY);
        if (saved) setSettings({...defaultSettings, ...JSON.parse(saved), resolution: '720p'});
      } catch { /* 使用默认设置 */ }
      setSettingsReady(true);
    }, 0);
    jsonRequest<{images: ImageRecord[]}>(`/api/images?${WORKSPACE_QUERY}`)
      .then((data) => setImages(data.images))
      .catch((error) => setMessage({kind: 'error', text: error.message}));
    const jobId = new URLSearchParams(window.location.search).get('job');
    if (jobId) {
      jsonRequest<{job: Job}>(`/api/video-jobs/${jobId}`).then((data) => {
        if (data.job.toolType !== 'three_image_motion') throw new Error('该任务属于“单图 5 秒特效”，请从历史记录进入对应工具');
        setJob(data.job);
      }).catch((error) => setMessage({kind: 'error', text: error.message}));
    }
    return () => window.clearTimeout(settingsTimer);
  }, []);

  useEffect(() => {
    if (settingsReady) window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings, settingsReady]);

  const activeJobId = job?.id;
  const activeJobStatus = job?.status;
  useEffect(() => {
    if (!activeJobId || !activeJobStatus || ['completed', 'partial_failed', 'failed'].includes(activeJobStatus)) return;
    const timer = window.setInterval(() => {
      jsonRequest<{job: Job}>(`/api/video-jobs/${activeJobId}`).then((data) => setJob(data.job)).catch(() => undefined);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeJobId, activeJobStatus]);

  const groups = useMemo(() => Array.from({length: Math.ceil(images.length / 3)}, (_, index) => images.slice(index * 3, index * 3 + 3)), [images]);
  const activeGroup = groups[Math.min(selectedGroup, Math.max(0, groups.length - 1))] ?? [];
  const missingCount = images.length === 0 || images.length % 3 === 0 ? 0 : 3 - images.length % 3;
  const completeGroupCount = Math.floor(images.length / 3);

  const uploadFiles = useCallback(async (files: File[]) => {
    if (creating) return;
    setMessage(null);
    if (files.length + images.length > MAX_SEQUENCE_IMAGES) return setMessage({kind: 'error', text: `三图工作区最多保留 ${MAX_SEQUENCE_IMAGES} 张图片`});
    const form = new FormData();
    form.append('workspaceType', 'three_image_motion');
    files.forEach((file) => form.append('files', file));
    setUploading(true);
    try {
      const data = await jsonRequest<{images: ImageRecord[]}>('/api/images', {method: 'POST', body: form});
      setImages((current) => [...current, ...data.images]);
    } catch (error) {
      setMessage({kind: 'error', text: error instanceof Error ? error.message : '上传失败'});
    } finally { setUploading(false); }
  }, [images.length, creating]);

  async function removeImage(image: ImageRecord) {
    if (creating) return;
    try {
      await jsonRequest(`/api/images/${image.id}?${WORKSPACE_QUERY}`, {method: 'DELETE'});
      const nextImages = images.filter((entry) => entry.id !== image.id);
      setImages(nextImages);
      setSelectedGroup((current) => Math.min(current, Math.max(0, Math.ceil(nextImages.length / 3) - 1)));
    } catch (error) { setMessage({kind: 'error', text: error instanceof Error ? error.message : '删除失败'}); }
  }

  async function clearImages() {
    if (creating || images.length === 0) return;
    setClearingImages(true);
    setMessage(null);
    try {
      await jsonRequest(`/api/images?${WORKSPACE_QUERY}`, {method: 'DELETE'});
      setImages([]);
      setSelectedGroup(0);
      if (fileRef.current) fileRef.current.value = '';
    } catch (error) {
      setMessage({kind: 'error', text: error instanceof Error ? error.message : '清空素材失败'});
    } finally {
      setClearingImages(false);
    }
  }

  async function reorderImages(fromIndex: number, toIndex: number) {
    if (creating || fromIndex === toIndex) return;
    const before = images;
    const reordered = [...images];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    setImages(reordered);
    setSelectedGroup(Math.floor(toIndex / 3));
    try {
      await jsonRequest(`/api/images?${WORKSPACE_QUERY}`, {
        method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({imageIds: reordered.map((image) => image.id)}),
      });
    } catch (error) {
      setImages(before);
      setMessage({kind: 'error', text: error instanceof Error ? error.message : '保存图片顺序失败'});
    }
  }

  async function createJob() {
    setMessage(null);
    if (images.length < 3) return setMessage({kind: 'error', text: `至少需要 3 张图片，还差 ${3 - images.length} 张`});
    if (missingCount > 0) return setMessage({kind: 'error', text: `图片数量必须是 3 的倍数，还差 ${missingCount} 张`});
    setCreating(true);
    try {
      const payload: ThreeImageMotionJobInput = {
        toolType: 'three_image_motion', imageIds: images.map((image) => image.id), ratio: 'source', durationSec: 15,
        secondsPerImage: 5, transition: 'cut', motionPath: 'smooth_loop', edgeMode: 'auto_zoom', ...settings,
      };
      await jsonRequest<{jobId: string}>('/api/video-jobs', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
      // 任务已持久化，历史记录负责展示进度；工作区只准备下一批素材。
      setJob(null);
      window.history.replaceState({}, '', window.location.pathname);
      window.dispatchEvent(new Event('motionflow:tasks-changed'));
      try {
        await jsonRequest(`/api/images?${WORKSPACE_QUERY}`, {method: 'DELETE'});
        setImages([]);
        setSelectedGroup(0);
        if (fileRef.current) fileRef.current.value = '';
        setMessage({kind: 'info', text: '任务已加入历史记录排队，可上传图片创建下一批任务。'});
      } catch {
        setMessage({kind: 'error', text: '任务已加入历史记录，但清空素材失败。请点击一键清除后再上传，请勿重复提交。'});
      }
    } catch (error) { setMessage({kind: 'error', text: error instanceof Error ? error.message : '创建任务失败'}); }
    finally { setCreating(false); }
  }

  async function startNewTask() {
    setResetting(true);
    setMessage(null);
    try {
      await jsonRequest(`/api/images?${WORKSPACE_QUERY}`, {method: 'DELETE'});
      setImages([]);
      if (fileRef.current) fileRef.current.value = '';
      setSelectedGroup(0);
      setJob(null);
      window.history.replaceState({}, '', window.location.pathname);
    } catch (error) { setMessage({kind: 'error', text: error instanceof Error ? error.message : '清空图片失败'}); }
    finally { setResetting(false); }
  }


  return (
    <main className="workspace-page sequence-page">
      {message && <div className={`notice ${message.kind}`}><AlertCircle size={17} /><span>{message.text}</span><button onClick={() => setMessage(null)} aria-label="关闭"><X size={15} /></button></div>}

      <div className="workspace-grid">
        <aside className="panel settings-panel">
          <div className="section-header"><span>01</span><h3>添加与排序</h3><small>{images.length}/{MAX_SEQUENCE_IMAGES} 张</small>{images.length > 0 && <button className="clear-materials-action" disabled={creating || clearingImages || uploading} onClick={() => void clearImages()}>{clearingImages ? <LoaderCircle className="spin" size={13} /> : <Trash2 size={13} />}一键清除</button>}</div>
          <div className={`dropzone ${draggingFiles ? 'dragging' : ''}`} onDragOver={(event) => {event.preventDefault(); setDraggingFiles(true);}} onDragLeave={() => setDraggingFiles(false)} onDrop={(event) => {event.preventDefault(); setDraggingFiles(false); void uploadFiles(Array.from(event.dataTransfer.files));}} onClick={() => fileRef.current?.click()}>
            {uploading ? <LoaderCircle className="spin" size={28} /> : <UploadCloud size={28} />}
            <strong>{uploading ? '正在读取图片…' : '拖入图片或点击上传'}</strong><span>每 3 张生成一条，最多 99 张</span>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(event) => {void uploadFiles(Array.from(event.target.files ?? [])); event.target.value = '';}} />
          </div>
          {images.length > 0 && <>
            <div className="sequence-image-list">{images.map((image, index) => <div
              className={`sequence-thumb ${draggedIndex === index ? 'dragging' : ''} ${Math.floor(index / 3) === selectedGroup ? 'selected-group' : ''}`}
              key={image.id} draggable
              onDragStart={() => setDraggedIndex(index)}
              onDragEnd={() => setDraggedIndex(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {event.preventDefault(); if (draggedIndex !== null) void reorderImages(draggedIndex, index); setDraggedIndex(null);}}
              onClick={() => setSelectedGroup(Math.floor(index / 3))}
            >
              <GripVertical size={13} />
              <img src={image.previewUrl} alt={image.originalName} loading="lazy" />
              <span><strong>{index + 1}. {image.originalName}</strong><small>第 {Math.floor(index / 3) + 1} 组 · 第 {index % 3 + 1} 张</small></span>
              <button onClick={(event) => {event.stopPropagation(); void removeImage(image);}} aria-label={`删除 ${image.originalName}`}><Trash2 size={13} /></button>
            </div>)}</div>
            {missingCount > 0 && <div className="sequence-missing"><AlertCircle size={13} />当前分组还差 {missingCount} 张</div>}
          </>}

          <div className="section-divider" />
          <SectionHeader number="02" title="输出参数" />
          <div className="two-fields">
            <Field label="画面比例"><div className="fixed-value">跟随每组第 1 张</div></Field>
            <Field label="清晰度"><div className="fixed-value">720p 标准</div></Field>
          </div>
          <Field label={`方向变化速度 · ${settings.motionSpeed.toFixed(1)} 倍`}><input className="range-input" type="range" min="0.3" max="1.2" step="0.1" value={settings.motionSpeed} onChange={(event) => setSettings((current) => ({...current, motionSpeed: Number(event.target.value)}))} /></Field>
          <Field label={`移动幅度 · 画布 ${(settings.motionAmplitude * 100).toFixed(1)}%`}><input className="range-input" type="range" min="0.01" max="0.15" step="0.005" value={settings.motionAmplitude} onChange={(event) => setSettings((current) => ({...current, motionAmplitude: Number(event.target.value)}))} /></Field>
          <div className="switch-row sequence-music"><span><strong>自动配乐</strong><small>顺序分配音乐，循环补足 15 秒</small></span><button className={`switch ${settings.enableMusic ? 'on' : ''}`} onClick={() => setSettings((current) => ({...current, enableMusic: !current.enableMusic}))}><i /></button></div>
        </aside>

        <section className="panel effects-panel sequence-center">
          <div className="panel-title-row"><div><span className="eyebrow">15 秒实时预览</span><h2>{activeGroup.length ? `第 ${Math.min(selectedGroup + 1, groups.length)} 组` : '等待添加三张图片'}</h2></div><span className="live-pill"><i /> LIVE</span></div>
          <ThreeImageMotionPreview rendering={renderBusy || job?.status === 'running'} images={activeGroup} motionSpeed={settings.motionSpeed} motionAmplitude={settings.motionAmplitude} />
          <div className="sequence-group-heading"><div><h3>图片分组</h3><span>可点击切换预览</span></div><small>拖拽左侧图片可跨组调整顺序</small></div>
          <div className="sequence-groups">{groups.map((group, groupIndex) => <button key={groupIndex} className={selectedGroup === groupIndex ? 'active' : ''} onClick={() => setSelectedGroup(groupIndex)}><strong>第 {groupIndex + 1} 组</strong><span>{group.length}/3 张</span><i>{group.map((image) => <span key={image.id}>{/* Local API image URL. */}<img src={image.previewUrl} alt="" /></span>)}</i></button>)}</div>
        </section>

        <aside className="right-column"><section className="panel result-panel">
          {!job ? <><div className="panel-title-row"><h2>生成任务</h2></div>
            <div className="estimate-card"><div className="estimate-visual"><Film size={25} /><span>{completeGroupCount}</span></div><div><small>预计生成</small><strong>{completeGroupCount} 组图片 → {completeGroupCount} 条</strong><p>每条 15 秒 · 共 {completeGroupCount * 15} 秒</p></div></div>
            <div className="summary-list"><Summary label="画面规格" value={`跟随组内首图 · ${settings.resolution}`} /><Summary label="方向变化速度" value={`${settings.motionSpeed.toFixed(1)} 倍`} /><Summary label="移动幅度" value={`${(settings.motionAmplitude * 100).toFixed(1)}%`} /><Summary label="预计输出" value={`H.264 MP4 · ${settings.enableMusic ? '自动配乐' : '静音'}`} /></div>
            {missingCount > 0 && <div className="inline-warning"><AlertCircle size={14} />还差 {missingCount} 张才能组成完整分组</div>}
            <button className="primary-action" disabled={creating || uploading || images.length < 3 || missingCount > 0} onClick={() => void createJob()}>{creating ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}开始批量生成</button>
            <p className="action-note">每组三张图片创建一条独立渲染任务。</p>
          </> : <>
            <CurrentTask jobId={job.id} onDeleted={()=>setJob(null)}/>
            <button className="ghost-action" disabled={resetting} onClick={()=>void startNewTask()}><ImagePlus size={16}/>创建新任务</button>
          </>}
        </section><RecentTasks/></aside>
      </div>
    </main>
  );
}

function SectionHeader({number, title, subtitle}: {number: string; title: string; subtitle?: string}) { return <div className="section-header"><span>{number}</span><h3>{title}</h3>{subtitle && <small>{subtitle}</small>}</div>; }
function Field({label, children}: {label: string; children: React.ReactNode}) { return <label className="field"><span>{label}</span>{children}</label>; }
function Summary({label, value}: {label: string; value: string}) { return <div><span>{label}</span><strong>{value}</strong></div>; }
