import {ok} from '@/lib/api';
import {getClientOwnerId} from '@/lib/client-identity';
import {getDb} from '@/lib/db';
import {recoverStaleControls} from '@/lib/job-control';
import {getDownloadMode} from '@/lib/package-mode';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  recoverStaleControls();
  const heartbeat = getDb().prepare("SELECT value FROM app_meta WHERE key = 'worker_heartbeat'").get() as {value:string}|undefined;
  const rendering = Boolean(getDb().prepare("SELECT 1 FROM video_job_items item JOIN video_jobs job ON job.id = item.job_id WHERE item.status = 'rendering' AND job.owner_ip = ? AND job.status IN ('pending', 'running', 'pausing') LIMIT 1").get(getClientOwnerId(request)));
  return ok({rendering, downloadMode:getDownloadMode(),codeVersion:process.env.MOTION_CODE_VERSION??'development',workerOnline:Date.now()-Number(heartbeat?.value??0)<15_000});
}
