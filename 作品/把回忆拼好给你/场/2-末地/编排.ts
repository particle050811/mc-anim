// 2-抢龙蛋 每一帧谁在哪、什么样：她、你、龙蛋、龙的死亡进度、经验球、龙蛋瞬移的传送粒子、机位、转场进度。
// 按段内帧算，时刻取 分镜.ts 的正片事件，位置和分寸取 参数.ts、姿势.ts。纯模块（测试能引，不 import 组件）。
// 游戏钟：段首是第 0 刻，每帧 20/24 刻；粒子、经验球、挥手都按刻走，同游戏。
import type { V3 } from '@engine/model/parts.tsx';
import type { FigurePose } from '@库/角色/骨架.tsx';
import type { 魔法酒狐全部表情, 魔法酒狐新姿势 } from '@库/角色/魔法酒狐新动作.ts';
import type { ParticleSpawn } from '@库/特效/原版粒子.tsx';
import { fps, 段内正片事件帧, 段窗口 } from '../../分镜.ts';
import { 网格 } from '../../配乐/网格.ts';
import { java随机 } from './光束.ts';
import { 龙掉经验, 模拟经验球, type 球态 } from './经验球.ts';
import * as 参 from './参数.ts';
import * as 姿 from './姿势.ts';

const 键 = '2-抢龙蛋';
export const 事 = 段内正片事件帧(键);
const 窗 = 段窗口(键);
export const 帧数 = 窗.帧数;
/** 段内帧 → 歌曲帧（颗粒的种子用它，核对段的静帧同一颗粒） */
export const 歌曲帧 = (f: number) => 窗.起帧 + f;
/** 段内帧 → 歌上的秒（她眨眼、尾巴按它走） */
export const 歌秒 = (f: number) => (窗.起帧 + f) / fps;
/** 段内帧 → 游戏刻（段首 0） */
export const 刻 = (f: number) => (f * 20) / fps;
const 拍帧 = 网格.拍长 * fps;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const 插 = (a: number, b: number, t: number) => a + (b - a) * t;
const 插3 = (a: readonly number[], b: readonly number[], t: number): V3 => [插(a[0]!, b[0]!, t), 插(a[1]!, b[1]!, t), 插(a[2]!, b[2]!, t)];
/** 两张骨骼表按转角、位置插值（一边没有的当 0） */
const 插骨 = (a: 姿.骨表, b: 姿.骨表, t: number): 姿.骨表 => {
  const r: 姿.骨表 = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const 甲 = a[k] ?? {}, 乙 = b[k] ?? {};
    r[k] = { ...甲, ...乙, rot: 插3(甲.rot ?? [0, 0, 0], 乙.rot ?? [0, 0, 0], t), ...(甲.pos || 乙.pos ? { pos: 插3(甲.pos ?? [0, 0, 0], 乙.pos ?? [0, 0, 0], t) } : {}) };
  }
  return r;
};
/** 格 (i, j, k) 中间、离格底 高 处 */
const 格心 = (c: readonly number[], 高 = 姿.蛋心高): V3 => [c[0]! + 0.5, c[1]! + 0.5, c[2]! + 高];
/** yaw（FigurePose：0 朝北、正 = 往左转）→ 水平朝向的单位向量 */
const 前 = (yaw: number): [number, number] => [-Math.sin((yaw * Math.PI) / 180), Math.cos((yaw * Math.PI) / 180)];

// ---------- 你 ----------
const 蹲切: readonly (readonly [number, number])[] = [
  [事.蹲一, 1],
  [事.起一, 0],
  [事.蹲二, 1],
  [事.起二, 0],
  [事.蹲三, 1],
  [事.再点龙蛋, 0],
];
/** 潜行（原版按下潜行键那一刻模型就切过去，0 / 1） */
export const 你蹲 = (f: number) => {
  let c = 0;
  for (const [at, v] of 蹲切) if (f >= at) c = v;
  return c;
};
const 挥帧 = (参.挥手刻 / 20) * fps;
/** 挥手进度（原版 attackTime 0～1，6 刻挥完）；没在挥 = null */
export const 你挥 = (f: number): number | null => {
  for (const e of [事.点龙蛋, 事.再点龙蛋]) {
    const a = (f - e) / 挥帧;
    if (a >= 0 && a < 1) return a;
  }
  return null;
};
const 提前帧 = 参.看蛋提前秒 * fps;
export const 你眼 = (f: number): V3 => [参.你.位[0], 参.你.位[1], 姿.你眼高(你蹲(f) > 0.5)];

