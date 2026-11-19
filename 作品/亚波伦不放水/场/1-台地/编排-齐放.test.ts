// 第 4 幕的打击停顿落到真编排上（用户 11-11 定照 Linker 打戏知识库来）：索命劈中那 16 帧她的姿势、杖尖和他的样子都定住、索命的电弧也定住，
// 别的法术照走。盘从第 2 幕末接过来，出手时消失；他一直被结界钉着、死在幕末。
import { describe, expect, it } from 'vitest';


const choreo = await import('./编排-齐放.ts');
const beatModule = await import('./齐放拍.ts');
const { secAt, perform, steveStateAt, castTable, wheelParams, cageSetup } = choreo;
const { killingPause, castStart, act2EndWheelTick, deathTime, actDur } = beatModule;
const frameSec = 1 / 60;
/** 数取到 1e-9（停顿里的钟是减出来的，差在 1e-15 上） */
const format = (x: unknown) => JSON.stringify(x, (_k, v) => (typeof v === 'number' ? Math.round(v * 1e9) / 1e9 + 0 : v));
/** 他这一刻的样子里会动的几样 */
const steveSample = (t: number) => {
  const s = steveStateAt(t);
  return format([s.位置, s.facing, s.看, s.sec, s.swingSec, s.hitReactSec, s.charge, s.afterDeathSec, s.leftHand]);
};
const yaBoLunSample = (t: number) => format([perform.在(t).props.pose, perform.在(t).props.bonePose, perform.杖(t).tip]);

const openingModule = await import('./编排-开盘.ts');
const { act2EndSteveSec } = await import('./开盘拍.ts');

it('开幕与首枚冰刺从右手真杖尖到胸口约 45 格，保留东南俯射角与第六版死亡起位', () => {
  for (const time of [secAt(castStart), castTable.find(cast => cast.id === 'ice_spike')!.sec]) {
    const tip = perform.杖(time).tip;
    const [east, north, height] = beatModule.steveFoot.map((value, index) => value - tip[index]! + (index === 2 ? 0.9 : 0)) as [number, number, number];
    const horizontalSpan = Math.hypot(east, north);
    expect(Math.abs(Math.hypot(horizontalSpan, height) - 45)).toBeLessThan(0.5);
    expect(Math.abs(Math.atan2(north, east) * 180 / Math.PI + 39.4)).toBeLessThan(2.5);
    expect(Math.abs(Math.atan2(height, horizontalSpan) * 180 / Math.PI + 51.3)).toBeLessThan(1);
  }
  expect(beatModule.act5StartPos).toEqual([914.5, 287.5, 62]);
  for (const [index, value] of beatModule.yaBoLunPos(secAt(actDur)).entries()) expect(value).toBeCloseTo(beatModule.act5StartPos[index]!, 8);
});

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
    expect(firstProps.sec).toBeCloseTo(second.sec, 9);
    // 第 4 幕开头她就开始漂，倾 往后看 0.08 秒，第一帧已经倾了 0.035 度（第 2 幕这一帧还停着）；看不出来，放 0.05 度
    expect(deepDiff(firstProps.bonePose, second.bonePose)).toBeLessThan(0.05);
    expect(deepDiff(openingModule.perform.杖(openingModule.actEnd).tip, perform.杖(t).tip)).toBeLessThan(1e-3);
    const [wheelAct2End, wheelNow] = [openingModule.act2WheelParams(openingModule.actEnd)!, wheelParams(t)!];
    expect(deepDiff([wheelAct2End.放 === wheelNow.放 ? 0 : 1, wheelAct2End.刻, wheelAct2End.openClose], [0, wheelNow.刻, wheelNow.openClose])).toBeLessThan(1e-9);
    const [steveAct2End, steveNow] = [openingModule.steveStateAt(openingModule.actEnd, act2EndSteveSec), steveStateAt(t)];
    expect(deepDiff([steveAct2End.位置, steveAct2End.facing, steveAct2End.看, steveAct2End.sec, steveAct2End.sneak ?? 0, steveAct2End.charge ?? 0], [steveNow.位置, steveNow.facing, steveNow.看, steveNow.sec, steveNow.sneak ?? 0, steveNow.charge ?? 0])).toBeLessThan(1e-6);
    expect([steveAct2End.rightHand, steveAct2End.surge]).toEqual([steveNow.rightHand, undefined]);
  });
});

