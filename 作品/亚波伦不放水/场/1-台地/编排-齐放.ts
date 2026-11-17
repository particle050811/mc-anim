// 第 4 幕（轰炸）的编排：第 2 幕末盘已张开、杖指着他，开幕杖往前一顶就按住不放地连放，结界和第一轮一起扔出去罩住他钉住；
// 他挥剑劈飞来的弹、一下下挨打，索命劈中时晋升之环像不死图腾一样炸开救他一次，几秒后被卫射照满打死（用户 11-11，见 齐放拍.ts 开头）。
// 钉住是用户 11-10 定的；游戏里结界每刻把人拽回上一刻的位置（RevelationCageEntity：setPos(xOld…)、速度清 0），对玩家等于没拽，
// 风系法术和每刻挨打的击退照样推得动他，所以原版站在里面不会被拽得一颤一颤（用户 11-11 问「他的位置应该也不停颤抖吧」，查了不抖，没加）。时钟接第 2 幕（现身后几秒）。
// 时刻、她怎么飞、连放的出手表在 齐放拍.ts（纯计算，段.ts 排声音也引）；这里是要模型的：她的姿势和杖尖、盘、结界从杖尖扔出去、法术从真杖尖出、他每一刻的样子。
// 都是 Agent 取的，用户没看过。
import { clamp01, lerp, smoothstep01 } from '@engine/core/数学.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { definePerformance, type TiltSettings, type PerformanceBar } from '../../角色/动作/亚波伦演出.ts';
import { leanBackEnvelope, type SteveState } from '../../角色/史蒂夫反应.ts';
import { defaultOpenClose } from '../../界面/分圈.ts';
import type { MultiRingParams } from '../../界面/多圈轮盘参数.ts';
import { STEVE, steveSize } from '@库/角色/史蒂夫姿势.ts';
import { cagePerformanceDefaults, type CagePerformanceSetting } from '../../特效/炼狱结界演出状态.ts';
import { fireKey, type Launch, type SceneCtx } from './出手表.ts';
import { act2EndSteveSec } from './开盘拍.ts';
import { yaBoLunPos as openingPos, stevePos as openingStevePos, openingTimeline, hoverHeight, altarPoint } from './编排-开盘.ts';
import {
  yaBoLunLocalPos,
  yaBoLunPos,
  castTable as pureCastTable,
  castStart,
  steveEye,
  steveFoot,
  steveBackToWorld,
  steveClock,
  yaBoLunClock,
  actStart,
  swingTimes,
  takenHits,
  deathTime,
  act2EndWheelTick,
  killingSec,
  eyeHeight,
  cageFlySec,
  coverFullSec,
  secAt,
  cageCenter,
  startPos,
  followStaffIds,
  chainCastTable,
} from './齐放拍.ts';

export { actStart, actDur, secAt, cameraStart, deathTime, steveFoot, steveEye, totemSec, killingSec, yaBoLunPos, dashRanges } from './齐放拍.ts';
const addVec = (a: readonly number[], b: readonly number[], k = 1): V3 => [a[0]! + b[0]! * k, a[1]! + b[1]! * k, a[2]! + b[2]! * k];
const distance = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

// 齐放拍.ts 不能引 编排-开盘.ts（那边引了模型），起点是它自己从布局算的：这里核对和第 2 幕末对得上
if (distance(startPos, openingPos(actStart)) > 1e-6 || distance(steveFoot, openingStevePos(actStart)) > 1e-6 || Math.abs(startPos[2] - altarPoint[2] - hoverHeight) > 1e-9 || Math.abs(steveSize(STEVE.scale).eye - eyeHeight) > 1e-9)
  throw new Error('齐放拍.ts 的起位、史蒂夫脚、眼高和 编排-开盘.ts、库/角色/史蒂夫.tsx 对不上');

