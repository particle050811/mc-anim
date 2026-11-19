// BV1UFH76QETS 草地版：只跟画面左侧舞者。上身取可见关节，脚与转身按原帧的接触、遮挡和朝向校正。
import { onePassSec } from './忘情牛肉面时长.ts';
import { leftDancerTrack } from './草地舞采样.ts';
import { grassArmFrames, type ArmFrame } from './草地手臂逐帧.ts';
import { grassTurn, leftStep, rightStep } from './草地舞步.ts';
import * as THREE from 'three';
import { lerpV as mixDir } from '@engine/core/数学.ts';
import { sample, type Key } from '@engine/anim/anim.ts';
import type { MolangEnv } from '@engine/anim/Molang.ts';
import type { BonePose } from '@engine/model/基岩模型.tsx';

/** 舞台坐标的向量 [左, 上, 前]：左 = 她自己的左手边（正面机位里是画面右边），单位像素（模型坐标，一像素 0.7/16 格）或只表方向 */
type DirVec3 = [左: number, 上: number, 前: number];

export type DancePose = {
  /** 胯（腰以下、腰以上一起）挪多少像素 */
  hip: DirVec3;
  /** 整个人绕竖轴转（度），正 = 转向她的左边（正面机位里脸朝画面右） */
  转: number;
  /** 胯往一边歪（度），正 = 她左边的胯低、上端倒向左 */
  hipTilt: number;
  /** 上身往一边倒（度），正 = 倒向她的左边 */
  bodyTilt: number;
  /** 上身比胯多转的角度（度），方向同 转 */
  bodyTwist: number;
  /** 上身前俯（度） */
  forwardBend: number;
  gazeDip: number;
  /** 头在「跟着上身」之外再加的 [转, 歪]（度）；头自己会往回找镜头，见 回头 */
  头: [转: number, 歪: number];
  /** 上臂、前臂朝哪（上身坐标，只表方向）：[0,-1,0] 垂着，[1,0,0] 往她左边平举，[0,1,0] 举过头 */
  leftUpperArm: DirVec3;
  leftForeArm: DirVec3;
  rightUpperArm: DirVec3;
  rightForeArm: DirVec3;
  /** 脚底中心踩在哪（舞台坐标，像素；上 = 离地） */
  leftFoot: DirVec3;
  rightFoot: DirVec3;
  /** 脚 [外八, 绷脚尖]（度）：外八 = 脚尖朝各自外侧转 */
  leftFootDir: [footSplay: number, toePitch: number];
  rightFootDir: [footSplay: number, toePitch: number];
};

// ---------- 关键姿势 ----------

const neutralPose: DancePose = {
  hip: [0, 0, 0],
  转: 0,
  hipTilt: 0,
  bodyTilt: 0,
  bodyTwist: 0,
  forwardBend: 0,
  gazeDip: 0,
  头: [0, 0],
  leftUpperArm: [0.22, -1, 0.05],
  leftForeArm: [0.2, -1, 0.3],
  rightUpperArm: [-0.22, -1, 0.05],
  rightForeArm: [-0.2, -1, 0.3],
  leftFoot: [2.2, 0, 0],
  rightFoot: [-2.2, 0, 0],
  leftFootDir: [8, 0],
  rightFootDir: [8, 0],
};
const mirrorX = ([left, up, forward]: DirVec3): DirVec3 => [-left, up, forward];
/** 左右对调 */
export const mirrorPose = (p: DancePose): DancePose => ({
  hip: mirrorX(p.hip),
  转: -p.转,
  hipTilt: -p.hipTilt,
  bodyTilt: -p.bodyTilt,
  bodyTwist: -p.bodyTwist,
  forwardBend: p.forwardBend,
  gazeDip: p.gazeDip,
  头: [-p.头[0], -p.头[1]],
  leftUpperArm: mirrorX(p.rightUpperArm),
  leftForeArm: mirrorX(p.rightForeArm),
  rightUpperArm: mirrorX(p.leftUpperArm),
  rightForeArm: mirrorX(p.leftForeArm),
  leftFoot: mirrorX(p.rightFoot),
  rightFoot: mirrorX(p.leftFoot),
  leftFootDir: p.rightFootDir,
  rightFootDir: p.leftFootDir,
});

