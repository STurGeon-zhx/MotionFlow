/* eslint-disable @next/next/no-img-element -- Local authenticated media must not be fetched by the Next image optimizer. */
'use client';

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Search, AlertCircle, Check, ChevronDown, Film,
  ImagePlus, LoaderCircle, Play, Sparkles, Trash2, UploadCloud, X,
} from 'lucide-react';
import type {EffectPreset, ImageRecord, Intensity, Resolution, SingleIntroJobInput} from '@/lib/schema';
import {MAX_WORKSPACE_IMAGES, VISIBLE_IMAGE_THUMBNAILS} from '@/lib/limits';
import {EffectPreview} from './EffectPreview';
import {useRenderBusy} from './useRenderBusy';
import {CurrentTask, RecentTasks} from './TaskCenter';

type JobItem = {id: string; effectId: string; effectName: string; status: string; progress: number; previewUrl: string | null; downloadUrl: string | null; errorMessage: string | null};
type Job = {id: string; toolType: 'single_intro' | 'three_image_motion'; status: string; totalCount: number; completedCount: number; failedCount: number; items: JobItem[]; createdAt: string};

const SETTINGS_KEY = 'motionflow:single-intro-settings';

const modeOptions = [
  {value: 'all_random', label: '全随机', note: '全部特效'},
  {value: 'basic_only', label: '基础动画', note: '简洁自然'},
  {value: 'combo_only', label: '组合动画', note: '入场＋出场联动'},
  {value: 'category_random', label: '分类随机', note: '按分类筛选'},
  {value: 'specific', label: '指定特效', note: '从已选中抽取'},
] as const;

const categoryNames: Record<string, string> = {basic: '基础', combo: '组合', dynamic: '动感', glitch: '故障', camera: '镜头', '3d': '3D', light: '光效', reference_light: '参考光效', reference_creative: '参考创意'};

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(data.error ?? '请求失败');
  return data as T;
}

