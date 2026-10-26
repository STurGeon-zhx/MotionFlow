import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const env = {
  ...process.env,
  MOTION_DESKTOP_REVIEW: "1",
  MOTION_NODE_EXECUTABLE: process.execPath,
};
delete env.ELECTRON_RUN_AS_NODE;
const logs = path.join(root, ".data/review/desktop");
fs.mkdirSync(logs, { recursive: true });
const child = spawn(
  require("electron"),
  [path.join(root, "packaging/desktop-review.cjs")],
  {
    cwd: root,
    env,
    windowsHide: false,
    detached: true,
    stdio: [
      "ignore",
      fs.openSync(path.join(logs, "desktop.log"), "a"),
      fs.openSync(path.join(logs, "desktop-error.log"), "a"),
    ],
  },
);
child.unref();
console.log("MotionFlow 本地评审版已启动；独立数据：" + logs);
