// 6-3 下坠的时间线单独引用也算得对：撞击时刻以前靠 编排/李樱.ts 在模块顶层调 setter 填进 时间线.ts，
// 只引 时间线.ts、不经 李樱.ts 的模块（6-3-8 的 fallTime、6-3-3/下落攻击.ts、编排/扫帚.ts）单独跑时得 NaN；现在 时间线.ts 自己用 solveFall 求。
// 每条先 resetModules 再动态 import 一个模块；李樱.ts 换成一引就抛错的 mock，保证闭包里没有它。
// 基准是 11-17 拆之前用旧代码在整包里（先引 李樱.ts）算的（提交 a9b631af），要逐位相同；逐位相同也就排除了 NaN。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FigurePose } from '@库/角色/骨架.tsx';

vi.mock('./编排/李樱.ts', () => {
  throw new Error('不该引到 编排/李樱.ts：这里测的是不经它单独引用');
});

beforeEach(() => {
  vi.resetModules();
});

const viaJson = (v: unknown) => JSON.parse(JSON.stringify(v)) as unknown;

describe('6-3 下坠时间线单独引用', () => {
  it('6-3-8/编排/时间线.ts 的 fallTime', async () => {
    const m = await import('../6-3-8/编排/时间线.ts');
    expect(m.afterImpact).toBe(4.5);
    expect([0, 1.5, 3.7, 8.2].map(m.fallTime)).toEqual([11.77308710315922, 13.27308710315922, 15.47308710315922, 19.97308710315922]);
  });

  it('时间线.ts 的撞击时刻、物理时间、下落轨迹', async () => {
    const m = await import('./时间线.ts');
    expect(m.impactTime()).toBe(7.27308710315922);
    const s = m.segTable;
    const Ts = [0, s['6-3-4'].start, s['6-3-5'].start, s['6-3-6'].start + 0.125, s['6-3-6'].start + 2.125];
    expect(Ts.map(m.physicalTime)).toEqual([2.25, 3.933333333333381, 3.9147537698258867, 7.27308710315922, 9.27308710315922]);
    expect(viaJson([1.6, 2.5, 5, 7.27308710315922, 8].map(m.liYingFall))).toEqual(fallBaseline);
  });

  it('6-3-3/下落攻击.ts 的 releasePose', async () => {
    const m = await import('../6-3-3/下落攻击.ts');
    expect(viaJson([1, 1.3, 1.6, 1.97, 2.275, 2.6, 5].map((t) => m.releasePose(t, synthPose(t), synthPose)))).toEqual(releaseBaseline);
  });

  it('编排/扫帚.ts 的扫帚位置和矩阵', async () => {
    const m = await import('./编排/扫帚.ts');
    const out = [0, 0.06, 1.55, 2.3, 7].map((w) => ({ s: m.broomState(w), m: Array.from(m.broomMatrixAt(w).elements) }));
    expect(viaJson(out)).toEqual(broomBaseline);
  });
});

// 下落攻击 的输入：随便一组随时间变的姿势（只看 releasePose 本身算得一样）
const synthPose = (t: number): FigurePose => ({ loc: [0, 0, 0], pitch: -10 * t, squash: 1, headPitch: 5 * t, headYaw: 0, legR: 20 + t, legL: 20 - t, armR: 100 + 30 * t, armRRoll: 3, armL: 90 + 20 * t, armLRoll: -3, kneeR: 10 * t, kneeL: 12 * t, elbowR: 15, elbowL: 25, ground: 0 }) as FigurePose;

