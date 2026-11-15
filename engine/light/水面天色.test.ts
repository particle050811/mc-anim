import { afterEach, describe, expect, it, vi } from 'vitest';

const sequence = vi.hoisted(() => ({ 帧: 0, cleanups: [] as (() => void)[] }));
// 直接调用天空组件，记录 effect 清理，复现新画布先写、旧画布后卸的次序。
vi.mock('react', async (importOriginal) => {
  const originalModule = await importOriginal<typeof import('react')>();
  const hooks = {
    useState: <T,>(initialValue: T | (() => T)) => [typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue],
    useMemo: <T,>(compute: () => T) => compute(),
    useRef: <T,>(value: T) => ({ current: value }),
    useContext: () => null,
    useEffect: (effect: () => void | (() => void)) => {
      const cleanup = effect();
      if (cleanup) sequence.cleanups.push(cleanup);
    },
  };
  return { ...originalModule, ...hooks, default: { ...originalModule, ...hooks } };
});
vi.mock('@react-three/fiber', () => ({ useFrame() {}, useThree() {} }));
vi.mock('remotion', () => ({ useCurrentFrame: () => sequence.帧, useVideoConfig: () => ({ fps: 30 }) }));
vi.mock('asset:贴图/场景/天空/clouds', () => ({ default: '' }));
vi.mock('asset:贴图/场景/天空/sun', () => ({ default: '' }));
vi.mock('./大气.ts', () => ({ atmoOn: () => false, atmosphere: { waterBands: [] }, atmoUniforms: {}, ATMO_FN_GLSL: '', ATMO_PARS_GLSL: '' }));

const { SkyDome, OverworldWaterSky } = await import('./天空.tsx');
const { waterSky, resetWaterSky } = await import('../voxel/水面.ts');
const snapshot = () => ({ 色: waterSky.skyColors.value.map((c) => c.toArray()), elevationDeg: [...waterSky.elevation.value], 时间: waterSky.time.value, limit: waterSky.reflectionMax.value });
const defaultSnapshot = snapshot();
const mount = (component: () => void) => {
  const startIndex = sequence.cleanups.length;
  component();
  const cleanups = sequence.cleanups.splice(startIndex);
  return () => cleanups.forEach((f) => f());
};

afterEach(() => {
  sequence.cleanups.splice(0).forEach((f) => f());
  resetWaterSky();
});

describe('水面天色的写入者', () => {
  it('最后一片天空卸载后恢复默认值，但保留已绑进着色器的 uniform 和颜色对象', () => {
    const uniforms = Object.values(waterSky);
    const colorList = waterSky.skyColors.value;
    const colorObject = [...colorList];
    const elevationList = waterSky.elevation.value;
    sequence.帧 = 75;
    const unmount = mount(() => SkyDome({ twilight: true }));
    expect(snapshot()).not.toEqual(defaultSnapshot);
    unmount();
    expect(snapshot()).toEqual(defaultSnapshot);
    Object.values(waterSky).forEach((u, i) => expect(u).toBe(uniforms[i]));
    expect(waterSky.skyColors.value).toBe(colorList);
    colorObject.forEach((c, i) => expect(waterSky.skyColors.value[i]).toBe(c));
    expect(waterSky.elevation.value).toBe(elevationList);
  });

  it('暮色旧画布晚卸不能清掉新画布的主世界天色；新画布卸载才复位', () => {
    sequence.帧 = 45;
    const unmountOld = mount(() => SkyDome({ twilight: true }));
    sequence.帧 = 90;
    const unmountNew = mount(() => OverworldWaterSky({}));
    const nextSnapshot = snapshot();
    expect(nextSnapshot.时间).toBe(3);
    expect(nextSnapshot.limit).toBe(0);
    unmountOld();
    expect(snapshot()).toEqual(nextSnapshot);
    unmountNew();
    expect(snapshot()).toEqual(defaultSnapshot);
  });
  it('地下兼容水面按参考时刻写时间，不跟这次跳到的当前帧走', () => {
    sequence.帧 = 120;
    const unmountOld = mount(() => SkyDome({ twilight: true }));
    const unmountNew = mount(() => OverworldWaterSky({ 秒: 42 / 30 }));
    expect(waterSky.time.value).toBe(42 / 30);
    expect(waterSky.reflectionMax.value).toBe(0);
    const nextSnapshot = snapshot();
    unmountOld();
    expect(snapshot()).toEqual(nextSnapshot);
    unmountNew();
    expect(snapshot()).toEqual(defaultSnapshot);
  });

});