export { onePassSec };
const degrees = Math.PI / 180;
const lookBackMix = 0.65;
const smoothMix = (sec: number, start: number, end: number) => {
  const progress = Math.max(0, Math.min(1, (sec - start) / (end - start)));
  return progress * progress * (3 - 2 * progress);
};
const poseAtSample = ([frame, lateral, crouch, lean]: typeof leftDancerTrack[number]): DancePose => {
  const sec = frame / 30;
  const yaw = grassTurn(sec);
  const spinning = smoothMix(sec, 11.21, 11.43);
  const highTuck = smoothMix(sec, 3.16, 3.44) * (1 - smoothMix(sec, 3.51, 3.84));
  const lowTuck = smoothMix(sec, 5.02, 5.27) * (1 - smoothMix(sec, 5.38, 5.66));
  return { ...neutralPose, hip: [lateral * 0.76, crouch, 0], 转: yaw, hipTilt: -lean * 0.32,
    bodyTilt: lean * 0.83 - 6 * highTuck, forwardBend: Math.min(7, -crouch * 1.3) + 11 * highTuck + 6 * lowTuck,
    gazeDip: 17 * highTuck + 8 * lowTuck, 头: [(spinning + smoothMix(sec, 7.05, 7.32) * (1 - smoothMix(sec, 10.70, 11.0))) * yaw * lookBackMix - 23 * highTuck + 12 * lowTuck, -lean * 0.18],
  };
};
const bodyKeys = leftDancerTrack.map(row => [row[0] / 30, poseAtSample(row)] as const);
const poseChannels = ['hip', 'hipTilt', 'bodyTilt', 'bodyTwist', 'forwardBend', 'gazeDip', '头'] as const;
const flattenPose = (pose: DancePose) => poseChannels.flatMap(channel => Array.isArray(pose[channel]) ? pose[channel] as number[] : [pose[channel] as number]);
const samples = bodyKeys.map(([sec, pose]) => [sec, flattenPose(pose)] as const);
const tracks: Key[][] = flattenPose(neutralPose).map((_, axis) => samples.map(([sec, values]) => [sec, values[axis]!]));

export function danceAt(sec: number): DancePose {
  const values = tracks.map(track => sample(track, sec));
  let offset = 0;
  const pose = { ...neutralPose };
  for (const channel of poseChannels) {
    const base = neutralPose[channel];
    Object.assign(pose, { [channel]: typeof base === 'number' ? values[offset++] : values.slice(offset, offset += base.length) });
  }
  const left = leftStep(sec);
  const right = rightStep(sec);
  const yaw = grassTurn(sec);
  pose.转 = yaw;
  pose.leftFoot = left.point;
  pose.rightFoot = right.point;
  pose.leftFootDir = [6 + yaw, left.toe];
  pose.rightFootDir = [6 - yaw, right.toe];
  applyArmTrack(pose, sec);
  fitStance(pose);
  return pose;
}

// ---------- 解成骨骼 ----------
// 骨骼自己的坐标（engine/model/基岩模型.tsx）：X = 她的右，Y 上，Z = 后；转角 = Euler(−x, −y, z, 'ZYX')（度），和骨骼自带的 rotation 相加；pos 的 x 取负。

