import fs from 'node:fs';
import path from 'node:path';
import {spawn, execFileSync} from 'node:child_process';
import sharp from 'sharp';
import {getVideoMetadata} from '@remotion/renderer';

const project = process.cwd();
const testRoot = path.join(project, '.data', 'worker-recovery', Date.now().toString());
process.env.MOTION_DATA_DIR = testRoot;
process.env.MOTION_REMOTION_BUNDLE = path.join(project, '.data/review/remotion-bundle');
process.env.MOTION_SEQUENCE_ENGINE = 'sharp';
fs.mkdirSync(testRoot, {recursive: true});
const {getDb, closeDbForTests} = await import('../src/lib/db');
const {createVideoJob, getJob, listJobs} = await import('../src/lib/jobs');
const {deleteVideoJob, pauseVideoJob, resumeVideoJob} = await import('../src/lib/job-control');
const db = getDb();
const owner = 'worker-recovery-isolated-device';
const checks: string[] = [];
function assert(value: unknown, label: string): asserts value {
  if (!value) throw new Error(label);
  checks.push(label); console.log('[recovery]', label);
}
async function poll<T>(read: () => T, accept: (value: T) => boolean, timeout = 45000): Promise<T> {
  const start = Date.now();
  let value: T;
  do {value = read(); if (accept(value)) return value; await new Promise(resolve => setTimeout(resolve, 150));} while (Date.now()-start < timeout);
  throw new Error('等待超时：' + JSON.stringify(value));
}
const imagePath = path.join(testRoot, 'test-source.png');
await sharp(path.join(project, 'public/preview-sample.svg')).png().toFile(imagePath);
const metadata = await sharp(imagePath).metadata();
const ids = Array.from({length:100}, (_,i) => 'recovery-image-' + i);
const insert = db.prepare('INSERT INTO images (id,owner_id,original_name,stored_name,file_path,mime_type,width,height,size_bytes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)');
for (const id of ids) insert.run(id,owner,id+'.png',id+'.png',imagePath,'image/png',metadata.width,metadata.height,fs.statSync(imagePath).size,new Date().toISOString());
const input = {imageIds:ids,ratio:'source',resolution:'720p',countPerImage:1,effectMode:'specific',selectedEffectIds:['basic_zoom_in'],allowDuplicate:false,introDurationSec:1.2,intensity:'medium',enableBreathing:true};
const corrupt = createVideoJob({...input,imageIds:ids.slice(0,1)},owner);
db.prepare("UPDATE video_jobs SET request_json = '{broken' WHERE id = ?").run(corrupt.jobId);
db.prepare("UPDATE video_job_items SET created_at = '2000-01-01T00:00:00.000Z' WHERE job_id = ?").run(corrupt.jobId);
const batch = createVideoJob(input,owner);
// 独立连接持续模拟页面保存参数/写入心跳，与后台领取任务并发。
const writerCode="const Database=require('better-sqlite3');const db=new Database(process.argv[1]);db.pragma('busy_timeout=20');setInterval(()=>{try{db.prepare(\"INSERT OR REPLACE INTO app_meta (key,value) VALUES ('contention-stress',?)\").run(String(Date.now()));}catch(error){if(!error.code?.startsWith('SQLITE_BUSY'))throw error;}},5);";
const stressWriter=spawn(process.execPath,['-e',writerCode,path.join(testRoot,'motion-studio.sqlite')],{cwd:project,env:process.env,windowsHide:true,stdio:'ignore'});
const logFile = path.join(testRoot,'worker.log');
let log = '';
const worker = spawn(process.execPath, ['--import','tsx',path.join(project,'src/worker.ts')], {cwd:project,env:process.env,windowsHide:true,stdio:['ignore','pipe','pipe']});
worker.on('exit',(code,signal)=>{fs.appendFileSync(logFile,'\n[supervisor-exit] '+code+' '+signal+'\n');});
for (const stream of [worker.stdout,worker.stderr]) stream.on('data',data=>{log+=data;fs.appendFileSync(logFile,data);});
const runnerPid = () => [...log.matchAll(/调度进程启动 PID=(\d+)/g)].map(match=>Number(match[1])).at(-1);
const kill = (pid: number) => execFileSync('taskkill.exe',['/PID',String(pid),'/T','/F'],{windowsHide:true,stdio:'ignore',timeout:5000});
try {
  await poll(()=>db.prepare("SELECT COUNT(*) AS n FROM video_job_items WHERE job_id = ? AND status = 'rendering'").get(batch.jobId) as {n:number},v=>v.n>0);
  assert((getJob(corrupt.jobId,owner) as {status:string}).status==='failed','坏记录隔离失败，100条后续任务正常开始处理');
  const oldPid=runnerPid(); assert(oldPid,'获取测试调度进程PID');
  await poll(()=>db.prepare("SELECT id FROM video_job_items WHERE job_id = ? AND status = 'rendering' AND progress > 0").get(batch.jobId),Boolean);
  const before=Date.now(); process.kill(oldPid,'SIGKILL');
  await deleteVideoJob(batch.jobId,owner);
  assert(!listJobs(owner).jobs.some(job=>job.id===batch.jobId),'后台崩溃时删除任务立即从历史中隐藏');
  await poll(runnerPid,pid=>Boolean(pid&&pid!==oldPid),15000);
  await poll(()=>db.prepare('SELECT id FROM video_jobs WHERE id = ?').get(batch.jobId),row=>!row,10000);
  assert(worker.exitCode===null,'调度崩溃后监督进程仍存活并自动重启，耗时'+(Date.now()-before)+'ms');
  const next=createVideoJob({...input,imageIds:ids.slice(0,2)},owner);
  const finished=await poll(()=>getJob(next.jobId,owner) as {status:string},job=>['completed','failed','partial_failed'].includes(job.status));
  assert(finished.status==='completed','删除100条旧任务后，新建任务成功生成全部成片');
  const outputs=db.prepare("SELECT output_path FROM video_job_items WHERE job_id = ? AND status = 'completed'").all(next.jobId) as Array<{output_path:string}>;
  for(const output of outputs){const meta=await getVideoMetadata(output.output_path);assert(meta.codec==='h264'&&meta.fps===30&&meta.width===1280&&meta.height===720&&meta.audioCodec==='aac'&&Math.abs((meta.durationInSeconds??0)-5)<.1,'恢复后成片仍为720p、30fps、H.264、AAC及5秒');}
  const outputTimes=outputs.map(output=>fs.statSync(output.output_path).mtimeMs);
  const secondPid=runnerPid();assert(secondPid,'获取再次中断的测试调度进程PID');kill(secondPid);
  await poll(runnerPid,pid=>Boolean(pid&&pid!==secondPid),15000);
  assert((getJob(next.jobId,owner) as {status:string}).status==='completed'&&outputs.every((output,index)=>fs.statSync(output.output_path).mtimeMs===outputTimes[index]),'后台再次崩溃后，已完成成片不丢失也不重新渲染');
  const controlled=createVideoJob({...input,imageIds:ids.slice(0,6)},owner);
  await poll(()=>db.prepare("SELECT id FROM video_job_items WHERE job_id = ? AND status = 'rendering'").get(controlled.jobId),Boolean);
  pauseVideoJob(controlled.jobId,owner);
  await poll(()=>getJob(controlled.jobId,owner) as {status:string},j=>j.status==='paused',10000);
  assert(true,'恢复后仍可暂停正在渲染的任务');
  resumeVideoJob(controlled.jobId,owner);
  await poll(()=>db.prepare("SELECT id FROM video_job_items WHERE job_id = ? AND status = 'rendering'").get(controlled.jobId),Boolean);
  await deleteVideoJob(controlled.jobId,owner);
  await poll(()=>db.prepare('SELECT id FROM video_jobs WHERE id = ?').get(controlled.jobId),row=>!row,10000);
  assert(true,'继续后删除活动任务，渲染资源正常释放');
  const sequence=createVideoJob({toolType:'three_image_motion',imageIds:ids.slice(0,3),resolution:'720p',motionSpeed:.8,motionAmplitude:.025,enableMusic:true},owner);
  const sequenceJob=await poll(()=>getJob(sequence.jobId,owner) as {status:string},j=>['completed','failed','partial_failed'].includes(j.status),90000);
  assert(sequenceJob.status==='completed','恢复后新建三图15秒任务也能完成');
  assert(stressWriter.exitCode===null,'持续数据库并发写入下，领取、暂停、删除和重建均可完成');
  fs.writeFileSync(path.join(testRoot,'report.json'),JSON.stringify({passed:true,checks,testRoot,checkedAt:new Date().toISOString()},null,2));
  console.log('真实故障恢复验收通过：'+testRoot);
} finally {
  if(worker.pid&&worker.exitCode===null){try{kill(worker.pid);}catch{/* 测试进程可能已退出，不能覆盖原始验收错误。 */}}
  if(stressWriter.pid&&stressWriter.exitCode===null){try{kill(stressWriter.pid);}catch{}}
  closeDbForTests();
}
