import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import { spawnSync } from "node:child_process";
const source = path.resolve(".data/motion-studio.sqlite");
const destination = path.resolve(".data/review/migration-copy");
await fs.mkdir(destination, { recursive: true });
const original = new Database(source, { readonly: true });
const before = {
  jobs: original.prepare("SELECT COUNT(*) AS count FROM video_jobs").get(),
  items: original
    .prepare("SELECT COUNT(*) AS count FROM video_job_items")
    .get(),
  images: original.prepare("SELECT COUNT(*) AS count FROM images").get(),
};
await original.backup(path.join(destination, "motion-studio.sqlite"));
original.close();
const script =
  "import {getDb} from './src/lib/db.ts';const db=getDb();console.log(JSON.stringify({jobs:db.prepare('SELECT COUNT(*) AS count FROM video_jobs').get(),items:db.prepare('SELECT COUNT(*) AS count FROM video_job_items').get(),images:db.prepare('SELECT COUNT(*) AS count FROM images').get(),columns:db.prepare('PRAGMA table_info(video_job_items)').all().map(x=>x.name)}));db.close();";
const child = spawnSync(
  process.execPath,
  ["--import", "tsx", "--input-type=module", "-e", script],
  {
    env: { ...process.env, MOTION_DATA_DIR: destination },
    encoding: "utf8",
    windowsHide: true,
  },
);
if (child.status !== 0) throw Error(child.stderr);
const after = JSON.parse(child.stdout.trim());
for (const key of ["jobs", "items", "images"] as const)
  if (JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    throw Error("旧数据行数改变 " + key);
for (const column of ["run_token", "heartbeat_at", "stage"])
  if (!after.columns.includes(column)) throw Error("缺少兼容字段");
const report = { before, after, sourceOpenedReadOnly: true, passed: true };
await fs.writeFile(
  path.join(destination, "report.json"),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