const radPerDeg = Math.PI / 180;
const toThreeVector = ([left, up, forward]: DirVec3) => new THREE.Vector3(-left, up, -forward);
const downDir = new THREE.Vector3(0, -1, 0);
const axisX = new THREE.Vector3(1, 0, 0);
const axisY = new THREE.Vector3(0, 1, 0);
const axisZ = new THREE.Vector3(0, 0, 1);
const axisQuat = (axis: THREE.Vector3, angle: number) => new THREE.Quaternion().setFromAxisAngle(axis, angle * radPerDeg);
/** 四元数 → BonePose 的 rot（减掉骨骼自带的转角） */
const quatToEuler = (q: THREE.Quaternion, builtIn: readonly number[] = [0, 0, 0]): number[] => {
  const e = new THREE.Euler().setFromQuaternion(q, 'ZYX');
  return [-e.x / radPerDeg - builtIn[0]!, -e.y / radPerDeg - builtIn[1]!, e.z / radPerDeg - builtIn[2]!];
};
const displacement = ([left, up, forward]: DirVec3): number[] => [left, up, -forward];

import danceModel from 'asset:模型/角色/娘化亚波伦';
import type { BedrockBone } from '@engine/model/基岩模型.tsx';
import { skeletonMatrix } from '@engine/model/基岩正解.ts';

const model = danceModel as unknown as { bones: BedrockBone[] };
const bones = new Map(model.bones.map(bone => [bone.name, bone]));
const modelPivot = (name: string) => new THREE.Vector3(...bones.get(name)!.pivot).multiply(new THREE.Vector3(-1, 1, 1));
const waistPivot = modelPivot('DownBody');
const bindLeg = (side: string) => {
  const foot = `${side}Foot`;
  const hip = modelPivot(`${side}Leg`), knee = modelPivot(`${side}LowerLeg`), ankle = modelPivot(foot);
  const thigh = knee.clone().sub(hip), calf = ankle.clone().sub(knee);
  const toFoot = skeletonMatrix(model, foot, {}, 1).invert();
  // 两只鞋各由七根刚性子骨组成。踝不在鞋底中心，绷脚时最低点也会从前掌换到鞋尖。
  const vertices = model.bones.filter(bone => bone.parent === foot).flatMap(bone => {
    const local = toFoot.clone().multiply(skeletonMatrix(model, bone.name, {}, 1));
    return bone.cubes!.flatMap(cube => Array.from({ length: 8 }, (_, corner) => new THREE.Vector3(
      bone.pivot[0] - cube.origin[0] - ((corner & 1) ? cube.size[0] : 0),
      cube.origin[1] - bone.pivot[1] + ((corner & 2) ? cube.size[1] : 0),
      cube.origin[2] - bone.pivot[2] + ((corner & 4) ? cube.size[2] : 0),
    ).applyMatrix4(local)));
  });
  const bounds = new THREE.Box3().setFromPoints(vertices);
  const sole = bounds.getCenter(new THREE.Vector3());
  sole.y = bounds.min.y;
  return { hip, thighLength: thigh.length(), calfLength: calf.length(), thighAxis: thigh.normalize(), calfAxis: calf.normalize(), sole, vertices };
};
const legs = { Left: bindLeg('Left'), Right: bindLeg('Right') };
const shoulderBuiltIn = { 左: [0, 0, -18], 右: [0, 0, 18] } as const;
const bindArm = (side: string) => {
  const forearm = bones.get(side + 'ForeArm')!;
  const [skin, sleeve] = [...forearm.cubes!].sort((first, second) => first.origin[1] - second.origin[1]);
  const edge = (cube: NonNullable<BedrockBone['cubes']>[number]) => cube.origin[1] - (cube.inflate ?? 0);
  const palm = new THREE.Vector3(forearm.pivot[0] - skin!.origin[0] - skin!.size[0] / 2,
    (edge(skin!) + edge(sleeve!)) / 2 - forearm.pivot[1], skin!.origin[2] + skin!.size[2] / 2 - forearm.pivot[2]);
  return { upper: modelPivot(side + 'ForeArm').sub(modelPivot(side + 'Arm')).normalize(), palm: palm.normalize() };
};
const armAxes = { Left: bindArm('Left'), Right: bindArm('Right') };
const frontAxis = new THREE.Vector3(0, 0, -1);
const palmToFront = {
  Left: new THREE.Quaternion().setFromUnitVectors(armAxes.Left.palm, frontAxis),
  Right: new THREE.Quaternion().setFromUnitVectors(armAxes.Right.palm, frontAxis),
};

