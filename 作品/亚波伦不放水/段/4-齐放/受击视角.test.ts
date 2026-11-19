import { expect, it } from 'vitest';
import { approxSceneCtx, actStart, cameraStart, castTable, castHits, deathTime } from '../../场/1-台地/齐放拍.ts';
import { launchFrom, launchTarget } from '../../场/1-台地/出手表.ts';
import { receiverWaveSprite, sonicBoomLifeTicks, sonicWaveCount } from '../../法术/演出/法术/音爆.元.ts';
import { firstPersonCast } from './受击视角.ts';

it('音爆瞬时结算不吞掉波纹；切镜前一发的余波和后三发在受击镜头仍有真实粒子', () => {
  const samples = castTable.flatMap((cast, index) => {
    if (cast.id !== 'sonic_boom') return [];
    const visible = firstPersonCast(cast, castHits[index]);
    expect(castHits[index]).toBe(cast.sec);
    expect(visible.options?.receivingSonic).toBe(true);
    expect(visible.end! - visible.sec).toBeCloseTo(sonicBoomLifeTicks / 20, 9);
    const origin = launchFrom(cast, approxSceneCtx), [east, north, bottom] = launchTarget(cast, approxSceneCtx);
    const distance = Math.hypot(east - origin[0], north - origin[1], bottom + 1.62 - origin[2]);
    const rings = sonicWaveCount(distance, true);
    expect(rings).toBeGreaterThan(0);
    expect(distance - rings).toBeGreaterThanOrEqual(3.5);
    expect(distance - rings).toBeLessThan(4.5);
    expect(sonicWaveCount(distance)).toBe(Math.floor(distance) + 6);
    return visible.end! > actStart + cameraStart.firstPerson && visible.sec < actStart + deathTime ? [visible] : [];
  });
  expect(samples).toHaveLength(4);
  expect(samples.filter(cast => cast.sec >= actStart + cameraStart.firstPerson)).toHaveLength(3);
});

it('受击波前同刻出现但有透视间距，只取原版空心相位，不让实心贴图盖屏', () => {
  for (const sec of [0, 0.25, 0.5, 47 / 60]) {
    const fronts = Array.from({ length: 26 }, (_, index) => receiverWaveSprite(index, sec)).filter(Boolean);
    expect(fronts).toHaveLength(5);
    expect(fronts.every(sprite => /^sonic_boom_(9|1[0-5])$/.test(sprite!))).toBe(true);
  }
  expect(receiverWaveSprite(27, 0)).toBe('native');
  expect(receiverWaveSprite(0, 0.8)).toBeNull();
});
