// 骑扫帚：李樱在前、九胡在后坐在魔理沙的扫帚上（车万女仆模组座次：驾驶的玩家在前 0.35 格，女仆在后 0.35 格，见 物品/扫帚.tsx 的 `BROOM`）。
// 各镜头共用的骑乘套件（6-1-3 起飞、6-1-4～6-1-8、6-2-4～6-2-6）。接口要稳定，改动只做追加。
//
// 用法：
//   <RideBroom 位置={[x, y, z]} 朝向={yaw} 俯仰={pitch} 横滚={roll}
//              李樱={{ 前倾: 30, 右手: (姿态) => <group quaternion={handAim(姿态, [0, 1, 0])}><长矛 /></group>, 姿态: (基础) => ({ ...基础, armR: 80 }) }}
//              九胡={{ 抱腰: 1 }} />
// 坐标（场景坐标 Z 朝上，1 = 一格；扫帚本地坐标同样 Z 朝上、+Y 朝扫帚头、+X 是骑手右手边）：
// - 位置：扫帚杆中心（两个座位正中间）在场景里的位置，也是转动支点。
// - 朝向：绕竖轴度数，0 = 扫帚头朝 +Y（北），正 = 往左转，和 骨架.tsx 的 yaw 一致，朝东飞填 -90。俯仰：正 = 抬头。横滚：正 = 往右压坡度，右转弯填正值。
// - 三个角的顺序：先朝向、再俯仰、最后横滚（机体坐标系），即 Rz(朝向)·Rx(俯仰)·Ry(横滚)，`broomMatrix`() 给出同一个变换。
// 李樱（骨架.tsx 的 Figure；不写就用默认跨坐姿态，李樱={false} 不画）：
// - 前倾：上身前压度数（默认 30，高速飞行 40～50），腿跟着补回来，屁股始终坐在杆上。抬头、转头：度，相对胸口。
// - 姿态：在跨坐基础姿态上改，可给部分字段（{ armR: 90 }）或函数 (基础) => 新姿态；基础字段见 `liYingRidePose`()。默认两手握杆，换手臂动作时自己给 armR / armRRoll / elbowR（约定见 骨架.tsx）。
// - 右手 / 左手：挂在手的握持点上的东西（坐标系同 骨架.tsx 的 handR），可给节点或函数 (最终姿态) => 节点；要让物品指向某方向用 `handAim`(最终姿态, 方向)，方向是扫帚本地坐标（[0, 1, 0] = 沿扫帚往前平端）。
// - 腰挂：挂在左腰（刀鞘），同 李樱.tsx 的 hipL；前倾小时鞘尾搁在扫帚翅膀上（见 `hipTilt`）。
// 九胡（九胡={false} 不画）：前倾（默认 20）；抱腰 0 = 两手扶杆、1 = 环抱李樱的腰（默认 1）；抬头、转头；尾巴（摆动相位，弧度）；风 0～1（尾巴被吹向后，高速填 1）；
//   位移（整个人在扫帚本地坐标里挪多少，下扫帚用）；右手（挂在右手握持点上的东西）。裙子按「反重力裙子」摆，风不吹裙子（见 `jiuhuRideBones`）。骨骼：额外覆盖的骨骼姿态（基岩动画约定，见 lib/基岩模型.tsx），最后叠上。
// 扫帚：{ 出现: 0～1（唤出时从中心放大）, 草丝: 是否加厚草束（默认 true） }。
// 其他导出：`liYingRidePose`、`jiuhuRideBones`（基础姿态，做上下扫帚过渡可插值）；`broomMatrix`(位置, 朝向, 俯仰, 横滚) 和 `toScene`(m, 本地点)；
//   `liYingHand`(姿态, 'R' | 'L')（手的握持点在扫帚本地坐标的位置，算矛尖到哪用）；`handAim`；`RIDE`（座位、杆高等常数）。
import React from 'react';
import * as THREE from 'three';
import { rad } from '../../engine/anim/anim.ts';
import { type BedrockModel, BedrockModelView, type BonePose } from '../../engine/model/基岩模型.tsx';
import type { V3 } from '../../engine/model/parts.tsx';
import { png } from '../../engine/model/贴图.ts';
import { BROOM, Broom } from '../物品/扫帚.tsx';
import { LiYing } from './李樱.tsx';
import { JIUHU_TALK_BONES, jiuhuMouthAttach } from './九胡.tsx';
import type { Mouth } from './口型.ts';
import type { FigurePose } from './骨架.tsx';
import jiuhuRaw资产 from 'asset:模型/角色/九胡';
import jiuhuSkin from 'asset:贴图/角色/九胡';
const jiuhuRaw = jiuhuRaw资产 as unknown as object;