// ---------- 基准（a9b631af） ----------
const fallBaseline: unknown = [{"p": [-15616, 1399.5750278167964, 1670.64467680581], "v": [-1.8355988871373593e-16, -1.498880239114964, -12.481357627388377]}, {"p": [-15616.000035964596, 1397.724450697201, 1621.8300632817886], "v": [-0.00011185368566559945, -3.070393994714753, -148.40213532072926]}, {"p": [-15616.000400809713, 1388.8439547063924, 831.1416727831892], "v": [-0.00015233709547415465, -3.642652977040408, -359.4107182933992]}, {"p": [-15616.000747232016, 1380.5618124572154, 13.065225892465344], "v": [-0.00015241513143443114, -3.64375606542708, -359.9979939098911]}, {"p": [-15616.000858024563, 1377.9131189424281, -248.62208536626233], "v": [-0.00015241515518605152, -3.6437564011714794, -359.99817265757946]}];
// releasePose 第一次调用时按传进来的 oldPoseAt 建表、之后沿用：整包里 李樱 加载时已经拿真姿势建过，
// 所以这组基准是旧代码单独打包 下落攻击.ts 算的（它本来就只引 基准.ts）。上面每条 resetModules，这里拿到的是没建过表的新模块。
const releaseBaseline: unknown = [{"loc": [0, 0, 0], "pitch": -10, "squash": 1, "headPitch": 5, "headYaw": 0, "legR": 21, "legL": 19, "armR": 130, "armRRoll": 3, "armL": 110, "armLRoll": -3, "kneeR": 10, "kneeL": 12, "elbowR": 15, "elbowL": 25, "ground": 0}, {"loc": [0, 0, 0], "pitch": -21.504132231404974, "squash": 1, "headPitch": -7.223140495867792, "headYaw": 0, "legR": 48.329977460556016, "legL": 46.9667918858002, "armR": 125.704, "armRRoll": 7.776040296296301, "armL": 110.2688, "armLRoll": 3.0219638518518592, "kneeR": 62.112697220135324, "kneeL": 63.47588279489115, "elbowR": 23.02801582456803, "elbowL": 30.925038739669446, "ground": 0, "legRRoll": 0, "legLRoll": 0}, {"loc": [0, 0, 0], "pitch": -7.391835016835019, "squash": 1, "headPitch": -16.603896103896105, "headYaw": 0, "legR": 6.167003367003369, "legL": 5.139980158730161, "armR": 164.5279368890413, "armRRoll": 22.28287999999999, "armL": 164.5279368890413, "armLRoll": 22.28287999999999, "kneeR": 4.053240740740742, "kneeL": 4.067592592592595, "elbowR": 36.31559766763844, "elbowL": 36.31559766763844, "ground": 0, "legRRoll": -1.171579743008317, "legLRoll": -1.7438721520354212}, {"loc": [0, 0, 0], "pitch": 20, "squash": 1, "headPitch": 25.061008530396286, "headYaw": 0, "legR": 48, "legL": -18, "armR": 235.05494577259475, "armRRoll": 12.230282968615384, "armL": 235.05494577259475, "armLRoll": 12.261236735999999, "kneeR": 94, "kneeL": 44, "elbowR": 57.75, "elbowL": 57.75, "ground": 0, "legRRoll": -12, "legLRoll": -16}, {"loc": [0, 0, 0], "pitch": -990, "squash": 1, "headPitch": 495, "headYaw": 0, "legR": 119, "legL": -79, "armR": 3070, "armRRoll": 3, "armL": 2070, "armLRoll": -3, "kneeR": 990, "kneeL": 1188, "elbowR": 14.999999999999991, "elbowL": 24.999999999999993, "ground": 0, "legRRoll": 0, "legLRoll": 0}, {"loc": [0, 0, 0], "pitch": -990, "squash": 1, "headPitch": 495, "headYaw": 0, "legR": 119, "legL": -79, "armR": 3070, "armRRoll": 3, "armL": 2070, "armLRoll": -3, "kneeR": 990, "kneeL": 1188, "elbowR": 15, "elbowL": 25, "ground": 0, "legRRoll": 0, "legLRoll": 0}, {"loc": [0, 0, 0], "pitch": -990, "squash": 1, "headPitch": 495, "headYaw": 0, "legR": 119, "legL": -79, "armR": 3070, "armRRoll": 3, "armL": 2070, "armLRoll": -3, "kneeR": 990, "kneeL": 1188, "elbowR": 15, "elbowL": 25, "ground": 0, "legRRoll": 0, "legLRoll": 0}];
const broomBaseline: unknown = [{"s": {"pos": [-15616, 1400, 1310.5795554957735], "yaw": 180, "pitch": 0, "roll": 0}, "m": [-1, 1.2246467991473532e-16, 0, 0, -1.2246467991473532e-16, -1, 0, 0, 0, 0, 1, 0, -15616, 1400, 1310.5795554957735, 1]}, {"s": {"pos": [-15616, 1400, 1490.5795554957735], "yaw": 180, "pitch": 0, "roll": 0}, "m": [-1, 1.2246467991473532e-16, 0, 0, -1.2246467991473532e-16, -1, 0, 0, 0, 0, 1, 0, -15616, 1400, 1490.5795554957735, 1]}, {"s": {"pos": [-15616, 1400, 1670.5795554957735], "yaw": 180, "pitch": 0, "roll": 0}, "m": [-1, 1.2246467991473532e-16, 0, 0, -1.2246467991473532e-16, -1, 0, 0, 0, 0, 1, 0, -15616, 1400, 1670.5795554957735, 1]}, {"s": {"pos": [-15616, 1400.2733484777063, 1670.75039829434], "yaw": 180, "pitch": 3.416855971328255, "roll": 0}, "m": [-1, 1.2246467991473532e-16, 7.703719777548943e-34, 0, -1.2224697901545795e-16, -0.9982223372532477, 0.05960004537467762, 0, 7.298900479713595e-18, 0.05960004537467762, 0.9982223372532476, 0, -15616, 1400.2733484777063, 1670.75039829434, 1]}, {"s": {"pos": [-15616, 1400.0000029248085, 1670.5795573237788], "yaw": 180, "pitch": 3.656010549614109e-05, "roll": 0}, "m": [-1, 1.2246467991473532e-16, 0, 0, -1.2246467991471037e-16, -0.9999999999997966, 6.380942157840938e-07, 0, 7.814400389144309e-23, 6.380942157840938e-07, 0.9999999999997964, 0, -15616, 1400.0000029248085, 1670.5795573237788, 1]}];
