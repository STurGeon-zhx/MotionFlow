'use client';

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import Link from 'next/link';
import {
  AlertCircle, Check, CheckCircle2, ChevronDown, CircleDashed, Download, Film,
  ImagePlus, LoaderCircle, Play, RotateCcw, Sparkles, Trash2, UploadCloud, WandSparkles, X,
} from 'lucide-react';
import type {CreateJobInput, EffectPreset, ImageRecord, Intensity, Resolution} from '@/lib/schema';
import {MAX_WORKSPACE_IMAGES, VISIBLE_IMAGE_THUMBNAILS} from '@/lib/limits';
import {EffectPreview} from './EffectPreview';

type JobItem = {id: string; effectId: string; effectName: string; status: string; progress: number; previewUrl: string | null; downloadUrl: string | null; errorMessage: string | null};
type Job = {id: string; status: string; totalCount: number; completedCount: number; failedCount: number; items: JobItem[]; createdAt: string};

const modeOptions = [
  {value: 'all_random', label: '全随机', note: '全部特效'},
  {value: 'basic_only', label: '基础动画', note: '简洁自然'},
  {value: 'combo_only', label: '组合动画', note: '入场＋出场联动'},
  {value: 'category_random', label: '分类随机', note: '按分类筛选'},
  {value: 'specific', label: '指定特效', note: '从已选中抽取'},
] as const;

const categoryNames: Record<string, string> = {basic: '基础', combo: '组合', dynamic: '动感', glitch: '故障', camera: '镜头', '3d': '3D', light: '光效'};
const statusNames: Record<string, string> = {pending: '等待中', running: '生成中', completed: '已完成', partial_failed: '部分失败', failed: '失败', waiting: '排队中', rendering: '渲染中'};

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(data.error ?? '请求失败');
  return data as T;
}