// 九胡的模型：和 九胡.tsx 同一份数据（那边的组件只做站立和跑步的骨骼映射，坐姿在这里另写，不改原文件）
const JIUHU_MODEL = { ...jiuhuRaw, texture: png(jiuhuSkin) } as unknown as BedrockModel;
const JIUHU_PX = 0.7 / 16; // YSM 玩家模型：一像素 = 0.7/16 格
const JIUHU_HIP = 18.95; // 腿的关节（RightLeg pivot）离脚底的像素
const LIYING_PX = 1.875 / 32; // 李樱：32 像素高 = 1.875 格
const LIYING_HIP = 12; // 髋关节离脚底的像素

export const RIDE = {
  stickZ: BROOM.stickZ, // 扫帚本地坐标的原点就在杆中心；实体原点在它下方这么多
  front: BROOM.seatFront,
  back: BROOM.seatBack,
  // 座位处杆顶面比杆中心高多少（模型实测：杆中心约 0.16，前座杆顶 0.27～0.29、后座 0.22～0.25）
  seatTop: 0.11,
  liYingHipZ: 0.11 + 2 * LIYING_PX, // 李樱髋关节离杆中心的高度：坐在杆顶，大腿半厚 2 像素
  jiuhuHipZ: 0.08 + 2 * JIUHU_PX,
  // 九胡站直时髋（腿的关节）离脚底多高：下扫帚落地时用
  jiuhuStandHip: JIUHU_HIP * JIUHU_PX,
};

// ---------- 扫帚本地 → 场景 ----------
export const broomMatrix = (pos: V3, yaw = 0, pitch = 0, roll = 0) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(...pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rad(pitch), rad(roll), rad(yaw), 'ZXY')),
    new THREE.Vector3(1, 1, 1),
  );
export const toScene = (matrix: THREE.Matrix4, localPoint: number[]): V3 => {
  const scenePoint = new THREE.Vector3(localPoint[0], localPoint[1], localPoint[2]).applyMatrix4(matrix);
  return [scenePoint.x, scenePoint.y, scenePoint.z];
};

// ---------- 李樱的跨坐姿态 ----------
// 跨坐：大腿往前下方伸出去、两腿分开夹着杆，小腿垂下来；上身前倾 lean 度，两手在身前握杆。
// 腿的角度相对躯干，所以前倾多少就给大腿补多少，大腿相对扫帚的角度固定。
export const liYingRidePose = (lean = 30): FigurePose => {
  const thigh = 58; // 大腿相对竖直线往前
  const shin = -12; // 小腿相对竖直线（负 = 往后收）
  // 手：前倾越多，手越容易够到身前的杆；手臂相对躯干往前摆的角度按前倾补
  const arm = 34 - lean * 0.35;
  return {
    loc: [0, RIDE.front, RIDE.liYingHipZ - LIYING_HIP * LIYING_PX],
    pitch: -lean,
    squash: 1,
    headPitch: lean * 0.8,
    headYaw: 0,
    legR: thigh + lean,
    legL: thigh + lean,
    kneeR: thigh - shin,
    kneeL: thigh - shin,
    legRRoll: -16,
    legLRoll: -16,
    armR: arm,
    armL: arm,
    armRRoll: 14,
    armLRoll: 14,
    elbowR: 28,
    elbowL: 28,
    ground: 0,
  };
};

