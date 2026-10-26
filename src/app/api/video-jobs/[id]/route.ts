import {errorResponse, ok} from '@/lib/api';
import {getClientOwnerId} from '@/lib/client-identity';
import {recoverStaleControls} from '@/lib/job-control';
import {deleteVideoJob, getJob} from '@/lib/jobs';

export const runtime = 'nodejs';
type Context = {params: Promise<{id: string}>};

export async function GET(request: Request, {params}: Context) {
  const {id} = await params;
  recoverStaleControls();
  const job = getJob(id, getClientOwnerId(request));
  if (!job) return errorResponse(new Error('任务不存在'), 404);
  return ok({job});
}

export async function DELETE(request: Request, {params}: Context) {
  const {id} = await params;
  try {
    const result = await deleteVideoJob(id, getClientOwnerId(request));
    if (!result) return errorResponse(new Error('任务不存在'), 404);
    return ok(result);
  } catch (error) {
    return errorResponse(error);
  }
}
