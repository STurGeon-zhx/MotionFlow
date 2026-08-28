import {effects} from '@/lib/effects';
import {ok} from '@/lib/api';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const category = url.searchParams.get('category');
  const filtered = effects.filter((effect) => effect.enabled)
    .filter((effect) => !type || effect.type === type)
    .filter((effect) => !category || effect.category === category);
  return ok({effects: filtered});
}
