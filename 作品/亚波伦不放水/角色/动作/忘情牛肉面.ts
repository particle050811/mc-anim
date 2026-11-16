// 结算舞「忘情牛肉面」（用户 11-09 定用这支）：娘化亚波伦的手做动作，按秒取一张骨骼姿势，交给 <娘化亚波伦 姿势={…}>，盖在 idle 上面。
// 照参考视频 08（小透明，真人全身正面，BV1PnHY6sE7d，9.36 秒）每 0.25 秒抽帧看着摆的，09（MMD）、10（MC 模型）只用来对段落。
// 关键帧表 `时间线` 里的秒数就是 08 的秒数：配乐对上 08 的音轨，拍子就对上。公开的动作数据没有，姿势都是看图估的，不是量出来的。
// 左右：08 当成没镜像，画面右边 = 她的左手（推测，调研没法确认哪版是正的）；要反过来把 `镜像` 套在整条时间线上。
// 写法：每个关键姿势写「舞台坐标」里的量（胯挪多少、身子转多少、上臂前臂各朝哪、两脚踩在哪），逐通道用 engine/anim/anim.ts 的 sample 插值，
// 再解成骨骼转角：腿按脚的落点反解（两节，膝盖朝脚尖），所以叉腿顶胯时脚不滑。头后大光环、浮块挂在 aaabody 上，这里只动 UpBody、DownBody，它们不跟着晃。
import { onePassSec } from './忘情牛肉面时长.ts';
import * as THREE from 'three';
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
const dancePose = (patch: Partial<DancePose>, bottomPose: DancePose = neutralPose): DancePose => ({ ...bottomPose, ...patch });
const mirrorX = ([left, up, forward]: DirVec3): DirVec3 => [-left, up, forward];
/** 左右对调 */
export const mirrorPose = (p: DancePose): DancePose => ({
  hip: mirrorX(p.hip),
  转: -p.转,
  hipTilt: -p.hipTilt,
  bodyTilt: -p.bodyTilt,
  bodyTwist: -p.bodyTwist,
  forwardBend: p.forwardBend,
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

// 叉腿站：两脚各往外 6.5 像素（腿长 21 像素的三成，照 08 量的），重心略降
const straddle = dancePose({ hip: [0, -0.6, 0], leftFoot: [6.5, 0, 0], rightFoot: [-6.5, 0, 0], leftFootDir: [18, 0], rightFootDir: [18, 0] });

// 第一段：胯顶向一边，上身倒向另一边，倒向的那只手举起来指斜上，另一只手垂在胯旁
const raiseLeftBend = dancePose(
  { hip: [-2.6, -0.6, 0], hipTilt: -7, bodyTilt: 14, 头: [0, -6], leftUpperArm: [0.85, 0.55, 0.1], leftForeArm: [0.2, 1, 0.2], rightUpperArm: [-0.35, -1, 0], rightForeArm: [-0.6, -0.75, 0.35] },
  straddle,
);
// 手臂短、帽檐宽：照 08 的角度举直，手会藏到帽子后面，所以举直的都往外、往前多偏一点让手露出来
const raiseLeftStraight = dancePose({ hip: [-3.2, -0.6, 0], hipTilt: -9, bodyTilt: 17, 头: [0, -7], leftUpperArm: [0.45, 1, 0.18], leftForeArm: [0.45, 1, 0.2] }, raiseLeftBend);
const raiseLeftDiag = dancePose({ leftUpperArm: [0.8, 1, 0.1], leftForeArm: [0.85, 1, 0.12] }, raiseLeftStraight);
// 换边的中间：两肘抬到胸口高、小臂竖着
const switchPose = dancePose({ leftUpperArm: [0.85, -0.45, 0.15], leftForeArm: [0.3, 0.85, 0.4], rightUpperArm: [-0.85, -0.45, 0.15], rightForeArm: [-0.3, 0.85, 0.4] }, straddle);
// 一只手抬得高些（往左 = 1 左手高，−1 右手高）：多数时候是下一下要举的那只先抬
const switchSidePose = (leftSign: 1 | -1) => {
  const preLift = { leftUpperArm: [0.9, 0.05, 0.12] as DirVec3, leftForeArm: [0.25, 1, 0.25] as DirVec3 };
  const p = dancePose({ hip: [-0.8, -0.6, 0], bodyTilt: 5, ...preLift }, switchPose);
  return leftSign === 1 ? p : mirrorPose(p);
};

// 第二段：身子转成侧面，两小臂平伸在腰前；转回正面两臂在胯旁斜向下摊开
const sideLeft = dancePose(
  { 转: 48, bodyTwist: 12, hip: [0.6, -0.8, 0], 头: [0, 0], leftUpperArm: [0.3, -1, 0.15], leftForeArm: [0.25, -0.25, 1], rightUpperArm: [-0.3, -1, 0.25], rightForeArm: [-0.1, -0.2, 1] },
  straddle,
);
// 转过去的那一下，转向那边的脚抬起来点一下地
const sideLeftLift = dancePose({ 转: 38, bodyTwist: 8, leftFoot: [7.2, 1.6, 0.5], leftFootDir: [40, 30], leftUpperArm: [0.3, -1, 0.2], leftForeArm: [-0.3, -0.5, 0.8], rightUpperArm: [-0.3, -1, 0.2], rightForeArm: [0.4, -0.5, 0.8] }, sideLeft);
const spreadHands = dancePose({ leftUpperArm: [0.85, -0.5, 0], leftForeArm: [1, -0.3, 0.12], rightUpperArm: [-0.85, -0.5, 0], rightForeArm: [-1, -0.3, 0.12] }, straddle);
// 换边时两手在身前交叉着过
const crossArmsPose = (yaw: number) => dancePose({ 转: yaw, hip: [0, -1, 0], leftUpperArm: [0.3, -1, 0.2], leftForeArm: [-0.5, -0.6, 0.6], rightUpperArm: [-0.3, -1, 0.2], rightForeArm: [0.5, -0.6, 0.6] }, straddle);

// 第三段：双手过头两次，中间收脚
const handsToChest = dancePose({ 转: -12, leftUpperArm: [0.45, -0.9, 0.1], leftForeArm: [-0.3, 0.6, 0.7], rightUpperArm: [-0.45, -0.9, 0.1], rightForeArm: [0.3, 0.6, 0.7] }, straddle);
const handsOnHead = dancePose({ hip: [0, -0.2, 0], leftUpperArm: [0.9, 0.5, 0.2], leftForeArm: [-0.35, 0.9, 0.3], rightUpperArm: [-0.9, 0.5, 0.2], rightForeArm: [0.35, 0.9, 0.3] }, straddle);
const bothRaisedStraight = dancePose({ hip: [0, 0.2, 0], leftUpperArm: [0.8, 1, 0.35], leftForeArm: [0.7, 1, 0.4], rightUpperArm: [-0.8, 1, 0.35], rightForeArm: [-0.7, 1, 0.4] }, straddle);
// 小跳收脚：右膝提起来，两拳收在肩前
const liftKnee = dancePose({
  hip: [0.3, 1.2, 0],
  bodyTilt: -4,
  leftUpperArm: [0.45, -0.9, 0.1],
  leftForeArm: [0.05, 0.9, 0.45],
  rightUpperArm: [-0.45, -0.9, 0.1],
  rightForeArm: [-0.05, 0.9, 0.45],
  leftFoot: [2.6, 0.8, 0],
  rightFoot: [-2.6, 4.2, 2.8],
  rightFootDir: [8, 35],
});
const feetTogether = dancePose({ leftFoot: [1.7, 0, 0], rightFoot: [-1.7, 0, 0] });
const landCrouch = dancePose({ hip: [-0.8, -1.6, 0], bodyTilt: -7, 头: [0, 4], rightForeArm: [-0.45, -0.9, 0.3], leftForeArm: [0.45, -0.9, 0.3] }, feetTogether);
const feetTogetherArmsUp = dancePose({ hip: [0, 0.5, 0], leftUpperArm: [0.95, 0.8, 0.3], leftForeArm: [0.45, 1, 0.4], rightUpperArm: [-0.95, 0.8, 0.3], rightForeArm: [-0.45, 1, 0.4] }, feetTogether);
const handsGather = dancePose({ hip: [0, -1, 0], leftUpperArm: [0.3, -1, 0], leftForeArm: [0.3, -0.5, 0.8], rightUpperArm: [-0.3, -1, 0], rightForeArm: [-0.3, -0.5, 0.8] }, feetTogether);

// ---------- 时间线 ----------

export { onePassSec };

/**
 * [08 的秒数, 姿势, 说明]。拍子：第一段每 0.5 秒一下（单、单、双 ×2），第二段 3.5 秒起每 1.5 秒换一面，第三段 7.5、8.25 秒两次双手过头。
 * 标「看」的是 08 抽帧上看得清的，标「估」的是抽帧糊、被身子挡住或两帧之间补的。
 */
export const timeline: readonly (readonly [sec: number, 姿势: DancePose, note: string])[] = [
  [0, neutralPose, '看：并脚站，手垂在身前'],
  [0.25, raiseLeftBend, '看：叉开腿，胯顶右、上身倒左，左手举起肘还弯着'],
  [0.5, switchSidePose(1), '看：两手都在胸口高，左手还没全放下'],
  [0.75, mirrorPose(raiseLeftStraight), '看：右手伸直举过头'],
  [1.0, switchSidePose(1), '看'],
  [1.25, raiseLeftBend, '看：左手举，肘弯（双拍的第一下）'],
  [1.5, raiseLeftDiag, '看：左手伸直指斜上（双拍的第二下）'],
  [1.75, switchPose, '看：两肘平抬、小臂竖着'],
  [2.0, mirrorPose(raiseLeftStraight), '看'],
  [2.25, switchSidePose(1), '看'],
  [2.5, raiseLeftDiag, '看：左手伸直指斜上，全片伸得最开的一下'],
  [2.75, switchSidePose(-1), '看'],
  [3.0, mirrorPose(raiseLeftStraight), '看'],
  [3.25, mirrorPose(raiseLeftBend), '看：右手没放下，肘松一下（双拍）'],
  [3.5, mirrorPose(raiseLeftStraight), '看：再伸直'],
  [3.75, mirrorPose(sideLeftLift), '看：手放下、身子转向她的右边，右脚抬起点地；两手怎么收的估'],
  [4.0, mirrorPose(sideLeft), '看：侧身，小臂平伸在腰前'],
  [4.25, mirrorPose(sideLeft), '看：停住'],
  [4.5, spreadHands, '看：转回正面，两臂斜向下摊开'],
  [5.0, spreadHands, '看：停住'],
  [5.25, crossArmsPose(22), '估：两手在身前交叉着过，抽帧是糊的'],
  [5.5, sideLeftLift, '看：转向她的左边，左脚抬起点地'],
  [5.75, sideLeft, '看'],
  [6.0, sideLeft, '看：停住'],
  [6.25, dancePose({ 转: 15 }, spreadHands), '看：转回来，手在打开'],
  [6.5, spreadHands, '看'],
  [6.75, spreadHands, '看：停住'],
  [7.0, handsToChest, '看：两手收到胸前，身子略偏右；手的前后估'],
  [7.25, handsOnHead, '看：两手搭在头顶、肘朝外，脚还叉着'],
  [7.5, bothRaisedStraight, '看：两臂伸直举过头'],
  [7.75, liftKnee, '看：手落到肩前，右膝提起、小跳；跳多高估'],
  [8.0, landCrouch, '看：并脚落地屈膝，手垂下，上身歪向右；08 里两脚是前后交叉的，这里只并拢'],
  [8.25, feetTogetherArmsUp, '看：并脚，双手再举过头'],
  [8.5, feetTogetherArmsUp, '看：停住'],
  [8.75, handsGather, '看：手落到腰前，略蹲'],
  [9.0, feetTogether, '看：站直收住'],
  [onePassSec, feetTogether, '片尾'],
];

// ---------- 插值 ----------

const channelNames = Object.keys(neutralPose) as (keyof DancePose)[];
const flattenPose = (p: DancePose): number[] => channelNames.flatMap((k) => (typeof p[k] === 'number' ? [p[k] as number] : (p[k] as number[])));
const tracks: Key[][] = flattenPose(neutralPose).map((_, i) => timeline.map(([sec, p]) => [sec, flattenPose(p)[i]!] as Key));

/** 这一秒的舞姿（舞台坐标）；0 秒以前、一遍结束以后停在首尾 */
export const danceAt = (sec: number): DancePose => {
  const value = tracks.map((keys) => sample(keys, sec));
  let i = 0;
  const poseValues: Record<string, number | number[]> = {};
  for (const k of channelNames) {
    if (typeof neutralPose[k] === 'number') poseValues[k] = value[i++]!;
    else {
      const n = (neutralPose[k] as number[]).length;
      poseValues[k] = value.slice(i, i + n);
      i += n;
    }
  }
  return poseValues as unknown as DancePose;
};

// ---------- 解成骨骼 ----------
// 骨骼自己的坐标（engine/model/基岩模型.tsx）：X = 她的右，Y 上，Z = 后；转角 = Euler(−x, −y, z, 'ZYX')（度），和骨骼自带的 rotation 相加；pos 的 x 取负。

const radPerDeg = Math.PI / 180;
const toThreeVector = ([left, up, forward]: DirVec3) => new THREE.Vector3(-left, up, -forward);
const downDir = new THREE.Vector3(0, -1, 0);
const axisX = new THREE.Vector3(1, 0, 0);
const axisY = new THREE.Vector3(0, 1, 0);
const axisZ = new THREE.Vector3(0, 0, 1);
const axisQuat = (axis: THREE.Vector3, angle: number) => new THREE.Quaternion().setFromAxisAngle(axis, angle * radPerDeg);
/** 把垂着的一节转到朝 向 的最小转动 */
const pointAt = (dir: THREE.Vector3) => new THREE.Quaternion().setFromUnitVectors(downDir, dir.clone().normalize());
/** 四元数 → BonePose 的 rot（减掉骨骼自带的转角） */
const quatToEuler = (q: THREE.Quaternion, builtIn: readonly number[] = [0, 0, 0]): number[] => {
  const e = new THREE.Euler().setFromQuaternion(q, 'ZYX');
  return [-e.x / radPerDeg - builtIn[0]!, -e.y / radPerDeg - builtIn[1]!, e.z / radPerDeg - builtIn[2]!];
};
const displacement = ([left, up, forward]: DirVec3): number[] => [left, up, -forward];

// 模型尺寸（像素，models/main.json 的轴心）：UpBody、DownBody 的轴心高 20.65；髋 (±2.2, 21.15)，膝 11.7，踝 2.5；肩的自带转角 ±18 度
const waistHeight = 20.65;
const hip = { 左: new THREE.Vector3(-2.2, 21.15, 0), 右: new THREE.Vector3(2.2, 21.15, 0) };
const thighLength = 21.15 - 11.7;
const calfLength = 11.7 - 2.5;
const ankleHeight = 2.5;
const shoulderBuiltIn = { 左: [0, 0, -18], 右: [0, 0, 18] } as const;
/** 头往回找镜头的比例：身子转 60 度时头只跟 21 度（08 里侧身时脸还是朝镜头多）。侧倒跟多少、点头、弹簧见文件末「头」一节 */
const lookBackMix = 0.65;

const armPose = (out: Record<string, BonePose>, side: '左' | '右', upperArm: DirVec3, foreArm: DirVec3) => {
  const sideName = side === '左' ? 'Left' : 'Right';
  const upperArmDir = pointAt(toThreeVector(upperArm));
  const forearmDir = pointAt(toThreeVector(foreArm));
  out[`${sideName}Arm`] = { rot: quatToEuler(upperArmDir, shoulderBuiltIn[side]) };
  out[`${sideName}ForeArm`] = { rot: quatToEuler(upperArmDir.clone().invert().multiply(forearmDir)) };
};

/** 腿：胯的位置、朝向定了以后，按脚底落点反解大腿、小腿，脚掌按 脚向 摆（舞台坐标里摆平） */
const legPose = (out: Record<string, BonePose>, side: '左' | '右', hipShift: THREE.Vector3, hipRot: THREE.Quaternion, feet: DirVec3, [footSplay, toePitch]: readonly number[]) => {
  const sideName = side === '左' ? 'Left' : 'Right';
  const waistPivot = new THREE.Vector3(0, waistHeight, 0);
  const hipPos = hip[side].clone().sub(waistPivot).applyQuaternion(hipRot).add(waistPivot).add(hipShift);
  const footRot = axisQuat(axisY, (side === '左' ? 1 : -1) * footSplay).multiply(axisQuat(axisX, -toePitch));
  const ankle = toThreeVector(feet).add(new THREE.Vector3(0, ankleHeight, 0));
  const hipInverse = hipRot.clone().invert();
  const d = ankle.sub(hipPos).applyQuaternion(hipInverse);
  const distance = Math.min(d.length(), thighLength + calfLength - 1e-3);
  const ankleDir = d.clone().normalize();
  // 膝盖朝脚尖那边顶
  const kneeDir = new THREE.Vector3(0, 0, -1).applyQuaternion(footRot).applyQuaternion(hipInverse);
  const perpVec = kneeDir.sub(ankleDir.clone().multiplyScalar(kneeDir.dot(ankleDir))).normalize();
  const hipAngle = Math.acos(Math.min(1, Math.max(-1, (thighLength ** 2 + distance ** 2 - calfLength ** 2) / (2 * thighLength * distance))));
  const thighDir = ankleDir.clone().multiplyScalar(Math.cos(hipAngle)).add(perpVec.multiplyScalar(Math.sin(hipAngle)));
  const calfDir = ankleDir.clone().multiplyScalar(distance).sub(thighDir.clone().multiplyScalar(thighLength));
  const thighAim = pointAt(thighDir);
  const lowerLegAim = pointAt(calfDir);
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
const headRestTarget = (p: DancePose): HeadAngle => [(1 - lookBackMix) * (p.转 + p.bodyTwist) + p.头[0], followTilt * p.bodyTilt + p.头[1], p.forwardBend];

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

/** 这一秒的骨骼姿势；循环 = 一遍跳完从头再来（默认停在收住的站姿）。头换成弹簧追过的（见上） */
export const noodleDancePose = (sec: number, settings: { 循环?: boolean } = {}): Record<string, BonePose> => {
  const t = settings.循环 ? ((sec % onePassSec) + onePassSec) % onePassSec : sec;
  const p = danceAt(t);
  const pose = solveSkeleton(p);
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