export type 你态 = { loc: V3; yaw: number; 蹲: number; 看: V3; 挥: number | null; 秒: number };
export const 你态 = (f: number): 你态 => {
  let 看: V3;
  if (f < 事.点龙蛋 - 提前帧) 看 = 她头位(f);
  else if (f < 事.扑空 + 2) 看 = 格心(参.蛋位们.起);
  else if (f < 事.再点龙蛋 - 提前帧) 看 = 她头位(f);
  else if (f < 事.再点龙蛋 + 3) 看 = 格心(参.蛋位们.一);
  else 看 = 格心(参.蛋位们.二, 1);
  return { loc: 参.你.位, yaw: 参.你.朝向, 蹲: 你蹲(f), 看, 挥: 你挥(f), 秒: 歌秒(f) };
};

// ---------- 她 ----------
export type 她态 = {
  pose: FigurePose;
  姿势: 魔法酒狐新姿势;
  表情: 魔法酒狐全部表情;
  /** 头对准场景里这一点（按这个姿势的身体倾斜算）；不给 = 头的转角写在 骨骼 的 Head 里 */
  看向?: V3;
  骨骼: 姿.骨表;
  眨眼: number | 'auto';
  秒?: number;
};

const 蹬起 = 事.扑起 - 参.蹬地帧;
const 站姿 = (loc: V3, pitch = 0, yaw: number = 参.她.朝向): FigurePose => ({ loc, pitch, squash: 1, headPitch: 0, headYaw: 0, legR: 0, legL: 0, armR: 0, armRRoll: 0, armL: 0, armLRoll: 0, yaw });

/** 扑在半空：0～1（扑起 → 落蛋） */
const 飞 = (f: number) => clamp01((f - 事.扑起) / (事.落蛋 - 事.扑起));
const 飞位 = (t: number): V3 => {
  const p = 插3(参.她.伏位, 参.她.落位, t);
  return [p[0], p[1], 4 * 参.她.扑高 * t * (1 - t) + 参.她.趴高 * t];
};
const 飞倾 = (t: number) => {
  const k = clamp01(t / 姿.扑倾.转完);
  return 插(姿.扑倾.起, 姿.扑倾.平, 1 - (1 - k) ** 2);
};
const 趴位: V3 = [参.她.落位[0], 参.她.落位[1], 参.她.趴高];

/** 她头大概在哪（你看她、她抬头算角度用；不用很准） */
export const 她头位 = (f: number): V3 => {
  if (f < 事.扑起) {
    const [fx, fy] = 前(参.她.朝向);
    const [往前, 高] = 姿.她头.伏;
    return [参.她.伏位[0] + fx * 往前, 参.她.伏位[1] + fy * 往前, 高];
  }
  const [fx, fy] = 前(参.她.趴朝向);
  if (f < 事.落蛋) {
    const t = 飞(f);
    const p = 飞位(t);
    const a = (-飞倾(t) * Math.PI) / 180;
    const 长 = 姿.她头.趴[0];
    return [p[0] + fx * 长 * Math.sin(a), p[1] + fy * 长 * Math.sin(a), p[2] + 长 * Math.cos(a) + 姿.她头.趴[1]];
  }
  const [往前, 高] = f < 事.抬头看你 ? 姿.她头.趴 : 姿.她头.撑;
  return [趴位[0] + fx * 往前, 趴位[1] + fy * 往前, 高];
};

/**
 * 扑、趴、撑的时候头的转角（Head 绕 x，负 = 抬头）：身子正朝东，要看的都在东边、偏离正前方不到 35°（测试里核），只解俯仰。
 * 坑：这几个姿势下要看的东西差不多在她「头顶」那一头，看向 解出来的左右转角乱跳、帽檐转向镜头，所以自己算；
 *   Head 绕 y 这时是绕往前伸的脖子转，加了是歪头、帽顶冲镜头，不是左右看，所以不加。
 * 身倾 = FigurePose.pitch（−90 趴平），腰 = UpBody 绕 x（负 = 往后仰）：脸本来朝水平以下 (−身倾 + 腰) 度，要抬到对着 点 的仰角
 */
const 抬头 = (身倾: number, 腰: number, 头: V3, 点: V3): 姿.骨 => {
  const 仰 = (Math.atan2(点[2] - 头[2], Math.hypot(点[0] - 头[0], 点[1] - 头[1])) * 180) / Math.PI;
  return { rot: [-(-身倾 + 腰 + 仰), 0, 0] };
};
const 腰 = (表: 姿.骨表) => 表.UpBody?.rot?.[0] ?? 0;