const armInShot = (row: ArmFrame, axis: number) => {
  const angle = row[axis]! * degrees, span = row[axis + 1]! / 100;
  const across = Math.sin(angle) * span, up = -Math.cos(angle) * span, depth = Math.sqrt(Math.max(0, 1 - span * span));
  return new THREE.Vector3(-across - 0.08 * depth, up + 0.14 * depth, -depth + 0.08 * across + 0.14 * up).normalize();
};

const armDirectionTracks = [0, 2, 4, 6].map(axis => {
  const directions = grassArmFrames.map(row => armInShot(row, axis));
  return (['x', 'y', 'z'] as const).map(coord => directions.map((direction, frame): Key => [frame, direction[coord]]));
});

const applyArmTrack = (pose: DancePose, sec: number) => {
  const frame = THREE.MathUtils.clamp(sec * 30, 0, grassArmFrames.length - 1);
  const index = Math.floor(frame), row = grassArmFrames[index]!, next = grassArmFrames[Math.min(index + 1, grassArmFrames.length - 1)]!;
  // 收肘展开在真人键之间接速度；不改起手的快甩或后面的舞步，过渡两端仍照原轨。
  const continuous = smoothMix(frame, 98, 104) * (1 - smoothMix(frame, 152, 158));
  const inverse = torsoFacing(pose).invert();
  const local = (axis: number): DirVec3 => {
    const [across, up, depth] = armDirectionTracks[axis / 2]!;
    const dir = armInShot(row, axis).lerp(armInShot(next, axis), frame - index).normalize();
    if (continuous) dir.lerp(new THREE.Vector3(sample(across!, frame), sample(up!, frame), sample(depth!, frame)).normalize(), continuous).normalize();
    dir.applyQuaternion(inverse);
    return [-dir.x, dir.y, -dir.z];
  };
  const turn = smoothMix(frame, 338, 342) * (1 - smoothMix(frame, 355, 359));
  for (const side of ['left', 'right'] as const) {
    const left = side === 'left', sign = left ? 1 : -1, axis = left ? 4 : 0;
    const akimbo = smoothMix(frame, left ? 371 : 373, left ? 374 : 378);
    pose[`${side}UpperArm`] = mixDir(mixDir(local(axis), [sign * 0.74, -0.62, 0.18], turn), [sign * 0.66, -0.74, 0.15], akimbo);
    pose[`${side}ForeArm`] = mixDir(mixDir(local(axis + 2), [sign * 0.17, 0.94, 0.25], turn), [-sign * 0.72, -0.60, 0.27], akimbo);
  }
};

const footTarget = (side: keyof typeof legs, feet: DirVec3, footSplay: number, toePitch: number) => {
  const shoe = legs[side];
  const footYaw = axisQuat(axisY, (side === 'Left' ? 1 : -1) * footSplay);
  const footRot = footYaw.clone().multiply(axisQuat(axisX, -toePitch));
  const upInShoe = axisY.clone().applyQuaternion(footRot.clone().invert());
  const soleOffset = shoe.sole.clone().applyQuaternion(footRot);
  soleOffset.y = Math.min(...shoe.vertices.map(vertex => vertex.dot(upInShoe)));
  return { footYaw, footRot, ankle: toThreeVector(feet).sub(soleOffset) };
};

