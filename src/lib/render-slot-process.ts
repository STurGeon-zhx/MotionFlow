import { spawn, execFile, type ChildProcess } from "node:child_process";
import path from "node:path";
import type { ClaimedRenderItem } from "./jobs";
import type { RenderClaimedItemOptions, RenderMetrics } from "./render-video";

export class RenderInterrupted extends Error {
  constructor() {
    super("任务已暂停或删除");
  }
}
export type RenderSlotProcess = { id: number; child: ChildProcess | null };
export async function stopSlotProcess(slot: RenderSlotProcess) {
  const child = slot.child;
  slot.child = null;
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32") {
    await new Promise<void>((resolve) =>
      execFile(
        "taskkill.exe",
        ["/pid", String(child.pid), "/t", "/f"],
        { windowsHide: true },
        () => resolve(),
      ),
    );
  } else {
    child.kill("SIGKILL");
  }
}

export async function executeInSlot(
  slot: RenderSlotProcess,
  item: ClaimedRenderItem,
  outputPath: string,
  options: Pick<
    RenderClaimedItemOptions,
    "concurrency" | "preset" | "timeoutInMilliseconds" | "softwareRendering"
  >,
  isActive: () => boolean,
  onProgress: (progress: number, stage: string) => void,
): Promise<RenderMetrics> {
  if (!slot.child || slot.child.exitCode !== null || !slot.child.connected) {
    slot.child = spawn(
      process.execPath,
      [...process.execArgv, path.resolve("src/render-slot.ts")],
      {
        windowsHide: true,
        stdio: ["ignore", "inherit", "inherit", "ipc"],
        env: { ...process.env, MOTION_RENDER_SLOT: String(slot.id) },
      },
    );
  }
  const child = slot.child;
  return new Promise<RenderMetrics>((resolve, reject) => {
    let finished = false;
    let cancelAt = 0;
    let lastProgressAt = Date.now();
    let lastProgressValue = -1,
      lastStage = "";
    let killing = false;
    const startedAt = Date.now();
    let fatal: Error | null = null;
    const finish = (error?: Error, metrics?: RenderMetrics) => {
      if (finished) return;
      finished = true;
      clearInterval(timer);
      child.off("message", message);
      child.off("exit", exited);
      child.off("error", failed);
      if (error) reject(error);
      else resolve(metrics!);
    };
    const failed = (error: Error) => finish(fatal ?? error);
    const exited = () =>
      finish(fatal ?? new Error("browser process 渲染槽位意外退出"));
    const message = (value: unknown) => {
      const data = value as {
        type: string;
        token: string;
        progress: number;
        stage: string;
        metrics: RenderMetrics;
        error: string;
      };
      if (data.token !== item.run_token) return;
      if (data.type === "progress") {
        if (data.progress !== lastProgressValue || data.stage !== lastStage) {
          lastProgressAt = Date.now();
          lastProgressValue = data.progress;
          lastStage = data.stage;
        }
        if (!fatal) onProgress(data.progress, data.stage);
      } else if (data.type === "done" || data.type === "error") {
        if (fatal) void stopSlotProcess(slot).finally(() => finish(fatal!));
        else if (data.type === "error") finish(new Error(data.error));
        else finish(undefined, data.metrics);
      }
    };
    const timer = setInterval(() => {
      if (finished) return;
      if (!fatal) {
        if (!isActive()) fatal = new RenderInterrupted();
        else if (
          Date.now() - startedAt >
          (options.timeoutInMilliseconds ?? 300_000)
        )
          fatal = new Error("渲染总耗时超过限制，准备降级重试");
        else if (Date.now() - lastProgressAt > 120_000)
          fatal = new Error("渲染进度连续 120 秒无响应，准备重建槽位重试");
        if (fatal) {
          cancelAt = Date.now();
          child.send({ type: "cancel", token: item.run_token }, () => {});
        }
      }
      if (fatal && !killing && Date.now() - cancelAt >= 3000) {
        killing = true;
        void stopSlotProcess(slot).finally(() => finish(fatal!));
      }
    }, 500);
    child.on("message", message);
    child.once("exit", exited);
    child.once("error", failed);
    child.send({ type: "render", item, outputPath, options }, (error) => {
      if (error) failed(error);
    });
  });
}
