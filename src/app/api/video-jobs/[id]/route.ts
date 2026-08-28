import {errorResponse, ok} from '@/lib/api';
import {getJob} from '@/lib/jobs';

export const runtime = 'nodejs';
type Context = {params: Promise<{id: string}>};

export async function GET(_request: Request, {params}: Context) {
  const {id} = await params;
  const job = getJob(id);
  if (!job) return errorResponse(new Error('任务不存在'), 404);
  return ok({job});
}