// ---------- 骨架正向运动学（和 骨架.tsx 的 Figure 同一串变换） ----------
const qe = (x: number, y: number, z: number, order: THREE.EulerOrder) => new THREE.Quaternion().setFromEuler(new THREE.Euler(rad(x), rad(y), rad(z), order));
const handFrame = (pose: FigurePose, hand: 'R' | 'L') => {
  const [arm, roll, elbow] = hand === 'R' ? [pose.armR, pose.armRRoll, pose.elbowR ?? 0] : [pose.armL, -pose.armLRoll, pose.elbowL ?? 0];
  return qe(0, 0, pose.yaw ?? 0, 'XYZ')
    .multiply(qe(pose.pitch, 0, 0, 'XYZ'))
    .multiply(qe(0, 0, pose.twist ?? 0, 'XYZ'))
    .multiply(qe(arm, roll, 0, 'YXZ'))
    .multiply(qe(elbow, 0, 0, 'XYZ'));
};

// 手的握持点在扫帚本地坐标里的位置（格）。只适用于 ground = 0（套件里的姿态都是）
export const liYingHand = (pose: FigurePose, hand: 'R' | 'L' = 'R'): V3 => {
  const [arm, roll, elbow] = hand === 'R' ? [pose.armR, pose.armRRoll, pose.elbowR ?? 0] : [pose.armL, -pose.armLRoll, pose.elbowL ?? 0];
  const pxSize = LIYING_PX;
  const hip = LIYING_HIP;
  const handPx = new THREE.Vector3(0, 0, 4 - 9).applyQuaternion(qe(elbow, 0, 0, 'XYZ')).add(new THREE.Vector3(0, 0, -4));
  handPx.applyQuaternion(qe(arm, roll, 0, 'YXZ')).add(new THREE.Vector3(hand === 'R' ? 6 : -6, 0, 22));
  handPx.applyQuaternion(qe(0, 0, pose.twist ?? 0, 'XYZ')).add(new THREE.Vector3(0, 0, -12));
  handPx.applyQuaternion(qe(pose.pitch, 0, 0, 'XYZ')).add(new THREE.Vector3(0, 0, hip * pose.squash));
  handPx.applyQuaternion(qe(0, 0, pose.yaw ?? 0, 'XYZ')).multiplyScalar(pxSize);
  return [pose.loc[0] + handPx.x, pose.loc[1] + handPx.y, pose.loc[2] + handPx.z];
};

// 让手里的物品（握持点里沿 +Z）指向扫帚本地坐标里的 方向：返回挂在握持点上的那一层该转的四元数
export const handAim = (pose: FigurePose, dir: number[], hand: 'R' | 'L' = 'R'): THREE.Quaternion => {
  const dirUnit = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize();
  const want = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dirUnit);
  return handFrame(pose, hand).invert().multiply(want);
};

