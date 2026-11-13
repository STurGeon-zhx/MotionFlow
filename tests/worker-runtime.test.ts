import {EventEmitter} from 'node:events';
import type {ChildProcess} from 'node:child_process';
import * as workerRuntime from '@/lib/worker-runtime';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {getAttemptConcurrency, getRenderRuntimeConfig, getRenderTimeoutMs, runWithRenderRetries, runWorkerSlots} from '@/lib/worker-runtime';

describe('Worker 并行运行配置', () => {
  it('默认使用双槽位、四路帧并发和 veryfast 编码', () => {
    expect(getRenderRuntimeConfig({} as NodeJS.ProcessEnv)).toEqual({slots: 2, concurrency: 4, preset: 'veryfast'});
  });

  it('失败重试按 4、2、1 降低并发', () => {
    expect([0, 1, 2].map((attempt) => getAttemptConcurrency(4, attempt))).toEqual([4, 2, 1]);
  });

  it('渲染超时会随降级重试逐级放宽', () => {
    const env = {} as NodeJS.ProcessEnv;
    expect([0, 1, 2].map((attempt) => getRenderTimeoutMs('single_intro', attempt, env))).toEqual([300_000, 450_000, 600_000]);
    expect([0, 1, 2].map((attempt) => getRenderTimeoutMs('three_image_motion', attempt, env))).toEqual([600_000, 900_000, 1_200_000]);
  });

  it('允许通过环境变量调整基础渲染时限并限制异常值', () => {
    const env = (value: string) => ({NODE_ENV: 'test', MOTION_RENDER_TIMEOUT_SECONDS: value}) as NodeJS.ProcessEnv;
    expect(getRenderTimeoutMs('single_intro', 0, env('180'))).toBe(180_000);
    expect(getRenderTimeoutMs('single_intro', 0, env('10'))).toBe(300_000);
    expect(getRenderTimeoutMs('single_intro', 0, env('9999'))).toBe(3_600_000);
  });

  it('浏览器连续崩溃时重建两次并在最后一次进入恢复模式', async () => {
    const attempts: Array<{attempt: number; concurrency: number}> = [];
    const retries: number[] = [];
    let recoveryRuns = 0;
    const result = await runWithRenderRetries({
      configuredConcurrency: 4,
      maxRetries: 2,
      operation: async (attempt, concurrency) => {
        attempts.push({attempt, concurrency});
        if (attempt < 2) throw new Error('Target closed');
        return 'completed';
      },
      isRetryable: (error) => error instanceof Error && error.message.includes('Target closed'),
      onRetry: async (_error, retryNumber) => { retries.push(retryNumber); },
      runRecovery: async (operation) => { recoveryRuns++; return operation(); },
    });
    expect(result).toBe('completed');
    expect(attempts).toEqual([{attempt: 0, concurrency: 4}, {attempt: 1, concurrency: 2}, {attempt: 2, concurrency: 1}]);
    expect(retries).toEqual([1, 2]);
    expect(recoveryRuns).toBe(1);
  });

  it('两个槽位各自领取任务且不会重复处理', async () => {
    const queue = [1, 2];
    const handled: Array<{item: number; slot: number}> = [];
    await runWorkerSlots({
      slots: 2,
      shouldStop: () => handled.length === 2,
      claim: () => queue.shift() ?? null,
      handle: async (item, slot) => { handled.push({item, slot}); },
      idleWait: async () => {},
    });
    expect(handled.map(({item}) => item).sort()).toEqual([1, 2]);
    expect(new Set(handled.map(({slot}) => slot)).size).toBe(2);
  });

  it('收到停止信号后不再领取新任务', async () => {
    const claim = vi.fn(() => 1);
    await runWorkerSlots({
      slots: 2,
      shouldStop: () => true,
      claim,
      handle: async () => {},
      idleWait: async () => {},
    });
    expect(claim).not.toHaveBeenCalled();
  });
  it('一个槽位领取或处理异常不会停止其它槽位和后续调度', async () => {
    const queue=[1,2,3];const handled:number[]=[];let first=true;const errors:unknown[]=[];
    await expect(runWorkerSlots({
      slots:2,
      shouldStop:()=>handled.length===2,
      claim:()=>{if(first){first=false;throw Error('SQLITE_BUSY');}return queue.shift()??null;},
      handle:async item=>{if(item===1)throw Error('临时文件被占用');handled.push(item);},
      idleWait:async()=>{await new Promise(resolve=>setTimeout(resolve,1));},
      onError:(error:unknown)=>{errors.push(error);},
    })).resolves.toBeUndefined();
    expect(handled.sort()).toEqual([2,3]);
    expect(errors).toHaveLength(2);
  });

});

function runnerProcess() {
  return Object.assign(new EventEmitter(),{pid:12345,exitCode:null,connected:true}) as unknown as ChildProcess;
}
afterEach(()=>vi.useRealTimers());
describe('Worker后台故障恢复',()=>{
  it('后台退出后自动重建，停止软件后不再启动后台',async()=>{
    vi.useFakeTimers();const workers:ChildProcess[]=[];const stopped:ChildProcess[]=[];
    const supervisor=workerRuntime.superviseWorkerProcess({
      spawnWorker:()=>{const worker=runnerProcess();workers.push(worker);return worker;},
      stopWorker:async worker=>{stopped.push(worker);},
      onError:()=>{},
    });
    expect(workers).toHaveLength(1);
    workers[0].emit('exit',1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(workers).toHaveLength(2);
    await supervisor.stop();
    workers[1].emit('exit',1);
    await vi.advanceTimersByTimeAsync(60000);
    expect(workers).toHaveLength(2);
    expect(stopped).toContain(workers[1]);
  });
  it('心跳卡死时先释放旧进程再重建，不能重复启动',async()=>{
    vi.useFakeTimers();const workers:ChildProcess[]=[];let release!:()=>void;
    const supervisor=workerRuntime.superviseWorkerProcess({
      spawnWorker:()=>{const worker=runnerProcess();workers.push(worker);return worker;},
      stopWorker:()=>new Promise<void>(resolve=>{release=resolve;}),onError:()=>{},
    });
    await vi.advanceTimersByTimeAsync(30000);
    await vi.advanceTimersByTimeAsync(10000);
    expect(workers).toHaveLength(1);
    release();await vi.advanceTimersByTimeAsync(2000);
    expect(workers).toHaveLength(2);
    const stopped=supervisor.stop();await Promise.resolve();release();await stopped;
  });
  it('持续收到有效心跳时不误杀长时间的正常渲染',async()=>{
    vi.useFakeTimers();const workers:ChildProcess[]=[];
    const supervisor=workerRuntime.superviseWorkerProcess({
      spawnWorker:()=>{const worker=runnerProcess();workers.push(worker);return worker;},
      stopWorker:async()=>{},onError:()=>{},
    });
    for(let i=0;i<20;i++){
      await vi.advanceTimersByTimeAsync(10000);workers[0].emit('message',{type:'worker-heartbeat'});
    }
    expect(workers).toHaveLength(1);await supervisor.stop();
  });
});
