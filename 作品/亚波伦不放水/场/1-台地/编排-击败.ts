// 第 5 幕 击败的编排：火光退去、地上剩史蒂夫的掉落物（5-01），他的死亡界面（5-02），她收盘、落地（5-03）。纯计算，时钟接第 4 幕（现身后几秒）。
// 时刻、她落在哪、收盘节奏都是 Agent 照分镜第二稿 5-01～5-03 取的，用户没看过。
// 和分镜不一样：5-03 从 2 秒拉到 4 秒（三圈收回、杖收到身侧、从 12 格高落下来，2 秒只够匆匆掉下来）；地上没有留火、冰、酸（第 4 幕各波硬切清场，同那边的做法）；没有经验球。
import { clamp01, lerp as 混, smoothstep01 as 平滑 } from '@engine/core/数学.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { 定演出 } from '../../角色/动作/亚波伦演出.ts';
import { 开完刻, 默认开合 } from '../../界面/分圈.ts';
import type { 多圈轮盘参数 } from '../../界面/多圈轮盘.tsx';
import { 杖尖盘位姿 } from '../../界面/杖尖盘位姿.ts';
import { 排盘 } from '../../界面/轮盘法术.ts';
import { 台地点 } from './布局.ts';
import 线 from './时间线.ts';
import { 开盘轴, 现身后, 盘摆, 轮盘参 as 开盘参 } from './编排-开盘.ts';
import { 史蒂夫眼, 史蒂夫脚 } from './编排-点名.ts';
import { 焚死, 站 } from './编排-齐放.ts';

const 事 = 线.事件;
/** 本幕开头（编排的钟）：结界收缩焚烧完的那一刻 */
export const 幕起 = 现身后(事.齐放完.秒);
export const 幕长 = 事.击败完.秒 - 事.齐放完.秒;
export const 秒在 = (s: number) => 幕起 + s;

/**
 * 游戏界面开关：5-02 的死亡界面、5-03 聊天栏里的死亡消息。都是游戏自带的界面，照分镜做上的，用户没看过；不要就改成 false。
 * 关了以后没有 5-02，5-01 一直拖到 5-03（幕长不变，要缩短改 场/1-台地/时间线.ts 的 击败完）
 */
export const 游戏界面 = true;

/** 各镜头的开头（幕内秒） */
export const 镜起 = { 一: 0, 二: 2.5, 三: 6 } as const;

// ── 史蒂夫：第 4 幕 焚死 那一刻死的，倒下、20 刻后化烟、东西撒一地（角色/史蒂夫掉落.tsx 照原版） ──
export const 死后秒 = (t: number) => t - 焚死;
export { 史蒂夫脚, 史蒂夫眼 };
/** 死亡消息：结界每刻用 34 种原版伤害来源轮着打（RevelationFix 4.9 DeathPerformance.damageSourcesFromForge，来源记在施法者名下），
 *  哪一下打死他是随机的。这里取 ON_FIRE 那一种（对得上焚烧的画面）：来源带实体、她手里的杖没改名，所以用 death.attack.onFire（原版 zh_cn「%1$s被烧死了」，只填死者）*/
export const 死亡消息 = 'Steve被烧死了';

// ── 她：5-01、5-02 停在第 4 幕处刑那个位置、杖还指着他；5-03 收盘、杖收到身侧、慢慢落到正下方的地上 ──
const 收起 = 秒在(镜起.三 + 0.25);
const 收杖 = 秒在(镜起.三 + 1.05);
const 降起 = 秒在(镜起.三 + 1.0);
export const 落地 = 秒在(镜起.三 + 3.1);
const 空中: V3 = 站.处刑;
/** 落脚点：处刑位正下方那一列的地面 */
export const 落脚: V3 = 台地点(空中[0], -空中[1]);
export const 亚波伦位 = (t: number): V3 => {
  const u = 平滑(clamp01((t - 降起) / (落地 - 降起)));
  return [空中[0], 空中[1], 混(空中[2], 落脚[2], u)];
};
const 轴 = [
  ...开盘轴,
  { 起: 收杖, 到: 收杖 + 0.5, 做: '悬停' as const },
  { 起: 落地 - 0.12, 到: 落地 + 0.12, 做: '落地' as const },
  { 起: 落地 + 0.3, 到: 落地 + 0.8, 做: '站立' as const },
];
export const 演 = 定演出({ 轴, 位: 亚波伦位, 目标: () => 史蒂夫眼 });
export const 盘位 = (t: number) => 杖尖盘位姿(演.杖(t), 盘摆);

const 圈数 = 排盘({ 放: '有画面' }).每圈格数.length;
/** 轮盘：一直开着（不再亮格，没在放法术）；5-03 从最外圈往里一圈圈收回杖尖，最里一圈缩没时圆心的炼狱聚晶一起灭 */
export const 轮盘参 = (t: number): 多圈轮盘参数 | null => {
  const 参 = 开盘参(t);
  if (!参) return null;
  if (t < 收起) return { ...参, 选中: [] };
  const 收刻 = (t - 收起) * 20;
  return 收刻 >= 开完刻(圈数, { ...默认开合, ...参.开合 }) ? null : { ...参, 选中: [], 收刻 };
};

// ── 5-02 的光标（GUI 像素，界面 640 × 360）：打开时原版把鼠标放在窗口正中；20 刻后按钮能按，移到「重生」上，点下去 ──
export const 光标 = { 起: [320, 180] as const, 到: [326, 170] as const, 移起: 1.35, 移秒: 0.45, 点: 2.6 };
export const 光标在 = (镜内秒: number): readonly [number, number] => {
  const u = 平滑(clamp01((镜内秒 - 光标.移起) / 光标.移秒));
  return [混(光标.起[0], 光标.到[0], u), 混(光标.起[1], 光标.到[1], u)];
};
