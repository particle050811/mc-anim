// 一镜到底航线的输入：全局上限和各程单给的参数，起点（接 6-1-3 末帧），各处 boss 的穿刺线。调航线改这里。
import { twilightLandmark } from '../../../../../world/地点/暮色新世界.tsx';
import type { V3 } from '../../../../../engine/model/parts.tsx';
import { broomFromTip } from '../../../../../world/角色/骑扫帚持矛.tsx';
import * as P613 from '../../6-1-3/编排.ts';
import * as lichChoreo from '../../6-1-5/编排.ts';
import * as hydraChoreo from '../../6-1-6/编排.ts';
import * as chainPierceChoreo from '../../6-1-7/编排.ts';
import * as snowQueenChoreo from '../../6-1-8/编排.ts';
import * as giantChoreo from '../../6-1-8b/编排.ts';
import * as castleChoreo from '../../6-1-9/编排.ts';

export const FPS = 24;
export const V_CRUISE = 1000;

// ====================== 输入表 ======================
// 全局上限（每帧口径：1 米/帧² = 576 米/秒²，1 米/帧³ = 13824 米/秒³，1°/帧 = 24°/秒）。改这里以后跑 工具/一镜到底/诊断.ts（可行性、各程）和 验收.ts（逐帧指标）
export const 限值 = {
  // 视角（航向）匀速转的角速度：每秒 60°（用户 10-07 定）
  视角转速: 60,
  // 角速度加满（或收回）的角加速度上限 0.3°/帧²：两头各约 0.35 秒回旋过渡，中间匀速（用户 10-07 嫌升余弦慢慢升满的弯怪）
  angAccel: 0.3 * 24 * 24,
  // 俯仰：角速度不超 2°/帧，竖直法向加速度不超 0.5 米/帧²（高速时由它定）。九头蛇爬回巡航高度时扫帚突然下压（用户 10-08），就是这两项超了十倍
  pitchRate: 48,
  vertNormalAccel: 0.5 * 576,
  // 速度：切向加速度 1.6 米/帧²、jerk 0.25 米/帧³，320 → 1000 用 1.00 秒（用户定穿出 1 秒内加回 1000）
  tangAccel: 1.6 * 576,
  tangJerk: 0.25 * 13824,
  // 每程爬升、下降最陡（度）
  maxSlopeDeg: 15,
};
// 程转速：这一程出发处单给的视角转速（度/秒）。极光宫殿 → 云中小屋只有 1.9 公里、出来要左转 119°，每秒 60° 时弯半径近 1 公里放不下，用户 10-08 要求增大，定 90
export const 程转速: Partial<Record<Boss名, number>> = { 冰雪女王: 90 };
// 提前对正（米）：进下一处穿刺线前的弯在这一程终点前多少米拐完、之后沿进场线直飞（用户 10-07：不要靠得特别近才转）。
// 巫妖取 350：450 时出口弯和进口弯叠在一起解不出；要起飞不先拐得把起飞方位改到约 154°（6-1-3 跟着重渲）
export const alignAheadM: Partial<Record<Boss名 | '降落', number>> = { 巫妖: 350, 降落: 600 };
// 程单给：这一程出发处单给的巡航速度（米/秒）、爬升下降最陡（度），其余照 `V_CRUISE`、`限值`.最陡。
// - 雪怪洞窟 → 极光宫殿只隔 0.55 公里却要爬 142 米，加速到 1000 来不及爬（俯仰角速度受竖直加速度管着），所以不加速，320 米/秒、最陡 20°。
// - 极光宫殿 → 云中小屋：先左转一百多度再右转对正，两个弯不能叠，加到 1000 这一程放不下，所以巡航 700。
export const legOverrides: Partial<Record<Boss名, { 巡航?: number; maxSlopeDeg?: number }>> = { 雪怪首领: { 巡航: 320, maxSlopeDeg: 20 }, 冰雪女王: { 巡航: 700 } };
// 巡航离树冠：每程一个巡航高度 = 沿线树冠面的中位 + 巡航离地（暮色新世界.tsx，10-07 定 60 米）。树不让
// 降落那一程（云中小屋 → 城堡）：穿出小屋先爬到 `landingCruiseZ`（过得去主楼南边塔楼和尖顶），在平台前落下来；320 进来，按 `landingDecel` 的 S 曲线减到脱手时的 `endSpeed`
export const landingCruiseZ = castleChoreo.castleOrigin[2] + 219;
export const landingDecel = { A: 0.25 * 576, J: 0.05 * 13824 };
// 起飞以后第一程的加速：接 6-1-3 末帧（567 米/秒、正按指数往 1000 加）的加速度接着加
// （骨架半径：杜宾骨架只给牛顿法当初值——往哪边转、大概转多少）
export const skeletonRadii = [260, 500, 1000, 1500];

