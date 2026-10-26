import fs from "node:fs";
import path from "node:path";
import { getDb } from "./db";
import { recomputeJob, type ItemRow } from "./jobs";
import { outputsDir, tempDir } from "./storage";

export function pauseVideoJob(jobId: string, ownerId: string) {
  const db = getDb();
  return db.transaction(() => {
    const row = db
      .prepare("SELECT status FROM video_jobs WHERE id = ? AND owner_ip = ?")
      .get(jobId, ownerId) as { status: string } | undefined;
    if (!row || row.status === "deleting") return null;
    if (
      ["completed", "failed", "partial_failed", "paused", "pausing"].includes(
        row.status,
      )
    )
      return { status: row.status };
    const active = db
      .prepare(
        "SELECT 1 FROM video_job_items WHERE job_id = ? AND status = 'rendering'",
      )
      .get(jobId);
    const status = active ? "pausing" : "paused";
    db.prepare(
      "UPDATE video_jobs SET status = ?, updated_at = ? WHERE id = ?",
    ).run(status, new Date().toISOString(), jobId);
    recoverStaleControls();
    return db
      .prepare("SELECT status FROM video_jobs WHERE id = ?")
      .get(jobId) as { status: string };
  })();
}

export function resumeVideoJob(jobId: string, ownerId: string) {
  const db = getDb();
  const row = db
    .prepare("SELECT status FROM video_jobs WHERE id = ? AND owner_ip = ?")
    .get(jobId, ownerId) as { status: string } | undefined;
  if (!row || row.status === "deleting") return null;
  if (row.status === "pausing") throw new Error("正在释放渲染资源，请稍后继续");
  if (row.status === "paused") {
    db.prepare(
      "UPDATE video_jobs SET status = 'pending', updated_at = ? WHERE id = ?",
    ).run(new Date().toISOString(), jobId);
    recomputeJob(jobId);
  }
  return { resumed: true };
}

export function isItemExecutionActive(item: ItemRow) {
  return Boolean(
    getDb()
      .prepare(
        `SELECT 1 FROM video_job_items item JOIN video_jobs job ON job.id = item.job_id
    WHERE item.id = ? AND item.run_token IS ? AND item.status = 'rendering' AND job.status IN ('pending', 'running')`,
      )
      .get(item.id, item.run_token ?? null),
  );
}

export function releaseInterruptedItem(item: ItemRow) {
  getDb()
    .prepare(
      `UPDATE video_job_items SET status = 'waiting', progress = 0, stage = 'waiting', run_token = NULL,
    heartbeat_at = NULL, error_message = NULL, updated_at = ? WHERE id = ? AND run_token IS ? AND status = 'rendering'`,
    )
    .run(new Date().toISOString(), item.id, item.run_token ?? null);
  recomputeJob(item.job_id);
}

export function writeWorkerHeartbeat() {
  getDb()
    .prepare(
      "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('worker_heartbeat', ?)",
    )
    .run(String(Date.now()));
}

export function heartbeatItem(item: ItemRow) {
  getDb()
    .prepare(
      "UPDATE video_job_items SET heartbeat_at = ? WHERE id = ? AND run_token IS ? AND status = 'rendering'",
    )
    .run(new Date().toISOString(), item.id, item.run_token ?? null);
}

export function recoverStaleControls() {
  const rows = getDb()
    .prepare(
      `SELECT item.* FROM video_job_items item JOIN video_jobs job ON job.id = item.job_id
    WHERE item.status = 'rendering' AND job.status IN ('pausing', 'deleting')`,
    )
    .all() as ItemRow[];
  for (const item of rows)
    if (Date.now() - Date.parse(item.heartbeat_at ?? item.updated_at) > 20_000)
      releaseInterruptedItem(item);
}

export async function cleanupDeletedJobs() {
  const db = getDb();
  const rows = db
    .prepare("SELECT id FROM video_jobs WHERE status = 'deleting'")
    .all() as Array<{ id: string }>;
  for (const { id } of rows) {
    const items = db
      .prepare("SELECT * FROM video_job_items WHERE job_id = ?")
      .all(id) as ItemRow[];
    if (items.some((item) => item.status === "rendering")) continue;
    try {
      const files = new Set<string>();
      for (const item of items) {
        if (
          item.output_path &&
          path
            .resolve(item.output_path)
            .startsWith(path.resolve(outputsDir) + path.sep)
        )
          files.add(path.resolve(item.output_path));
        files.add(path.join(outputsDir, `${item.id}.mp4`));
        for (const filename of fs.readdirSync(tempDir))
          if (
            filename === `${item.id}.mp4` ||
            filename.startsWith(`${item.id}-`)
          )
            files.add(path.join(tempDir, filename));
      }
      await Promise.all(
        [...files].map((file) => fs.promises.rm(file, { force: true })),
      );
      db.prepare(
        "DELETE FROM video_jobs WHERE id = ? AND status = 'deleting'",
      ).run(id);
    } catch (error) {
      console.warn("[worker] 删除文件暂时被占用，将重试", id, String(error));
    }
  }
}

export async function deleteVideoJob(jobId: string, ownerIp: string) {
  const db = getDb();
  if (
    !db
      .prepare("SELECT id FROM video_jobs WHERE id = ? AND owner_ip = ?")
      .get(jobId, ownerIp)
  )
    return null;
  db.prepare(
    "UPDATE video_jobs SET status = 'deleting', updated_at = ? WHERE id = ? AND owner_ip = ?",
  ).run(new Date().toISOString(), jobId, ownerIp);
  recoverStaleControls();
  await cleanupDeletedJobs();
  return {
    deleted: true as const,
    pendingCleanup: Boolean(
      db.prepare("SELECT id FROM video_jobs WHERE id = ?").get(jobId),
    ),
  };
}