describe('第 4 幕打击停顿', () => {
  it('世界与玩家用同一视线、脚位和蹲高：寻路挪步、雷落缩回、末帧接倒下，不起剑', () => {
    const { escapeGap, cutoffSec, steveFoot } = beatModule;
    const distanceToGap = (sec: number) => {
      const foot = steveStateAt(secAt(sec)).位置;
      return Math.hypot(foot[0] - escapeGap[0], foot[1] - escapeGap[1]);
    };
    for (let frame = 0; frame < Math.round(actDur * 60); frame++) {
      const time = secAt(frame / 60);
      const state = steveStateAt(time);
      const { eye, look } = choreo.steveViewAt(time);
      expect(state.swingSec).toBeUndefined();
      expect(state.charge).toBe(0);
      expect(look).toEqual(state.看);
      expect(eye.slice(0, 2)).toEqual(state.位置.slice(0, 2));
      expect(eye[2] - state.位置[2]).toBeCloseTo(1.62 - 0.35 * state.sneak!, 8);
    }
    expect(choreo.steveViewAt(secAt(cutoffSec)).look.slice(0, 2)).toEqual(escapeGap.slice(0, 2));
    expect(distanceToGap(cutoffSec)).toBeLessThan(distanceToGap(cutoffSec - 0.65) - 0.55);
    expect(distanceToGap(cutoffSec + 0.4)).toBeGreaterThan(distanceToGap(cutoffSec) + 0.55);
    const last = steveStateAt(secAt(deathTime - frameSec));
    const cut = steveStateAt(secAt(deathTime));
    expect(last.位置).toEqual(steveFoot);
    expect(last.sneak).toBeGreaterThan(0.7);
    expect(cut.位置).toEqual(last.位置);
    expect(cut.sneak).toBe(last.sneak);
    expect(cut.afterDeathSec).toBeCloseTo(0, 9);
    expect(Math.abs(cut.facing - last.facing)).toBeLessThan(1);
  });

  it('索命劈中：16 帧里她、他定住，过了停顿接着动', () => {
    const startSec = secAt(killingPause.start);
    for (let f = 1; f <= 16; f++) {
      expect(yaBoLunSample(startSec + f * frameSec)).toBe(yaBoLunSample(startSec));
      expect(steveSample(startSec + f * frameSec)).toBe(steveSample(startSec));
    }
    expect(yaBoLunSample(startSec + 18 * frameSec)).not.toBe(yaBoLunSample(startSec));
    expect(steveSample(startSec + 18 * frameSec)).not.toBe(steveSample(startSec));
  });

  it('只有索命带自己的钟（撕裂照晋升之环缩过的施法刻，不再自己快放）；停顿里索命定住，盘不重开', () => {
    expect([...new Set(castTable.filter((x) => x.clock).map((x) => x.id))]).toEqual(['killing']);
    const killCast = castTable.find((x) => x.id === 'killing')!;
    const startSec = secAt(killingPause.start);
    expect(killCast.clock!(startSec + 10 * frameSec)).toBeCloseTo(startSec, 9);
    expect(killCast.clock!(startSec + 20 * frameSec)).toBeCloseTo(startSec + 4 * frameSec, 9);
    expect(wheelParams(startSec + 10 * frameSec)).toBeNull();
  });
});

describe('第 4 幕开头接第 2 幕末', () => {
  it('盘第一帧就张着，施法前只有聚晶蓄光，不画选格；第一发起到幕末每帧都没有盘', () => {
    const params = wheelParams(secAt(0))!;
    expect(params.刻).toBeCloseTo(act2EndWheelTick, 9);
    expect(params.openClose?.spinStartTick ?? 0).toBe(0);
    expect(params.selectedId).toBeUndefined();
    const key = 'goety_revelation:revelation_focus';
    const glowAt = (lead: number) => openingModule.act2WheelParams(openingModule.actEnd - lead)?.flash?.[key] ?? 0;
    expect(glowAt(0.5)).toBe(0);
    expect(glowAt(0.22)).toBeGreaterThan(0);
    expect(params.flash?.[key]).toBeCloseTo(glowAt(0), 8);
    expect(wheelParams(secAt(castStart - frameSec))?.flash?.[key]).toBeGreaterThan(0.8);
    expect(wheelParams(secAt(castStart - frameSec))).not.toBeNull();
    for (let frame = 0; frame <= Math.ceil((actDur - castStart) * 60); frame++) expect(wheelParams(secAt(castStart + frame / 60))).toBeNull();
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