export function Workspace() {
  const renderBusy = useRenderBusy();
  const fileRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [effects, setEffects] = useState<EffectPreset[]>([]);
  const [previewEffectId, setPreviewEffectId] = useState('basic_zoom_in');
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedEffectIds, setSelectedEffectIds] = useState<string[]>([]);
  const resolution: Resolution = '720p';
  const [effectMode, setEffectMode] = useState<SingleIntroJobInput['effectMode']>('all_random');
  const [introDuration, setIntroDuration] = useState<0.5 | 0.8 | 1 | 1.2>(1.2);
  const [intensity, setIntensity] = useState<Intensity>('medium');
  const [breathing, setBreathing] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [clearingImages, setClearingImages] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [message, setMessage] = useState<{kind: 'error' | 'info'; text: string} | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(true);
  const [settingsReady, setSettingsReady] = useState(false);
  const activeJobId = job?.id;
  const activeJobStatus = job?.status;

  useEffect(() => {
    const settingsTimer = window.setTimeout(() => {
      try {
        const saved = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<{
          effectMode: SingleIntroJobInput['effectMode']; selectedCategories: string[];
          selectedEffectIds: string[]; introDuration: 0.5 | 0.8 | 1 | 1.2; intensity: Intensity; breathing: boolean;
        }>;
        if (saved.effectMode) setEffectMode(saved.effectMode);
        if (saved.selectedCategories) setSelectedCategories(saved.selectedCategories);
        if (saved.selectedEffectIds) setSelectedEffectIds(saved.selectedEffectIds);
        if (saved.introDuration) setIntroDuration(saved.introDuration);
        if (saved.intensity) setIntensity(saved.intensity);
        if (typeof saved.breathing === 'boolean') setBreathing(saved.breathing);
      } catch { /* 使用默认设置 */ }
      setSettingsReady(true);
    }, 0);
    jsonRequest<{effects: EffectPreset[]}>('/api/effects').then((data) => setEffects(data.effects)).catch((error) => setMessage({kind: 'error', text: error.message}));
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('new') === '1') {
      jsonRequest('/api/images', {method: 'DELETE'})
        .then(() => {
          setImages([]);
          if (fileRef.current) fileRef.current.value = '';
          window.history.replaceState({}, '', window.location.pathname);
        })
        .catch((error) => setMessage({kind: 'error', text: error.message}));
    } else {
      jsonRequest<{images: ImageRecord[]}>('/api/images').then((data) => setImages(data.images)).catch((error) => setMessage({kind: 'error', text: error.message}));
    }
    const jobId = searchParams.get('job');
    if (jobId) jsonRequest<{job: Job}>(`/api/video-jobs/${jobId}`).then((data) => {
      if (data.job.toolType !== 'single_intro') throw new Error('该任务属于“三图 15 秒微动”，请从历史记录进入对应工具');
      setJob(data.job);
    }).catch((error) => setMessage({kind: 'error', text: error.message}));
    return () => window.clearTimeout(settingsTimer);
  }, []);

  useEffect(() => {
    if (!settingsReady) return;
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({effectMode, selectedCategories, selectedEffectIds, introDuration, intensity, breathing}));
  }, [settingsReady, effectMode, selectedCategories, selectedEffectIds, introDuration, intensity, breathing]);

  useEffect(() => {
    if (!activeJobId || !activeJobStatus || ['completed', 'partial_failed', 'failed'].includes(activeJobStatus)) return;
    const timer = window.setInterval(() => {
      jsonRequest<{job: Job}>(`/api/video-jobs/${activeJobId}`).then((data) => setJob(data.job)).catch(() => undefined);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeJobId, activeJobStatus]);

  const previewEffect = effects.find((effect) => effect.id === previewEffectId) ?? effects[0];
  const visibleEffects = useMemo(() => effects.filter((effect) => (activeCategory === 'all' || effect.category === activeCategory) && (effect.name + effect.description).toLowerCase().includes(search.trim().toLowerCase())), [effects, activeCategory, search]);
  const totalCount = images.length;
  const selectedPoolSize = useMemo(() => {
    if (effectMode === 'basic_only') return effects.filter((effect) => effect.type === 'basic').length;
    if (effectMode === 'combo_only') return effects.filter((effect) => effect.type === 'combo').length;
    if (effectMode === 'category_random') return effects.filter((effect) => selectedCategories.includes(effect.category)).length;
    if (effectMode === 'specific') return effects.filter((effect) => selectedEffectIds.includes(effect.id)).length;
    return effects.length;
  }, [effectMode, effects, selectedCategories, selectedEffectIds]);

  const uploadFiles = useCallback(async (files: File[]) => {
    if (creating) return;
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
  }, [images.length, creating]);

  async function removeImage(image: ImageRecord) {
    if (creating) return;
    try {
      await jsonRequest(`/api/images/${image.id}`, {method: 'DELETE'});
      setImages((current) => current.filter((entry) => entry.id !== image.id));
    } catch (error) { setMessage({kind: 'error', text: error instanceof Error ? error.message : '删除失败'}); }
  }

  async function clearImages() {
    if (creating || images.length === 0) return;
    setClearingImages(true);
    setMessage(null);
    try {
      await jsonRequest('/api/images', {method: 'DELETE'});
      setImages([]);
      if (fileRef.current) fileRef.current.value = '';
    } catch (error) {
      setMessage({kind: 'error', text: error instanceof Error ? error.message : '清空素材失败'});
    } finally {
      setClearingImages(false);
    }
  }

  async function startNewTask() {
    setResetting(true);
    setMessage(null);
    try {
      await jsonRequest('/api/images', {method: 'DELETE'});
      setImages([]);
      if (fileRef.current) fileRef.current.value = '';
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
      const payload: SingleIntroJobInput = {toolType: 'single_intro', imageIds: images.map((image) => image.id), ratio: 'source', durationSec: 5, countPerImage: 1, effectMode, selectedCategories, selectedEffectIds, allowDuplicate: false, introDurationSec: introDuration, intensity, enableBreathing: breathing, resolution};
      await jsonRequest<{jobId: string}>('/api/video-jobs', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
      // 任务已持久化，历史记录负责展示进度；工作区只准备下一批素材。
      setJob(null);
      window.history.replaceState({}, '', window.location.pathname);
      window.dispatchEvent(new Event('motionflow:tasks-changed'));
      try {
        await jsonRequest('/api/images', {method: 'DELETE'});
        setImages([]);
        if (fileRef.current) fileRef.current.value = '';
        setMessage({kind: 'info', text: '任务已加入历史记录排队，可上传图片创建下一批任务。'});
      } catch {
        setMessage({kind: 'error', text: '任务已加入历史记录，但清空素材失败。请点击一键清除后再上传，请勿重复提交。'});
      }
    } catch (error) { setMessage({kind: 'error', text: error instanceof Error ? error.message : '创建任务失败'}); }
    finally { setCreating(false); }
  }


  return (
    <main className="workspace-page">
      {message && <div className={`notice ${message.kind}`}><AlertCircle size={17} /><span>{message.text}</span><button onClick={() => setMessage(null)} aria-label="关闭"><X size={15} /></button></div>}

      <div className="workspace-grid">
        <aside className="panel settings-panel">
          <div className="section-header"><span>01</span><h3>添加图片</h3><small>{images.length}/{MAX_WORKSPACE_IMAGES} 张</small>{images.length > 0 && <button className="clear-materials-action" disabled={creating || clearingImages || uploading} onClick={() => void clearImages()}>{clearingImages ? <LoaderCircle className="spin" size={13} /> : <Trash2 size={13} />}一键清除</button>}</div>
          <div className={`dropzone ${dragging ? 'dragging' : ''}`} onDragOver={(event) => {event.preventDefault(); setDragging(true);}} onDragLeave={() => setDragging(false)} onDrop={(event) => {event.preventDefault(); setDragging(false); void uploadFiles(Array.from(event.dataTransfer.files));}} onClick={() => fileRef.current?.click()}>
            {uploading ? <LoaderCircle className="spin" size={28} /> : <UploadCloud size={28} />}
            <strong>{uploading ? '正在读取图片…' : '拖入图片或点击上传'}</strong><span>JPG / PNG / WebP，单张不超过 20MB</span>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(event) => {void uploadFiles(Array.from(event.target.files ?? [])); event.target.value = '';}} />
          </div>
          {/* Local API image URLs are intentionally rendered without optimization. */}
          {images.length > 0 && <div className={`image-strip ${images.length > VISIBLE_IMAGE_THUMBNAILS ? 'scrollable' : ''}`}>{images.map((image, index) => <div className="image-thumb" key={image.id}><img src={image.previewUrl} alt={image.originalName} loading="lazy" decoding="async" /><span>{index + 1}</span><button onClick={() => void removeImage(image)} aria-label={`删除 ${image.originalName}`}><Trash2 size={13} /></button></div>)}</div>}

          <div className="section-divider" />
          <SectionHeader number="02" title="基础参数" />
          <div className="two-fields">
            <Field label="输出比例"><div className="fixed-value">跟随每张原图</div></Field>
            <Field label="清晰度"><div className="fixed-value">720p 标准</div></Field>
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
          {previewEffect && <EffectPreview rendering={renderBusy || job?.status === 'running'} effect={previewEffect} imageSrc={images[0]?.previewUrl} sourceWidth={images[0]?.width} sourceHeight={images[0]?.height} introDuration={introDuration} intensity={intensity} breathing={breathing} />}
          <div className="library-heading"><label className="effect-search"><Search size={16}/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="搜索特效名称" aria-label="搜索特效名称"/></label><div><h3>特效库</h3><span>{effects.length} 个特效</span></div>{selectedEffectIds.length > 0 && <button className="text-button" onClick={() => setEffectMode('specific')}>仅从已选 {selectedEffectIds.length} 个中随机</button>}</div>
          <div className="effect-tabs"><button className={activeCategory === 'all' ? 'active' : ''} onClick={() => setActiveCategory('all')}>全部</button>{Object.entries(categoryNames).map(([key, name]) => <button key={key} className={activeCategory === key ? 'active' : ''} onClick={() => setActiveCategory(key)}>{name}</button>)}</div>
          <div className="effect-cards">{visibleEffects.map((effect) => {
            const selected = selectedEffectIds.includes(effect.id);
            const previewing = effect.id === previewEffectId;
            const effectTiming = effect.category === 'reference_creative' ? '创意入场 · 稳定展示' : effect.category === 'reference_light'
              ? '循环入场光效'
              : effect.type === 'combo' ? '入场＋出场' : `${effect.durationFrames} 帧`;
            return <button key={effect.id} className={`effect-card ${selected ? 'selected' : ''} ${previewing ? 'previewing' : ''}`} onClick={() => toggleEffect(effect.id)}><span className="effect-thumbnail"><img src={`/effect-thumbnails/${effect.id}.webp`} alt="" loading="lazy" onError={event=>{event.currentTarget.onerror=null;event.currentTarget.src='/preview-placeholder.png';}}/><i><Play size={16} fill="currentColor"/></i></span><span className="effect-copy"><strong>{effect.name}</strong><small>{categoryNames[effect.category]} · {effectTiming}</small></span>{effectMode === 'specific' && <span className="check-dot">{selected && <Check size={12} />}</span>}</button>;
          })}</div>
        </section>

        <aside className="right-column"><section className="panel result-panel">
          {!job ? <><div className="panel-title-row"><h2>生成任务</h2></div>
            <div className="estimate-card"><div className="estimate-visual"><Film size={25} /><span>{totalCount || 0}</span></div><div><small>预计生成</small><strong>{images.length} 张图片 × 每张 1 条</strong><p>共 {totalCount} 条 · 每条 5 秒</p></div></div>
            <div className="summary-list"><Summary label="画面规格" value={`跟随原图 · ${resolution}`} /><Summary label="特效范围" value={`${selectedPoolSize} 个可用`} /><Summary label="入场设置" value={`${introDuration}s · ${intensity === 'weak' ? '弱' : intensity === 'medium' ? '中' : '强'}强度`} /><Summary label="预计输出" value="H.264 MP4 · 自动配乐" /></div>
            <button className="primary-action" disabled={creating || uploading || images.length === 0 || totalCount > 100} onClick={() => void createJob()}>{creating ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}开始批量生成</button>
            <p className="action-note">本地并行渲染，可随时暂停或从历史任务继续查看。</p>
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