// ---------- 小工具 ----------
export const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const len = (a: number[]) => Math.hypot(a[0], a[1], a[2]);
export const ss = (x: number) => {
  const clamped = Math.min(1, Math.max(0, x));
  return clamped * clamped * (3 - 2 * clamped);
};
export const rad = (d: number) => (d * Math.PI) / 180;
export const deg = (r: number) => (r * 180) / Math.PI;
// 方位：度，0 = 北、顺时针为正；编排的朝向是往左为正，= −方位
const bearingOf = (dx: number, dy: number) => ((((Math.atan2(dx, dy) * 180) / Math.PI) % 360) + 360) % 360;
const angleDiff = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180; // a → b 转多少（正 = 右转）

// ---------- 起点：6-1-3 末帧 ----------
// 6-1-3 的编排是娜迦庭院本地坐标（庭院没转，只平移）。起飞方位 144.5° 由 6-1-3 定，顺着它末帧的速度方向接着飞，速度、加速度都接上（末帧 567 米/秒、还在加）
const courtyard = twilightLandmark('娜迦庭院');
export const B0 = courtyard.到世界(P613.LAST.broom().pos);
export const V0 = P613.LAST.speed();
export const A0 = (() => {
  const lastFrame = P613.beats.末帧;
  return (len(P613.velocity(lastFrame + 0.25)) - len(P613.velocity(lastFrame - 0.25))) * 2 * FPS;
})();
export const D0 = (() => {
  const velVec = P613.LAST.velocity();
  return velVec.map((x) => x / len(velVec)) as V3;
})();
export const 起飞方位 = bearingOf(D0[0], D0[1]);
export const takeoffPitch = deg(Math.asin(D0[2]));

// ---------- 穿刺线 ----------
// 身（近景的几处才有）：穿刺线上每个 boss 的身体中心 心、矛尖碰到它身体的位置 触（米，同 a）。战利品箱、boss 死时变半透明按它
export type 穿刺 = { 名: string; V: number; 朝向: number; 矛尖: (along: number) => V3; 前: number; 后: number; 撞: number; 出: number; 身?: { 心: number; 触: number }[] };
export const 穿刺表 = {
  巫妖: lichChoreo.穿刺线 as 穿刺,
  九头蛇: hydraChoreo.穿刺线 as 穿刺,
  暮初恶魂: chainPierceChoreo.ghastPierceLine as 穿刺,
  雪怪首领: chainPierceChoreo.yetiPierceLine as 穿刺,
  冰雪女王: snowQueenChoreo.穿刺线 as 穿刺,
  巨人: giantChoreo.穿刺线 as 穿刺,
};
export type Boss名 = keyof typeof 穿刺表;
export const ORDER: Boss名[] = ['巫妖', '九头蛇', '暮初恶魂', '雪怪首领', '冰雪女王', '巨人'];
export const placeName = (n: string) => ({ 巫妖: '巫妖怪塔', 九头蛇: '九头蛇巢穴', 暮初恶魂: '幽冥高塔', 雪怪首领: '雪怪洞窟', 冰雪女王: '极光宫殿', 巨人: '云中小屋' })[n] ?? n;
// 穿刺线上 a 处的扫帚杆中心：矛尖反求（朝向固定，俯仰按矛尖路线的坡度）
export const pitchAt = (pierce: 穿刺, along: number) => {
  const tipBefore = pierce.矛尖(along - 0.25);
  const tipAfter = pierce.矛尖(along + 0.25);
  return deg(Math.atan2(tipAfter[2] - tipBefore[2], Math.hypot(tipAfter[0] - tipBefore[0], tipAfter[1] - tipBefore[1])));
};
export const centerAt = (P: 穿刺, a: number): V3 => broomFromTip(P.矛尖(a), P.朝向, pitchAt(P, a));
export const bearingAt = (pierce: 穿刺, along: number) => {
  const tipBefore = pierce.矛尖(along - 1);
  const tipAfter = pierce.矛尖(along + 1);
  return bearingOf(tipAfter[0] - tipBefore[0], tipAfter[1] - tipBefore[1]);
};
