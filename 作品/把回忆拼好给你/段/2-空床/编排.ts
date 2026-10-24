// 2-空床 每一帧她在哪、什么姿势，窗光哪一档、调子、天色，镜头挪到哪。按段内帧算，时刻取 分镜.ts 的正片事件，分寸取 场/2-卧室/参数.ts。纯模块（测试也引）。
// 她：38.46 弯腰抚平你那张床的被子（每拍抹一下），39.31 前转身、退半步坐在床沿，之后一动不动（不眨眼、不呼吸、尾巴不摆），41.01 两帧里猛地抬头转向门口。
// 窗光：每拍跳一档，档和档之间不插值（平涂、一档一档挪）。镜头：下沉起 到段尾往下沉、往右横移，先慢后快，最后一帧还在动。
import type { V3 } from '@engine/model/parts.tsx';
import type { BonePose } from '@engine/model/基岩模型.tsx';
import { 插调子, type 调子 } from '@engine/三渲二/调子.ts';
import type { 魔法酒狐全部表情 } from '@库/角色/魔法酒狐新动作.ts';
import { fps, 段内正片事件帧, 段窗口 } from '../../分镜.ts';
import type { 侧取景 } from '../../地点/侧剖面.tsx';
import { 网格 } from '../../配乐/网格.ts';
import { 色板 } from '../../色板.ts';
import * as 参 from '../../场/2-卧室/参数.ts';
import { 坐床沿骨骼, 抚平骨骼 } from '../../场/2-卧室/姿势.ts';
import { 床面高 } from '../../物品/床尺寸.ts';

export const 键 = '2-空床';
export const 事 = 段内正片事件帧(键);
const 窗 = 段窗口(键);
export const 帧数 = 窗.帧数;
/** 段内帧 → 歌曲帧（颗粒的种子、歌词用它） */
export const 歌曲帧 = (f: number) => 窗.起帧 + f;

const 插 = (a: number, b: number, t: number) => a + (b - a) * t;
const 夹 = (x: number) => Math.min(1, Math.max(0, x));
const 拍帧 = 网格.拍长 * fps;

type 骨表 = Record<string, BonePose>;
/** 两张骨骼表逐字段插值（转角、位移、缩放；一边没有的当 0° / 0 / 1） */
const 插骨 = (a: 骨表, b: 骨表, t: number): 骨表 => {
  const r: 骨表 = {};
  const 三 = (x: number | number[] | undefined, 缺: number) => (x === undefined ? [缺, 缺, 缺] : typeof x === 'number' ? [x, x, x] : x);
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const [p, q] = [a[k] ?? {}, b[k] ?? {}];
    const 插3 = (u: number[], v: number[]) => u.map((x, i) => 插(x, v[i]!, t));
    r[k] = { rot: 插3(三(p.rot, 0), 三(q.rot, 0)), pos: 插3(三(p.pos, 0), 三(q.pos, 0)), scale: 插3(三(p.scale, 1), 三(q.scale, 1)) };
  }
  return r;
};

// ---------- 她 ----------
export type 她态 = {
  loc: V3;
  /** 度，0 朝北（背对镜头）、90 朝西（门）、180 朝镜头、−90 朝东（床） */
  yaw: number;
  表情: 魔法酒狐全部表情;
  看: [number, number];
  骨骼: 骨表;
};

/** 转身起（抚平到这一帧为止）、坐下起：倒推到 坐床沿 那一帧正好坐稳 */
export const 坐下起 = 事.坐床沿 - 参.坐下帧;
export const 转身起 = 坐下起 - 参.转身帧;

/** 抚平：每拍抹一下，七成拍长抹过去（缓进缓出）、三成拍长抬手回到床里侧 */
export const 抹 = (f: number) => {
  if (f < 事.抚平被子) return 0;
  const p = (((f - 事.抚平被子) / 拍帧) % 1 + 1) % 1;
  if (p < 0.7) {
    const t = p / 0.7;
    return t * t * (3 - 2 * t);
  }
  return 1 - (p - 0.7) / 0.3;
};