/** 扭屁股：每拍一个来回，起止各用 2 帧渐入渐出 */
const 扭 = (f: number) => {
  const 包 = clamp01((f - 事.扭屁股) / 2) * clamp01((蹬起 - f) / 2);
  return Math.sin((2 * Math.PI * (f - 事.扭屁股)) / 拍帧) * 包;
};

export const 她态 = (f: number): 她态 => {
  const 秒 = 歌秒(f);
  if (f < 蹬起) {
    const w = 扭(f);
    return {
      pose: 站姿(参.她.伏位),
      姿势: 姿.伏底,
      表情: '认出你',
      看向: 格心(参.蛋位们.起),
      骨骼: {
        ...姿.伏,
        Root: { pos: [0, 0, 2.3], rot: [0, 参.扭屁股.转 * w, 0] },
        UpBody: { rot: [姿.伏.UpBody!.rot![0]!, -参.扭屁股.转 * w, 0] },
        Tail: { rot: [姿.伏.Tail!.rot![0]!, 参.扭屁股.尾甩 * w, 0] },
      },
      眨眼: 'auto',
      秒,
    };
  }
  if (f < 事.扑起) return { pose: 站姿(参.她.伏位), 姿势: 姿.伏底, 表情: '大笑', 看向: 格心(参.蛋位们.起), 骨骼: 姿.蹬, 眨眼: 0, 秒 };
  const 头 = 她头位(f);
  if (f < 事.落蛋) {
    const t = 飞(f);
    const 倾 = 飞倾(t);
    const 骨骼 = { ...姿.扑, Head: 抬头(倾, 腰(姿.扑), 头, 格心(参.蛋位们.起)) };
    return { pose: 站姿(飞位(t), 倾, 插(参.她.朝向, 参.她.趴朝向, t)), 姿势: '静站', 表情: '大笑', 骨骼, 眨眼: 0 };
  }
  if (f < 事.扑空) {
    // 抱住蛋：落地那几帧胸口弹起一点再贴下去
    const k = clamp01((f - 事.落蛋) / 参.落地弹帧);
    const 倾 = -90 + Math.sin(Math.PI * k) * 姿.落地弹;
    const 骨骼 = { ...姿.抱, Head: 抬头(倾, 腰(姿.抱), 头, 格心(参.蛋位们.起)) };
    return { pose: 站姿(趴位, 倾, 参.她.趴朝向), 姿势: '静站', 表情: '大笑', 骨骼, 眨眼: 0, 秒 };
  }
  const pose = 站姿(趴位, -90, 参.她.趴朝向);
  if (f < 事.抬头看你) {
    // 抱了个空：脸朝下看着空了的那块地
    const 骨骼 = { ...姿.趴, Head: 抬头(-90, 腰(姿.趴), 头, 格心(参.蛋位们.起, 0)) };
    return { pose, 姿势: '静站', 表情: '惊讶', 骨骼, 眨眼: 0, 秒 };
  }
  // 撑起来：3 帧撑到位，小腿交替晃；头跟着撑起来的腰算
  const 撑 = 插骨(姿.趴, 姿.撑, clamp01((f - 事.抬头看你 + 1) / 3));
  const 晃 = Math.sin((2 * Math.PI * (f - 事.抬头看你)) / (姿.晃腿.拍 * 拍帧)) * 姿.晃腿.幅;
  const 腿 = (k: string, s: number) => ({ rot: [撑[k]!.rot![0]! + s * 晃, 0, 0] });
  const 身 = { ...撑, LeftLowerLeg: 腿('LeftLowerLeg', 1), RightLowerLeg: 腿('RightLowerLeg', -1) };
  const 看 = (点: V3) => ({ ...身, Head: 抬头(-90, 腰(撑), 头, 点) });
  if (f < 事.她看蛋) return { pose, 姿势: '静站', 表情: '难过', 骨骼: 看(你眼(f)), 眨眼: 'auto', 秒 };
  // 蛋又闪走以后还盯着那儿，只是吓了一跳
  return { pose, 姿势: '静站', 表情: f < 事.再点龙蛋 + 2 ? '认出你' : '惊讶', 骨骼: 看(格心(参.蛋位们.一)), 眨眼: 0, 秒 };
};

// ---------- 龙蛋 ----------
/** 龙蛋在哪一格：点一下之前在 起，点完在 一，再点在 二（镜头背后） */
export const 蛋格 = (f: number): readonly [number, number, number] => (f < 事.点龙蛋 ? 参.蛋位们.起 : f < 事.再点龙蛋 ? 参.蛋位们.一 : 参.蛋位们.二);

