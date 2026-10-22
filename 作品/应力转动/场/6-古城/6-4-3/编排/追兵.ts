// 6-4-3 黄叛（拉弓、放箭、愣住）和刘心忠（高台上看）的姿势。
import type { V3 } from '@engine/model/parts.tsx';
import { type FigurePose, standPose } from '@库/角色/骨架.tsx';
import { drawBowPose } from '../../../../角色/追兵.tsx';
import { bowTextureFor, type BowTexture } from '@库/物品/弓.tsx';
import { yawTo } from '../../../../地点/古城4x/6-4-1/古城戏.ts';
import * as geom from '../几何.ts';
import { ss, add, sub, storySecAt } from './公用.ts';
// ---------- 黄叛 ----------
// 0～1.2 垂手站着；1.2～1.6 拉弓（原版 BOW_AND_ARROW，左手持弓）；放箭时大喝「贼子，拿命来！」，放箭后右手甩开；
// 箭被挑飞时他在 370 米外，碎裂声 1.1 秒才到，靠看见招架闪光愣住，看向李樱，弓慢慢放下
const ceilingEntry: V3 = geom.方块中心(geom.击穿方块[0]);
const lookAtCeiling = (() => {
  const toCeiling = sub(ceilingEntry, add(geom.黄叛脚底, [0, 0, 1.62]));
  return { yaw: yawTo(toCeiling[0], toCeiling[1]) - geom.黄叛朝向, pitch: (Math.atan2(toCeiling[2], Math.hypot(toCeiling[0], toCeiling[1])) * 180) / Math.PI };
})();
const freezeSec = geom.弹开 + 0.25; // 看见闪光（光一下就到）+ 反应 0.25 秒
// 弓的贴图照原版换：1.2 秒开始拉（pulling），pull 按拉了几秒涨（1 秒拉满），2.6 秒放箭后换回 bow
const drawStartSec = 1.2;
export const huangpan = (globalFrame: number): { pose: FigurePose; bow: BowTexture } => {
  const t = storySecAt(globalFrame);
  const draw = ss((t - drawStartSec) / 0.4);
  let pose = drawBowPose(geom.黄叛脚底, geom.黄叛朝向, 0, geom.黄叛俯仰, draw);
  if (draw <= 0) pose = { ...standPose(geom.黄叛脚底), yaw: geom.黄叛朝向, headPitch: geom.黄叛俯仰, armL: 8, armLRoll: 4, armR: 12, armRRoll: 6, elbowR: 15 };
  // 喊（放箭前后）：头往上一扬。配音按画面时间原速放（1.5 秒），此时正慢放 1/120，所以头扬起来就停在那里
  const shout = ss((t - (geom.放箭 - 0.1)) / 0.08) * (1 - ss((t - (geom.放箭 + 0.15)) / 0.3));
  if (shout > 0) pose = { ...pose, headPitch: pose.headPitch + 7 * shout };
  // 放箭：拉弦手松开、往后一甩
  const rel = ss((t - geom.放箭) / 0.12);
  if (rel > 0) pose = { ...pose, armR: pose.armR - 15 * rel, armRYaw: (pose.armRYaw ?? 0) * (1 - rel) - 25 * rel, elbowR: 25 * rel };
  // 愣住、抬头看：头 0.3 秒转过去，弓 0.8 秒放下一半，拉弦手垂下
  const look = ss((t - freezeSec) / 0.3);
  const lower = ss((t - freezeSec - 0.2) / 0.8);
  if (look > 0)
    pose = {
      ...pose,
      headYaw: pose.headYaw + (lookAtCeiling.yaw - pose.headYaw) * look,
      headPitch: pose.headPitch + (lookAtCeiling.pitch + 5 - pose.headPitch) * look,
      armL: pose.armL + (45 - pose.armL) * lower,
      armLYaw: (pose.armLYaw ?? 0) * (1 - lower),
      armR: pose.armR + (10 - pose.armR) * lower,
      armRYaw: (pose.armRYaw ?? 0) * (1 - lower),
      elbowR: (pose.elbowR ?? 0) * (1 - lower),
    };
  return { pose, bow: bowTextureFor(t >= drawStartSec && t < geom.放箭, t - drawStartSec) };
};

// ---------- 刘心忠 ----------
// 站在门西边的高台上（几何.ts 的 `刘心忠脚底`），拄杖看着李樱不动；箭被挑飞后头往前一探、往上看一眼洞顶
const liuLookAtLiYing = (() => {
  const toLiYing = sub(add(geom.FOOT, [0, 0, 1.2]), add(geom.刘心忠脚底, [0, 0, 1.7]));
  return { yaw: yawTo(toLiYing[0], toLiYing[1]), pitch: (Math.atan2(toLiYing[2], Math.hypot(toLiYing[0], toLiYing[1])) * 180) / Math.PI };
})();
export const liuxinzhong = (globalFrame: number): FigurePose => {
  const t = storySecAt(globalFrame);
  const leanIn = ss((t - geom.弹开 - 0.3) / 0.4);
  return { ...standPose(geom.刘心忠脚底), yaw: liuLookAtLiYing.yaw, headPitch: liuLookAtLiYing.pitch + 12 * leanIn, pitch: 4 * leanIn, armR: 18, armRRoll: 4, armL: 6, armLRoll: 4, elbowL: 10 };
};