/** 抚平那几帧的骨骼：手的远近、弯腰深浅都跟着 抹 走；手顺着她的朝向伸出去，往前多远按手要到的 x 折回来 */
export const 抚平姿 = (f: number) => {
  const m = 抹(f);
  const { 远x, 近x, 远弯, 近弯, 头抬 } = 参.抚平手;
  const 朝东 = Math.cos(((参.抚平朝向 + 90) * Math.PI) / 180);
  const 手前 = (插(远x, 近x, m) - 参.抚平站位[0]) / 朝东;
  return 抚平骨骼(手前, 床面高, 插(远弯[0], 近弯[0], m), 插(远弯[1], 近弯[1], m), 头抬);
};

/** 坐着时的朝向写成从抚平的朝向往镜头那边转过去的连续角度：抚平朝向 → −180（朝镜头）→ 坐朝向 − 360 */
const 坐yaw = 参.坐朝向 - 360;

export const 她态 = (f: number): 她态 => {
  const 站: V3 = [...参.抚平站位];
  const 坐: V3 = [...参.床沿坐位];
  if (f < 转身起) return { loc: 站, yaw: 参.抚平朝向, 表情: '无', 看: [参.抚平手.头抬, 0], 骨骼: 抚平姿(f) };
  if (f < 坐下起) {
    // 直起身、从朝镜头那边转过去（看得见一眼脸）
    const t = (f - 转身起 + 1) / 参.转身帧;
    return { loc: 站, yaw: 插(参.抚平朝向, 坐yaw, t), 表情: '无', 看: [-10, 0], 骨骼: {} };
  }
  if (f < 事.坐床沿) {
    // 退半步、坐下：位置和骨骼一起从站着插到坐床沿
    const t = (f - 坐下起 + 1) / (参.坐下帧 + 1);
    const loc: V3 = [插(站[0], 坐[0], t), 插(站[1], 坐[1], t), 插(站[2], 坐[2], t)];
    return { loc, yaw: 坐yaw, 表情: '无', 看: [插(-10, 参.守夜看[0], t), 插(0, 参.守夜看[1], t)], 骨骼: 插骨({}, 坐床沿骨骼, t) };
  }
  const 转 = 夹((f - 事.天亮转头 + 1) / 参.转头帧);
  const 看: [number, number] = [插(参.守夜看[0], 参.看门口[0], 转), 插(参.守夜看[1], 参.看门口[1], 转)];
  return { loc: 坐, yaw: 坐yaw, 表情: f >= 事.天亮转头 ? '惊讶' : '无', 看, 骨骼: 坐床沿骨骼 };
};

// ---------- 窗光、调子 ----------
/** 这一帧窗光在第几档（参数.ts 的 窗光档们）：坐床沿 之前也是第一档 */
export const 光档 = (f: number) => [事.窗光二, 事.窗光三, 事.月落, 事.天亮转头].filter((e) => f >= e).length;

export const 光态 = (f: number) => {
  const i = 光档(f);
  const t: 调子 = 插调子(色板.夜, 色板.日落, 参.晓们[i]!);
  return { 光: 参.窗光档们[i]!, 调子: t, 天: 参.天们[i]! };
};

// ---------- 镜头 ----------
/** 下沉进度 0～1：下沉起 那一帧开始动，段尾最后一帧正好走完（二次方加速，最后一帧还在最快的时候） */
export const 下沉进度 = (f: number) => {
  const n = 帧数 - 事.下沉起;
  const t = 夹((f - 事.下沉起 + 1) / n);
  return t * t;
};

/** 取景中心挪到成片的偶数像素上（像素网格不闪） */
const 吸 = (格: number, 每格: number) => (Math.round((格 * 每格) / 2) * 2) / 每格;

export const 镜 = (f: number): 侧取景 => {
  const s = 下沉进度(f);
  const { 中心, 每格 } = 参.卧室取景;
  return { 中心: [吸(中心[0] + 参.下沉.右 * s, 每格), 吸(中心[1] - 参.下沉.下 * s, 每格)], 每格 };
};

/** 最后一帧镜头的速度（格/帧、成片像素/帧）：交给分屏那一路接（二次方的导数 2t/n，t = 1） */
export const 末帧速度 = () => {
  const n = 帧数 - 事.下沉起;
  const 每帧 = 2 / n;
  return { 下: 参.下沉.下 * 每帧, 右: 参.下沉.右 * 每帧, 每格: 参.卧室取景.每格 };
};
