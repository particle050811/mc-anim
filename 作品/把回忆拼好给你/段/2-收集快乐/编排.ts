// 2-收集快乐 每一帧谁在哪、什么姿势：镜头（段首下摇；头顶的云在 场/2-门口/第8句云.ts）、调子、照片墙、她和往框里放的那张照片、你、苦力怕、头顶的气泡。按段内帧算，时刻取 分镜.ts 的正片事件，
// 分寸取 场/2-门口/第8句参数.ts。纯模块（不 import react、three），测试直接引。
// 苦力怕按原版走路摆腿（库/角色/史蒂夫.tsx 的 vanillaWalk）：走进来的速度由冒头、哈气两个时刻倒推，逃的速度是原版躲猫的两倍（演绎）；
// 转身、转头都在一两帧里转完（原版一刻转 90°）。
import { clamp01 } from '@engine/anim/anim.ts';
import type { V3 } from '@engine/model/parts.tsx';
import type { BonePose } from '@engine/model/基岩模型.tsx';
import { 插调子, type 调子 } from '@engine/三渲二/调子.ts';
import { vanillaWalk } from '@库/角色/史蒂夫.tsx';
import type { 魔法酒狐全部表情, 魔法酒狐新姿势 } from '@库/角色/魔法酒狐新动作.ts';
import { CREEPER, type CreeperPose } from '@库/生物/苦力怕.tsx';
import { fps, 段内正片事件帧, 段窗口 } from '../../分镜.ts';
import { 门口 } from '../../地点/门口小木屋.tsx';
import type { 门口取景 } from '../../场/2-门口/参数.ts';
import * as 参 from '../../场/2-门口/第8句参数.ts';
import * as 八 from '../../场/2-门口/第8句.ts';
import { 色板 } from '../../色板.ts';

const 键 = '2-收集快乐';
export const 事 = 段内正片事件帧(键);
const 起帧 = 段窗口(键).起帧;
/** 段内帧 → 歌曲帧（颗粒的种子用它，和核对段的静帧同一颗粒） */
export const 歌曲帧 = (f: number) => 起帧 + f;
/** 段内帧 → 歌上的秒（她的呼吸、尾巴按它走） */
export const 歌秒 = (f: number) => (起帧 + f) / fps;
const 站 = 门口.站排y;

const 插 = (a: number, b: number, t: number) => a + (b - a) * t;
const 插3 = (a: readonly number[], b: readonly number[], t: number): V3 => [插(a[0]!, b[0]!, t), 插(a[1]!, b[1]!, t), 插(a[2]!, b[2]!, t)];
type 骨表 = Record<string, BonePose>;
/** 两张骨骼表按转角插值（一边没有的骨骼当 0°） */
const 插骨 = (a: 骨表, b: 骨表, t: number): 骨表 => {
  const r: 骨表 = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) r[k] = { rot: 插3(a[k]?.rot ?? [0, 0, 0], b[k]?.rot ?? [0, 0, 0], t) };
  return r;
};
const 看插 = (a: [number, number], b: [number, number], t: number): [number, number] => [插(a[0], b[0], clamp01(t)), 插(a[1], b[1], clamp01(t))];

// ---------- 镜头、调子 ----------
/** 落定的取景（第8句镜头）：屋后远景的相机按它放，下摇时往上仰（门口画布 的 远景.落定） */
export const 落定 = 八.第8句镜头.取景;
/** 下摇走了多少（0 段首 → 1 落定），两头缓 */
export const 下摇进度 = (f: number) => {
  const t = clamp01(f / 事.第8句落镜);
  return t * t * (3 - 2 * t);
};
/** 这一帧正交那一层的取景：落定的取景往上 下摇高 格，摇下来；中心吸到偶数成片像素（预览级里贴图像素的边也落在整像素上） */
export const 取景在 = (f: number): 门口取景 => {
  const z = 落定.中心[1] + 参.下摇高 * (1 - 下摇进度(f));
  return { 中心: [落定.中心[0], (2 * Math.round((z * 落定.每格) / 2)) / 落定.每格], 每格: 落定.每格 };
};
/** 屋后远景的眼睛这一帧高几格（门口画布 的 远景.升）：跟着下摇降回 0 */
export const 远景升在 = (f: number) => 参.远景升 * (1 - 下摇进度(f));
/** 调子：段首接第 7 句末的雨后暖阳，下摇落定时到 第8句调子（雨后暖阳和夏日白天各一半） */
export const 调子在 = (f: number): 调子 => 插调子(色板.雨后暖阳, 色板.夏日白天, 0.5 * 下摇进度(f));

// ---------- 照片墙 ----------
/** 夏天那四格里放了几张：段首前三张，挂照片 那一帧起四张（第 4 格先是空框） */
export const 墙上几张 = (f: number) => (f < 事.挂照片 ? 3 : 4);

// ---------- 她 ----------
export type 她态 = {
  loc: V3;
  yaw: number;
  姿势: 魔法酒狐新姿势;
  表情: 魔法酒狐全部表情;
  /** 头 [俯仰, 左右]；给了 骨骼.Head 就不用它 */
  看?: [number, number];
  骨骼: 骨表;
  眨眼: number | 'auto';
  /** 不给 = 不呼吸、尾巴不摆（屏住气哈） */
  秒?: number;
};

const 伸起 = 事.挂照片 - 参.挂伸帧;
/** 往框里推走了多少（0 手里 → 1 进框）：伸起 那一帧起，挂照片 前一帧到 1（正好落在框里那张的位置、大小），两头缓（进框时慢下来） */
const 推进度 = (f: number) => {
  const t = clamp01((f - 伸起) / (参.挂伸帧 - 1));
  return t * t * (3 - 2 * t);
};