// ── 她的演出：杖一直指着他（盘在杖尖正面朝他、不翻；用户 11-11 嫌甩盘诡异），开幕 5 帧线性往前一顶第一轮离手；
//    之后每出手一发杖头小幅一挑（抖杖，隔 0.3 秒以上取一次，免得叠起来乱抖）；索命 5 帧往前一送、劈中定住 16 帧。冲的时候照旧开火 ──
/** 幕内世界秒 → 她局部钟上的编排秒 */
const yaBoLunArrange = (s: number) => secAt(yaBoLunClock(s));
const timeline: readonly PerformanceBar[] = [
  ...openingTimeline,
  { start: yaBoLunArrange(0), dest: yaBoLunArrange(castStart), pose: '开盘', ease: '线性' },
  { start: yaBoLunArrange(castStart) + 0.1, dest: yaBoLunArrange(castStart) + 0.45, pose: '指向' },
  { start: yaBoLunArrange(killingSec) - 5 / 60, dest: yaBoLunArrange(killingSec), pose: '开盘', ease: '线性' },
  { start: yaBoLunArrange(killingSec) + 0.1, dest: yaBoLunArrange(killingSec) + 0.45, pose: '指向' },
];
const shakeTimes = [...pureCastTable.map((cast) => cast.sec)].sort((a, b) => a - b).reduce<number[]>((picked, s) => (!picked.length || s - picked[picked.length - 1]! >= 0.3 ? [...picked, s] : picked), []);
/** 冲的时候身子往冲的方向倒、急刹往后仰（同第 1、2 幕的 倾，系数按 20～30 格/秒取） */
const lean: TiltSettings = { perSpeed: 1.0, perAccel: 0.03, limit: 25, 窗: 0.08 };
const performBase = definePerformance({ timeline, 位: (τ) => yaBoLunLocalPos(τ - actStart), target: () => steveEye, swingTimes: shakeTimes.map((s) => secAt(yaBoLunClock(s - actStart))), lean });
/** 她的演出（编排的钟）：换到她的局部钟再取，索命那 16 帧连头发、身子一起定住 */
export const perform = { ...performBase, 在: (t: number) => performBase.在(yaBoLunArrange(t - actStart)), 杖: (t: number) => performBase.杖(yaBoLunArrange(t - actStart)) };

/** 轮盘：第 2 幕末已张满（齐放拍.ts 的 第二幕末盘刻），一直开到第 5 幕收；按住连放的那些格亮着，每出手一发那一格一闪（闪秒 淡完）。
 *  盘的钟是世界钟：打击停顿里照转。Agent 取的 */
const flashSec = 0.3;
const releases: readonly (readonly [string, number])[] = [[fireKey('revelation'), secAt(castStart)], ...pureCastTable.map((cast) => [fireKey(cast.id), cast.sec] as const)];
const litKeys = [fireKey('revelation'), ...chainCastTable.map((x) => fireKey(x.id))];
export const wheelParams = (t: number): MultiRingParams => {
  const flash: Record<string, number> = {};
  for (const [focusKey, sec] of releases) {
    const d = (t - sec) / flashSec;
    if (d >= 0 && d < 1) flash[focusKey] = Math.max(flash[focusKey] ?? 0, Math.round((1 - d) ** 2 * 20) / 20);
  }
  return { 放: '有画面', 刻: act2EndWheelTick + (t - actStart) * 20, openClose: defaultOpenClose, selectedId: litKeys, ...(Object.keys(flash).length ? { flash } : {}) };
};
export const sceneCtx: SceneCtx = { wandTip: (t) => perform.杖(t).tip, steveFoot: () => steveFoot };

/** 结界：和第一轮一起从杖尖扔出（用户 11-10 定），0.75 秒飞到他身上罩严、钉住他（七版的快慢；齐放拍.ts 的 结界飞出秒），一直罩到他死。
 *  他一死就没了（不收缩焚烧：用户 11-11「而不是法术烧完后死掉」；原版施法者停下后淡出 30 刻，这里同七版硬切，第 5 幕不画）。留着是 Agent 定的：它把他钉在原地挨炸 */
export const throwSec = secAt(castStart);
export const cageSetup: CagePerformanceSetting = {
  ...cagePerformanceDefaults,
  flyOutSec: cageFlySec,
  from: perform.杖(throwSec).tip,
  target: cageCenter,
  coverSec: secAt(deathTime) - throwSec - cageFlySec,
  shrinkBurnSec: 0,
};
/** 罩严（编排的钟） */
export const coverFull = secAt(coverFullSec);
/** 画的全部：卫射的光束起点每帧跟着真杖尖 */
export const castTable: readonly Launch[] = pureCastTable.map((cast) => (followStaffIds.includes(cast.id) ? { ...cast, follow: (t: number) => perform.杖(t).tip } : cast));

