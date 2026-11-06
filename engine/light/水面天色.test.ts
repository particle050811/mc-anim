import { afterEach, describe, expect, it, vi } from 'vitest';

const 时序 = vi.hoisted(() => ({ 帧: 0, 清理: [] as (() => void)[] }));
// 直接调用天空组件，记录 effect 清理，复现新画布先写、旧画布后卸的次序。
vi.mock('react', async (原模块) => {
  const 原 = await 原模块<typeof import('react')>();
  const 钩子 = {
    useState: <T,>(初值: T | (() => T)) => [typeof 初值 === 'function' ? (初值 as () => T)() : 初值],
    useMemo: <T,>(算: () => T) => 算(),
    useRef: <T,>(值: T) => ({ current: 值 }),
    useContext: () => null,
    useEffect: (挂: () => void | (() => void)) => {
      const 清理 = 挂();
      if (清理) 时序.清理.push(清理);
    },
  };
  return { ...原, ...钩子, default: { ...原, ...钩子 } };
});
vi.mock('@react-three/fiber', () => ({ useFrame() {}, useThree() {} }));
vi.mock('remotion', () => ({ useCurrentFrame: () => 时序.帧, useVideoConfig: () => ({ fps: 30 }) }));
vi.mock('asset:贴图/场景/天空/clouds', () => ({ default: '' }));
vi.mock('asset:贴图/场景/天空/sun', () => ({ default: '' }));
vi.mock('./大气.ts', () => ({ atmoOn: () => false, atmosphere: { waterBands: [] }, atmoUniforms: {}, ATMO_FN_GLSL: '', ATMO_PARS_GLSL: '' }));

const { SkyDome, OverworldWaterSky } = await import('./天空.tsx');
const { waterSky, 复位水面天色 } = await import('../voxel/水面.ts');
const 快照 = () => ({ 色: waterSky.skyColors.value.map((c) => c.toArray()), 仰角: [...waterSky.elevation.value], 时间: waterSky.time.value, 上限: waterSky.reflectionMax.value });
const 默认值 = 快照();
const 挂 = (组件: () => void) => {
  const 起 = 时序.清理.length;
  组件();
  const 清理 = 时序.清理.splice(起);
  return () => 清理.forEach((f) => f());
};

afterEach(() => {
  时序.清理.splice(0).forEach((f) => f());
  复位水面天色();
});

describe('水面天色的写入者', () => {
  it('最后一片天空卸载后恢复默认值，但保留已绑进着色器的 uniform 和颜色对象', () => {
    const uniforms = Object.values(waterSky);
    const 颜色数组 = waterSky.skyColors.value;
    const 颜色对象 = [...颜色数组];
    const 仰角数组 = waterSky.elevation.value;
    时序.帧 = 75;
    const 卸载 = 挂(() => SkyDome({ twilight: true }));
    expect(快照()).not.toEqual(默认值);
    卸载();
    expect(快照()).toEqual(默认值);
    Object.values(waterSky).forEach((u, i) => expect(u).toBe(uniforms[i]));
    expect(waterSky.skyColors.value).toBe(颜色数组);
    颜色对象.forEach((c, i) => expect(waterSky.skyColors.value[i]).toBe(c));
    expect(waterSky.elevation.value).toBe(仰角数组);
  });

  it('暮色旧画布晚卸不能清掉新画布的主世界天色；新画布卸载才复位', () => {
    时序.帧 = 45;
    const 卸旧 = 挂(() => SkyDome({ twilight: true }));
    时序.帧 = 90;
    const 卸新 = 挂(() => OverworldWaterSky({}));
    const 新值 = 快照();
    expect(新值.时间).toBe(3);
    expect(新值.上限).toBe(0);
    卸旧();
    expect(快照()).toEqual(新值);
    卸新();
    expect(快照()).toEqual(默认值);
  });
  it('地下兼容水面按参考帧写时间，不跟这次跳到的当前帧走', () => {
    时序.帧 = 120;
    const 卸旧 = 挂(() => SkyDome({ twilight: true }));
    const 卸新 = 挂(() => OverworldWaterSky({ 帧: 42 }));
    expect(waterSky.time.value).toBe(42 / 30);
    expect(waterSky.reflectionMax.value).toBe(0);
    const 新值 = 快照();
    卸旧();
    expect(快照()).toEqual(新值);
    卸新();
    expect(快照()).toEqual(默认值);
  });

});