const fitStance = (pose: DancePose) => {
  const rotation = axisQuat(axisY, pose.转).multiply(axisQuat(axisZ, pose.hipTilt));
  const shift = toThreeVector(pose.hip);
  let lower = 0;
  for (const side of ['Left', 'Right'] as const) {
    const leg = legs[side];
    const hip = leg.hip.clone().sub(waistPivot).applyQuaternion(rotation).add(waistPivot).add(shift);
    const { ankle } = side === 'Left' ? footTarget(side, pose.leftFoot, ...pose.leftFootDir) : footTarget(side, pose.rightFoot, ...pose.rightFootDir);
    const height = Math.sqrt(Math.max(0, (leg.thighLength + leg.calfLength) ** 2 - (ankle.x - hip.x) ** 2 - (ankle.z - hip.z) ** 2));
    lower = Math.max(lower, hip.y - ankle.y - height);
  }
  pose.hip[1] -= lower;
};

const armPose = (out: Record<string, BonePose>, side: '左' | '右', upperArm: DirVec3, foreArm: DirVec3) => {
  const sideName = side === '左' ? 'Left' : 'Right';
  const upperArmDir = new THREE.Quaternion().setFromUnitVectors(armAxes[sideName]!.upper, toThreeVector(upperArm).normalize());
  const forearmDir = new THREE.Quaternion().setFromUnitVectors(frontAxis, toThreeVector(foreArm).normalize()).multiply(palmToFront[sideName]);
  out[`${sideName}Arm`] = { rot: quatToEuler(upperArmDir, shoulderBuiltIn[side]) };
  out[`${sideName}ForeArm`] = { rot: quatToEuler(upperArmDir.clone().invert().multiply(forearmDir)) };
};

/** 腿：胯的位置、朝向定了以后，按脚底落点反解大腿、小腿，脚掌按 脚向 摆（舞台坐标里摆平） */
const legPose = (out: Record<string, BonePose>, side: '左' | '右', hipShift: THREE.Vector3, hipRot: THREE.Quaternion, feet: DirVec3, [footSplay, toePitch]: readonly number[]) => {
  const sideName = side === '左' ? 'Left' : 'Right';
  const { hip, thighLength, calfLength, thighAxis, calfAxis } = legs[sideName];
  const hipPos = hip.clone().sub(waistPivot).applyQuaternion(hipRot).add(waistPivot).add(hipShift);
  const { footYaw, footRot, ankle } = footTarget(sideName, feet, footSplay!, toePitch!);
  const hipInverse = hipRot.clone().invert();
  const d = ankle.sub(hipPos).applyQuaternion(hipInverse);
  const reach = d.length();
  const distance = THREE.MathUtils.clamp(reach, Math.abs(thighLength - calfLength), thighLength + calfLength);
  const ankleDir = reach > 1e-9 ? d.divideScalar(reach) : downDir;
  // 膝盖朝脚尖那边顶
  const kneeDir = new THREE.Vector3(0, 0, -1).applyQuaternion(footYaw).applyQuaternion(hipInverse);
  const perpVec = kneeDir.projectOnPlane(ankleDir);
  if (perpVec.lengthSq() < 1e-12) perpVec.copy(Math.abs(ankleDir.y) < 0.9 ? axisY : axisX).projectOnPlane(ankleDir);
  perpVec.normalize();
  const hipAngle = Math.acos(Math.min(1, Math.max(-1, (thighLength ** 2 + distance ** 2 - calfLength ** 2) / (2 * thighLength * distance))));
  const thighDir = ankleDir.clone().multiplyScalar(Math.cos(hipAngle)).add(perpVec.multiplyScalar(Math.sin(hipAngle)));
  const calfDir = ankleDir.clone().multiplyScalar(distance).sub(thighDir.clone().multiplyScalar(thighLength));
  const thighAim = new THREE.Quaternion().setFromUnitVectors(thighAxis, thighDir.normalize());
  const lowerLegAim = new THREE.Quaternion().setFromUnitVectors(calfAxis, calfDir.normalize());
  out[`${sideName}Leg`] = { rot: quatToEuler(thighAim) };
  out[`${sideName}LowerLeg`] = { rot: quatToEuler(thighAim.clone().invert().multiply(lowerLegAim)) };
  out[`${sideName}Foot`] = { rot: quatToEuler(lowerLegAim.clone().invert().multiply(hipInverse).multiply(footRot)) };
};

