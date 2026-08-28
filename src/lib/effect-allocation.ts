import {effects} from './effects';
import {createRandom, shuffle} from './random';
import type {CreateJobInput, EffectPreset} from './schema';

export function getEffectPool(input: CreateJobInput) {
  const enabled = effects.filter((effect) => effect.enabled);
  switch (input.effectMode) {
    case 'basic_only': return enabled.filter((effect) => effect.type === 'basic');
    case 'combo_only': return enabled.filter((effect) => effect.type === 'combo');
    case 'category_random': return enabled.filter((effect) => input.selectedCategories.includes(effect.category));
    case 'specific': return enabled.filter((effect) => input.selectedEffectIds.includes(effect.id));
    default: return enabled;
  }
}

export function allocateEffects(pool: EffectPreset[], count: number, allowDuplicate: boolean, seed: number) {
  if (pool.length === 0) throw new Error('当前条件下没有可用特效');
  const random = createRandom(seed);
  if (allowDuplicate) {
    return Array.from({length: count}, () => pool[Math.floor(random() * pool.length)]);
  }
  const result: EffectPreset[] = [];
  let previousId: string | undefined;
  while (result.length < count) {
    const cycle = shuffle(pool, random);
    if (cycle.length > 1 && cycle[0].id === previousId) {
      [cycle[0], cycle[1]] = [cycle[1], cycle[0]];
    }
    for (const effect of cycle) {
      if (result.length >= count) break;
      result.push(effect);
      previousId = effect.id;
    }
  }
  return result;
}

export function resolvedRandomParams(seed: number) {
  const random = createRandom(seed);
  const variation = () => Number((0.9 + random() * 0.2).toFixed(4));
  return {
    scaleMultiplier: variation(),
    translateMultiplier: variation(),
    rotateMultiplier: variation(),
    blurMultiplier: variation(),
  };
}
