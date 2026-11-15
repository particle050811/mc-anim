// 史蒂夫的肘和膝：关节在哪、弯了以后脚底在哪、髋该多高。纯计算；画在 角色/史蒂夫装备.tsx（弯折的几何在 角色/弯折.ts）。
// 用户 11-10 定：史蒂夫要改绑骨骼、加关节，不再完全照原版。所以这套不进 库/（库/角色/史蒂夫.tsx 是原版玩家模型，别的作品在用）。
// 角度用 StevePose（库/角色/骨架.tsx 的 FigurePose）里已有的四个字段，单位度，正负照那边：
//   elbowR / elbowL：前臂相对上臂往前折（正）；kneeR / kneeL：小腿相对大腿往后折（正）。都是 0 时和原版一模一样。
// 原版那套髋高（库里的 hipHeight）不认膝；这里按两节腿算，接在 steveRootMatrix 外面补上。
import * as THREE from 'three';
import { rad } from '@engine/core/数学.ts';
import { type StevePose, STEVE, steveRootMatrix } from '@库/角色/史蒂夫.tsx';

/** 关节在部件里的位置（模型像素，y 朝下、z 朝后）：切 = 关节的 y，铰z = 铰链的 z。手臂方盒 y −2～10、腿 0～12，都从正中折。
 *  肘的铰链从中线往折的内侧（前）偏 1 像素，内侧少吃进去一点；膝的铰链在中线上：往后偏的话小腿折起来反而把人垫高，蹲不下去。Agent 取的 */
export const joints = {
  elbow: { cut: 4, hingeZ: -1 },
  knee: { cut: 6, hingeZ: 0 },
} as const;

/** 本片史蒂夫的姿势：库里的 StevePose 再加一个腕（剑绕手的左右轴转，度，正 = 剑尖往前臂的延长线那边压；角色/剑招.ts 用，画在 史蒂夫装备.tsx） */
export type JointPose = StevePose & { wristR?: number };

const legLength = 12;
/** 脚掌前后各半个宽（像素） */
const halfFoot = 2;
/** 没有踝，小腿斜着时脚尖（或脚跟）比脚底中心低；按它着地人会被垫高、蹲不深，按脚底中心着地脚尖又全吃进地里：各让一半 */
const toeContact = 0.5;

/** 膝弯 膝度 时脚底中心在大腿坐标里的位置（像素）：沿 = 顺着大腿往下，后 = 垂直大腿往后 */
export const footOffset = (kneeDeg: number) => {
  const { cut, hingeZ } = joints.knee;
  const [c, s] = [Math.cos(rad(kneeDeg)), Math.sin(rad(kneeDeg))];
  return { alongLeg: cut + (legLength - cut) * c + hingeZ * s, 后: hingeZ + (legLength - cut) * s - hingeZ * c };
};

/** 大腿和竖直线的夹角是 腿度（往前为正，已经算上身子前倾）、膝弯 膝度 时，脚底最低处在髋下面多少像素、脚底中心在髋前面多少像素。
 *  最低处：脚底中心再加一半脚尖多出来的（见 脚尖着地）；膝是 0 时不算这一项（和库里只看脚底中心一样），20 度以内渐入。不超过腿长 */
export const legExtend = (legDeg: number, kneeDeg: number) => {
  const { alongLeg, 后: back } = footOffset(kneeDeg);
  const [c, s] = [Math.cos(rad(legDeg)), Math.sin(rad(legDeg))];
  const kneeRatio = Math.min(1, Math.abs(kneeDeg) / 20);
  const toeLen = halfFoot * toeContact * Math.abs(Math.sin(rad(legDeg - kneeDeg))) * kneeRatio * kneeRatio * (3 - 2 * kneeRatio);
  return { 下: Math.min(legLength, alongLeg * c + back * s + toeLen), 前: alongLeg * s - back * c };
};

/** 膝弯 膝度 时，大腿往前抬多少度（相对竖直线）脚底中心正好在髋的正下方：下蹲、落地缓冲用 */
export const squatLegAngle = (kneeDeg: number) => {
  const { alongLeg, 后: back } = footOffset(kneeDeg);
  return (Math.atan2(back, alongLeg) * 180) / Math.PI;
};

/** 髋离地高度（像素）：同库里的 hipHeight（哪条腿伸得低以它着地，ground 调贴地的程度），只是腿按两节算 */
export const hipHeight = (pose: StevePose) => {
  const legBottom = (legPitch: number, knee: number | undefined) => legExtend(legPitch + pose.pitch, knee ?? 0).下;
  const landedLeg = Math.max(3, legBottom(pose.legR, pose.kneeR), legBottom(pose.legL, pose.kneeL));
  return legLength + (pose.ground ?? 1) * (landedLeg - legLength);
};

/** 同 steveRootMatrix（落脚点、转身、缩放、以髋为轴前倾），髋高换成认膝的 */
export const jointRootMatrix = (pose: StevePose) => {
  const perPixel = (pose.scale ?? STEVE.scale) / 16;
  return new THREE.Matrix4().makeTranslation(0, 0, (hipHeight(pose) - legLength) * pose.squash * perPixel).multiply(steveRootMatrix({ ...pose, ground: 0 }));
};

/** 挂在肢体上的一块盔甲网格（顶点表，每顶点 8 个数）怎么跟关节：'弯' 在关节处裁开跟着折；'上' / '下' 整块跟上半节、下半节。
 *  斜着的块（肩甲、腿侧的甲片）和只探过关节不到 3 像素的（上臂的臂环）不折，看中心在关节哪边 */
export const meshSection = (vertices: readonly number[], cut: number): '弯' | '上' | '下' => {
  let [minY, maxHeight, aligned] = [Infinity, -Infinity, true];
  for (let i = 0; i < vertices.length; i += 8) {
    minY = Math.min(minY, vertices[i + 1]!);
    maxHeight = Math.max(maxHeight, vertices[i + 1]!);
    if (Math.max(Math.abs(vertices[i + 5]!), Math.abs(vertices[i + 6]!), Math.abs(vertices[i + 7]!)) < 0.999) aligned = false;
  }
  if (aligned && cut - minY >= 3 && maxHeight - cut >= 3) return '弯';
  return (minY + maxHeight) / 2 <= cut ? '上' : '下';
};