/** 上身（UpBody）相对 aaabody 的朝向 */
const torsoFacing = (p: DancePose) => axisQuat(axisY, p.转 + p.bodyTwist).multiply(axisQuat(axisZ, p.bodyTilt)).multiply(axisQuat(axisX, -p.forwardBend));

/** 舞姿 → 骨骼姿势（给 <娘化亚波伦 姿势>）。头是不带弹簧的静态版，忘情牛肉面姿势 里换成弹簧追过的 */
export const solveSkeleton = (p: DancePose): Record<string, BonePose> => {
  const poses: Record<string, BonePose> = {};
  const hipShift = toThreeVector(p.hip);
  const hipRot = axisQuat(axisY, p.转).multiply(axisQuat(axisZ, p.hipTilt));
  const upperBody = torsoFacing(p);
  poses.DownBody = { rot: quatToEuler(hipRot), pos: displacement(p.hip) };
  poses.UpBody = { rot: quatToEuler(upperBody), pos: displacement(p.hip) };
  poses.Head = { rot: quatToEuler(upperBody.clone().invert().multiply(headOrient(headRestTarget(p)))) };
  armPose(poses, '左', p.leftUpperArm, p.leftForeArm);
  armPose(poses, '右', p.rightUpperArm, p.rightForeArm);
  legPose(poses, '左', hipShift, hipRot, p.leftFoot, p.leftFootDir);
  legPose(poses, '右', hipShift, hipRot, p.rightFoot, p.rightFootDir);
  return poses;
};

// ---------- 头：跟着上身走，慢半拍 ----------
// 用户 11-11「跳舞头动作有点僵硬」。原来头每一刻按同一刻的舞姿直接算：侧倒抵掉一半、转身抵掉 65%，再加 头 那两个数，
// 合起来头在世界里几乎不动（上身左右倒 ±17 度，头只歪 ±2.6 度，从不点头），身子在一个钉住的头底下晃，起停又和身子同一帧。
// 现在头在世界里（相对 aaabody）的朝向是一个二阶弹簧（欠阻尼）去追目标：转、歪跟着上身走，身子每甩一下顺势点一下头。
// 身子先动、头晚约 4 帧跟上、略冲过再回稳。弹簧从舞前 0.5 秒按固定步长积出整张表，取哪一帧都一样（和取帧顺序无关）。
// 下面的数都是 Agent 取的，用户没看过。

/** 头在世界里跟上身侧倒的比例（其余留在脖子上抵掉，脸不至于跟着身子倒平） */
const followTilt = 0.85;
/** 身子动得快时头往下点多少（度）、多快算满（度/秒，胯的像素/秒按 8 度折算） */
const nod = { nodAmp: 5, fullSpeed: 140, hipFold: 8 };
/** 弹簧：自然频率（赫兹）、阻尼比；阻尼比 < 1 会冲过一点再回来 */
const headSpring = { freq: 2.4, damping: 0.55 };

type HeadAngle = [转: number, 歪: number, 俯: number];
/** 头在世界里的 [转, 歪, 俯] → 四元数（俯 = 低头） */
const headOrient = ([yawDeg, tilt, pitchRad]: readonly number[]) => axisQuat(axisY, yawDeg!).multiply(axisQuat(axisZ, tilt!)).multiply(axisQuat(axisX, -pitchRad!));
/** 不算点头和弹簧时头在世界里该朝哪：转身跟 1 − 回头，侧倒跟 跟倾，再加姿势里的 头 */
const headRestTarget = (p: DancePose): HeadAngle => [(1 - lookBackMix) * (p.转 + p.bodyTwist) + p.头[0], followTilt * p.bodyTilt + p.头[1], p.forwardBend + p.gazeDip];

