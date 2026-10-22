'use client';

import {useEffect, useRef, useState} from 'react';
import {Download, LoaderCircle, RefreshCw, Settings, X} from 'lucide-react';

type UpdateInfo = {
  status: 'available' | 'up_to_date' | 'not_configured' | 'no_release';
  currentVersion: string; latestVersion?: string; name?: string; notes?: string;
  message?: string; asset?: {name: string; size: number} | null;
};
type DesktopUpdater = {
  getUpdateConfig: () => Promise<{currentVersion: string; repository: string}>;
  setUpdateRepository: (repository: string) => Promise<{currentVersion: string; repository: string}>;
  checkForUpdates: () => Promise<UpdateInfo>;
  downloadUpdate: () => Promise<{canceled: boolean; filename?: string}>;
  onUpdateDownloadProgress: (handler: (progress: {received: number; total: number}) => void) => () => void;
};
function getUpdater() {
  return (window as Window & {motionFlowDesktop?: DesktopUpdater}).motionFlowDesktop;
}
export function CheckUpdatesButton() {
  const modal=useRef<HTMLDialogElement>(null);
  const [desktop,setDesktop]=useState(false);
  const [version,setVersion]=useState('');
  const [repository,setRepository]=useState('');
  const [editing,setEditing]=useState(false);
  const [busy,setBusy]=useState(false);
  const [downloading,setDownloading]=useState(false);
  const [percent,setPercent]=useState<number|null>(null);
  const [result,setResult]=useState<UpdateInfo|null>(null);
  const [message,setMessage]=useState('');
  useEffect(()=>{
    const updater=getUpdater();if(!updater?.getUpdateConfig)return;
    void updater.getUpdateConfig().then(config=>{setDesktop(true);setVersion(config.currentVersion);setRepository(config.repository);setEditing(!config.repository);}).catch(error=>{setDesktop(true);setMessage(error instanceof Error?error.message:'读取更新配置失败');setEditing(true);});
    return updater.onUpdateDownloadProgress(progress=>setPercent(progress.total?Math.min(100,Math.floor(progress.received/progress.total*100)):null));
  },[]);
  async function check() {
    setBusy(true);setMessage('');setResult(null);
    try {
      const updater=getUpdater()!;
      const config=await updater.setUpdateRepository(repository);
      setRepository(config.repository);setEditing(!config.repository);
      const info=await updater.checkForUpdates();setResult(info);
      if(info.status==='not_configured')setEditing(true);
    }catch(error){setMessage(error instanceof Error?error.message:'检查更新失败');}
    finally{setBusy(false);}
  }
  async function open() {
    modal.current?.showModal();
    await check();
  }
  async function download() {
    setDownloading(true);setPercent(null);setMessage('');
    try {const saved=await getUpdater()!.downloadUpdate();if(!saved.canceled)setMessage(`新版已保存为 ${saved.filename}。关闭软件后解压更新，保留原 data 文件夹即可继续查看历史任务。`);}
    catch(error){setMessage(error instanceof Error?error.message:'下载失败，请重试');}
    finally{setDownloading(false);}
  }
  if(!desktop)return null;
  return <>
    <button className="nav-link check-updates-trigger" onClick={()=>void open()}><RefreshCw size={15}/>检查更新</button>
    <dialog className="updates-dialog" ref={modal} onCancel={event=>{if(downloading)event.preventDefault();}}>
      <div className="updates-heading"><div><h2>软件更新</h2><p>当前版本 {version?`v${version}`:'正在读取'}</p></div><button aria-label="关闭更新窗口" disabled={downloading} onClick={()=>modal.current?.close()}><X size={20}/></button></div>
      <button className="updates-source-toggle" disabled={busy||downloading} onClick={()=>setEditing(value=>!value)}><Settings size={14}/>GitHub 更新源{repository?` · ${repository}`:''}</button>
      {editing&&<div className="updates-source"><label htmlFor="update-repository">GitHub 仓库地址</label><input id="update-repository" value={repository} onChange={event=>setRepository(event.target.value)} placeholder="https://github.com/用户名/仓库名" disabled={busy||downloading}/><p>读取该仓库最新正式 Release 中的 Windows 桌面版。</p></div>}
      <div className="updates-result" aria-live="polite">
        {busy?<p><LoaderCircle className="spin" size={17}/>正在连接 GitHub 检查更新…</p>:<>
          {result?.status==='not_configured'&&<p>填写发布仓库地址后，即可检查更新。</p>}
          {result?.status==='up_to_date'&&<p className="updates-current">当前已是最新版本（最新发布 v{result.latestVersion}）。</p>}
          {result?.status==='no_release'&&<p>{result.message}</p>}
          {result?.status==='available'&&<><h3>发现新版本 v{result.latestVersion}</h3>{result.notes&&<pre>{result.notes}</pre>}{!result.asset&&<p>该版本尚未提供 Windows 桌面压缩包，请等待发布者补充。</p>}</>}
        </>}
        {message&&<p className="updates-message">{message}</p>}
      </div>
      <div className="updates-actions"><button className="secondary-action" disabled={busy||downloading} onClick={()=>void check()}><RefreshCw size={15}/>{editing?'保存并检查':'重新检查'}</button>{result?.status==='available'&&result.asset&&<button className="primary-action" disabled={busy||downloading} onClick={()=>void download()}>{downloading?<LoaderCircle size={16} className="spin"/>:<Download size={16}/>} {downloading?`正在下载${percent===null?'…':` ${percent}%`}`:'下载新版'}</button>}</div>
    </dialog>
  </>;
}
