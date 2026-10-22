import {describe, expect, it} from 'vitest';
import {getDimensions, getSourceDimensions, REFERENCE_LIGHT_LOOP_IN_FRAMES} from '@/lib/video-config';
import {atomValue, resolveAnimationFrame, resolveBreathingScale, resolveLoopFrame} from '@/remotion/animation';
import {getThreeImageMotion} from '@/remotion/three-image-motion';

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

  it('参考光效每两秒重新开始一轮', () => {
    expect(REFERENCE_LIGHT_LOOP_IN_FRAMES).toBe(60);
    expect(resolveLoopFrame(0, REFERENCE_LIGHT_LOOP_IN_FRAMES)).toBe(0);
    expect(resolveLoopFrame(59, REFERENCE_LIGHT_LOOP_IN_FRAMES)).toBe(59);
    expect(resolveLoopFrame(60, REFERENCE_LIGHT_LOOP_IN_FRAMES)).toBe(0);
    expect(resolveLoopFrame(119, REFERENCE_LIGHT_LOOP_IN_FRAMES)).toBe(59);
    expect(resolveLoopFrame(120, REFERENCE_LIGHT_LOOP_IN_FRAMES)).toBe(0);
  });

  it('三图微动使用固定种子的受限随机折返轨迹', () => {
    expect(getThreeImageMotion(0, .8, .01, 1280, 720, 42)).toMatchObject({imageIndex: 0, translateX: 0, translateY: 0});
    expect(getThreeImageMotion(149, .8, .01, 1280, 720).imageIndex).toBe(0);
    expect(getThreeImageMotion(150, .8, .01, 1280, 720).imageIndex).toBe(1);
    expect(getThreeImageMotion(300, .8, .01, 1280, 720).imageIndex).toBe(2);
    for (const boundary of [150, 300]) {
      const beforeCut = getThreeImageMotion(boundary - 1, .8, .1, 1280, 720, 42);
      const afterCut = getThreeImageMotion(boundary, .8, .1, 1280, 720, 42);
      expect(Math.hypot(afterCut.translateX - beforeCut.translateX, afterCut.translateY - beforeCut.translateY)).toBeLessThan(8);
      expect(Math.hypot(afterCut.translateX, afterCut.translateY)).toBeGreaterThan(1);
    }
    const previous = getThreeImageMotion(60, .8, .025, 1280, 720, 42);
    const next = getThreeImageMotion(61, .8, .025, 1280, 720, 42);
    expect(Math.abs(next.translateX - previous.translateX)).toBeLessThan(2);
    expect(Math.abs(next.translateY - previous.translateY)).toBeLessThan(2);
    expect(getThreeImageMotion(60, .8, .025, 1280, 720, 42)).toEqual(previous);
    expect(getThreeImageMotion(60, .8, .025, 1280, 720, 43)).not.toEqual(previous);
    for (let frame = 0; frame < 150; frame++) {
      const position = getThreeImageMotion(frame, 1.2, .15, 1280, 720, 42);
      expect(Math.abs(position.translateX)).toBeLessThanOrEqual(1280 * .15 * .82 + .001);
      expect(Math.abs(position.translateY)).toBeLessThanOrEqual(720 * .15 * .82 + .001);
    }
    const route = [0, 47, 94, 141].map((frame) => getThreeImageMotion(frame, .8, .025, 1280, 720, 42));
    const firstDirection = {x: route[1].translateX - route[0].translateX, y: route[1].translateY - route[0].translateY};
    const secondDirection = {x: route[2].translateX - route[1].translateX, y: route[2].translateY - route[1].translateY};
    const turnAmount = Math.abs(firstDirection.x * secondDirection.y - firstDirection.y * secondDirection.x)
      / (Math.hypot(firstDirection.x, firstDirection.y) * Math.hypot(secondDirection.x, secondDirection.y));
    expect(turnAmount).toBeGreaterThan(.1);
    expect(route[3].translateX).toBeCloseTo(route[1].translateX, 0);
    expect(route[3].translateY).toBeCloseTo(route[1].translateY, 0);
    const directTurn = [48, 49, 50, 51].map((frame) => getThreeImageMotion(frame, .75, .025, 1280, 720, 42));
    const priorSpeed = Math.hypot(
      directTurn[1].translateX - directTurn[0].translateX,
      directTurn[1].translateY - directTurn[0].translateY,
    );
    const speedBeforeTurn = Math.hypot(
      directTurn[2].translateX - directTurn[1].translateX,
      directTurn[2].translateY - directTurn[1].translateY,
    );
    const speedAfterTurn = Math.hypot(
      directTurn[3].translateX - directTurn[2].translateX,
      directTurn[3].translateY - directTurn[2].translateY,
    );
    expect(speedBeforeTurn).toBeCloseTo(priorSpeed, 5);
    expect(speedAfterTurn).toBeGreaterThan(.5);
    expect(getThreeImageMotion(0, .8, .15, 1280, 720).scale).toBeCloseTo(1.34);
  });
});