// ---------- 九胡的跨坐骨骼 ----------
// 腿取材自 YSM 酒狐的 ride 动画（main.animation.json：大腿往前 62.5°、两腿分开）；ride 本身是跪坐（小腿折 165°），骑杆不成立，改成两腿分开夹杆、小腿垂下。手臂自己摆。
// 裙子不照 ride 动画（前片掀 65°、两侧翻到大腿上），改「反重力裙子」（用户 10-06 要求裙底不能露，做法见 九胡.tsx 文件头）：裙片往上掀，前片顺大腿盖住，后片和两侧垂下往杆收拢。
// 角度对着几何定（腿和裙片外面不相交、露的最少，前倾 0～34° 核对过）：
// - 整圈（clothe）往回转前倾的一半：全转回来腰带会跟上身前挪，后片压进撅起的屁股。
// - 前片整组前转 47.5° 躺大腿上，裙摆节在膝盖往下折 70°，不戳到李樱背。
// - 两侧整组外张 20° 让开大腿根（抬腿后髋关节上那截会从两侧顶出）；靠前一条随大腿前转 65°、裙摆节膝盖折 70°；正中、靠后两条髋节内收 40°，座位底下合拢。
// - 后片整组后转 10° 让开屁股，髋节前收 30°、裙摆节再收 20°，贴杆垂下。
// 风只吹尾巴，不吹裙子。
const HIDE: BonePose = { scale: 0 };
const TAIL_BONES = ['Tail', 'Tail2', 'Tail3', 'Tail4', 'Tail5', 'Tail6', 'Tail7'];
export const jiuhuRideBones = (opts: { lean?: number; hugWaist?: number; headRaise?: number; headTurn?: number; tailPhase?: number; 风?: number } = {}): Record<string, BonePose> => {
  const { lean = 20, hugWaist = 1, headRaise = 0, headTurn = 0, tailPhase = 0, 风: wind = 0 } = opts;
  const k = Math.min(1, Math.max(0, hugWaist));
  const mix = (a: number[], b: number[]) => a.map((v, i) => v + (b[i] - v) * k);
  const bones: Record<string, BonePose> = {
    Mask: HIDE,
    Expression: HIDE,
    Mouth_smile2: { pos: [0, 0, -1] },
    UpBody: { rot: [lean, 0, 0] },
    Head: { rot: [-lean * 0.7 - headRaise, -headTurn, 0] },
    RightLeg: { rot: [-62.5, 16, 0] },
    LeftLeg: { rot: [-62.5, -16, 0] },
    RightLowerLeg: { rot: [70, 0, 0] },
    LeftLowerLeg: { rot: [70, 0, 0] },
    RightFoot: { rot: [-10, 0, 0] },
    LeftFoot: { rot: [-10, 0, 0] },
    clothe: { rot: [-lean / 2, 0, 0] },
    FrontClothe: { rot: [-47.5, 0, 0] },
    FL2: { rot: [70, 0, 0] },
    FR2: { rot: [70, 0, 0] },
    FM2: { rot: [70, 0, 0] },
    LeftClothe: { rot: [0, 0, -20] },
    RightClothe: { rot: [0, 0, 20] },
    LF: { rot: [-65, 0, 0] },
    RF: { rot: [-65, 0, 0] },
    LF3: { rot: [70, 0, 0] },
    RF3: { rot: [70, 0, 0] },
    LM2: { rot: [0, 0, 40] },
    LB2: { rot: [0, 0, 40] },
    RM2: { rot: [0, 0, -40] },
    RB2: { rot: [0, 0, -40] },
    BackClothe: { rot: [10, 0, 0] },
    BL2: { rot: [-30, 0, 0] },
    BM2: { rot: [-30, 0, 0] },
    BR2: { rot: [-30, 0, 0] },
    BL3: { rot: [-20, 0, 0] },
    BM3: { rot: [-20, 0, 0] },
    BR3: { rot: [-20, 0, 0] },
    RightArm: { rot: mix([-35 + lean * 0.3, 0, -8], [-62 + lean * 0.6, -10, -22]) },
    LeftArm: { rot: mix([-35 + lean * 0.3, 0, 8], [-62 + lean * 0.6, 10, 22]) },
    RightForeArm: { rot: mix([-15, 0, 0], [-25, 30, 0]) },
    LeftForeArm: { rot: mix([-15, 0, 0], [-25, -30, 0]) },
  };
  TAIL_BONES.forEach((name, i) => {
    bones[name] = { rot: [i === 0 ? 0 : -6 * wind, Math.sin(tailPhase - i * 0.6) * (i < 3 ? 8 : 5) * (1 - 0.6 * wind), 0] };
  });
  // 风把尾巴往后上方压（用户 10-09：扬起 55° 会比头还高挡住两人，压到 -45° 又整条躺进草束太明显；要「斜着穿模一部分、但不能整个没入」）：尾根和草束穿插一点，尾尖露在扫帚上方
  bones.MTail = { rot: [-20 * wind, 0, 0] };
  return bones;
};

