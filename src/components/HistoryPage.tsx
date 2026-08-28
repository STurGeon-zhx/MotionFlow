'use client';

import {useEffect, useState} from 'react';
import Link from 'next/link';
import {AlertCircle, CheckCircle2, Clock3, Download, Film, LoaderCircle, RotateCcw, Sparkles} from 'lucide-react';

type Job = {id: string; status: string; totalCount: number; completedCount: number; failedCount: number; imageCount: number; ratio: string; resolution: string; createdAt: string};
const statusNames: Record<string, string> = {pending: '等待中', running: '生成中', completed: '已完成', partial_failed: '部分失败', failed: '失败'};

export function HistoryPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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

  return <main className="history-page">
    <div className="history-hero"><div><span className="eyebrow"><Clock3 size={14} /> 本地任务记录</span><h1>历史任务</h1><p>生成结果保存在本机，应用重启后仍可继续查看和下载。</p></div><Link className="primary-action compact" href="/"><Sparkles size={17} />创建新任务</Link></div>
    {error && <div className="notice error"><AlertCircle size={17} />{error}</div>}
    {loading ? <div className="empty-history"><LoaderCircle className="spin" /><p>正在读取历史任务…</p></div> : jobs.length === 0 ? <div className="empty-history"><Film size={38} /><h2>还没有生成记录</h2><p>上传图片并完成第一个批量任务后，记录会显示在这里。</p><Link href="/">前往动效工坊</Link></div> : <div className="history-table-wrap"><table className="history-table"><thead><tr><th>任务</th><th>创建时间</th><th>规格</th><th>进度</th><th>状态</th><th>操作</th></tr></thead><tbody>{jobs.map((job) => <tr key={job.id}><td><div className="job-name"><span><Film size={17} /></span><div><strong>{job.id.slice(0, 12)}</strong><small>{job.imageCount} 张图片 · {job.totalCount} 条视频</small></div></div></td><td>{new Date(job.createdAt).toLocaleString('zh-CN', {hour12: false})}</td><td>{job.ratio === 'source' ? '跟随原图' : job.ratio} · {job.resolution}</td><td><div className="table-progress"><span><i style={{width: `${((job.completedCount + job.failedCount) / job.totalCount) * 100}%`}} /></span><small>{job.completedCount}/{job.totalCount}</small></div></td><td><span className={`status-pill status-${job.status}`}>{job.status === 'completed' && <CheckCircle2 size={13} />}{statusNames[job.status]}</span></td><td><div className="table-actions"><Link href={`/?job=${job.id}`}>查看详情</Link>{job.completedCount > 0 && <a href={`/api/video-jobs/${job.id}/download-zip`} title="打包下载"><Download size={16} /></a>}{job.failedCount > 0 && <button onClick={() => void retry(job.id)} title="重试失败项"><RotateCcw size={16} /></button>}</div></td></tr>)}</tbody></table></div>}
  </main>;
}

