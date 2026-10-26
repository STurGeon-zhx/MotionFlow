"use client";
import {confirmAction} from './InterfaceDialogs';
import { useEffect, useRef, useState } from "react";
import { Download, LoaderCircle, RefreshCw, Settings, X } from "lucide-react";
type UpdateInfo = {
  status: "available" | "up_to_date" | "no_release" | "runtime_required";
  currentVersion: string;
  latestVersion?: string;
  notes?: string;
  message?: string;
  codeManifestUrl?: string | null;
};
type Progress = { received: number; total: number; stage?: string };
type DesktopUpdater = {
  getUpdateConfig: () => Promise<{
    currentVersion: string;
    repository: string;
  }>;
  setUpdateRepository: (
    value: string,
  ) => Promise<{ currentVersion: string; repository: string }>;
  checkForUpdates: () => Promise<UpdateInfo>;
  downloadUpdate: () => Promise<{ ready: boolean; version: string }>;
  applyUpdate: (
    confirmed: boolean,
  ) => Promise<{
    needsConfirmation?: boolean;
    count?: number;
    applied?: boolean;
  }>;
  onUpdateDownloadProgress: (handler: (p: Progress) => void) => () => void;
};
const updater = () =>
  (window as Window & { motionFlowDesktop?: DesktopUpdater }).motionFlowDesktop;
export function CheckUpdatesButton() {
  const modal = useRef<HTMLDialogElement>(null);
  const [desktop, setDesktop] = useState(false);
  const [version, setVersion] = useState("");
  const [repository, setRepository] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState<UpdateInfo | null>(null);
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  useEffect(() => {
    const api = updater();
    if (!api?.getUpdateConfig) return;
    void api
      .getUpdateConfig()
      .then((config) => {
        setDesktop(true);
        setVersion(config.currentVersion);
        setRepository(config.repository);
      })
      .catch((error) => {
        setDesktop(true);
        setMessage(String(error));
      });
    return api.onUpdateDownloadProgress(setProgress);
  }, []);
  async function check() {
    setBusy("checking");
    setMessage("");
    setResult(null);
    try {
      const config = await updater()!.setUpdateRepository(repository);
      setRepository(config.repository);
      setResult(await updater()!.checkForUpdates());
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }
  async function download() {
    setBusy("downloading");
    setMessage("");
    setProgress(null);
    try {
      const downloaded = await updater()!.downloadUpdate();
      setReady(downloaded.ready);
      setMessage(`代码 v${downloaded.version} 已校验，重启应用后生效。`);
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy("");
    }
  }
  async function apply() {
    setBusy("applying");
    setMessage("");
    try {
      let response = await updater()!.applyUpdate(false);
      if (response.needsConfirmation) {
        if (
          !(await confirmAction(
            `有 ${response.count} 个任务正在排队或渲染。是否暂停任务并重启应用更新？已完成视频会保留。`,
          ))
        )
          return;
        response = await updater()!.applyUpdate(true);
      }
      if (response.applied) setMessage("新版已生效");
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy("");
    }
  }
  if (!desktop) return null;
  return (
    <>
      <button
        className="nav-link check-updates-trigger"
        onClick={() => {
          modal.current?.showModal();
          void check();
        }}
      >
        <RefreshCw size={16} />
        检查更新
      </button>
      <dialog
        ref={modal}
        className="updates-dialog"
        onCancel={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <div className="updates-heading">
          <div>
            <h2>软件更新</h2>
            <p>当前代码版本 v{version}</p>
          </div>
          <button
            disabled={!!busy}
            onClick={() => modal.current?.close()}
            aria-label="关闭更新窗口"
          >
            <X size={20} />
          </button>
        </div>
        <button
          className="updates-source-toggle"
          disabled={!!busy}
          onClick={() => setEditing(!editing)}
        >
          <Settings size={14} />
          GitHub 更新源 · {repository}
        </button>
        {editing && (
          <div className="updates-source">
            <label htmlFor="update-repository">GitHub 仓库地址</label>
            <input
              id="update-repository"
              value={repository}
              onChange={(e) => setRepository(e.target.value)}
              disabled={!!busy}
            />
          </div>
        )}
        <div className="updates-result" aria-live="polite">
          {busy === "checking" ? (
            <p>
              <LoaderCircle className="spin" size={16} />
              正在检查代码更新…
            </p>
          ) : result?.status === "up_to_date" ? (
            <p className="updates-current">
              当前已是最新版本（v{result.latestVersion}）。
            </p>
          ) : result?.status === "available" ? (
            <>
              <h3>发现代码更新 v{result.latestVersion}</h3>
              <p>只更新程序代码，素材和历史任务不会覆盖。</p>
              {result.notes && <pre>{result.notes}</pre>}
            </>
          ) : result?.message ? (
            <p>{result.message}</p>
          ) : null}
          {busy === "downloading" && (
            <p>
              {progress?.stage === "verifying"
                ? "正在校验代码…"
                : `下载代码更新 ${progress?.total ? Math.floor((progress.received / progress.total) * 100) + "%" : "…"}`}
            </p>
          )}
          {busy === "applying" && (
            <p>
              <LoaderCircle className="spin" size={16} />
              正在重启本地应用并检查新版…
            </p>
          )}
          {message && <p className="updates-message">{message}</p>}
        </div>
        <div className="updates-actions">
          <button
            className="secondary-action"
            disabled={!!busy}
            onClick={() => void check()}
          >
            <RefreshCw size={15} />
            重新检查
          </button>
          {ready ? (
            <button
              className="primary-action"
              disabled={!!busy}
              onClick={() => void apply()}
            >
              重启应用并更新
            </button>
          ) : (
            result?.status === "available" &&
            result.codeManifestUrl && (
              <button
                className="primary-action"
                disabled={!!busy}
                onClick={() => void download()}
              >
                <Download size={16} />
                更新到新版
              </button>
            )
          )}
        </div>
      </dialog>
    </>
  );
}
