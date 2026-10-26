import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClaimedRenderItem } from "@/lib/jobs";
const mocks = vi.hoisted(() => ({ spawn: vi.fn(), execFile: vi.fn() }));
vi.mock("node:child_process", () => ({
  spawn: mocks.spawn,
  execFile: mocks.execFile,
}));
import {
  executeInSlot,
  RenderInterrupted,
  type RenderSlotProcess,
} from "@/lib/render-slot-process";
function child() {
  return Object.assign(new EventEmitter(), {
    pid: 12345,
    exitCode: null,
    connected: true,
    send: vi.fn((_message, callback) => callback?.()),
    kill: vi.fn(),
  }) as unknown as ChildProcess;
}
const item = { id: "item_test", run_token: "run-1" } as ClaimedRenderItem;
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
describe("独立渲染槽位控制", () => {
  it("卡死时 3.5 秒内仅终止对应槽位，不依赖渲染返回", async () => {
    vi.useFakeTimers();
    const hung = child(),
      other = child();
    mocks.spawn.mockReturnValue(hung);
    mocks.execFile.mockImplementation((_bin, _args, _options, callback) => {
      hung.emit("exit", 1);
      callback();
    });
    const slot: RenderSlotProcess = { id: 1, child: null };
    const otherSlot = { id: 2, child: other };
    const promise = executeInSlot(
      slot,
      item,
      "test.mp4",
      { concurrency: 4, preset: "veryfast" },
      () => false,
      vi.fn(),
    );
    const result = expect(promise).rejects.toBeInstanceOf(RenderInterrupted);
    await vi.advanceTimersByTimeAsync(3500);
    await result;
    expect(slot.child).toBeNull();
    expect(otherSlot.child).toBe(other);
    expect(mocks.execFile).toHaveBeenCalledTimes(1);
    expect(hung.send).toHaveBeenCalledWith(
      { type: "cancel", token: "run-1" },
      expect.any(Function),
    );
  });
  it("浏览器崩溃会结束当前尝试，下一次重新创建进程", async () => {
    const crashed = child();
    mocks.spawn.mockReturnValueOnce(crashed);
    const slot: RenderSlotProcess = { id: 1, child: null };
    const pending = executeInSlot(
      slot,
      item,
      "test.mp4",
      { concurrency: 4, preset: "veryfast" },
      () => true,
      vi.fn(),
    );
    const rejected = expect(pending).rejects.toThrow("意外退出");
    crashed.emit("exit", 1);
    await rejected;
  });
  it("旧令牌消息不改变新任务，正确消息返回并复用进程", async () => {
    const current = child();
    mocks.spawn.mockReturnValue(current);
    const slot: RenderSlotProcess = { id: 1, child: null };
    const progress = vi.fn();
    const result = executeInSlot(
      slot,
      item,
      "test.mp4",
      { concurrency: 4, preset: "veryfast" },
      () => true,
      progress,
    );
    current.emit("message", { type: "progress", token: "old", progress: 0.9 });
    expect(progress).not.toHaveBeenCalled();
    current.emit("message", {
      type: "progress",
      token: "run-1",
      progress: 0.4,
      stage: "rendering",
    });
    expect(progress).toHaveBeenCalledWith(0.4, "rendering");
    current.emit("message", {
      type: "done",
      token: "run-1",
      metrics: { totalMs: 100 },
    });
    await expect(result).resolves.toMatchObject({ totalMs: 100 });
    expect(slot.child).toBe(current);
  });
});
