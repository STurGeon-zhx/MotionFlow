/* eslint-disable @next/next/no-img-element -- Local authenticated media must not be fetched by the Next image optimizer. */
"use client";
import {confirmAction} from './InterfaceDialogs';
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock3,
  Film,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  X,
  ChevronRight,
} from "lucide-react";
import { BulkDownloadButton } from "./BulkDownloadButton";
export type TaskItem = {
  id: string;
  effectName: string;
  status: string;
  progress: number;
  previewUrl: string | null;
  downloadUrl: string | null;
  thumbnailUrl: string;
  errorMessage: string | null;
  stage: string;
  stalled: boolean;
};
export type Task = {
  id: string;
  toolType: string;
  status: string;
  totalCount: number;
  completedCount: number;
  failedCount: number;
  durationSec: number;
  resolution: string;
  imageCount: number;
  createdAt: string;
  workerOnline: boolean;
  thumbnailUrl: string | null;
  items?: TaskItem[];
};
export const taskStatus: Record<string, string> = {
  pending: "排队中",
  running: "生成中",
  pausing: "暂停中",
  paused: "已暂停",
  deleting: "删除中",
  completed: "已完成",
  partial_failed: "部分失败",
  failed: "失败",
  waiting: "排队中",
  rendering: "生成中",
};
const stageNames: Record<string, string> = {
  preparing: "准备素材",
  initializing: "初始化",
  encoding: "编码中",
  rendering: "渲染中",
  retrying: "降级重试",
  waiting: "等待槽位",
};
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const body = await res.json();
  if (!res.ok || !body.success)
    throw Object.assign(new Error(body.error ?? "请求失败"), {
      status: res.status,
    });
  return body;
}
export function taskProgress(task: Task) {
  return Math.round(
    ((task.items?.reduce(
      (sum, item) =>
        sum +
        (["completed", "failed"].includes(item.status) ? 1 : item.progress),
      0,
    ) ?? task.completedCount + task.failedCount) /
      Math.max(1, task.totalCount)) *
      100,
  );
}
export function TaskControls({
  task,
  onChange,
  onDeleted,
  compact = false,
}: {
  task: Task;
  onChange: () => void;
  onDeleted: () => void;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  async function action(name: string) {
    if (
      name === "delete" &&
      !(await confirmAction(
        "确定删除此任务及已生成的视频？正在渲染的内容将立即停止，原始素材不会删除。",
      ))
    )
      return;
    setBusy(name);
    setError("");
    try {
      await request(
        `/api/video-jobs/${task.id}${name === "delete" ? "" : `/${name}`}`,
        { method: name === "delete" ? "DELETE" : "POST" },
      );
      if (name === "delete") {
        onDeleted();
        window.dispatchEvent(new Event("motionflow:tasks-changed"));
      } else onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy("");
    }
  }
  const active = ["pending", "running", "pausing"].includes(task.status);
  return (
    <>
      <div className={`task-controls ${compact ? "compact" : ""}`}>
        {active && (
          <button
            disabled={!!busy || task.status === "pausing"}
            onClick={() => void action("pause")}
            title="立即暂停"
          >
            {busy === "pause" ? (
              <LoaderCircle className="spin" size={15} />
            ) : (
              <Pause size={15} />
            )}
            <span>暂停</span>
          </button>
        )}
        {task.status === "paused" && (
          <button
            disabled={!!busy}
            onClick={() => void action("resume")}
            title="继续未完成项"
          >
            {busy === "resume" ? (
              <LoaderCircle className="spin" size={15} />
            ) : (
              <Play size={15} />
            )}
            <span>继续</span>
          </button>
        )}
        {task.failedCount > 0 && (
          <button
            disabled={!!busy}
            onClick={() => void action("retry-failed")}
            title="重试失败项"
          >
            <RotateCcw size={15} />
            <span>重试失败</span>
          </button>
        )}
        <button
          className="danger-text"
          disabled={!!busy}
          onClick={() => void action("delete")}
          title="删除任务"
        >
          {busy === "delete" ? (
            <LoaderCircle className="spin" size={15} />
          ) : (
            <Trash2 size={15} />
          )}
          <span>删除</span>
        </button>
      </div>
      {error && (
        <p className="task-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
export function TaskDetailsDialog({
  jobId,
  onClose,
  onDeleted,
}: {
  jobId: string | null;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [previewId, setPreviewId] = useState("");
  const initialized = useRef("");
  const load = useCallback(async () => {
    if (!jobId) return;
    try {
      const data = await request<{ job: Task }>(`/api/video-jobs/${jobId}`);
      setTask(data.job);
      setError("");
      if (initialized.current !== jobId) {
        initialized.current = jobId;
        setSelected(
          data.job.items
            ?.filter((x) => x.status === "completed")
            .map((x) => x.id) ?? [],
        );
        setPreviewId("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "读取失败");
    }
  }, [jobId]);
  useEffect(() => {
    if (jobId) {
      ref.current?.showModal();
      const start = setTimeout(() => void load(), 0);
      const timer = setInterval(() => void load(), 1000);
      return () => {
        clearTimeout(start);
        clearInterval(timer);
      };
    }
    ref.current?.close();
  }, [jobId, load]);
  const completed = task?.items?.filter((x) => x.status === "completed") ?? [];
  const selectedCompleted = completed.filter((x) => selected.includes(x.id));
  const preview =
    task?.items?.find((x) => x.id === previewId) ??
    completed[0] ??
    task?.items?.[0];
  const active =
    task?.items?.filter((x) => x.status === "rendering").length ?? 0;
  const toggle = (id: string) =>
    setSelected((previous) =>
      previous.includes(id)
        ? previous.filter((x) => x !== id)
        : [...previous, id],
    );
  return (
    <dialog
      ref={ref}
      className="task-dialog"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="task-dialog-heading">
        <h2>任务生成进度</h2>
        <button onClick={onClose} aria-label="关闭任务详情">
          <X size={23} />
        </button>
      </div>
      {error && (
        <div className="notice error">
          <AlertCircle size={16} />
          {error}
        </div>
      )}
      {task && (!jobId || task.id === jobId) ? (
        <div className="task-dialog-layout">
          <section className="task-preview-card">
            <h3>预览</h3>
            <div className="task-preview-media">
              {preview?.previewUrl ? (
                <video
                  key={preview.id}
                  src={preview.previewUrl}
                  controls
                  playsInline
                  preload="metadata"
                  poster={preview.thumbnailUrl}
                />
              ) : preview ? (
                <img src={preview.thumbnailUrl} alt="任务素材" />
              ) : (
                <Film size={48} />
              )}
            </div>
            <dl>
              <dt>任务 ID</dt>
              <dd title={task.id}>{task.id}</dd>
              <dt>创建时间</dt>
              <dd>
                {new Date(task.createdAt).toLocaleString("zh-CN", {
                  hour12: false,
                })}
              </dd>
              <dt>输出数量</dt>
              <dd>{task.totalCount} 条视频</dd>
              <dt>视频时长</dt>
              <dd>{task.durationSec} 秒 / 条</dd>
              <dt>画面规格</dt>
              <dd>跟随原图 · {task.resolution}</dd>
              <dt>任务类型</dt>
              <dd>
                {task.toolType === "three_image_motion"
                  ? "三图微动"
                  : "单图动效"}
              </dd>
            </dl>
          </section>
          <section className="task-details-main">
            <div className="task-progress-heading">
              <h3>整体进度</h3>
              <strong>{taskProgress(task)}%</strong>
            </div>
            <div className="progress-track">
              <i style={{ width: `${taskProgress(task)}%` }} />
            </div>
            <div className="task-counters">
              {[
                [task.totalCount, "总数量", "blue"],
                [task.completedCount, "已生成", "green"],
                [active, "生成中", "amber"],
                [task.failedCount, "失败", "red"],
              ].map(([value, label, color]) => (
                <div key={label} className={`counter-${color}`}>
                  <i>
                    {color === "green" ? (
                      <Check size={16} />
                    ) : color === "red" ? (
                      <X size={16} />
                    ) : (
                      <Clock3 size={16} />
                    )}
                  </i>
                  <strong>{value}</strong>
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <TaskControls
              task={task}
              onChange={() => void load()}
              onDeleted={() => {
                onClose();
                onDeleted?.();
              }}
            />
            {!task.workerOnline &&
              ["running", "pending", "pausing"].includes(task.status) && (
                <p className="inline-warning">
                  渲染服务离线，仍可暂停或删除任务。
                </p>
              )}
            <div className="task-results-heading">
              <h3>生成结果（{task.totalCount}）</h3>
              <label>
                <input
                  type="checkbox"
                  checked={
                    completed.length > 0 &&
                    selectedCompleted.length === completed.length
                  }
                  onChange={() =>
                    setSelected(
                      selectedCompleted.length === completed.length
                        ? []
                        : completed.map((x) => x.id),
                    )
                  }
                />
                全选已完成（{completed.length}）
              </label>
              {selectedCompleted.length > 0 && (
                <BulkDownloadButton
                  jobId={task.id}
                  count={selectedCompleted.length}
                  itemIds={selectedCompleted.map((x) => x.id)}
                  compact
                />
              )}
            </div>
            <div className="task-result-grid" role="region" aria-label="生成结果列表" tabIndex={0}>
              {task.items?.map((item, index) => (
                <article
                  className={preview?.id === item.id ? "active" : ""}
                  key={item.id}
                >
                  <div className="task-result-thumb">
                    <button
                      className="task-result-preview"
                      onClick={() => setPreviewId(item.id)}
                      aria-label={`预览第 ${index + 1} 条`}
                    >
                      <img
                        src={item.thumbnailUrl}
                        alt={item.effectName}
                        loading="lazy"
                      />
                      {item.previewUrl && (
                        <i>
                          <Play size={18} />
                        </i>
                      )}
                    </button>
                    {item.status === "completed" && (
                      <input
                        aria-label={`选择第 ${index + 1} 条`}
                        type="checkbox"
                        checked={selected.includes(item.id)}
                        onChange={() => toggle(item.id)}
                      />
                    )}
                    <small>
                      00:{task.durationSec.toString().padStart(2, "0")}
                    </small>
                  </div>
                  <strong title={item.effectName}>
                    {task.toolType === "three_image_motion"
                      ? `第 ${index + 1} 组三图微动`
                      : item.effectName}
                  </strong>
                  <span className={`status-pill status-${item.status}`}>
                    {item.status === "completed" ? (
                      <CheckCircle2 size={13} />
                    ) : item.status === "rendering" ? (
                      <LoaderCircle className="spin" size={13} />
                    ) : (
                      <Clock3 size={13} />
                    )}{" "}
                    {item.status === "rendering"
                      ? `${stageNames[item.stage] ?? "生成中"} ${Math.round(item.progress * 100)}%`
                      : item.status === "waiting" && task.status === "paused"
                        ? "已暂停"
                        : taskStatus[item.status]}
                  </span>
                  {item.stalled && (
                    <small className="task-error">
                      进度暂未变化，可暂停或删除
                    </small>
                  )}
                  {item.errorMessage && (
                    <small className="task-error" title={item.errorMessage}>
                      {item.errorMessage}
                    </small>
                  )}
                  {item.status === "failed" && (
                    <button
                      className="text-button"
                      onClick={() =>
                        void request(`/api/video-job-items/${item.id}/retry`, {
                          method: "POST",
                        })
                          .then(() => load())
                          .catch((e) => setError(String(e)))
                      }
                    >
                      重试此条
                    </button>
                  )}
                </article>
              ))}
            </div>
          </section>
        </div>
      ) : (
        <div className="empty-history">
          <LoaderCircle className="spin" />
          正在读取任务…
        </div>
      )}
    </dialog>
  );
}
export function CurrentTask({
  jobId,
  onDeleted,
}: {
  jobId: string;
  onDeleted: () => void;
}) {
  const deleted = useRef(onDeleted);
  useEffect(() => {
    deleted.current = onDeleted;
  }, [onDeleted]);
  const [task, setTask] = useState<Task | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setTask((await request<{ job: Task }>(`/api/video-jobs/${jobId}`)).job);
    } catch (e) {
      if ((e as Error & { status?: number }).status === 404) {
        setTask(null);
        deleted.current();
      } else setError(String(e));
    }
  }, [jobId]);
  useEffect(() => {
    const start = setTimeout(() => {
      void load();
      setOpen(true);
    }, 0);
    const timer = setInterval(() => void load(), 1000);
    return () => {
      clearTimeout(start);
      clearInterval(timer);
    };
  }, [load]);
  return (
    <>
      {task ? (
        <>
          <div className="panel-title-row">
            <h2>生成任务</h2>
            <span className={`status-pill status-${task.status}`}>
              {taskStatus[task.status]}
            </span>
          </div>
          <div className="task-state-banner">
            <span>
              <Film size={26} />
            </span>
            <div>
              <strong>{taskStatus[task.status]}</strong>
              <small>
                {task.completedCount} / {task.totalCount} 条已生成
              </small>
            </div>
          </div>
          <div className="progress-top">
            <span>整体进度</span>
            <strong>{taskProgress(task)}%</strong>
          </div>
          <div className="progress-track">
            <i style={{ width: `${taskProgress(task)}%` }} />
          </div>
          {!task.workerOnline &&
            ["pending", "running"].includes(task.status) && (
              <p className="inline-warning">渲染服务离线，操作任务不受影响</p>
            )}
          <TaskControls
            task={task}
            onChange={() => void load()}
            onDeleted={onDeleted}
          />
          <button className="primary-action" onClick={() => setOpen(true)}>
            查看任务与生成结果
          </button>
          {task.completedCount > 0 && (
            <BulkDownloadButton jobId={jobId} count={task.completedCount} />
          )}
        </>
      ) : (
        <p>{error || "正在读取任务…"}</p>
      )}
      <TaskDetailsDialog
        jobId={open ? jobId : null}
        onClose={() => setOpen(false)}
        onDeleted={onDeleted}
      />
    </>
  );
}
export function RecentTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setTasks(
        (await request<{ jobs: Task[] }>("/api/video-jobs?pageSize=3")).jobs,
      );
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }, []);
  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    const timer = setInterval(() => void load(), 3000);
    window.addEventListener("motionflow:tasks-changed", load);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
      window.removeEventListener("motionflow:tasks-changed", load);
    };
  }, [load]);
  return (
    <section className="panel recent-tasks">
      <div className="recent-heading">
        <h2>历史任务</h2>
        <Link href="/history">
          查看全部 <ChevronRight size={14} />
        </Link>
      </div>
      {error && <p className="task-error">{error}</p>}
      {!tasks.length ? (
        <div className="recent-empty">
          <Clock3 size={25} />
          <p>还没有任务</p>
          <small>生成的视频会保存在这里</small>
        </div>
      ) : (
        tasks.map((task) => (
          <article key={task.id}>
            <button
              className="recent-task-open"
              onClick={() => setSelected(task.id)}
            >
              <img
                src={task.thumbnailUrl ?? "/preview-placeholder.png"}
                alt="任务缩略图"
              />
              <span>
                <strong>
                  {task.toolType === "three_image_motion"
                    ? "三图微动"
                    : "单图动效"}{" "}
                  · {task.id.slice(-6)}
                </strong>
                <small>
                  {new Date(task.createdAt).toLocaleString("zh-CN", {
                    hour12: false,
                  })}
                </small>
                <small>
                  {task.totalCount} 条视频 · {task.durationSec} 秒
                </small>
              </span>
            </button>
            <span className={`status-pill status-${task.status}`}>
              {taskStatus[task.status]}
            </span>
            <TaskControls
              task={task}
              onChange={() => void load()}
              onDeleted={() => void load()}
              compact
            />
          </article>
        ))
      )}
      <TaskDetailsDialog
        jobId={selected}
        onClose={() => setSelected(null)}
        onDeleted={() => void load()}
      />
    </section>
  );
}
