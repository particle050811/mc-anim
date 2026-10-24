// 新世界这一场每一帧的样子：镜头在哪（钻进图标时往前冲、落定后往粉色推）、你（史蒂夫）站哪、朝哪、走了几步。纯计算（不 import react、three），测试直接引。
// 钻入、推镜的进度由段算好传进来（钻入的帧数在 场/2-启动器：场只接上一场的末态，这一场不引它）；你的动作按歌曲帧对正片事件。
import type { V3 } from '@engine/model/parts.tsx';
import { fps, 正片事件 } from '../../分镜.ts';
import { 地面高 } from './地形.ts';
import { 你, 推镜缓起, 机位们, 走速, type 机位帧 } from './参数.ts';

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const 平滑 = (q: number) => q * q * (3 - 2 * q);
const 插 = (a: number, b: number, k: number) => a + (b - a) * k;
const 插机位 = (a: 机位帧, b: 机位帧, k: number): 机位帧 => ({
  眼: a.眼.map((v, i) => 插(v, b.眼[i]!, k)) as unknown as V3,
  看: a.看.map((v, i) => 插(v, b.看[i]!, k)) as unknown as V3,
  视角: 插(a.视角, b.视角, k),
});

/** 推镜进度 u（0～1，落定到段尾线性）→ 推了多少：前 推镜缓起 这一截不动，之后缓起缓停 */
export const 推镜曲线 = (u: number) => 平滑(clamp01((u - 推镜缓起) / (1 - 推镜缓起)));

/**
 * 镜头：钻 = 钻进图标的进度（0～1，线性），推 = 落定以后的推镜进度（0～1，线性）。
 * 钻的时候从 钻起 冲到 落定，越来越慢（缓出，接住图标放大越来越快的那股劲）；推 > 0 以后从 落定 往 推终 推
 */
export const 机位在 = (钻: number, 推: number): 机位帧 => {
  if (推 > 0) return 插机位(机位们.落定, 机位们.推终, 推镜曲线(推));
  const p = clamp01(钻);
  return 插机位(机位们.钻起, 机位们.落定, 1 - (1 - p) ** 2);
};

export type 你的样子 = {
  脚: V3;
  /** 身子朝向（度，同 stevePose 的 yaw） */
  朝向: number;
  /** 起步后走了几秒（给 vanillaWalk 算摆臂迈腿）；还没起步 = null */
  走秒: number | null;
  /** 游戏时间（秒），两臂的轻晃 */
  秒: number;
};

/** 起步后走出去多远（格）：原版从站着起步，每刻速度往目标速度收 40%（同 库/角色/史蒂夫.tsx vanillaWalk 的 fromRest），位置是它的累加 */
export const 走出 = (秒: number) => {
  if (秒 <= 0) return 0;
  const 刻 = 秒 * 20;
  return (走速 / 20) * (刻 - (0.6 * (1 - 0.6 ** 刻)) / 0.4);
};

/** 第 歌帧 帧你的样子：站在出生点朝着樱花林，起步往樱花林走。原来起步前有一拍转头张望，手机上你只有十几个像素高、背对镜头，看不出来（核查 10-24），删了 */
export const 你在 = (歌帧: number): 你的样子 => {
  const 走秒 = 歌帧 >= 正片事件.第1句起步.帧 ? (歌帧 - 正片事件.第1句起步.帧) / fps : null;
  const d = 走出(走秒 ?? 0);
  const a = (你.朝向 * Math.PI) / 180;
  // yaw 正 = 往左（朝 −x），0 朝北（+y）
  const x = 你.脚[0] - Math.sin(a) * d, y = 你.脚[1] + Math.cos(a) * d;
  return { 脚: [x, y, 地面高(Math.floor(x), Math.floor(y))], 朝向: 你.朝向, 走秒, 秒: 歌帧 / fps };
};
