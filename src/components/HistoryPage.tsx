/* eslint-disable @next/next/no-img-element -- Local authenticated media must not be fetched by the Next image optimizer. */
"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Clock3,
  Film,
  LoaderCircle,
  Sparkles,
} from "lucide-react";
import { BulkDownloadButton } from "./BulkDownloadButton";
import {
  TaskControls,
  TaskDetailsDialog,
  taskStatus,
  type Task,
} from "./TaskCenter";
export function HistoryPage() {
  const [jobs, setJobs] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/video-jobs?pageSize=50", {
        cache: "no-store",
      });
      const body = await res.json();
      if (!res.ok) throw Error(body.error ?? "读取失败");
      setJobs(body.jobs);
      setError("");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const start = setTimeout(() => void load(), 0);
    const timer = setInterval(() => void load(), 2000);
    return () => {
      clearTimeout(start);
      clearInterval(timer);
    };
  }, [load]);
  return (
    <main className="history-page">
      <div className="history-hero">
        <div>
          <span className="eyebrow">
            <Clock3 size={14} />
            本地任务记录
          </span>
          <h1>历史任务</h1>
          <p>仅显示当前设备的任务，排队或渲染中也可以暂停、删除。</p>
        </div>
        <Link className="primary-action compact" href="/?new=1">
          <Sparkles size={17} />
          创建新任务
        </Link>
      </div>
      {error && (
        <div className="notice error">
          <AlertCircle size={17} />
          {error}
        </div>
      )}
      {loading ? (
        <div className="empty-history">
          <LoaderCircle className="spin" />
          正在读取…
        </div>
      ) : !jobs.length ? (
        <div className="empty-history">
          <Film size={38} />
          <h2>还没有任务</h2>
          <Link href="/">前往动效工坊</Link>
        </div>
      ) : (
        <div className="history-table-wrap">
          <table className="history-table">
            <thead>
              <tr>
                <th>任务</th>
                <th>创建时间</th>
                <th>规格</th>
                <th>进度</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    <button
                      className="history-name-button"
                      onClick={() => setSelected(job.id)}
                    >
                      <img
                        src={job.thumbnailUrl ?? "/preview-placeholder.png"}
                        alt=""
                      />
                      <span>
                        <strong>
                          {job.toolType === "three_image_motion"
                            ? "三图微动"
                            : "单图动效"}{" "}
                          · {job.id.slice(-6)}
                        </strong>
                        <small>
                          {job.totalCount} 条 · {job.durationSec} 秒
                        </small>
                      </span>
                    </button>
                  </td>
                  <td>
                    {new Date(job.createdAt).toLocaleString("zh-CN", {
                      hour12: false,
                    })}
                  </td>
                  <td>跟随原图 · {job.resolution}</td>
                  <td>
                    <div className="table-progress">
                      <span>
                        <i
                          style={{
                            width: `${((job.completedCount + job.failedCount) / Math.max(1, job.totalCount)) * 100}%`,
                          }}
                        />
                      </span>
                      <small>
                        {job.completedCount}/{job.totalCount}
                      </small>
                    </div>
                  </td>
                  <td>
                    <span className={`status-pill status-${job.status}`}>
                      {taskStatus[job.status]}
                    </span>
                  </td>
                  <td>
                    <div className="table-actions">
                      <button onClick={() => setSelected(job.id)}>
                        查看详情
                      </button>
                      {job.completedCount > 0 && (
                        <BulkDownloadButton
                          jobId={job.id}
                          count={job.completedCount}
                          compact
                        />
                      )}
                      <TaskControls
                        task={job}
                        onChange={() => void load()}
                        onDeleted={() => void load()}
                        compact
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <TaskDetailsDialog
        jobId={selected}
        onClose={() => setSelected(null)}
        onDeleted={() => void load()}
      />
    </main>
  );
}
