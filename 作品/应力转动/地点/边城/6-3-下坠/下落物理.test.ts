// 下落物理.ts 的 solveFall 是纯函数：不靠哪个模块先调 setter 填状态，单独 import 就能求出撞击时刻。
// 基准是 11-17 拆之前的旧流程（时间线.ts 的 setTakeoff → setImpact → 两轮 setAim、setImpact，原来由 编排/李樱.ts 在模块顶层调）用同一组输入算的，要逐位相同。
// 输入取真的起跳髋、打击深度、地面、落点；锤头用「髋 + 固定偏移」代替骨架算的（真骨架要模型资产）。
// 时间线.ts 和只引它的模块单独 import 算得对，见 时间线.test.ts。
import { describe, expect, it } from 'vitest';
import { solveFall, at, type FallInput } from './下落物理.ts';

const strikeDepth = 2.5652258924652083;
const input: FallInput = {
  hip: [-15616, 1399.65, 1671.256713719519],
  forward: [-1.2246467991473532e-16, -1],
  leapSec: 1.55,
  terminalSpeed: 90,
  blower: { topSpeed: 360, maxAccel: 250, timeConst: 0.4, 开: 1.97 },
  groundZ: 10.5,
  strikeDepth,
  landing: [-15616.5, 1380.5, 10],
  maceHeadAt: (p) => [p[0] + 0.3, p[1] - 0.2, p[2] - strikeDepth],
};
const baseline = {
  impactTime: 7.27308710315922,
  lateral: [-0.16317866359073713, -3.6155732245880645],
  fall: [{"p": [-15616, 1399.65, 1671.256713719519], "v": [-1.8369701987210297e-16, -1.5, -12]}, {"p": [-15616, 1399.5750278167964, 1670.64467680581], "v": [-1.8355988871373593e-16, -1.498880239114964, -12.481357627388377]}, {"p": [-15616.03850434252, 1397.731101731225, 1621.8300632817886], "v": [-0.11975256558174167, -3.0497085775319053, -148.40213532072926]}, {"p": [-15616.429114095119, 1388.918077578276, 831.1416727831892], "v": [-0.16309483150021217, -3.614480848839568, -359.4107182933992]}, {"p": [-15616.799999992152, 1380.7000001737297, 13.065225892465344], "v": [-0.16317837820137965, -3.615569505816278, -359.9979939098911]}, {"p": [-15616.918616477768, 1378.0717958357536, -248.62208536626233], "v": [-0.1631784036302912, -3.615569837168224, -359.99817265757946]}],
};
const viaJson = (v: unknown) => JSON.parse(JSON.stringify(v)) as unknown;

describe('solveFall', () => {
  const fall = solveFall(input);
  it('撞击时刻、瞄准和旧的 setter 流程逐位相同', () => {
    expect(fall.impactTime).toBe(baseline.impactTime);
    expect(fall.lateral).toEqual(baseline.lateral);
    expect(viaJson([1.55, 1.6, 2.5, 5, fall.impactTime, 8].map((w) => at(fall.table, w)))).toEqual(baseline.fall);
  });
  it('撞击那刻锤头底碰地、落在落点上', () => {
    const p = at(fall.table, fall.impactTime).p;
    expect(p[2] - strikeDepth).toBeCloseTo(input.groundZ, 9);
    const head = input.maceHeadAt(p);
    expect(Math.hypot(head[0] - input.landing[0], head[1] - input.landing[1])).toBeLessThan(0.5);
  });
  it('同一组输入求两次一样（没有模块状态）', () => {
    expect(solveFall(input).impactTime).toBe(fall.impactTime);
  });
});
