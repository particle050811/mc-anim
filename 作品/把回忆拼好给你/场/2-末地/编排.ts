// 2-抢龙蛋 每一帧谁在哪、什么样：她、你、龙蛋、龙蛋瞬移的传送粒子、机位、开头从第 4 句的浪里出来。
// 按段内帧算，时刻取 分镜.ts 的正片事件，位置和分寸取 参数.ts、姿势.ts。纯模块（测试能引，不 import 组件）。
// 游戏钟：段首是第 0 刻，每帧 20/24 刻；粒子、挥手都按刻走，同游戏。
import type { V3 } from '@engine/model/parts.tsx';
import type { FigurePose } from '@库/角色/骨架.tsx';
import type { 魔法酒狐全部表情, 魔法酒狐新姿势 } from '@库/角色/魔法酒狐新动作.ts';
import type { ParticleSpawn } from '@库/特效/原版粒子.tsx';
import { fps, 段内正片事件帧, 段窗口, 正片事件 } from '../../分镜.ts';
import { 网格 } from '../../配乐/网格.ts';
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
const 挥帧 = (参.挥手刻 / 20) * fps;
const 挥提前帧 = (参.挥手提前刻 / 20) * fps;
/** 挥手进度（原版 attackTime 0～1，6 刻挥完）：比蛋瞬移早 挥手提前刻 起挥；没在挥 = null */
export const 你挥 = (f: number): number | null => {
  const a = (f - 事.点龙蛋 + 挥提前帧) / 挥帧;
  return a >= 0 && a < 1 ? a : null;
};
const 提前帧 = 参.看蛋提前秒 * fps;
export const 你眼 = (): V3 => [参.你.位[0], 参.你.位[1], 姿.你眼高];

export type 你态 = { loc: V3; yaw: number; 看: V3; 挥: number | null; 秒: number };
/** 你一直站着：看她，点蛋前转头看蛋，蛋没了、她摔下去以后再看回她 */
export const 你态 = (f: number): 你态 => {
  const 看 = f >= 事.点龙蛋 - 提前帧 && f < 事.扑空 + 2 ? 格心(参.蛋位们.起) : 她头位(f);
  return { loc: 参.你.位, yaw: 参.你.朝向, 看, 挥: 你挥(f), 秒: 歌秒(f) };
};

// ---------- 她 ----------
export type 她态 = {
  pose: FigurePose;
  姿势: 魔法酒狐新姿势;
  表情: 魔法酒狐全部表情;
  /** 头对准场景里这一点（按这个姿势的身体倾斜算）；不给 = 看 或者 骨骼 的 Head */
  看向?: V3;
  /** 头相对身子的 [俯仰, 左右]（度，正 = 抬头、往左） */
  看?: [number, number];
  骨骼: 姿.骨表;
  眨眼: number | 'auto';
  秒?: number;
};

const 蹬起 = 事.扑起 - 参.蹬地帧;
const 站姿 = (loc: V3, pitch = 0, yaw: number = 参.她.朝向): FigurePose => ({ loc, pitch, squash: 1, headPitch: 0, headYaw: 0, legR: 0, legL: 0, armR: 0, armRRoll: 0, armL: 0, armLRoll: 0, yaw });

/** 扑在半空：0～1（扑起 → 落蛋） */
const 飞 = (f: number) => clamp01((f - 事.扑起) / (事.落蛋 - 事.扑起));
/** 半空的 loc：伏位 → 蛋上位，连线上再拱起一道抛物线 */
const 飞位 = (t: number): V3 => {
  const p = 插3(参.她.伏位, 参.她.蛋上位, t);
  return [p[0], p[1], p[2] + 4 * 参.她.扑高 * t * (1 - t)];
};
const 飞倾 = (t: number) => {
  const k = clamp01(t / 姿.扑倾.转完);
  return 插(姿.扑倾.起, 姿.扑倾.平, 1 - (1 - k) ** 2);
};

/** 原版实体下落：每刻先按速度走，再 v = (v − 0.08) × 0.98（LivingEntity.travel），刻与刻之间线性插值（渲染的 partialTick）。返回第 刻 刻掉了多少格 */
export const 原版下落 = (刻数: number): number => {
  if (刻数 <= 0) return 0;
  let y = 0, v = 0;
  for (let k = 0; k < Math.floor(刻数); k++) {
    y += v;
    v = (v - 0.08) * 0.98;
  }
  return -(y + (刻数 - Math.floor(刻数)) * v);
};
const 摔前高 = 参.她.蛋上位[2];
/** 蛋没了以后她的身子中线离地多高（落到 趴高 停住） */
const 摔高 = (f: number) => Math.max(参.她.趴高, 摔前高 - 原版下落(刻(f - 事.点龙蛋)));
/** 掉到地上那一帧（连续的段内帧）；分镜.ts 的 扑空 按同一套写成秒，测试核两边差不到一帧 */
export const 摔地帧 = (() => {
  let f = 事.点龙蛋;
  while (摔高(f) > 参.她.趴高) f += 0.01;
  return f;
})();
const 趴位: V3 = [参.她.蛋上位[0], 参.她.蛋上位[1], 参.她.趴高];

