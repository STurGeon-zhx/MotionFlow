import {describe, expect, it} from 'vitest';
import {getDimensions, getSourceDimensions} from '@/lib/video-config';
import {atomValue, resolveAnimationFrame, resolveBreathingScale} from '@/remotion/animation';

describe('视频规格与动画插值', () => {
  it('映射所有比例和清晰度', () => {
    expect(getDimensions('9:16', '1080p')).toEqual({width: 1080, height: 1920});
    expect(getDimensions('1:1', '720p')).toEqual({width: 720, height: 720});
    expect(getDimensions('16:9', '720p')).toEqual({width: 1280, height: 720});
  });

  it('按原图比例计算偶数输出尺寸', () => {
    expect(getSourceDimensions(1920, 1080, '1080p')).toEqual({width: 1920, height: 1080});
    expect(getSourceDimensions(1080, 1920, '720p')).toEqual({width: 720, height: 1280});
    expect(getSourceDimensions(1000, 1000, '1080p')).toEqual({width: 1080, height: 1080});
    const custom = getSourceDimensions(1200, 900, '720p');
    expect(custom.width / custom.height).toBeCloseTo(1200 / 900, 2);
    expect(custom.width % 2).toBe(0);
    expect(custom.height % 2).toBe(0);
  });

  it('原子动画在可调整入场时长下仍到达终点', () => {
    const atoms = [{type: 'translateX' as const, from: -200, to: 0, startFrame: 0, endFrame: 24, easing: 'linear' as const}];
    const params = {scaleMultiplier: 1, translateMultiplier: 1, rotateMultiplier: 1, blurMultiplier: 1};
    expect(atomValue(atoms, 'translateX', 0, 24, 36, 0, 'medium', params)).toBe(-200);
    expect(atomValue(atoms, 'translateX', 36, 24, 36, 0, 'medium', params)).toBe(0);
  });

  it('组合动画在结尾反向执行同一段动画', () => {
    expect(resolveAnimationFrame(0, 24, 150, true)).toEqual({animationFrame: 0, isExiting: false});
    expect(resolveAnimationFrame(100, 24, 150, true)).toEqual({animationFrame: 100, isExiting: false});
    expect(resolveAnimationFrame(126, 24, 150, true)).toEqual({animationFrame: 24, isExiting: true});
    expect(resolveAnimationFrame(149, 24, 150, true)).toEqual({animationFrame: 0, isExiting: true});
    expect(resolveAnimationFrame(149, 24, 150, false)).toEqual({animationFrame: 149, isExiting: false});
  });

  it('镜头呼吸从首帧开始并平滑贯穿转场', () => {
    expect(resolveBreathingScale(0, 150, true)).toBe(1);
    expect(resolveBreathingScale(18, 150, true)).toBeGreaterThan(1);
    expect(Math.abs(resolveBreathingScale(36, 150, true) - resolveBreathingScale(35, 150, true))).toBeLessThan(.001);
    expect(resolveBreathingScale(130, 150, true)).toBeGreaterThan(1);
    expect(resolveBreathingScale(149, 150, true)).toBeCloseTo(1, 8);
    expect(resolveBreathingScale(75, 150, false)).toBe(1);
  });
});
