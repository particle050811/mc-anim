// 关键帧动画：播放 工具/游戏取材/导出实体模型.py --动画 从游戏字节码导出的 `AnimationDefinition`（原版 1.19 起新生物用的那套：监守者、嗅探兽、骆驼、青蛙…；
// 数据是 `Keyframe` 里的值，已按 degreeVec/posVec/scaleVec 换算）。规则照 1.20.1 字节码（javap 核对）：
// - `HierarchicalModel.animate` → `AnimationState.updateTime`（毫秒累加）→ `KeyframeAnimations.animate`(模型, 动画, 毫秒, 1.0)；
// - 时刻 = 毫秒/1000，循环的动画对长度取余，不循环的过了最后一帧就停在最后一帧的值上；
// - 每个通道：`Mth.binarySearch` 找第一个时间 ≥ 时刻的关键帧，往前一个是 i（最小 0），j = min(i+1, 末尾)；比例 = (时刻 - t[i]) / (t[j] - t[i]) 夹到 0～1，按 **j 那一帧** 的插值方式算：
//   LINEAR = lerp(v[i], v[j], 比例)；CATMULLROM = `Mth.catmullrom`(比例, v[i-1], v[i], v[j], v[j+1])（下标越界夹到两头）；
// - 算出来的值 **加** 到部件上：position → offset（像素），rotation → rot（弧度），scale → scale；
// - 部件按名字找（`getAnyDescendantWithName`），模型里没有这个名字的通道直接跳过（监守者吼叫、钻出动画里 right_ear / left_ear 两条，模型里那两片叫 right_tendril / left_tendril，游戏里这几条就是不生效）。
import type { EntityPart, PartPose } from '../model/实体模型.tsx';

export type AnimKeyframe = { t: number; v: number[]; interp: 'linear' | 'catmullrom' };
export type AnimChannel = { target: 'position' | 'rotation' | 'scale'; keyframes: AnimKeyframe[] };
export type AnimDef = { length: number; looping: boolean; bones: Record<string, AnimChannel[]> };
// setupAnim 过程中的姿态（ModelPart 的 x/y/z、xRot/yRot/zRot、xScale/yScale/zScale），每帧从 restPose 开始改
export type MutablePose = Record<string, { offset: number[]; rot: number[]; scale: number[] }>;

// ---------- Mth ----------
// Mth.sin / Mth.cos 是查表的（65536 格），原版生物的摆动都用它；差别很小，但照抄
const SIN = new Float32Array(65536);
for (let i = 0; i < 65536; i++) SIN[i] = Math.sin((i * Math.PI * 2) / 65536);
const F_TABLE = Math.fround(10430.378);
export const mthSin = (x: number) => SIN[Math.trunc(Math.fround(Math.fround(x) * F_TABLE)) & 65535];
export const mthCos = (x: number) => SIN[Math.trunc(Math.fround(Math.fround(x) * F_TABLE + 16384)) & 65535];
// Mth.catmullrom(t, p0, p1, p2, p3)
export const catmullrom = (t: number, p0: number, p1: number, p2: number, p3: number) =>
  0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);

// 一个通道在某时刻（秒）的值
export const sampleChannel = (kfs: AnimKeyframe[], sec: number): number[] => {
  // Mth.binarySearch(0, n, i -> sec <= kfs[i].t)：第一个满足的下标，没有就是 n
  let lo = 0;
  let len = kfs.length;
  while (len > 0) {
    const half = Math.floor(len / 2);
    const mid = lo + half;
    if (sec <= kfs[mid].t) len = half;
    else {
      lo = mid + 1;
      len -= half + 1;
    }
  }
  const i = Math.max(0, lo - 1);
  const j = Math.min(kfs.length - 1, i + 1);
  const prevKey = kfs[i];
  const nextKey = kfs[j];
  const k = j !== i ? Math.min(1, Math.max(0, (sec - prevKey.t) / (nextKey.t - prevKey.t))) : 0;
  if (nextKey.interp === 'catmullrom') {
    const p0 = kfs[Math.max(0, i - 1)].v;
    const p3 = kfs[Math.min(kfs.length - 1, j + 1)].v;
    return [0, 1, 2].map((c) => catmullrom(k, p0[c], prevKey.v[c], nextKey.v[c], p3[c]));
  }
  return [0, 1, 2].map((c) => prevKey.v[c] + (nextKey.v[c] - prevKey.v[c]) * k);
};

// KeyframeAnimations.animate：把动画在 秒（这个动画已经播放的时长）时的值加到姿态上
export const applyAnimation = (pose: MutablePose, anim: AnimDef, elapsedSec: number) => {
  const t = anim.looping ? elapsedSec % anim.length : elapsedSec;
  for (const [bone, chs] of Object.entries(anim.bones)) {
    const partPose = pose[bone];
    if (!partPose) continue; // 模型里没有这个部件：游戏里同样跳过
    for (const ch of chs) {
      const delta = sampleChannel(ch.keyframes, t);
      const dst = ch.target === 'position' ? partPose.offset : ch.target === 'rotation' ? partPose.rot : partPose.scale;
      dst[0] += delta[0];
      dst[1] += delta[1];
      dst[2] += delta[2];
    }
  }
};

// ModelPart.resetPose：每个部件回到模型里定义的初始 PartPose（缩放 1）
export const restPose = (root: EntityPart): MutablePose => {
  const out: MutablePose = {};
  const walk = (part: EntityPart) => {
    out[part.name] = { offset: [...part.pose.offset], rot: [...part.pose.rot], scale: [1, 1, 1] };
    part.children.forEach(walk);
  };
  walk(root);
  return out;
};

// 换成 EntityModel 的 pose 参数（没缩放的部件不带 scale）
export const toPartPoses = (pose: MutablePose): Record<string, PartPose> => {
  const out: Record<string, PartPose> = {};
  for (const [k, partPose] of Object.entries(pose)) {
    out[k] = partPose.scale.every((s) => s === 1) ? { offset: partPose.offset, rot: partPose.rot } : { offset: partPose.offset, rot: partPose.rot, scale: partPose.scale };
  }
  return out;
};
