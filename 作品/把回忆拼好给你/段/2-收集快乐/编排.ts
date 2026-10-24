// 2-收集快乐 每一帧谁在哪、什么姿势：她、你、苦力怕、手里的照片、头顶的气泡。按段内帧算，时刻取 分镜.ts 的正片事件，分寸取 场/2-门口/第8句参数.ts。
// 苦力怕按原版走路摆腿（库/角色/史蒂夫.tsx 的 vanillaWalk）：走进来的速度由三稿的两个时刻倒推（和原版追人差 2%），逃的速度是原版躲猫的两倍（演绎）；
// 转身、转头都在一两帧里转完（原版一刻转 90°）。
import { clamp01 } from '@engine/anim/anim.ts';
import type { V3 } from '@engine/model/parts.tsx';
import type { BonePose } from '@engine/model/基岩模型.tsx';
import { vanillaWalk } from '@库/角色/史蒂夫.tsx';
import type { 魔法酒狐全部表情, 魔法酒狐新姿势 } from '@库/角色/魔法酒狐新动作.ts';
import { CREEPER, type CreeperPose } from '@库/生物/苦力怕.tsx';
import { fps, 段内正片事件帧, 段窗口 } from '../../分镜.ts';
import { 门口 } from '../../地点/门口小木屋.tsx';
import * as 参 from '../../场/2-门口/第8句参数.ts';
import * as 八 from '../../场/2-门口/第8句.ts';
import { 照片态, 放完 } from './照片编排.ts';

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

// ---------- 照片：照片编排.ts（纯模块，测试也引） ----------
export { 照片态, 第8句照片 } from './照片编排.ts';

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

const 看插 = (a: [number, number], b: [number, number], t: number): [number, number] => [插(a[0], b[0], t), 插(a[1], b[1], t)];
/** 四张放完以后，右手从箱子口放下来、头从箱子转到你用几帧 */
const 收照片后放手帧 = 3;
/** 蹲下的那几帧、起跳的那一帧 */
const 蹲起 = 事.冲出 - 参.冲出蓄力帧;
const 跳起 = 事.冲出;

export const 她态 = (f: number): 她态 => {
  const 秒 = 歌秒(f);
  if (f < 蹲起) {
    const 照 = 照片态(f);
    let 手: 骨表 = {};
    let 看: [number, number] = 参.看照片;
    if (照?.阶段 === '举') 手 = 参.举照片手;
    else if (照?.阶段 === '升') 手 = 插骨(参.放照片手, 参.举照片手, 照.t);
    else if (照?.阶段 === '落') {
      手 = 插骨(参.举照片手, 参.放照片手, 照.t);
      看 = 看插(参.看照片, 参.看箱子, 照.t);
    } else if (f >= 放完) {
      // 四张放完：手从箱子口放下来，头转过来看你
      const t = clamp01((f - 放完 + 1) / 收照片后放手帧);
      手 = 插骨(参.放照片手, {}, t);
      看 = 看插(参.看箱子, 参.看你, t);
    }
    // 苦力怕摸到背后那一拍，转头看见它
    if (f >= 事.苦力怕摸到背后) 看 = 参.看苦力怕;
    const 吓到 = f >= 事.苦力怕摸到背后;
    return {
      loc: [参.收照片站位, 站, 0],
      yaw: 180,
      姿势: '站',
      表情: 吓到 ? '惊讶' : '微笑',
      看,
      骨骼: 手,
      眨眼: 吓到 ? 0 : 'auto',
      秒,
    };
  }
  if (f < 跳起) {
    // 蹲下：转身朝苦力怕，库里的蹲（大腿抬平、上身前倾），盯着它；尾巴先竖起来（蹲着的尾巴往后横着，会扫到你的腿）
    return { loc: [参.收照片站位, 站, 0], yaw: 八.哈气朝向.她, 姿势: '蹲', 表情: '惊讶', 看: [0, 0], 骨骼: 参.蹲尾, 眨眼: 0 };
  }
  if (f < 事.哈气) {
    // 扑过去：箱子前面一道抛物线（水平匀速），爪子已经伸出去，哈气那一拍落在门洞正中
    const t = (f - 跳起 + 1) / (事.哈气 - 跳起 + 1);
    const x = 插(参.收照片站位, 八.哈气站位.她, t);
    const z = 4 * 参.冲出跳高 * t * (1 - t);
    return { loc: [x, 站, z], yaw: 八.哈气朝向.她, 姿势: '哈气', 表情: '哈气', 看: 八.哈气看, 骨骼: { ...八.哈气爪, ...八.哈气尾 }, 眨眼: 0 };
  }
  if (f < 事.苦力怕逃) {
    return { loc: [八.哈气站位.她, 站, 0], yaw: 八.哈气朝向.她, 姿势: '哈气', 表情: '哈气', 看: 八.哈气看, 骨骼: { ...八.哈气爪, ...八.哈气尾 }, 眨眼: 0 };
  }
  // 回头冲你得意地一歪头：转身朝镜头，头转向你、歪过去（三帧歪到位），闭眼笑
  const 歪 = 参.得意歪 * clamp01((f - 事.苦力怕逃 + 1) / 3);
  const [俯仰, 左右] = 参.得意看;
  return {
    loc: [八.哈气站位.她, 站, 0],
    yaw: 180,
    姿势: '站',
    表情: '微笑',
    骨骼: { Head: { rot: [-俯仰, -左右, 歪] } },
    眨眼: 1,
    秒,
  };
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
/** 你一直站在箱子右边、身子朝镜头，头转过去看着她（收照片、哈气、回头歪头都看着她；定稿：你在她身后看她或看苦力怕） */
export const 你态 = (_f: number) => ({ x: 八.哈气站位.你, yaw: 八.哈气朝向.你, headYaw: 八.你的头, 倍数: 八.史蒂夫倍数 });

// ---------- 气泡 ----------
export const 气泡态 = (f: number): { 字: string; x: number } | null => {
  if (f < 事.哈气) return null;
  if (f < 事.苦力怕逃) return { 字: 八.哈气气泡字, x: 八.哈气站位.她 };
  return { 字: 参.得意气泡字, x: 八.哈气站位.她 };
};
