import {errorResponse, ok} from '@/lib/api';
import {getClientIp} from '@/lib/client-ip';
import {retryFailedItems} from '@/lib/jobs';

export const runtime = 'nodejs';
type Context = {params: Promise<{id: string}>};

export async function POST(request: Request, {params}: Context) {
  const {id} = await params;
  const result = retryFailedItems(id, getClientIp(request));
  if (!result) return errorResponse(new Error('任务不存在'), 404);
  return ok(result);
}
