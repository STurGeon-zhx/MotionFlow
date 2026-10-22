import {errorResponse, ok} from '@/lib/api';
import {getClientOwnerId} from '@/lib/client-identity';
import {createVideoJob, listJobs} from '@/lib/jobs';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    return ok(createVideoJob(await request.json(), getClientOwnerId(request)));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const page = Number(url.searchParams.get('page') ?? 1);
  const pageSize = Number(url.searchParams.get('pageSize') ?? 12);
  return ok(listJobs(getClientOwnerId(request), page, pageSize));
}
