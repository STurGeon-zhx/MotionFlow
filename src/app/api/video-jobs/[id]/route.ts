import {errorResponse, ok} from '@/lib/api';
import {getClientOwnerId} from '@/lib/client-identity';
import {deleteVideoJob, getJob} from '@/lib/jobs';

export const runtime = 'nodejs';
type Context = {params: Promise<{id: string}>};

export async function GET(request: Request, {params}: Context) {
  const {id} = await params;
  const job = getJob(id, getClientOwnerId(request));
  if (!job) return errorResponse(new Error('任务不存在'), 404);
  return ok({job});
}

export async function DELETE(request: Request, {params}: Context) {
  const {id} = await params;
  try {
    const result = await deleteVideoJob(id, getClientOwnerId(request));
    if (!result) return errorResponse(new Error('任务不存在'), 404);
    if (!result.deleted) return errorResponse(new Error('任务仍在排队或生成中，暂时不能删除'), 409);
    return ok({deleted: true});
  } catch (error) {
    return errorResponse(error);
  }
}
