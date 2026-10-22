import {describe, expect, it} from 'vitest';
import {effects} from '@/lib/effects';
import {allocateEffects, getEffectPool, resolvedRandomParams} from '@/lib/effect-allocation';
import {effectPresetSchema, singleIntroJobSchema} from '@/lib/schema';

const baseInput = singleIntroJobSchema.parse({
  toolType: 'single_intro',
  imageIds: ['img_1'], ratio: 'source', durationSec: 5, countPerImage: 1, effectMode: 'all_random',
  selectedCategories: [], selectedEffectIds: [], allowDuplicate: false, introDurationSec: .8,
  intensity: 'medium', enableBreathing: true, resolution: '1080p',
});

describe('特效预设与分配', () => {
  it('提供 7 个基础动画和 91 个组合动画', () => {
    expect(effects).toHaveLength(98);
    expect(effects.filter((effect) => effect.type === 'basic')).toHaveLength(7);
    expect(effects.filter((effect) => effect.type === 'combo')).toHaveLength(91);
    expect(new Set(effects.map((effect) => effect.id)).size).toBe(effects.length);
    effects.forEach((effect) => expect(effectPresetSchema.safeParse(effect).success).toBe(true));
  });

  it('3D 动效使用不同的运动或视觉机制', () => {
    const threeDEffects = effects.filter((effect) => effect.category === '3d');
    const signatures = threeDEffects.map((effect) => `${effect.visual ?? 'atomic'}:${[...new Set(effect.atoms.map((entry) => entry.type))].sort().join(',')}`);
    expect(threeDEffects).toHaveLength(16);
    expect(new Set(signatures).size).toBe(threeDEffects.length);
  });

  it('63 个创意转场使用互不重复的视觉机制', () => {
    const creativeEffects = effects.filter((effect) => effect.visual);
    expect(creativeEffects).toHaveLength(63);
    expect(new Set(creativeEffects.map((effect) => effect.visual)).size).toBe(creativeEffects.length);
  });

  it('参考视频光效且视觉机制互不重复', () => {
    const referenceLightIds = [
      'light_radial_clarity', 'light_firework_crown', 'light_corner_fountains', 'light_glitter_rain',
      'light_star_glints', 'light_halo_shockwave', 'light_luminous_ribbon', 'light_flash_cluster',
      'light_golden_dust', 'light_celebration_pyro',
      'light_prismatic_fireworks', 'light_polaroid_spark_pop', 'light_chromatic_star_wash',
      'light_radial_rush_focus', 'light_split_focus_rush', 'light_tunnel_snap_clarity',
    ];
    const referenceLights = effects.filter((effect) => referenceLightIds.includes(effect.id));
    expect(referenceLights).toHaveLength(16);
    expect(referenceLights.every((effect) => effect.category === 'reference_light')).toBe(true);
    expect(new Set(referenceLights.map((effect) => effect.visual)).size).toBe(16);
    const cameraSignatures: string[] = [];
    for (const effect of referenceLights) {
      expect(effect.durationFrames).toBe(36);
      const progressAtoms = effect.atoms.filter((entry) => entry.type === 'visualProgress');
      expect(progressAtoms).toHaveLength(1);
      expect(progressAtoms.map((entry) => [entry.startFrame, entry.endFrame])).toEqual([[0, 36]]);
      expect(effect.atoms.filter((entry) => entry.type === 'flash')).toHaveLength(1);
      const cameraAtoms = effect.atoms.filter((entry) => !['visualProgress', 'flash', 'glow'].includes(entry.type));
      expect(cameraAtoms.length).toBeGreaterThan(0);
      for (const entry of cameraAtoms) {
        if (entry.type === 'scale') {
          expect(Math.min(entry.from, entry.to)).toBeGreaterThanOrEqual(.65);
          expect(Math.max(entry.from, entry.to)).toBeLessThanOrEqual(1.3);
        }
        if (entry.type === 'translateX' || entry.type === 'translateY') {
          expect(Math.max(Math.abs(entry.from), Math.abs(entry.to))).toBeLessThanOrEqual(220);
        }
      }
      cameraSignatures.push(cameraAtoms.map((entry) => `${entry.type}:${entry.from}:${entry.to}:${entry.startFrame}:${entry.endFrame}:${entry.easing}`).join('|'));
    }
    expect(new Set(cameraSignatures).size).toBe(referenceLights.length);
  });

  it('其余转场不存在完全相同的原子动画组合', () => {
    const atomicEffects = effects.filter((effect) => !effect.visual);
    const signatures = atomicEffects.map((effect) => [...new Set(effect.atoms.map((entry) => entry.type))].sort().join(','));
    expect(new Set(signatures).size).toBe(atomicEffects.length);
  });

  it('已移除仅方向或参数不同的相似转场', () => {
    const removedIds = [
      'basic_zoom_out', 'basic_slide_right', 'basic_slide_down', 'combo_zoom_blur', 'combo_zoom_flash',
      'combo_mask_focus', 'combo_push_shake', 'combo_rgb_shake', 'combo_split_assemble', 'combo_camera_exposure',
      'combo_right_swing_bounce', 'combo_bloom_pulse', 'combo_flash_spin', 'combo_chromatic_zoom', 'combo_soft_mask_drift',
      'combo_corner_zoom', 'combo_drop_rebound', 'combo_float_focus', 'combo_macro_pullback', 'combo_camera_roll',
      'combo_rgb_slide', 'combo_glitch_pulse', 'combo_mask_flash', 'combo_circle_reveal', 'combo_soft_cross_push',
      'creative_shards', 'creative_tunnel_frames', 'creative_waveform_reveal',
      'creative_light_leak', 'creative_lens_flare', 'creative_sunburst', 'creative_aurora_veil', 'creative_bokeh_burst',
      'creative_laser_grid', 'creative_lightning_flash', 'creative_sparkle_trail', 'creative_neon_frame', 'creative_rainbow_sweep',
      'creative_negative_flash', 'creative_thermal_reveal', 'creative_comet_streak', 'creative_edge_glow', 'creative_light_columns',
    ];
    expect(effects.some((effect) => removedIds.includes(effect.id))).toBe(false);
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