/**
 * 龙蛋瞬移的 128 颗传送粒子（DragonEggBlock.teleport 客户端那段，javap 核过）：沿新旧两格的连线随机撒，
 * 位置 = lerp(随机, 新, 旧) + 水平格内随机、竖直 ±0.5，速度各分量 (随机 − 0.5) × 0.2。原版用世界的随机数，这里定种子（Agent 定）。
 * 原版方块坐标 (X, Y, Z) 换场景：格 i = X、k = Y、j = −Z − 1
 */
const 瞬移粒子 = (帧: number, 旧: readonly number[], 新: readonly number[], 种子: number): ParticleSpawn[] => {
  const r = java随机(种子);
  const 旧Z = -旧[1]! - 1, 新Z = -新[1]! - 1;
  return Array.from({ length: 128 }, (_, n) => {
    const d0 = r();
    const fx = (r() - 0.5) * 0.2, fy = (r() - 0.5) * 0.2, fz = (r() - 0.5) * 0.2;
    const x = 插(新[0]!, 旧[0]!, d0) + (r() - 0.5) + 0.5;
    const y = 插(新[2]!, 旧[2]!, d0) + r() - 0.5;
    const z = 插(新Z, 旧Z, d0) + (r() - 0.5) + 0.5;
    return { 种: 'portal' as const, 刻: 刻(帧), p: [x, -z, y] as V3, v: [fx, -fz, fy] as V3, 种子: 种子 * 1000 + n };
  });
};
export const 传送粒子们: ParticleSpawn[] = [
  ...瞬移粒子(事.点龙蛋, 参.蛋位们.起, 参.蛋位们.一, 5),
  ...瞬移粒子(事.再点龙蛋, 参.蛋位们.一, 参.蛋位们.二, 6),
];

// ---------- 龙、经验球 ----------
/** 这一帧龙死了多少刻（连续） */
export const 死刻 = (f: number) => 参.段首龙死刻 + 刻(f);
/** 死亡第 t 刻龙在哪（每刻上飘 0.1） */
export const 龙位 = (t: number): V3 => [参.段首龙位[0], 参.段首龙位[1], 参.段首龙位[2] + (t - 参.段首龙死刻) * 参.龙每刻上飘];

/** 出口传送门：传送门方块的格（原点格四周 5×5 去掉四角和中间柱子，EndPodiumFeature 的 closerThan 2.5） */
export const 门格们: readonly (readonly [number, number])[] = (() => {
  const r: [number, number][] = [];
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) if (i * i + j * j < 6.25 && (i || j)) r.push([i, j]);
  return r;
})();
const 是门 = (x: number, y: number) => 门格们.some(([i, j]) => i === Math.floor(x) && j === Math.floor(y));

const 球起刻 = 参.段首龙死刻;
const 球止刻 = 参.段首龙死刻 + Math.ceil(刻(帧数)) + 1;
const 球表 = 模拟经验球(
  龙掉经验(参.龙经验, 龙位),
  球起刻,
  球止刻,
  { 位: () => 参.你.位, 蹲: (t) => 你蹲(((t - 参.段首龙死刻) * fps) / 20) > 0.5 },
  { 高: () => 0, 门: (x, y) => (是门(x, y) ? { 面: -0.25 } : null) },
  3,
);
/** 这一帧看得见的经验球（在相邻两刻之间插值，同游戏渲染）；龄 带小数，颜色闪烁按它算 */
export const 经验球们 = (f: number): 球态[] => {
  const t = 刻(f);
  const k = Math.floor(t), s = t - k;
  const out: 球态[] = [];
  for (const 行 of 球表) {
    const a = 行[k], b = 行[k + 1];
    if (!a) continue;
    out.push(b ? { ...a, 位: 插3(a.位, b.位, s), 龄: a.龄 + s } : a);
  }
  return out;
};

// ---------- 机位、转场 ----------
/** 透视机位：整句从 眼起 匀速推到 眼止 */
export const 机位 = (f: number) => ({ 种: '透视' as const, 眼: 插3(参.机位.眼起, 参.机位.眼止, f / (帧数 - 1)), 看: 参.机位.看, 视角: 参.机位.视角 });
/** 粒子带走画面的进度：再点龙蛋那一帧 0，段尾最后一帧 1（盖满） */
export const 转场进度 = (f: number) => clamp01((f - 事.再点龙蛋) / (帧数 - 1 - 事.再点龙蛋));
