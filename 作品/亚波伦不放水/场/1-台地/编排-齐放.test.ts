// 第 4 幕的打击停顿落到真编排上（用户 11-11 定照 Linker 打戏知识库来）：索命劈中那 16 帧她的姿势、杖尖和他的样子都定住、索命的电弧也定住，
// 别的法术、盘照走。盘从第一帧就张着（第 2 幕末已张开）、连放的格一直亮着；他一直被结界钉着、死在幕末。只算位置和姿势，模型、贴图给空的。
import { describe, expect, it, vi } from 'vitest';

const emptyImage = { default: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==' };
vi.mock('asset:模型/角色/巨人', () => ({ default: { models: { 宽: { texW: 64, texH: 64, parts: [] } } } }));
vi.mock('asset:贴图/角色/巨人/史蒂夫', () => emptyImage);
// 杖挂在 RightHandLocator 上：给一根右臂、一个手的定位骨，杖尖位置只要停顿前后可比
vi.mock('asset:模型/角色/娘化亚波伦', () => ({
  default: { texW: 1, texH: 1, bones: [{ name: 'MAllBody', pivot: [0, 12, 0] }, { name: 'RightArm', parent: 'MAllBody', pivot: [-5, 22, 0] }, { name: 'RightForeArm', parent: 'RightArm', pivot: [-6, 17, 0] }, { name: 'RightHandLocator', parent: 'RightForeArm', pivot: [-6, 12, 0] }] },
}));
// 她的姿势要取动画：用到的几段给空的（只比停顿前后一样不一样，不看具体转角）
vi.mock('asset:动画/角色/娘化亚波伦/main', () => ({
  default: { animations: Object.fromEntries(['pre_parallel0', 'pre_parallel1', 'pre_parallel2', 'parallel0', 'parallel1', 'idle', 'fly'].map((animName) => [animName, { loop: true, bones: {} }])) },
}));
vi.mock('asset:动画/角色/娘化亚波伦/extra', () => ({ default: { animations: {} } }));
vi.mock('asset:模型/物品/下界魔杖', () => ({ default: {} }));
// 多圈轮盘一 import 就要上百张聚晶图标；这里只用它算盘的外半径
vi.mock('../../界面/多圈轮盘.tsx', () => ({ wheelOuterRadius: () => 100 }));
vi.mock('asset:贴图/角色/娘化亚波伦/default', () => emptyImage);
vi.mock('asset:贴图/角色/娘化亚波伦/5default', () => emptyImage);
vi.mock('asset:贴图/角色/娘化亚波伦/4default', () => emptyImage);
vi.mock('asset:贴图/角色/娘化亚波伦/3default', () => emptyImage);
vi.mock('asset:贴图/角色/娘化亚波伦/2default', () => emptyImage);
vi.mock('asset:贴图/特效/晋升之环/halo', () => emptyImage);
vi.mock('asset:贴图/物品/下界魔杖', () => emptyImage);

const choreo = await import('./编排-齐放.ts');
const beatModule = await import('./齐放拍.ts');
const { secAt, perform, steveStateAt, castTable, wheelParams, cageSetup } = choreo;
const { killingPause, castStart, act2EndWheelTick, chainCastTable, deathTime, actDur } = beatModule;
const frameSec = 1 / 60;
/** 数取到 1e-9（停顿里的钟是减出来的，差在 1e-15 上） */
const format = (x: unknown) => JSON.stringify(x, (_k, v) => (typeof v === 'number' ? Math.round(v * 1e9) / 1e9 + 0 : v));
/** 他这一刻的样子里会动的几样 */
const steveSample = (t: number) => {
  const s = steveStateAt(t);
  return format([s.位置, s.facing, s.看, s.秒, s.swingSec, s.hitReactSec, s.charge, s.afterDeathSec, s.leftHand]);
};
const yaBoLunSample = (t: number) => format([perform.在(t).props.pose, perform.在(t).props.bonePose, perform.杖(t).tip]);

const openingModule = await import('./编排-开盘.ts');
const { act2EndSteveSec } = await import('./开盘拍.ts');

describe('第 2 幕末接第 4 幕开头', () => {
  /** 两边的样子逐个数比，最大差多少；骨骼只在一边有的按 0 补（第 4 幕的姿势把腿的 0 也写出来了） */
  const deepDiff = (a: unknown, b: unknown): number => {
    if (typeof a === 'number' || typeof b === 'number') return Math.abs(((a as number) ?? 0) - ((b as number) ?? 0));
    if (a === undefined || b === undefined) return deepDiff(a ?? (Array.isArray(b) ? b.map(() => 0) : b === undefined ? 0 : {}), b ?? (Array.isArray(a) ? a.map(() => 0) : {}));
    if (typeof a !== 'object' || a === null) return a === b ? 0 : Infinity;
    const keys = new Set([...Object.keys(a), ...Object.keys(b as object)]);
    return Math.max(0, ...[...keys].map((k) => deepDiff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])));
  };
  it('一帧对上：她的位置、浮动、朝向、姿势、杖尖，盘张开度和转角，他的位置、朝向、看哪、待机相位都一样', () => {
    const t = beatModule.actStart;
    expect(t).toBeCloseTo(openingModule.actEnd, 9);
    const [firstProps, second] = [openingModule.perform.在(openingModule.actEnd).props, perform.在(t).props];
    expect(deepDiff(firstProps.pose, second.pose)).toBeLessThan(1e-9);
    expect(firstProps.秒).toBeCloseTo(second.秒, 9);
    // 第 4 幕开头她就开始漂，倾 往后看 0.08 秒，第一帧已经倾了 0.035 度（第 2 幕这一帧还停着）；看不出来，放 0.05 度
    expect(deepDiff(firstProps.bonePose, second.bonePose)).toBeLessThan(0.05);
    expect(deepDiff(openingModule.perform.杖(openingModule.actEnd).tip, perform.杖(t).tip)).toBeLessThan(1e-3);
    const [wheelAct2End, wheelNow] = [openingModule.act2WheelParams(openingModule.actEnd)!, wheelParams(t)];
    expect(deepDiff([wheelAct2End.放 === wheelNow.放 ? 0 : 1, wheelAct2End.刻, wheelAct2End.openClose], [0, wheelNow.刻, wheelNow.openClose])).toBeLessThan(1e-9);
    const [steveAct2End, steveNow] = [openingModule.steveStateAt(openingModule.actEnd, act2EndSteveSec), steveStateAt(t)];
    expect(deepDiff([steveAct2End.位置, steveAct2End.facing, steveAct2End.看, steveAct2End.秒, steveAct2End.sneak ?? 0, steveAct2End.charge ?? 0], [steveNow.位置, steveNow.facing, steveNow.看, steveNow.秒, steveNow.sneak ?? 0, steveNow.charge ?? 0])).toBeLessThan(1e-6);
    expect([steveAct2End.rightHand, steveAct2End.surge]).toEqual([steveNow.rightHand, undefined]);
  });
});