// ---------- 组件 ----------
export type RideLiYing = {
  lean?: number;
  headRaise?: number;
  headTurn?: number;
  poseOverride?: Partial<FigurePose> | ((base: FigurePose) => FigurePose);
  右手?: React.ReactNode | ((finalPose: FigurePose) => React.ReactNode);
  leftHand?: React.ReactNode | ((finalPose: FigurePose) => React.ReactNode);
  hipItem?: React.ReactNode;
  嘴?: Mouth; // 说话时的口型（src/lib/口型.ts 的 mouthAt）
};
// 右手：挂在九胡右手握持点（RightHandLocator）上的东西（6-2-4 起手里的结构指南针，见 九胡持指南针.tsx）
export type RideJiuhu = { lean?: number; hugWaist?: number; headRaise?: number; headTurn?: number; tailPhase?: number; 风?: number; boneOverrides?: Record<string, BonePose>; offset?: V3; 嘴?: Mouth; 右手?: React.ReactNode };
export type RideBroomProps = {
  pos: V3;
  yaw?: number;
  pitch?: number;
  roll?: number;
  liYing?: RideLiYing | false;
  jiuhu?: RideJiuhu | false;
  broom?: { appear?: number; grassStrands?: boolean };
};

// 套件里李樱的最终姿态（基础姿态 + 前倾/抬头/转头 + 外部改动），镜头里算手的位置时用同一个函数，保证和画出来的一致
export const liYingFinalPose = (ride: RideLiYing = {}): FigurePose => {
  const base = liYingRidePose(ride.lean ?? 30);
  base.headPitch += ride.headRaise ?? 0;
  base.headYaw += ride.headTurn ?? 0;
  if (!ride.poseOverride) return base;
  return typeof ride.poseOverride === 'function' ? ride.poseOverride(base) : { ...base, ...ride.poseOverride };
};

// 腰挂（刀鞘）跟着髋转：前倾小于 SHEATH_REST_LEAN 度时鞘尾往后下扎进扫帚左边的白翅膀，这时鞘尾搁在翅膀上不再往下沉，
// 鞘相对扫帚的角度停在前倾 SHEATH_REST_LEAN 度时的样子（鞘差不多水平，离翅膀约 1 像素）。扫帚收起（出现 0）就照常挂
const SHEATH_REST_LEAN = 30;
const hipTilt = (pose: FigurePose, appear: number) => Math.min(0, -pose.pitch - SHEATH_REST_LEAN) * appear;

export const RideBroom: React.FC<RideBroomProps> = ({ pos: pos, yaw: yaw = 0, pitch: pitch = 0, roll: roll = 0, liYing: liYing, jiuhu: jiuhu, broom: broom }) => {
  const ly = liYing === false ? null : liYingFinalPose(liYing ?? {});
  const at = (x: RideLiYing['右手']) => (typeof x === 'function' ? (ly ? x(ly) : null) : x);
  const jh = jiuhu === false ? null : jiuhu ?? {};
  return (
    <group position={pos} rotation={[rad(pitch), rad(roll), rad(yaw), 'ZXY']}>
      <group position={[0, 0, -RIDE.stickZ]}>
        <Broom appear={broom?.appear} grassStrands={broom?.grassStrands} />
      </group>
      {ly && liYing !== false && <LiYing pose={ly} handR={at(liYing?.右手)} handL={at(liYing?.leftHand)} hipL={liYing?.hipItem && <group rotation={[rad(hipTilt(ly, broom?.appear ?? 1)), 0, 0]}>{liYing.hipItem}</group>} 嘴={liYing?.嘴} />}
      {jh && (
        // 九胡：腿的关节放在后座杆顶上方，模型原点（脚底）在它下方 JIUHU_HIP 像素
        <group position={[jh.offset?.[0] ?? 0, RIDE.back + (jh.offset?.[1] ?? 0), RIDE.jiuhuHipZ - JIUHU_HIP * JIUHU_PX + (jh.offset?.[2] ?? 0)]}>
          <BedrockModelView model={JIUHU_MODEL} scale={JIUHU_PX} pose={{ ...jiuhuRideBones(jh), ...(jh.boneOverrides ?? {}), ...(jh.嘴 ? JIUHU_TALK_BONES : {}) }} attach={jh.右手 ? { ...jiuhuMouthAttach(jh.嘴), RightHandLocator: jh.右手 } : jiuhuMouthAttach(jh.嘴)} />
        </group>
      )}
    </group>
  );
};