export function Workspace() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [effects, setEffects] = useState<EffectPreset[]>([]);
  const [previewEffectId, setPreviewEffectId] = useState('basic_zoom_in');
  const [activeCategory, setActiveCategory] = useState('all');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedEffectIds, setSelectedEffectIds] = useState<string[]>([]);
  const [resolution, setResolution] = useState<Resolution>('1080p');
  const [effectMode, setEffectMode] = useState<CreateJobInput['effectMode']>('all_random');
  const [introDuration, setIntroDuration] = useState<0.5 | 0.8 | 1 | 1.2>(1.2);
  const [intensity, setIntensity] = useState<Intensity>('medium');
  const [breathing, setBreathing] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [retryingAll, setRetryingAll] = useState(false);
  const [retryingItemId, setRetryingItemId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [message, setMessage] = useState<{kind: 'error' | 'info'; text: string} | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(true);
  const activeJobId = job?.id;
  const activeJobStatus = job?.status;

  useEffect(() => {
    jsonRequest<{effects: EffectPreset[]}>('/api/effects').then((data) => setEffects(data.effects)).catch((error) => setMessage({kind: 'error', text: error.message}));
    jsonRequest<{images: ImageRecord[]}>('/api/images').then((data) => setImages(data.images)).catch((error) => setMessage({kind: 'error', text: error.message}));
    const jobId = new URLSearchParams(window.location.search).get('job');
    if (jobId) jsonRequest<{job: Job}>(`/api/video-jobs/${jobId}`).then((data) => setJob(data.job)).catch((error) => setMessage({kind: 'error', text: error.message}));
  }, []);

  useEffect(() => {
    if (!activeJobId || !activeJobStatus || ['completed', 'partial_failed', 'failed'].includes(activeJobStatus)) return;
    const timer = window.setInterval(() => {
      jsonRequest<{job: Job}>(`/api/video-jobs/${activeJobId}`).then((data) => setJob(data.job)).catch(() => undefined);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeJobId, activeJobStatus]);

  const previewEffect = effects.find((effect) => effect.id === previewEffectId) ?? effects[0];
  const visibleEffects = useMemo(() => effects.filter((effect) => activeCategory === 'all' || effect.category === activeCategory), [effects, activeCategory]);
  const totalCount = images.length;
  const selectedPoolSize = useMemo(() => {
    if (effectMode === 'basic_only') return effects.filter((effect) => effect.type === 'basic').length;
    if (effectMode === 'combo_only') return effects.filter((effect) => effect.type === 'combo').length;
    if (effectMode === 'category_random') return effects.filter((effect) => selectedCategories.includes(effect.category)).length;
    if (effectMode === 'specific') return effects.filter((effect) => selectedEffectIds.includes(effect.id)).length;
    return effects.length;
  }, [effectMode, effects, selectedCategories, selectedEffectIds]);

  const uploadFiles = useCallback(async (files: File[]) => {
    setMessage(null);
    if (files.length + images.length > MAX_WORKSPACE_IMAGES) return setMessage({kind: 'error', text: `当前工作区最多保留 ${MAX_WORKSPACE_IMAGES} 张图片`});
    const form = new FormData();
    files.forEach((file) => form.append('files', file));
    setUploading(true);
    try {
      const data = await jsonRequest<{images: ImageRecord[]}>('/api/images', {method: 'POST', body: form});
      setImages((current) => [...current, ...data.images]);
    } catch (error) {
      setMessage({kind: 'error', text: error instanceof Error ? error.message : '上传失败'});
    } finally { setUploading(false); }
  }, [images.length]);

  async function removeImage(image: ImageRecord) {
    try {
      await jsonRequest(`/api/images/${image.id}`, {method: 'DELETE'});
      setImages((current) => current.filter((entry) => entry.id !== image.id));
    } catch (error) { setMessage({kind: 'error', text: error instanceof Error ? error.message : '删除失败'}); }
  }

  async function startNewTask() {
    setResetting(true);
    setMessage(null);
    try {
      await jsonRequest('/api/images', {method: 'DELETE'});
      setImages([]);
      setJob(null);
      window.history.replaceState({}, '', window.location.pathname);
    } catch (error) {
      setMessage({kind: 'error', text: error instanceof Error ? error.message : '清空图片失败'});
    } finally {
      setResetting(false);
    }
  }

  function toggleEffect(id: string) {
    setPreviewEffectId(id);
    if (effectMode === 'specific') {
      setSelectedEffectIds((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]);
    }
  }

  async function createJob() {
    setMessage(null);
    if (images.length === 0) return setMessage({kind: 'error', text: '请先上传至少一张图片'});
    if (totalCount > 100) return setMessage({kind: 'error', text: '单个任务最多生成 100 条视频，请减少图片或生成数量'});
    if (selectedPoolSize === 0) return setMessage({kind: 'error', text: effectMode === 'specific' ? '请先选择具体特效' : '请选择至少一个有效分类'});
    setCreating(true);
    try {
      const payload: CreateJobInput = {imageIds: images.map((image) => image.id), ratio: 'source', durationSec: 5, countPerImage: 1, effectMode, selectedCategories, selectedEffectIds, allowDuplicate: false, introDurationSec: introDuration, intensity, enableBreathing: breathing, resolution};
      const data = await jsonRequest<{jobId: string}>('/api/video-jobs', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
      const detail = await jsonRequest<{job: Job}>(`/api/video-jobs/${data.jobId}`);
      setJob(detail.job);
    } catch (error) { setMessage({kind: 'error', text: error instanceof Error ? error.message : '创建任务失败'}); }
    finally { setCreating(false); }
  }

  async function retryFailed() {
    if (!job) return;
    setRetryingAll(true);
    try {
      await jsonRequest(`/api/video-jobs/${job.id}/retry-failed`, {method: 'POST'});
      const detail = await jsonRequest<{job: Job}>(`/api/video-jobs/${job.id}`);
      setJob(detail.job);
    } catch (error) { setMessage({kind: 'error', text: error instanceof Error ? error.message : '重试失败'}); }
    finally { setRetryingAll(false); }
  }

  async function retryItem(itemId: string) {
    if (!job) return;
    setRetryingItemId(itemId);
    try {
      await jsonRequest(`/api/video-job-items/${itemId}/retry`, {method: 'POST'});
      const detail = await jsonRequest<{job: Job}>(`/api/video-jobs/${job.id}`);
      setJob(detail.job);
    } catch (error) { setMessage({kind: 'error', text: error instanceof Error ? error.message : '重试失败'}); }
    finally { setRetryingItemId(null); }
  }

  const completedPercent = job ? Math.round(((job.completedCount + job.failedCount) / Math.max(1, job.totalCount)) * 100) : 0;
  const completedItems = job?.items.filter((item) => item.downloadUrl) ?? [];
  const oneClickDownloadUrl = job && completedItems.length > 0
    ? completedItems.length === 1 ? completedItems[0].downloadUrl : `/api/video-jobs/${job.id}/download-zip`
    : null;

  return (
    <main className="workspace-page">
      <div className="workspace-heading">
        <div><span className="eyebrow"><WandSparkles size={14} /> 图片入场动效工坊</span><h1>一组图片，批量变成吸睛开场</h1><p>选择画幅和动效，生成标准 5 秒 MP4 视频。</p></div>
        <div className="heading-stat"><strong>{effects.length || '—'}</strong><span>内置动效</span></div>
      </div>
      {message && <div className={`notice ${message.kind}`}><AlertCircle size={17} /><span>{message.text}</span><button onClick={() => setMessage(null)} aria-label="关闭"><X size={15} /></button></div>}

      <div className="workspace-grid">
        <aside className="panel settings-panel">
          <SectionHeader number="01" title="添加图片" subtitle={`${images.length}/${MAX_WORKSPACE_IMAGES} 张`} />
          <div className={`dropzone ${dragging ? 'dragging' : ''}`} onDragOver={(event) => {event.preventDefault(); setDragging(true);}} onDragLeave={() => setDragging(false)} onDrop={(event) => {event.preventDefault(); setDragging(false); void uploadFiles(Array.from(event.dataTransfer.files));}} onClick={() => fileRef.current?.click()}>
            {uploading ? <LoaderCircle className="spin" size={28} /> : <UploadCloud size={28} />}
            <strong>{uploading ? '正在读取图片…' : '拖入图片或点击上传'}</strong><span>JPG / PNG / WebP，单张不超过 20MB</span>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(event) => {void uploadFiles(Array.from(event.target.files ?? [])); event.target.value = '';}} />
          </div>
          {/* Local API image URLs are intentionally rendered without optimization. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {images.length > 0 && <div className={`image-strip ${images.length > VISIBLE_IMAGE_THUMBNAILS ? 'scrollable' : ''}`}>{images.map((image, index) => <div className="image-thumb" key={image.id}><img src={image.previewUrl} alt={image.originalName} loading="lazy" decoding="async" /><span>{index + 1}</span><button onClick={() => void removeImage(image)} aria-label={`删除 ${image.originalName}`}><Trash2 size={13} /></button></div>)}</div>}

          <div className="section-divider" />
          <SectionHeader number="02" title="基础参数" />
          <div className="two-fields">
            <Field label="输出比例"><div className="fixed-value">跟随每张原图</div></Field>
            <Field label="清晰度"><select value={resolution} onChange={(event) => setResolution(event.target.value as Resolution)}><option value="1080p">1080p 高清</option><option value="720p">720p 快速</option></select></Field>
          </div>

          <div className="section-divider" />
          <SectionHeader number="03" title="特效模式" />
          <div className="mode-grid">{modeOptions.map((option) => <button key={option.value} className={effectMode === option.value ? 'active' : ''} onClick={() => setEffectMode(option.value)}><span>{option.label}</span><small>{option.note}</small>{effectMode === option.value && <Check size={14} />}</button>)}</div>
          {effectMode === 'category_random' && <div className="category-picker">{Object.entries(categoryNames).map(([key, name]) => <button key={key} className={selectedCategories.includes(key) ? 'active' : ''} onClick={() => setSelectedCategories((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key])}>{name}</button>)}</div>}

          <button className="advanced-toggle" onClick={() => setAdvancedOpen((value) => !value)}><span>高级设置</span><ChevronDown size={16} className={advancedOpen ? 'open' : ''} /></button>
          {advancedOpen && <div className="advanced-body">
            <div className="switch-row"><span><strong>轻微镜头呼吸</strong><small>与入场、出场转场全程同步</small></span><button className={`switch ${breathing ? 'on' : ''}`} onClick={() => setBreathing((value) => !value)}><i /></button></div>
            <Field label="入场时长"><div className="mini-options">{([0.5, 0.8, 1, 1.2] as const).map((value) => <button key={value} className={introDuration === value ? 'active' : ''} onClick={() => setIntroDuration(value)}>{value}s</button>)}</div></Field>
            <Field label="动效强度"><div className="mini-options">{([['weak', '弱'], ['medium', '中'], ['strong', '强']] as const).map(([value, label]) => <button key={value} className={intensity === value ? 'active' : ''} onClick={() => setIntensity(value)}>{label}</button>)}</div></Field>
          </div>}
        </aside>

        <section className="panel effects-panel">
          <div className="panel-title-row"><div><span className="eyebrow">实时预览</span><h2>{previewEffect?.name ?? '载入特效中'}</h2></div><span className="live-pill"><i /> LIVE</span></div>
          {previewEffect && <EffectPreview effect={previewEffect} imageSrc={images[0]?.previewUrl} sourceWidth={images[0]?.width} sourceHeight={images[0]?.height} introDuration={introDuration} intensity={intensity} breathing={breathing} />}
          <div className="library-heading"><div><h3>特效库</h3><span>{effects.length} 个特效</span></div>{selectedEffectIds.length > 0 && <button className="text-button" onClick={() => setEffectMode('specific')}>仅从已选 {selectedEffectIds.length} 个中随机</button>}</div>
          <div className="effect-tabs"><button className={activeCategory === 'all' ? 'active' : ''} onClick={() => setActiveCategory('all')}>全部</button>{Object.entries(categoryNames).map(([key, name]) => <button key={key} className={activeCategory === key ? 'active' : ''} onClick={() => setActiveCategory(key)}>{name}</button>)}</div>
          <div className="effect-cards">{visibleEffects.map((effect) => {
            const selected = selectedEffectIds.includes(effect.id);
            const previewing = effect.id === previewEffectId;
            return <button key={effect.id} className={`effect-card ${selected ? 'selected' : ''} ${previewing ? 'previewing' : ''}`} onClick={() => toggleEffect(effect.id)}><span className={`effect-icon category-${effect.category}`}><Play size={15} fill="currentColor" /></span><span className="effect-copy"><strong>{effect.name}</strong><small>{categoryNames[effect.category]} · {effect.type === 'combo' ? '入场＋出场' : `${effect.durationFrames} 帧`}</small></span>{effectMode === 'specific' && <span className="check-dot">{selected && <Check size={12} />}</span>}</button>;
          })}</div>
        </section>

        <aside className="panel result-panel">
          <div className="panel-title-row"><div><span className="eyebrow">生成任务</span><h2>{job ? statusNames[job.status] : '准备生成'}</h2></div>{job && <span className={`status-pill status-${job.status}`}>{statusNames[job.status]}</span>}</div>
          {!job ? <>
            <div className="estimate-card"><div className="estimate-visual"><Film size={25} /><span>{totalCount || 0}</span></div><div><small>预计生成</small><strong>{images.length} 张图片 × 每张 1 条</strong><p>共 {totalCount} 条 · 每条 5 秒</p></div></div>
            <div className="summary-list"><Summary label="画面规格" value={`跟随原图 · ${resolution}`} /><Summary label="特效范围" value={`${selectedPoolSize} 个可用`} /><Summary label="入场设置" value={`${introDuration}s · ${intensity === 'weak' ? '弱' : intensity === 'medium' ? '中' : '强'}强度`} /><Summary label="预计输出" value="H.264 MP4 · 自动配乐" /></div>
            <button className="primary-action" disabled={creating || uploading || images.length === 0 || totalCount > 100} onClick={() => void createJob()}>{creating ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}开始批量生成</button>
            <p className="action-note">本地顺序渲染，可离开当前页面后从历史任务继续查看。</p>
          </> : <>
            <div className="progress-card"><div className="progress-top"><span>整体进度</span><strong>{completedPercent}%</strong></div><div className="progress-track"><i style={{width: `${completedPercent}%`}} /></div><div className="progress-counts"><span><CheckCircle2 size={14} />完成 {job.completedCount}</span><span><CircleDashed size={14} />剩余 {job.totalCount - job.completedCount - job.failedCount}</span>{job.failedCount > 0 && <span className="failed">失败 {job.failedCount}</span>}</div></div>
            {oneClickDownloadUrl && <a className="primary-action one-click-download" href={oneClickDownloadUrl}><Download size={17} />{completedItems.length === 1 ? '一键下载 MP4' : `一键下载全部 ${completedItems.length} 条`}</a>}
            {job.failedCount > 0 && <div className="job-actions"><button className="secondary-action" disabled={retryingAll} onClick={() => void retryFailed()}>{retryingAll ? <LoaderCircle className="spin" size={16} /> : <RotateCcw size={16} />}重试全部失败项</button></div>}
            {job.status === 'running' && <p className="retry-note">临时渲染异常会自动重试 2 次，无需手动操作。</p>}
            <div className="result-list">{job.items.map((item, index) => <article className="result-item" key={item.id}>
              <div className="result-media">{item.previewUrl ? <video src={item.previewUrl} muted playsInline preload="metadata" /> : <span>{item.status === 'rendering' ? <LoaderCircle className="spin" size={21} /> : item.status === 'failed' ? <AlertCircle size={21} /> : <Film size={21} />}</span>}<b>{String(index + 1).padStart(2, '0')}</b></div>
              <div className="result-copy"><strong>{item.effectName}</strong><span>{statusNames[item.status] ?? item.status}{item.status === 'rendering' ? ` · ${Math.round(item.progress * 100)}%` : ''}</span>{item.errorMessage && <small title={item.errorMessage}>{item.errorMessage}</small>}</div>
              {item.downloadUrl && <a href={item.downloadUrl} aria-label={`下载 ${item.effectName}`}><Download size={16} /></a>}
              {item.status === 'failed' && <button className="item-retry" disabled={retryingItemId === item.id} onClick={() => void retryItem(item.id)} aria-label={`重试 ${item.effectName}`}>{retryingItemId === item.id ? <LoaderCircle className="spin" size={15} /> : <RotateCcw size={15} />}</button>}
            </article>)}</div>
            <button className="ghost-action" disabled={resetting} onClick={() => void startNewTask()}>{resetting ? <LoaderCircle className="spin" size={16} /> : <ImagePlus size={16} />}{resetting ? '正在清空图片…' : '创建新任务'}</button>
            <Link className="history-link" href="/history">查看全部历史任务</Link>
          </>}
        </aside>
      </div>
    </main>
  );
}

function SectionHeader({number, title, subtitle}: {number: string; title: string; subtitle?: string}) { return <div className="section-header"><span>{number}</span><h3>{title}</h3>{subtitle && <small>{subtitle}</small>}</div>; }
function Field({label, children}: {label: string; children: React.ReactNode}) { return <label className="field"><span>{label}</span>{children}</label>; }
function Summary({label, value}: {label: string; value: string}) { return <div><span>{label}</span><strong>{value}</strong></div>; }