const headStep = 1 / 480;
const headStartSec = -0.5;
const headEndSec = onePassSec + 3;
let headTableCache: Float64Array[] | undefined;
const buildHeadTable = (): Float64Array[] => {
  const n = Math.ceil((headEndSec - headStartSec) / headStep) + 1;
  const poseList = Array.from({ length: n }, (_, i) => danceAt(headStartSec + i * headStep));
  const headTable = [0, 1, 2].map(() => new Float64Array(n));
  const ω = 2 * Math.PI * headSpring.freq;
  const x = headRestTarget(poseList[0]!);
  const v = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const [a, b] = [poseList[Math.max(0, i - 1)]!, poseList[Math.min(n - 1, i + 1)]!];
    const numDiff = (f: (p: DancePose) => number) => (f(b) - f(a)) / (2 * headStep);
    const speed = Math.hypot(numDiff((p) => p.bodyTilt), 0.3 * numDiff((p) => p.转 + p.bodyTwist), nod.hipFold * numDiff((p) => p.hip[0]), nod.hipFold * numDiff((p) => p.hip[1]));
    const headTarget = headRestTarget(poseList[i]!);
    headTarget[2] += nod.nodAmp * Math.min(1, speed / nod.fullSpeed);
    for (let k = 0; k < 3; k++) {
      headTable[k]![i] = x[k]!;
      v[k]! += headStep * (ω * ω * (headTarget[k]! - x[k]!) - 2 * headSpring.damping * ω * v[k]!);
      x[k]! += headStep * v[k]!;
    }
  }
  return headTable;
};
/** 这一秒头在世界里的 [转, 歪, 俯]（弹簧追过的） */
export const headAngleAt = (sec: number): HeadAngle => {
  const headTable = (headTableCache ??= buildHeadTable());
  const u = (Math.min(Math.max(sec, headStartSec), headEndSec) - headStartSec) / headStep;
  const i = Math.min(Math.floor(u), headTable[0]!.length - 2);
  const t = u - i;
  return [0, 1, 2].map((k) => headTable[k]![i]! * (1 - t) + headTable[k]![i + 1]! * t) as HeadAngle;
};

/** 默认走完整舞谱；显式循环才从原片第一拍重放。 */
export const noodleDancePose = (sec: number, settings: { 循环?: boolean } = {}): Record<string, BonePose> => {
  const t = settings.循环 ? ((sec % onePassSec) + onePassSec) % onePassSec : sec;
  const p = danceAt(t);
  const pose = solveSkeleton(p);
  const lift = Math.max(p.leftFoot[1], p.rightFoot[1]);
  pose.Skirt = { scale: [1, 0.77 - 0.29 * smoothMix(lift, 0, 9), 1] };
  const upperBody = torsoFacing(p);
  pose.Head = { rot: quatToEuler(upperBody.invert().multiply(headOrient(headAngleAt(t)))) };
  return pose;
};

/**
 * 给头发、胸部弹簧的输入（定表演 的 环境）：从舞姿差分出转身速度（度/秒）和竖直速度（米/秒）。
 * 弹簧吃的 q.yaw_speed 单位包里没写，这里按度/秒给（推断）；这支舞转身最快约 250 度/秒，头发因此只偏几度。
 */
export const noodleDanceEnv = (sec: number): MolangEnv => {
  const h = 1 / 120;
  const [before, poseAfter] = [danceAt(sec - h), danceAt(sec + h)];
  const perSecDelta = (a: number, b: number) => (b - a) / (2 * h);
  return { query: { yaw_speed: perSecDelta(before.转 + before.bodyTwist, poseAfter.转 + poseAfter.bodyTwist), vertical_speed: (perSecDelta(before.hip[1], poseAfter.hip[1]) * 0.7) / 16 } };
};