describe('第 4 幕打击停顿', () => {
  it('索命劈中：16 帧里她、他定住，过了停顿接着动', () => {
    const startSec = secAt(killingPause.起);
    for (let f = 1; f <= 16; f++) {
      expect(yaBoLunSample(startSec + f * frameSec)).toBe(yaBoLunSample(startSec));
      expect(steveSample(startSec + f * frameSec)).toBe(steveSample(startSec));
    }
    expect(yaBoLunSample(startSec + 18 * frameSec)).not.toBe(yaBoLunSample(startSec));
    expect(steveSample(startSec + 18 * frameSec)).not.toBe(steveSample(startSec));
  });

  it('只有索命带自己的钟（撕裂照晋升之环缩过的施法刻，不再自己快放）；停顿里索命定住，盘照转', () => {
    expect([...new Set(castTable.filter((x) => x.clock).map((x) => x.id))]).toEqual(['killing']);
    const killCast = castTable.find((x) => x.id === 'killing')!;
    const startSec = secAt(killingPause.起);
    expect(killCast.clock!(startSec + 10 * frameSec)).toBeCloseTo(startSec, 9);
    expect(killCast.clock!(startSec + 20 * frameSec)).toBeCloseTo(startSec + 4 * frameSec, 9);
    expect(wheelParams(startSec + 10 * frameSec).刻).not.toBe(wheelParams(startSec).刻);
  });
});

describe('第 4 幕开头接第 2 幕末', () => {
  it('盘第一帧就张着（第 2 幕末的转角接着转），连放的格一直亮着，每出手一发那一格闪一下', () => {
    const params = wheelParams(secAt(0));
    expect(params.刻).toBeCloseTo(act2EndWheelTick, 9);
    expect(params.openClose?.spinStartTick ?? 0).toBe(0);
    expect(params.selectedId?.length ?? 0).toBeGreaterThanOrEqual(chainCastTable.length);
    expect(Object.keys(wheelParams(secAt(castStart) + frameSec).flash ?? {}).length).toBeGreaterThan(0);
  });

  it('出手不挥杖（用户 11-11「甩法术面板的镜头很诡异」）：连放一整幕杖一帧里转不过 8 度，盘不甩', () => {
    let minDot = 1;
    for (let t = secAt(0); t < secAt(actDur); t += frameSec) {
      const [a, b] = [perform.杖(t).axis, perform.杖(t + frameSec).axis];
      minDot = Math.min(minDot, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]);
    }
    console.log(`杖一帧最多转 ${((Math.acos(Math.min(1, minDot)) * 180) / Math.PI).toFixed(2)} 度`);
    expect(minDot).toBeGreaterThan(Math.cos((8 * Math.PI) / 180));
  });

  it('结界：和第一轮一起扔出，罩到他死就没了，不收缩焚烧', () => {
    expect(cageSetup.shrinkBurnSec).toBe(0);
    expect(choreo.throwSec).toBeCloseTo(secAt(castStart), 9);
    expect(steveStateAt(secAt(deathTime) - frameSec).afterDeathSec).toBeUndefined();
    expect(steveStateAt(secAt(deathTime) + frameSec).afterDeathSec).toBeCloseTo(frameSec, 9);
  });
});
