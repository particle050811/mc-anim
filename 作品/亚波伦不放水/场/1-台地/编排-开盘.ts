// 第 2 幕的走位和她的演出：史蒂夫怎么冲、跳、退到受困位，亚波伦怎么升、举杖、开盘。纯计算，时钟是「现身后几秒」（和第 1 幕她的动画时钟接上），第 3 幕接着用。
// 走位、时刻、轮盘大小都是 Agent 照分镜第二稿取的，用户没看过。和分镜不一样：祭坛南边一排基座挡着，史蒂夫是跳上基座挥剑（分镜只写「冲上去跳劈」）。
import { clamp01, lerp as 混, smoothstep01 as 平滑 } from '@engine/core/数学.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { STEVE, steveSize } from '@库/角色/史蒂夫.tsx';
import { 定演出, type 演出条 } from '../../角色/动作/亚波伦演出.ts';
import { 杖尖盘位姿, type 盘摆法 } from '../../界面/杖尖盘位姿.ts';
import { 轮盘外半径, type 多圈轮盘参数 } from '../../界面/多圈轮盘.tsx';
import { 现身位置 } from '../../特效/安息仪式时序.ts';
import { 脚高 } from './布局.ts';
import { 真下界场景 } from '../../地点/真下界位置.ts';
import 线 from './时间线.ts';

const 事 = 线.事件;
/** 场时间线的秒 → 现身后几秒 */
export const 现身后 = (场秒: number) => 场秒 - 事.现身.秒;
const 幕起 = 现身后(事.召唤完.秒);
const 段 = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));

// 祭坛那一列中心的游戏坐标（布局.ts 的 祭坛）；本地 = 以它为原点的场景坐标（x 东、y 北）
const 祭坛游戏 = { x: 898.5, z: -299.5 };
/** 本地 (x, y) 站在地上、再抬 高 格的场景坐标 */
const 地上 = (x: number, y: number, 高 = 0): V3 => {
  const [gx, gz] = [祭坛游戏.x + x, 祭坛游戏.z - y];
  return 真下界场景(gx, 脚高(gx, gz) + 高, gz);
};
const 受困本地 = [8, -6] as const;

/** 史蒂夫的脚底：冲两步 → 跳上南边中间那个基座挥剑 → 跳下来 → 倒退到受困位 */
export const 史蒂夫位 = (t: number): V3 => {
  const s = t - 幕起;
  if (s < 0.75) return 地上(0, 混(-6.6, -4.3, 段(s, 0.1, 0.75)));
  if (s < 1.25) {
    const u = 段(s, 0.75, 1.25);
    return 地上(0, 混(-4.3, -3, u), u + 0.5 * Math.sin(Math.PI * u));
  }
  if (s < 1.7) return 地上(0, -3, 1);
  if (s < 2.1) {
    const u = 段(s, 1.7, 2.1);
    return 地上(0, 混(-3, -4.4, u), 1 - u + 0.3 * Math.sin(Math.PI * u));
  }
  const u = 平滑(段(s, 2.1, 4.8));
  return 地上(混(0, 受困本地[0], u), 混(-4.4, 受困本地[1], u));
};
export const 史蒂夫眼 = (t: number): V3 => {
  const p = 史蒂夫位(t);
  return [p[0], p[1], p[2] + steveSize(STEVE.scale).eye];
};

export const 祭坛点 = 地上(0, 0);
/** 悬停的高度（脚底离地），分镜 2-02「约 12 格高」 */
export const 悬停高 = 12;
/** 亚波伦的脚底：跳劈前 0.3 秒离地，先快后慢升到 悬停高 */
export const 亚波伦位 = (t: number): V3 => {
  const u = 段(t - 幕起, 现身后(事.跳劈.秒) - 幕起 - 0.3, 现身后(事.升到位.秒) - 幕起);
  return [祭坛点[0] + 现身位置[0], 祭坛点[1] + 现身位置[1], 祭坛点[2] + 混(现身位置[2], 悬停高, 1 - (1 - u) ** 2.2)];
};

const 举 = 现身后(事.举杖.秒);
const 张 = 现身后(事.张盘.秒);
/** 她到张开轮盘为止的姿势轴；后面的幕接着往下排 */
export const 开盘轴: readonly 演出条[] = [
  { 起: 0, 做: '站立' },
  { 起: 现身后(事.跳劈.秒) - 0.55, 到: 现身后(事.跳劈.秒) - 0.25, 做: '起飞' },
  { 起: 现身后(事.跳劈.秒) - 0.2, 到: 现身后(事.跳劈.秒) + 0.5, 做: '悬停' },
  { 起: 举, 到: 举 + 0.6, 做: '指向' },
  { 起: 张 - 0.1, 到: 张 + 0.1, 做: '开盘' },
  { 起: 张 + 0.3, 到: 张 + 0.8, 做: '指向' },
];
export const 演 = 定演出({ 轴: 开盘轴, 位: 亚波伦位, 目标: 史蒂夫眼 });

// ── 轮盘 ──
/** 开合放慢到看得出一圈一圈（原版 2.5 刻整圈弹开，三圈连弹只有 0.4 秒） */
const 开合 = { 每圈刻: 5, 圈间隔刻: 7 };
/** 张开后第几刻的轮盘参数；没开始张 = null */
export const 轮盘参 = (t: number): 多圈轮盘参数 | null => (t < 张 ? null : { 放: '有画面', 刻: (t - 张) * 20, 开合 });
/** 盘在世界里的半径（格）。用户 11-10 看了直径 12 格的说过大、「比人都大这么多」；缩到直径 4 格是 Agent 取的，用户没看过 */
export const 盘半径 = 2;
export const 每像素格 = 盘半径 / 轮盘外半径({ 放: '有画面' });
export const 盘摆 = { 朝向: '垂直杖身', 离尖: 0.1 } satisfies 盘摆法;
export const 盘位 = (t: number) => 杖尖盘位姿(演.杖(t), 盘摆);
