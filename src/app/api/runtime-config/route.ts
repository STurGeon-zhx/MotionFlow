import {ok} from '@/lib/api';
import {getDownloadMode} from '@/lib/package-mode';

export const runtime = 'nodejs';

export async function GET() {
  return ok({downloadMode: getDownloadMode()});
}
