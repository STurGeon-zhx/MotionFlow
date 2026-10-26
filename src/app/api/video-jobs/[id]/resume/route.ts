import {errorResponse, ok} from '@/lib/api';
import {getClientOwnerId} from '@/lib/client-identity';
import {resumeVideoJob} from '@/lib/job-control';
export const runtime = 'nodejs';
export async function POST(request: Request, {params}: {params: Promise<{id: string}>}) {
  try {
    const result = resumeVideoJob((await params).id, getClientOwnerId(request));
    return result ? ok(result) : errorResponse(new Error('任务不存在'), 404);
  } catch (error) { return errorResponse(error, 409); }
}
