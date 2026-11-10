// 第 3 幕的编排：结界几时扔、七个法术几时放、她几时冲到结界另一侧、史蒂夫几时举盾拉弓。纯计算，时钟接第 2 幕（现身后几秒），第 4 幕接着用。
// 时刻、走位都是 Agent 照分镜第二稿 3-01～3-07 取的，用户没看过。
import { clamp01, lerp as 混 } from '@engine/core/数学.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { STEVE, steveSize } from '@库/角色/史蒂夫.tsx';
import { 定演出 } from '../../角色/动作/亚波伦演出.ts';
import { 出箭点, 箭飞行, type 史蒂夫状态 } from '../../角色/史蒂夫反应.ts';
import { 杖尖盘位姿 } from '../../界面/杖尖盘位姿.ts';
import type { 多圈轮盘参数 } from '../../界面/多圈轮盘.tsx';
import { 排盘 } from '../../界面/轮盘法术.ts';
import { 结界演出默认, type 结界演出设定 } from '../../特效/炼狱结界演出状态.ts';
import { 亮格, 发命中, 发键, type 一发, type 场况 } from '../../场/1-台地/出手.tsx';
import 线 from '../../场/1-台地/时间线.ts';
import { 亚波伦位 as 开盘位, 史蒂夫位 as 开盘史位, 开盘轴, 悬停高, 每像素格, 演 as 开盘演, 现身后, 盘摆, 祭坛点, 轮盘参 as 开盘参 } from '../2-开盘/编排.ts';

const 事 = 线.事件;
/** 本幕开头（编排的钟） */
export const 幕起 = 现身后(事.开盘完.秒);
const 平滑 = (u: number) => u * u * (3 - 2 * u);
const 加 = (a: readonly number[], b: readonly number[], k = 1): V3 => [a[0]! + b[0]! * k, a[1]! + b[1]! * k, a[2]! + b[2]! * k];

/** 史蒂夫被钉住的地方（脚底）：第 2 幕退到的受困位 */
export const 史蒂夫脚: V3 = 开盘史位(幕起);
export const 史蒂夫眼: V3 = 加(史蒂夫脚, [0, 0, steveSize(STEVE.scale).eye]);
/** 结界中心：史蒂夫半身高（原版结界中心也在半身高） */
export const 结界心: V3 = 加(史蒂夫脚, [0, 0, 0.9]);

// ── 她的位置：先停在祭坛上空，冲刺 闪到结界另一侧上空（关于史蒂夫对称的那一点） ──
const 位甲: V3 = 开盘位(幕起);
const 位乙: V3 = [2 * 史蒂夫脚[0] - 位甲[0], 2 * 史蒂夫脚[1] - 位甲[1], 祭坛点[2] + 悬停高];
const 秒在 = (s: number) => 幕起 + s;
export const 冲刺起 = 秒在(11.2);
const 冲刺秒 = 0.4;
export const 亚波伦位 = (t: number): V3 => {
  if (t < 冲刺起) return 开盘位(t);
  const u = 平滑(clamp01((t - 冲刺起) / 冲刺秒));
  return [混(位甲[0], 位乙[0], u), 混(位甲[1], 位乙[1], u), 混(位甲[2], 位乙[2], u)];
};

// ── 出手表（时刻是幕内秒，下面换成编排的钟） ──
const 半身 = (p: V3): V3 => 加(p, [0, 0, 0.5]);
const 冲向 = 加(位乙, [位乙[0] - 位甲[0], 位乙[1] - 位甲[1], 0], 1.5 / Math.hypot(位乙[0] - 位甲[0], 位乙[1] - 位甲[1]));
export const 出手表: readonly 一发[] = [
  { id: 'fireball', 秒: 秒在(3.8) },
  { id: 'ice_spike', 秒: 秒在(5.3) },
  // 旋风、冲刺是她自己身上的：起点 = 她半身（两个法术都把 起点 − 0.5 格当脚底）
  { id: 'whirlwind', 秒: 秒在(9.9), 起点: 半身(位甲), 目标: 半身(位甲) },
  { id: 'bolting', 秒: 冲刺起, 起点: 半身(位甲), 目标: 半身(冲向) },
  // 大牙要在头顶悬 3 秒才落：冲刺一到位就放，3-05 里砸下来
  { id: 'teeth', 秒: 秒在(11.9) },
  { id: 'razor_wind', 秒: 秒在(15.7) },
  { id: 'lightning', 秒: 秒在(18) },
];
/** 结界扔出的时刻；计数里炼狱算第 1 个 */
export const 扔 = 现身后(事.扔结界.秒);
/** 盘上剩下的格同时亮（3-07） */
export const 全亮起 = 秒在(20.3);

export const 演 = 定演出({ 轴: 开盘轴, 位: 亚波伦位, 目标: () => 史蒂夫眼, 出手: [扔, ...出手表.map((发) => 发.秒)] });
export const 盘位 = (t: number) => 杖尖盘位姿(演.杖(t), 盘摆);

const 已放 = new Set(['revelation', ...出手表.map((发) => 发.id)].map(发键));
const 剩下 = 排盘({ 放: '有画面' })
  .项.map((项) => 项.键)
  .filter((键) => !已放.has(键));