/** 她头大概在哪（你看她、她抬头算角度用；不用很准） */
export const 她头位 = (f: number): V3 => {
  if (f < 事.扑起) {
    const [fx, fy] = 前(参.她.朝向);
    const [往前, 高] = 姿.她头.伏;
    return [参.她.伏位[0] + fx * 往前, 参.她.伏位[1] + fy * 往前, 高];
  }
  if (f >= 事.坐起) return [参.她.坐位[0], 参.她.坐位[1], 姿.她头.坐];
  const [fx, fy] = 前(参.她.趴朝向);
  const [长, 抬] = 姿.她头.平;
  if (f < 事.落蛋) {
    const t = 飞(f);
    const p = 飞位(t);
    const a = (-飞倾(t) * Math.PI) / 180;
    return [p[0] + fx * 长 * Math.sin(a), p[1] + fy * 长 * Math.sin(a), p[2] + 长 * Math.cos(a) + 抬];
  }
  const z = f < 事.点龙蛋 ? 摔前高 : 摔高(f);
  return [趴位[0] + fx * 长, 趴位[1] + fy * 长, z + 抬];
};

/**
 * 身子放平（扑、蛋上、摔、趴）时头的转角（Head 绕 x，负 = 抬头）：身子正朝东，要看的都在东边，只解俯仰。
 * 坑：这几个姿势下要看的东西差不多在她「头顶」那一头，看向 解出来的左右转角乱跳、帽檐转向镜头，所以自己算；
 *   Head 绕 y 这时是绕往前伸的脖子转，加了是歪头、帽顶冲镜头，不是左右看，所以不加。
 * 身倾 = FigurePose.pitch（−90 趴平），腰 = UpBody 绕 x（正 = 往前弯）：脸本来朝水平以下 (−身倾 + 腰) 度，要抬到对着 点 的仰角
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
  if (f < 事.点龙蛋) {
    // 扑在蛋上抱住：落上去那几帧胸口弹起一点再贴下去；抬头看你（得意）
    const k = clamp01((f - 事.落蛋) / 参.落地弹帧);
    const 倾 = -90 + Math.sin(Math.PI * k) * 姿.落地弹;
    const 骨骼 = { ...姿.蛋上, Head: 抬头(倾, 腰(姿.蛋上), 头, 你眼()) };
    return { pose: 站姿(参.她.蛋上位, 倾, 参.她.趴朝向), 姿势: '静站', 表情: '大笑', 骨骼, 眨眼: 0, 秒 };
  }
  if (f < 事.坐起) {
    // 蛋没了：照原版重力掉下去，身子从抱蛋摊成趴着；落地以后脸朝下趴着
    const z = 摔高(f);
    const t = clamp01((摔前高 - z) / (摔前高 - 参.她.趴高));
    const 身 = 插骨(姿.蛋上, 姿.趴, t);
    const 骨骼 = { ...身, Head: 抬头(-90, 腰(身), 头, 格心(参.蛋位们.起, 0)) };
    return { pose: 站姿([趴位[0], 趴位[1], z], -90, 参.她.趴朝向), 姿势: '静站', 表情: '惊讶', 骨骼, 眨眼: 0, 秒 };
  }
  // 坐起来（TLM 的待命坐）：一下切过去，身子半朝镜头，抬头冲你噘嘴，一直到段尾
  return { pose: 站姿(参.她.坐位, 0, 参.她.坐朝向), 姿势: '坐', 表情: '难过', 看: 参.她.噘嘴看, 骨骼: {}, 眨眼: 'auto', 秒 };
};

// ---------- 龙蛋 ----------
/** 龙蛋在哪一格：点一下之前在 起，点完在 一 */
export const 蛋格 = (f: number): readonly [number, number, number] => (f < 事.点龙蛋 ? 参.蛋位们.起 : 参.蛋位们.一);

/** Java Random（LegacyRandomSource）的 nextFloat 序列 */
export const java随机 = (种子: number) => {
  const 乘 = 0x5deece66dn;
  const 模 = (1n << 48n) - 1n;
  let s = (BigInt(种子) ^ 乘) & 模;
  return () => {
    s = (s * 乘 + 0xbn) & 模;
    return Number(s >> 24n) / 16777216;
  };
};

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
export const 传送粒子们: ParticleSpawn[] = 瞬移粒子(事.点龙蛋, 参.蛋位们.起, 参.蛋位们.一, 5);

/** 出口传送门：传送门方块的格（原点格四周 5×5 去掉四角和中间柱子，EndPodiumFeature 的 closerThan 2.5） */
export const 门格们: readonly (readonly [number, number])[] = (() => {
  const r: [number, number][] = [];
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) if (i * i + j * j < 6.25 && (i || j)) r.push([i, j]);
  return r;
})();

// ---------- 机位、开头的浪 ----------
/** 透视机位：从段首一路推到段尾（缓起缓停） */
export const 机位 = (f: number) => {
  const k = clamp01(f / (帧数 - 1));
  const t = k * k * (3 - 2 * k);
  return { 种: '透视' as const, 眼: 插3(参.机位.眼起, 参.机位.眼止, t), 看: 插3(参.机位.看起, 参.机位.看止, t), 视角: 参.机位.视角 };
};
/** 第 4 句末盖满画面的那道浪（场/2-海上/浪.tsx 的 进）接着往上退：段首 1（盖满），照第 4 句涌上来的速度（浪起 到第 5 句起那一段走完 0 → 1）退到 2，露出末地 */
const 浪一程帧 = 窗.起帧 - 正片事件.浪起.帧;
export const 浪进 = (f: number) => Math.min(2, 1 + f / 浪一程帧);
