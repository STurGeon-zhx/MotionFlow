import {describe, expect, it} from 'vitest';
import {effects} from '@/lib/effects';
import {allocateEffects, getEffectPool, resolvedRandomParams} from '@/lib/effect-allocation';
import {createJobSchema, effectPresetSchema} from '@/lib/schema';

const baseInput = createJobSchema.parse({
  imageIds: ['img_1'], ratio: 'source', durationSec: 5, countPerImage: 1, effectMode: 'all_random',
  selectedCategories: [], selectedEffectIds: [], allowDuplicate: false, introDurationSec: .8,
  intensity: 'medium', enableBreathing: true, resolution: '1080p',
});

describe('特效预设与分配', () => {
  it('提供 10 个基础动画和 15 个组合动画', () => {
    expect(effects).toHaveLength(25);
    expect(effects.filter((effect) => effect.type === 'basic')).toHaveLength(10);
    expect(effects.filter((effect) => effect.type === 'combo')).toHaveLength(15);
    effects.forEach((effect) => expect(effectPresetSchema.safeParse(effect).success).toBe(true));
  });

  it('按模式过滤特效池', () => {
    expect(getEffectPool({...baseInput, effectMode: 'basic_only'}).every((effect) => effect.type === 'basic')).toBe(true);
    expect(getEffectPool({...baseInput, effectMode: 'category_random', selectedCategories: ['glitch']}).every((effect) => effect.category === 'glitch')).toBe(true);
  });

  it('关闭重复时先用完一轮再重复且避免相邻重复', () => {
    const pool = effects.slice(0, 3);
    const allocated = allocateEffects(pool, 8, false, 42);
    expect(new Set(allocated.slice(0, 3).map((effect) => effect.id)).size).toBe(3);
    for (let index = 1; index < allocated.length; index++) expect(allocated[index].id).not.toBe(allocated[index - 1].id);
  });

  it('相同随机种子产生稳定参数', () => {
    expect(resolvedRandomParams(2026)).toEqual(resolvedRandomParams(2026));
    expect(resolvedRandomParams(2026)).not.toEqual(resolvedRandomParams(2027));
  });
});
