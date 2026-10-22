import {errorResponse, ok} from '@/lib/api';
import {getClientOwnerId} from '@/lib/client-identity';
import {retryFailedItems} from '@/lib/jobs';

export const runtime = 'nodejs';
type Context = {params: Promise<{id: string}>};

export async function POST(request: Request, {params}: Context) {
  const {id} = await params;
  const result = retryFailedItems(id, getClientOwnerId(request));
  if (!result) return errorResponse(new Error('任务不存在'), 404);
  return ok(result);
}
