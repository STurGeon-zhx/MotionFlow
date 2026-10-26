import { makeCancelSignal, type HeadlessBrowser } from "@remotion/renderer";
import {
  closeRenderBrowser,
  createRenderBrowser,
  renderClaimedItem,
  type RenderClaimedItemOptions,
} from "./lib/render-video";
import type { ClaimedRenderItem } from "./lib/jobs";
let browser: HeadlessBrowser | null = null;
let cancelCurrent: (() => void) | null = null;
let busy = false;
process.on(
  "message",
  async (message: {
    type: string;
    item: ClaimedRenderItem;
    token?: string;
    outputPath: string;
    options: RenderClaimedItemOptions;
  }) => {
    if (message.type === "cancel") {
      cancelCurrent?.();
      return;
    }
    if (message.type !== "render" || busy) return;
    busy = true;
    const { item, outputPath, options } = message;
    const { cancel, cancelSignal } = makeCancelSignal();
    cancelCurrent = cancel;
    const send = (data: Record<string, unknown>) => {
      if (process.connected) process.send?.({ ...data, token: item.run_token });
    };
    let lastProgress = 0;
    try {
      browser ??= await createRenderBrowser(options.softwareRendering);
      const metrics = await renderClaimedItem(item, outputPath, {
        ...options,
        browser,
        cancelSignal,
        onProgress: (progress) => {
          lastProgress = progress;
          send({ type: "progress", progress, stage: "rendering" });
        },
        onStage: (stage) =>
          send({ type: "progress", progress: lastProgress, stage }),
      });
      send({ type: "done", metrics });
    } catch (error) {
      send({
        type: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      busy = false;
      cancelCurrent = null;
    }
  },
);
process.on("disconnect", () => {
  cancelCurrent?.();
  const timeout = setTimeout(() => process.exit(0), 2000);
  timeout.unref();
  void closeRenderBrowser(browser).finally(() => process.exit(0));
});
