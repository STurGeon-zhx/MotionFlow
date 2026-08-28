import {errorResponse, ok} from '@/lib/api';
import {retryFailedItems} from '@/lib/jobs';

export const runtime = 'nodejs';
type Context = {params: Promise<{id: string}>};

export async function POST(_request: Request, {params}: Context) {
  const {id} = await params;
  const result = retryFailedItems(id);
  if (!result) return errorResponse(new Error('任务不存在'), 404);
  return ok(result);
}

