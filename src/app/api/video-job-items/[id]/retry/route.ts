import {errorResponse, ok} from '@/lib/api';
import {getClientIp} from '@/lib/client-ip';
import {retryFailedItem} from '@/lib/jobs';

export const runtime = 'nodejs';
type Context = {params: Promise<{id: string}>};

export async function POST(request: Request, {params}: Context) {
  const {id} = await params;
  const result = retryFailedItem(id, getClientIp(request));
  if (!result) return errorResponse(new Error('视频任务不存在'), 404);
  if (!result.retried) return errorResponse(new Error('当前视频不是失败状态，无需重试'), 409);
  return ok(result);
}
