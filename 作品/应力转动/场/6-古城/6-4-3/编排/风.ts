// 6-4-3 风：弓前的风扇虚影和风道粒子。
import { bladeVisualAngle } from '@库/物品/鼓风机.tsx';
import { scatterDuct, type AirFlowParticle } from '@库/特效/气流.tsx';
import * as geom from '../几何.ts';
import * as timeline from '../时间线.ts';
import { ss, storySecAt } from './公用.ts';
// 原文第 7 章：「应力转动之力从黄叛的体内空间涌出……形成风场！」。人身上不画粒子（用户 10-10），只留弓前风道：
// 从风扇虚影出风口往前喷（出生距离 [0, 0.15]），风扇升速时风道跟着变长，「哄」那一下转满。
// 「风比箭快」靠风道看：风一直比箭快（几何.ts 的 `windSpeedAt`），粒子从箭身边超过去
// 风扇：1.85 起显出来开始转，「哄」转满 256 rpm，放箭后 0.15～0.4 秒停转、淡掉
export const fanFadeSec = geom.shootTime + 0.15;
export const fanStopSec = geom.shootTime + 0.4;
export const fanRpm = (t: number) => (t < fanFadeSec ? 256 * ss((t - 1.85) / (geom.roar - 1.85)) : 256 * (1 - ss((t - fanFadeSec) / (fanStopSec - fanFadeSec))));
export const fanVisibility = (t: number) => ss((t - 1.85) / 0.15) * (1 - ss((t - fanFadeSec) / (fanStopSec - fanFadeSec)));
export const fanState = (globalFrame: number) => {
  const t = storySecAt(globalFrame);
  const visibility = fanVisibility(t);
  const spin = bladeVisualAngle(globalFrame, (f) => ({ rpm: fanRpm(storySecAt(f)), storySec: storySecAt(f + 1) - storySecAt(f) }), { startFrame: timeline.frameAt(1.8) });
  return { pos: geom.fanCenter, facing: geom.incomingDir, sideLength: geom.fanSideLength, spin, opacity: 0.55 * visibility };
};
export const airflow = (globalFrame: number): AirFlowParticle[] => {
  const t = storySecAt(globalFrame);
  // 风道：照机械动力的风扇逐刻推（模型/特效/气流.tsx），按剧情放大两处（几何.ts 的 `风道最大距离`、`风快放`）：距离缩到 0.3 倍，快放 880 倍，一直比箭快。
  // 样子是 `散花风道`（芯 + 散花两层、末端渐稀，用户 10-18 定），7-1-5、7-4-1 同款。
  // 出生位置照 AirCurrent.tick（风扇中心 + 风向 × 0.5，±0.25），但后一半在风扇方块里；这里风扇是半透明虚影，
  // 生在里面会像从弓上冒出来，所以只生在出风口前 0～0.15 格（用户 10-10：气流「从鼓风机出风口才开始」）。
  const k = geom.fanSideLength;
  return scatterDuct({ 种子: 11, storyTime: t, sideLength: k, outlet: geom.fanOutlet, windDir: geom.incomingDir, rotSpeedRpm: fanRpm, maxDist: (tt: number) => geom.ductMaxDist(fanRpm(tt)), fastForward: geom.windFastForward, spawnDist: [0, 0.5 * k], 起: 1.85 });
};
