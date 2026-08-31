import {errorResponse, ok} from '@/lib/api';
import {getClientIp} from '@/lib/client-ip';
import {createVideoJob, listJobs} from '@/lib/jobs';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    return ok(createVideoJob(await request.json(), getClientIp(request)));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const page = Number(url.searchParams.get('page') ?? 1);
  const pageSize = Number(url.searchParams.get('pageSize') ?? 12);
  return ok(listJobs(getClientIp(request), page, pageSize));
}