// ── 史蒂夫：钉在原地，一直转着身子对着她、挥剑劈飞来的弹、一下下挨打踉跄、在结界里挣；晋升之环救他那一下不倒（原版图腾救下来不倒地），幕末死 ──
const faceSteve = (p: readonly number[]): V3 => {
  const vecLength = Math.hypot(steveFoot[0] - p[0]!, steveFoot[1] - p[1]!) || 1;
  return [(steveFoot[0] - p[0]!) / vecLength, (steveFoot[1] - p[1]!) / vecLength, 0];
};
/** 劈之前把剑举过头顶的时间（秒） */
const raiseSwordSec = 0.12;
/** 挨打的反应（照 Linker 打戏知识库 animation.md 第 7 节的受击反应）：9 帧仰到头、0.4 秒回正（0.5 秒一下，回正得比七版快），顺着弹来的方向往后让 0.45 格再被结界拽回。Agent 取的 */
const leanTiming = { peakSec: 9 / 60, restoreSec: 0.4 } as const;
const yieldCells = 0.45;
export const steveStateAt = (t: number): SteveState => {
  // 他的局部钟：索命劈中定住 16 帧。s 是局部钟上的幕内秒，w 是世界钟（停着时取停顿开头）
  const s = steveClock(t - actStart);
  const w = steveBackToWorld(s);
  const yaBoLun = yaBoLunPos(secAt(w));
  const yaBoLunHead = addVec(yaBoLun, [0, 0, 1.5]);
  const faceYaBoLunDeg = (Math.atan2(-(yaBoLunHead[0] - steveFoot[0]), yaBoLunHead[1] - steveFoot[1]) * 180) / Math.PI;
  const prevSwing = swingTimes.filter((c) => c <= s).pop();
  const nextSwing = swingTimes.find((c) => c > s);
  const swingSec = prevSwing !== undefined && s - prevSwing < 0.5 ? s - prevSwing : undefined;
  const raiseAmount = nextSwing !== undefined && nextSwing - s < raiseSwordSec ? smoothstep01(1 - (nextSwing - s) / raiseSwordSec) : 0;
  const release = swingSec !== undefined ? 1 - smoothstep01(swingSec / 0.1) : 0;
  // 每一剑身子往左右轮着拧一下，劈不同方向飞来的弹
  const twist = swingTimes.reduce((sum, c, i) => sum + (i % 2 ? -18 : 18) * smoothstep01(clamp01((s - c + raiseSwordSec) / raiseSwordSec)) * (1 - smoothstep01(clamp01((s - c - 0.15) / 0.35))), 0);
  const nearestHit = takenHits.filter((h) => h.sec <= s).pop();
  const hitReactSec = nearestHit && s - nearestHit.sec < leanTiming.restoreSec ? s - nearestHit.sec : undefined;
  const sinceHeavy = nearestHit && nearestHit.重 ? s - nearestHit.sec : Infinity;
  const tilt = sinceHeavy < 0.6 ? 20 * Math.sin(Math.PI * clamp01(sinceHeavy / 0.6)) : 0;
  // 挣：罩严那一下想跑（脚抬不起来）、挨了重的腿软；钉住以后一直扎着马步晃，越到后面越使劲
  const cover = coverFull - actStart;
  const coverStruggle = smoothstep01(clamp01((w - (cover - 0.05)) / 0.2)) * (1 - smoothstep01(clamp01((w - (cover + 0.7)) / 0.35)));
  const heavyStruggle = sinceHeavy < 0.6 ? 0.7 * (1 - sinceHeavy / 0.6) : 0;
  const pinned = w >= cover ? lerp(0.15, 0.45, clamp01((w - cover) / (deathTime - cover))) : 0;
  const struggle = Math.min(1, Math.max(coverStruggle * 0.9, heavyStruggle, pinned));
  // 看：看着她（弹从她那边来）
  const lookAt: V3 = yaBoLunHead;
  const afterDeathSec = t - secAt(deathTime);
  const recoil = hitReactSec === undefined ? 0 : yieldCells * leanBackEnvelope(hitReactSec, leanTiming.peakSec, leanTiming.restoreSec);
  return {
    位置: addVec(steveFoot, faceSteve(yaBoLun), recoil),
    facing: faceYaBoLunDeg + twist + tilt,
    看: lookAt,
    // 待机、剑的光泽、光环自转接着第 2 幕末的相位走（开盘拍.ts 的 第二幕末史蒂夫秒）
    sec: act2EndSteveSec + s,
    rightHand: '剑',
    leftHand: '空',
    ...(swingSec !== undefined ? { swingSec } : {}),
    charge: Math.max(raiseAmount, release),
    hitReactSec,
    backLeanDeg: nearestHit?.重 ? 24 : 16,
    leanTiming,
    ...(afterDeathSec >= 0 ? { afterDeathSec: afterDeathSec } : {}),
    ...(struggle > 0 ? { struggle } : {}),
  };
};