export const 轮盘参 = (t: number): 多圈轮盘参数 | null => {
  const 参 = 开盘参(t);
  return 参 && { ...参, 选中: [...亮格(出手表, t), ...(t >= 扔 && t < 扔 + 0.5 ? [发键('revelation')] : []), ...(t >= 全亮起 ? 剩下 : [])] };
};
export const 况: 场况 = { 盘位, 轮盘参, 每像素格, 杖尖: (t) => 演.杖(t).尖, 史蒂夫脚: () => 史蒂夫脚 };

/** 结界：从盘心扔出（那时盘在第 2 幕收尾的位置），1.5 秒飞到、涨满；之后一直罩着（收缩焚烧在第 4 幕末，时长到时再接） */
export const 结界设定: 结界演出设定 = { ...结界演出默认, 起点: 杖尖盘位姿(开盘演.杖(扔), 盘摆).心, 目标: 结界心 };

// ── 箭：第一箭射中她，第二箭被旋风吹偏 ──
const 箭速 = 60; // 满弓 3 格/刻
export const 放箭 = [秒在(7.7), 秒在(10.4)] as const;
const 她胸 = (t: number): V3 => 加(亚波伦位(t), [0, 0, 1.1]);
const 箭程秒 = (t0: number) => Math.hypot(...加(她胸(t0), 出箭点(史蒂夫脚), -1)) / 箭速;
/** 第一箭射中她的时刻 */
export const 中箭 = 放箭[0] + 箭程秒(放箭[0]);
/** 这一刻在飞的箭 */
export const 箭们 = (t: number): { p: V3; dir: V3 }[] =>
  放箭.flatMap((t0, i) => {
    const τ = t - t0;
    const 程 = 箭程秒(t0);
    if (τ < 0) return [];
    const 起 = 出箭点(史蒂夫脚);
    // 抬一点抵掉这段路上的下坠
    const 朝 = 加(加(她胸(t0), 起, -1), [0, 0, 0.5 * 20 * 程 * 程]);
    if (i === 0) return τ < 程 ? [箭飞行(起, 朝, 1, τ)] : [];
    // 第二箭：飞到七成被风带偏，往侧上方甩出去、打着转，0.7 秒后不画
    const 偏起 = 程 * 0.7;
    if (τ < 偏起) return [箭飞行(起, 朝, 1, τ)];
    if (τ > 偏起 + 0.7) return [];
    const 基 = 箭飞行(起, 朝, 1, 偏起);
    const k = τ - 偏起;
    const 侧: V3 = [-基.dir[1], 基.dir[0], 0.6];
    const 速: V3 = 加(加([0, 0, 0], 基.dir, 4), 侧, 3);
    return [{ p: 加(加(基.p, 速, k), [0, 0, -1], 8 * k * k), dir: 加(速, [0, 0, -1], 16 * k) }];
  });

// ── 史蒂夫 ──
const 举盾段: readonly (readonly [number, number])[] = [
  [-1, 1.1],
  [3.5, 5.0],
  [15.5, 16.5],
];
const 拉弓段 = [
  [6.9, 7.7],
  [9.7, 10.4],
] as const;
/** 被盾挡下的不算挨打 */
const 挨打的 = (发: 一发) => !['fireball', 'razor_wind', 'whirlwind', 'bolting'].includes(发.id);
const 命中们 = 出手表.filter(挨打的).flatMap((发) => 发命中(发, 况) ?? []);
export const 史蒂夫状态在 = (t: number): 史蒂夫状态 => {
  const s = t - 幕起;
  const 拿弓 = s >= 6.5 && s < 12.6;
  const 拉 = 拉弓段.find(([a, b]) => s >= a && s < b);
  const 逃 = s >= 1.2 && s < 3.2;
  const 背向 = (Math.atan2(-(史蒂夫脚[0] - 位甲[0]), 史蒂夫脚[1] - 位甲[1]) * 180) / Math.PI;
  const 她头 = 加(亚波伦位(t), [0, 0, 1.5]);
  const 朝她 = (Math.atan2(-(她头[0] - 史蒂夫脚[0]), 她头[1] - 史蒂夫脚[1]) * 180) / Math.PI;
  const 近 = 命中们.filter((h) => h <= t).pop();
  return {
    位置: 史蒂夫脚,
    朝向: 逃 ? 背向 : 朝她,
    // 逃的时候看前面；3-07 抬头看盘
    看: 逃 ? undefined : t >= 全亮起 - 0.6 ? 盘位(t).心 : 她头,
    秒: s,
    右手: 拿弓 ? '弓' : '剑',
    左手: 拿弓 ? '空' : '盾',
    举盾: 举盾段.some(([a, b]) => s >= a && s < b),
    拉弓秒: 拉 ? s - 拉[0] : undefined,
    受击秒: 近 !== undefined && t - 近 < 0.5 ? t - 近 : undefined,
    挣扎: 逃 ? 平滑(clamp01((s - 1.6) / 0.4)) * 0.9 : 0,
  };
};
