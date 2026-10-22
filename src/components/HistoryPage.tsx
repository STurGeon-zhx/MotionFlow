'use client';

import {useEffect, useState} from 'react';
import Link from 'next/link';
import {AlertCircle, CheckCircle2, Clock3, Film, LoaderCircle, RotateCcw, Sparkles, Trash2} from 'lucide-react';
import {BulkDownloadButton} from './BulkDownloadButton';

type Job = {id: string; toolType: 'single_intro' | 'three_image_motion'; status: string; totalCount: number; completedCount: number; failedCount: number; imageCount: number; groupCount: number; durationSec: number; ratio: string; resolution: string; createdAt: string};
const statusNames: Record<string, string> = {pending: '等待中', running: '生成中', completed: '已完成', partial_failed: '部分失败', failed: '失败'};

export function HistoryPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const load = async () => {
    try {
      const response = await fetch('/api/video-jobs?pageSize=50', {cache: 'no-store'});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? '读取失败');
      setJobs(data.jobs);
    } catch (err) { setError(err instanceof Error ? err.message : '读取失败'); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 3000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, []);
  async function retry(id: string) { await fetch(`/api/video-jobs/${id}/retry-failed`, {method: 'POST'}); await load(); }
  async function remove(id: string) {
    if (!window.confirm('删除后，该任务记录和已生成的视频将无法恢复。确认删除吗？')) return;
    setDeletingId(id);
    setError('');
    try {
      const response = await fetch(`/api/video-jobs/${id}`, {method: 'DELETE'});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? '删除失败');
      setJobs((current) => current.filter((job) => job.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeletingId(null);
    }
  }

  return <main className="history-page">
    <div className="history-hero"><div><span className="eyebrow"><Clock3 size={14} /> 本地任务记录</span><h1>历史任务</h1><p>生成结果保存在本机，应用重启后仍可继续查看和下载。</p></div><Link className="primary-action compact" href="/?new=1"><Sparkles size={17} />创建新任务</Link></div>
    {error && <div className="notice error"><AlertCircle size={17} />{error}</div>}
    {loading ? <div className="empty-history"><LoaderCircle className="spin" /><p>正在读取历史任务…</p></div> : jobs.length === 0 ? <div className="empty-history"><Film size={38} /><h2>还没有生成记录</h2><p>上传图片并完成第一个批量任务后，记录会显示在这里。</p><Link href="/">前往动效工坊</Link></div> : <div className="history-table-wrap"><table className="history-table"><thead><tr><th>任务</th><th>创建时间</th><th>规格</th><th>进度</th><th>状态</th><th>操作</th></tr></thead><tbody>{jobs.map((job) => {
      const sequence = job.toolType === 'three_image_motion';
      const detailHref = sequence ? `/motion-sequence?job=${job.id}` : `/?job=${job.id}`;
      const active = job.status === 'pending' || job.status === 'running';
      return <tr key={job.id}><td><div className="job-name"><span><Film size={17} /></span><div><strong>{job.id.slice(0, 12)}</strong><small>{sequence ? `三图微动 · ${job.groupCount} 组 · ${job.durationSec} 秒` : `单图动效 · ${job.imageCount} 张 · ${job.durationSec} 秒`}</small></div></div></td><td>{new Date(job.createdAt).toLocaleString('zh-CN', {hour12: false})}</td><td>{job.ratio === 'source' ? (sequence ? '跟随组内首图' : '跟随原图') : job.ratio} · {job.resolution}</td><td><div className="table-progress"><span><i style={{width: `${((job.completedCount + job.failedCount) / job.totalCount) * 100}%`}} /></span><small>{job.completedCount}/{job.totalCount}</small></div></td><td><span className={`status-pill status-${job.status}`}>{job.status === 'completed' && <CheckCircle2 size={13} />}{statusNames[job.status]}</span></td><td><div className="table-actions"><Link href={detailHref}>查看详情</Link>{job.completedCount > 0 && <BulkDownloadButton jobId={job.id} count={job.completedCount} compact />}{job.failedCount > 0 && <button onClick={() => void retry(job.id)} title="重试失败项"><RotateCcw size={16} /></button>}<button className="delete-task" disabled={active || deletingId === job.id} onClick={() => void remove(job.id)} title={active ? '生成中的任务不能删除' : '删除任务'} aria-label={`删除任务 ${job.id}`}>{deletingId === job.id ? <LoaderCircle className="spin" size={16} /> : <Trash2 size={16} />}</button></div></td></tr>;
    })}</tbody></table></div>}
  </main>;
}