export const 她态 = (f: number): 她态 => {
  const loc: V3 = [八.哈气站位.她, 站, 0];
  const 秒 = 歌秒(f);
  if (f < 事.她看见苦力怕) {
    let 手: 骨表 = 参.拿照片手;
    let 看 = 参.看手里;
    if (f >= 事.挂照片) {
      // 挂上了：手收回来，看一眼框再转过来看你
      手 = 插骨(参.挂照片手, 参.空手, (f - 事.挂照片) / 参.收手帧);
      看 = 看插(参.看框, 参.看你, (f - 事.挂照片 - 参.收手帧 + 1) / 参.转头帧);
    } else if (f >= 伸起) {
      手 = 插骨(参.拿照片手, 参.挂照片手, 推进度(f));
      看 = 看插(参.看手里, 参.看框, (f - 伸起 + 1) / 参.转头帧);
    }
    return { loc, yaw: 180, 姿势: '站', 表情: '微笑', 看, 骨骼: 手, 眨眼: 'auto', 秒 };
  }
  if (f < 事.哈气) {
    // 看见苦力怕：头往画面左边转过去，吓一跳
    return { loc, yaw: 180, 姿势: '站', 表情: '惊讶', 看: 看插(参.看你, 参.看苦力怕, (f - 事.她看见苦力怕 + 1) / 2), 骨骼: 参.空手, 眨眼: 0, 秒 };
  }
  if (f < 事.苦力怕逃) {
    return { loc, yaw: 八.哈气朝向.她, 姿势: '哈气', 表情: '哈气', 看: 八.哈气看, 骨骼: { ...八.哈气爪, ...八.哈气尾 }, 眨眼: 0 };
  }
  // 回头冲你得意地一歪头：转身朝镜头，头转向你、歪过去（三帧歪到位），闭眼笑
  const 歪 = 参.得意歪 * clamp01((f - 事.苦力怕逃 + 1) / 3);
  const [俯仰, 左右] = 参.得意看;
  return { loc, yaw: 180, 姿势: '站', 表情: '微笑', 骨骼: { Head: { rot: [-俯仰, -左右, 歪] } }, 眨眼: 1, 秒 };
};

/** 不在框里的那张光柱破云（照片墙.tsx 的 地图画片）：挂照片 之前在她手里，伸起 起从手里的位置、大小挪进空框，前一帧已经和框里那张一样，
 *  挂照片 那一帧（咔哒一声）换成框里那张（这里给 null），画面不跳。角的 x、z 吸到整成片像素（贴图像素的边落在整像素上） */
export const 照片态 = (f: number): { 角: V3; 边: number } | null => {
  if (f >= 事.挂照片) return null;
  const t = 推进度(f);
  const 吸 = (v: number) => Math.round(v * 落定.每格) / 落定.每格;
  const 角 = 插3(参.照片手持角, 参.照片框角, t);
  return { 角: [吸(角[0]), 角[1], 吸(角[2])], 边: 插(参.照片手持边, 1, t) };
};

// ---------- 苦力怕 ----------
const 走速 = 参.苦力怕走速;
const 逃速 = CREEPER.speed.flee * 参.苦力怕逃倍率;
const 开逃 = 事.苦力怕掉头 + 参.苦力怕掉头帧;

export const 苦力怕态 = (f: number): CreeperPose => {
  const 停 = 八.哈气站位.苦力怕;
  if (f < 事.哈气) {
    const x = 停 - (走速 * (事.哈气 - f)) / fps;
    // 一直在走（不是从站着起步）；腿的相位按到哈气那一帧还差几秒倒推
    const 腿 = vanillaWalk(走速, 10 - (事.哈气 - f) / fps);
    return { loc: [x, 站, 0], yaw: 八.哈气朝向.苦力怕, limbSwing: 腿.limbSwing, stride: 腿.stride, headYaw: 0 };
  }
  if (f < 事.苦力怕掉头) return { loc: [停, 站, 0], yaw: 八.哈气朝向.苦力怕, ...八.苦力怕停步 };
  if (f < 开逃) {
    // 往右（顺时针）转过来：先正脸朝镜头，再朝西
    const k = f - 事.苦力怕掉头 + 1;
    return { loc: [停, 站, 0], yaw: 八.哈气朝向.苦力怕 - (180 * k) / 参.苦力怕掉头帧, limbSwing: 0, stride: 0, headYaw: 0 };
  }
  const 秒 = (f - 开逃 + 1) / fps;
  const x = 停 - 逃速 * 秒;
  const 腿 = vanillaWalk(逃速, 秒, true);
  return { loc: [x, 站, 0], yaw: 八.哈气朝向.苦力怕 - 180, limbSwing: 腿.limbSwing, stride: 腿.stride, headYaw: 0 };
};

// ---------- 你 ----------
/** 你一直站在照片墙右边、身子朝镜头，头转过去看着她（定稿：你在她身后看她或看苦力怕） */
export const 你态 = (_f: number) => ({ x: 八.哈气站位.你, yaw: 八.哈气朝向.你, headYaw: 八.你的头, 倍数: 八.史蒂夫倍数 });

// ---------- 气泡 ----------
export const 气泡态 = (f: number): { 字: string; x: number } | null => {
  if (f < 事.哈气) return null;
  if (f < 事.苦力怕逃) return { 字: 八.哈气气泡字, x: 八.哈气站位.她 };
  return { 字: 参.得意气泡字, x: 八.哈气站位.她 };
};
