// 6-3-1 又回到边城（编排，纯函数）：6-3 下坠共用时间线上 6-3-2 前面的窗口（负的全局帧，见 6-3-下坠/时间线.ts 的 `段表`）。用户 10-02 要求 6-3-2 开头悬停时预留对话，确认古城在边城。
// 扫帚悬停在边城正上方（6-2-6 末帧的位置，不动），物理时间原速；首帧 = 6-2-6 末帧，末帧 = 6-3-2 首帧（同机位同姿势，九胡双手环着李樱的腰）。
// 段末那一帧归 6-3-2 思索（镜头/6-3-2/扫帚上.ts），这里只管它之前的帧，所有改动量到段末收回到 0。
//
// 戏（段内秒数 t，见 `cues631`）：镜头从悬停机位降到扫帚右前方两人中景；李樱低头看城，愣一下，说「诶，我们怎么又回到这里了？」，后半句转头问九胡；
//   九胡右手（6-2-4 李樱递给她的结构指南针一直握在这只手里，见 模型/角色/九胡持指南针.tsx）松开他的腰、放到身前低处，低头看，指针晃一下停住、指着正下方；
//   抬头说「狗修金要找的古城，就在这座边城的脚下。」，李樱顺着往下看城；她握着指南针把右手环回他的腰，歪头问「狗修金打算怎么下去呢？」（开口 `jiuhuAskFrame`，6-3-2 李樱的思索回答这一句）；两人坐回原姿势，镜头绕回后面拉回悬停机位。
// 指南针（用户 10-12 剪映注释定）：不用举着给观众看（太诡异），李樱也不掏。九胡手放身前低处、肘弯着，表盘朝上低头看；右前方中景看，它在李樱身后被挡大半、露出一点。
// 台词时长按正常语速留足（用户 10-03 定：约每秒 4.5 字，逗号停顿另算，再加 0.5 秒余量）；说话时嘴按配音张合（src/lib/口型.ts），外加轻微头部动作。
import * as THREE from 'three';
import { track } from '../../../../engine/anim/anim.ts';
import type { V3 } from '../../../../engine/model/parts.tsx';
import type { BedrockBone, BonePose } from '../../../../engine/model/基岩模型.tsx';
import { broomMatrix, jiuhuRideBones, liYingRidePose, RIDE } from '../../../../world/角色/骑扫帚.tsx';
import type { FigurePose } from '../../../../world/角色/骨架.tsx';
import { JIUHU, JIUHU_TALK_BONES } from '../../../../world/角色/九胡.tsx';
import { jiuhuCompassMatrix } from '../../../../world/角色/九胡持指南针.tsx';
import { mouthAt, type Mouth } from '../../../../world/配音/口型.ts';
import jiuhuRaw from 'asset:模型/角色/九胡';
import * as fallChoreo from '../../../../world/地点/边城/6-3-下坠/编排.ts';
import { FPS, 段表, 物理时间, 起点 } from '../../../../world/地点/边城/6-3-下坠/时间线.ts';

const ss = (x: number) => {
  const clamped = Math.min(1, Math.max(0, x));
  return clamped * clamped * (3 - 2 * clamped);
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const D2R = Math.PI / 180;
const v3 = (v: THREE.Vector3): V3 => [v.x, v.y, v.z];

export const G0 = 段表['6-3-1'].起;
export const segmentSec = (段表['6-3-1'].止 - G0) / FPS; // 秒
// 段内秒数
const toSegSec = (G: number) => (G - G0) / FPS;

// ---------- 时刻（段内秒数） ----------
// 台词时长：约每秒 4.5 字 + 逗号停顿 0.25 秒 + 余量 0.5 秒。
// 李樱「诶，我们怎么又回到这里了？」3.2 秒；九胡「狗修金要找的古城，就在这座边城的脚下。」4.5 秒；
// 九胡「狗修金打算怎么下去呢？」（用户在剪映里加的字幕，段内第 198 帧 = 8.25 秒）：到 10.95 秒，11 秒的段里放得下，段长不变；坐回、拉回挪到这句的后半截
export const cues631 = {
  pushIn: [0, 2.6] as const, // 镜头从悬停机位推到两人中景
  startle: 0.45, // 李樱愣一下（头微微一抬）
  liYingLine: [1.0, 4.2] as const,
  grab: [2.5, 3.1] as const, // 九胡右手离开他的腰、放到自己身前低处
  lookDown: [2.6, 3.2] as const, // 九胡低头看指南针
  headRaise: [3.95, 4.4] as const, // 看清了，抬起头来说
  jiuhuLine: [4.4, 8.25] as const,
  lookDownAtCity: [5.9, 6.6] as const, // 说到「这座边城的脚下」，李樱往下看城
  handBack: [7.8, 8.4] as const, // 右手握着指南针环回他的腰
  jiuhuAsk: [8.25, 10.95] as const,
  settleBack: [10.1, 10.85] as const, // 两人坐回原来的姿势（段末 0.15 秒谁都不动）
  pullBack: [9.3, 11.0] as const, // 镜头拉回悬停机位
};
// 新加的那句的开口帧（段内帧）：配音（6-3-1-九胡-怎么下去）另外在出，出来以后 `Sound.tsx` 的台词轨接这一帧
export const jiuhuAskFrame = Math.round(cues631.jiuhuAsk[0] * FPS); // 198
// 三句台词（段内帧 = 开口），声音.tsx 的台词轨和口型共用
export const lines = [
  { id: '6-3-1-李樱-又回到这里', 帧: cues631.liYingLine[0] * FPS },
  { id: '6-3-1-九胡-边城脚下', 帧: cues631.jiuhuLine[0] * FPS },
  { id: '6-3-1-九胡-怎么下去', 帧: jiuhuAskFrame },
];

// ---------- 扫帚、骑乘的基准（6-2-6 末帧 = 6-3-2 首帧） ----------
const broomStart = 起点.broom;
const BM = broomMatrix(broomStart.位置, broomStart.朝向, broomStart.俯仰, broomStart.横滚);
const toWorld = (p: number[]): V3 => v3(new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(BM));
const LY0 = 起点.riders.李樱 as { lean?: number; headRaise?: number };
const JH0 = 起点.riders.九胡;

// ---------- 李樱 ----------
// 两手一直握着扫帚杆（不再掏指南针）。头：相对骑乘姿态的增量（低头为负、往右转为负）
const LY_PITCH: [number, number][] = [
  [0, 0], [0.3, 0], [cues631.startle, 9], [0.9, 7], // 愣一下：头一抬
  [1.5, 4], [2.0, 7], [2.6, 3], [3.3, -6], // 说话：轻轻点头；后半句转过头去，往下瞟一眼她手里
  [cues631.headRaise[1], 2], // 她抬头说话，他看着她
  [cues631.lookDownAtCity[0], 2], [cues631.lookDownAtCity[1], -30], // 顺着她的话往下看城
  [cues631.jiuhuAsk[0], -30], [8.8, -8], // 她问他，他回过头
  [cues631.settleBack[0], -8], [cues631.settleBack[1], 0],
];
const LY_YAW: [number, number][] = [
  [0, 0], [2.5, 0], [3.3, -26], // 后半句转头问身后的九胡
  [cues631.lookDownAtCity[0], -26], [cues631.lookDownAtCity[1], -8],
  [cues631.jiuhuAsk[0], -8], [8.8, -24],
  [cues631.settleBack[0], -24], [cues631.settleBack[1], 0],
];
const liyingPose = (t: number): FigurePose => {
  const pose = liYingRidePose(LY0.lean ?? 18);
  pose.headPitch += (LY0.headRaise ?? 0) + track(LY_PITCH, t);
  pose.headYaw += track(LY_YAW, t);
  return pose;
};

// ---------- 九胡 ----------
// 骨骼正向运动学（和 lib/基岩模型.tsx 的 `BedrockModelView` 同一串变换），算手在扫帚本地坐标里的位置
const BONES = new Map((jiuhuRaw as unknown as { bones: BedrockBone[] }).bones.map((b) => [b.name, b]));
const chain = (name: string) => {
  const out: BedrockBone[] = [];
  for (let bone = BONES.get(name); bone; bone = bone.parent ? BONES.get(bone.parent) : undefined) out.unshift(bone);
  return out;
};
const JH_HIP = 18.95; // 腿的关节离脚底的像素，同 骑扫帚.tsx
// 九胡的模型（脚底为原点）在扫帚本地坐标里的摆法，同 骑扫帚.tsx 的 RideBroom
const JH_LOCAL = new THREE.Matrix4()
  .makeTranslation(0, RIDE.back, RIDE.jiuhuHipZ - JH_HIP * JIUHU.scale)
  .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
  .multiply(new THREE.Matrix4().makeScale(JIUHU.scale, JIUHU.scale, JIUHU.scale));
export const jiuhuBonePoint = (bones: Record<string, BonePose>, name: string, localPoint: number[] = [0, 0, 0]): V3 => {
  const matrix = JH_LOCAL.clone();
  let parent = [0, 0, 0];
  for (const bone of chain(name)) {
    const bonePose = bones[bone.name];
    const restRot = bone.rotation ?? [0, 0, 0];
    const ar = bonePose?.rot ?? [0, 0, 0];
    const ap = bonePose?.pos ?? [0, 0, 0];
    const scale = bonePose?.scale ?? 1;
    const sv = typeof scale === 'number' ? [scale, scale, scale] : scale;
    const pos = new THREE.Vector3(-(bone.pivot[0] - parent[0]) - ap[0], bone.pivot[1] - parent[1] + ap[1], bone.pivot[2] - parent[2] + ap[2]);
    const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-(restRot[0] + ar[0]) * D2R, -(restRot[1] + ar[1]) * D2R, (restRot[2] + ar[2]) * D2R, 'ZYX'));
    matrix.multiply(new THREE.Matrix4().compose(pos, quat, new THREE.Vector3(sv[0], sv[1], sv[2])));
    parent = bone.pivot;
  }
  return v3(new THREE.Vector3(localPoint[0], localPoint[1], localPoint[2]).applyMatrix4(matrix));
};

// 尾巴摆动的相位：首帧接 6-2-6 末帧（它按帧数 / 9 走），段末接 6-3-2（物理时间 × 2）。中间按 6-3-2 的走法，差的相位（折到 ±π）在整段里慢慢补掉
const tailBase = (G: number) => 2 * 物理时间(G);
const TAIL_FIX = (() => {
  const phaseDiff = JH0.tailPhase - tailBase(G0);
  return phaseDiff - 2 * Math.PI * Math.round(phaseDiff / (2 * Math.PI));
})();
const tail = (G: number) => tailBase(G) + TAIL_FIX * (1 - ss(toSegSec(G) / segmentSec));

// 头（相对 6-2-6 末帧的 抬头 / 转头；转头为负 = 往右转）：
// 听李樱说话时抬头看他；拿出指南针后低头、往右偏一点看自己手里；抬起头从他右肩后面说话、轻轻点头；问他时歪着头往上看他
const JH_LOOKUP: [number, number][] = [
  [0, 0], [1.4, 0], [2.2, 10],
  [cues631.lookDown[0], 10], [cues631.lookDown[1], -22], [cues631.headRaise[0], -22], // 低头看指南针
  [cues631.headRaise[1], 16], [5.0, 20], [5.6, 14], [6.3, 19], [7.0, 14], [7.6, 17], // 说话：轻轻点头
  [cues631.jiuhuAsk[0], 17], [8.7, 24], [9.6, 20], // 问他
  [cues631.settleBack[0], 20], [cues631.settleBack[1], 0],
];
const JH_TURN: [number, number][] = [
  [0, 0], [cues631.lookDown[0], 0], [cues631.lookDown[1], -12], [cues631.headRaise[0], -12],
  [cues631.headRaise[1], -30], [cues631.jiuhuAsk[0], -30], [8.7, -34],
  [cues631.settleBack[0], -34], [cues631.settleBack[1], 0],
];
// 问的时候头往右歪一点（Head 的 z）
const JH_TILT: [number, number][] = [[0, 0], [cues631.jiuhuAsk[0], 0], [8.7, 9], [cues631.settleBack[0], 9], [cues631.settleBack[1], 0]];
const jhBody = (t: number, globalFrame: number) => {
  const bones = jiuhuRideBones({ lean: JH0.lean, hugWaist: 1, headRaise: JH0.headRaise + track(JH_LOOKUP, t), headTurn: (JH0.headTurn ?? 0) + track(JH_TURN, t), tailPhase: tail(globalFrame), 风: JH0.风 });
  const headRot = bones.Head?.rot ?? [0, 0, 0];
  bones.Head = { ...bones.Head, rot: [headRot[0], headRot[1], headRot[2] + track(JH_TILT, t)] };
  return bones;
};
// 右手拿指南针的地方（扫帚本地坐标）：右肩往前 0.2 格、往下 0.36 格、往外 0.04 格——手在身前、肚子右前方低处，肘弯着，
// 比环腰时低、靠后，不往李樱身上伸，也不举起来（肩到手约 0.42 格，手臂 0.56 格，不伸直）
const holdBody = jhBody(3.5, 0);
const HAND_TARGET: V3 = (() => {
  const sh = jiuhuBonePoint(holdBody, 'RightArm');
  return [sh[0] + 0.04, sh[1] + 0.2, sh[2] - 0.36];
})();
// 右臂的拿姿势：用坐标下降法解 RightArm（x、y、z）和 RightForeArm（x），让手落到 HAND_TARGET（同 10-10 以前那一版的解法）
const ARM_HOLD = (() => {
  const guess = [-40, 0, 0, -60];
  const err = (x: number[]) => {
    const trialBones = { ...holdBody, RightArm: { rot: [x[0], x[1], x[2]] }, RightForeArm: { rot: [x[3], 0, 0] } };
    const hand = jiuhuBonePoint(trialBones, 'RightHandLocator');
    const reg = x.reduce((s, v, i) => s + (v - guess[i]) ** 2, 0) * 1e-7;
    return (hand[0] - HAND_TARGET[0]) ** 2 + (hand[1] - HAND_TARGET[1]) ** 2 + (hand[2] - HAND_TARGET[2]) ** 2 + reg;
  };
  const x = [...guess];
  let error = err(x);
  for (let step = 16; step > 0.02; ) {
    let better = false;
    for (let i = 0; i < x.length; i++)
      for (const delta of [step, -step]) {
        const y = [...x];
        y[i] += delta;
        if (i === 3) y[3] = Math.min(0, Math.max(-120, y[3])); // 肘只往前弯
        const ey = err(y);
        if (ey < error) {
          error = ey;
          better = true;
          x.splice(0, x.length, ...y);
        }
      }
    if (!better) step /= 2;
  }
  return { RightArm: [x[0], x[1], x[2]], RightForeArm: [x[3], 0, 0], 误差: Math.sqrt(error) };
})();
const holdK = (t: number) => ss((t - cues631.grab[0]) / (cues631.grab[1] - cues631.grab[0])) * (1 - ss((t - cues631.handBack[0]) / (cues631.handBack[1] - cues631.handBack[0])));
const jiuhuBones = (t: number, globalFrame: number) => {
  const bones = jhBody(t, globalFrame);
  const holdWeight = holdK(t);
  const mix = (from: number[] | undefined, to: number[]) => (from ?? [0, 0, 0]).map((v, i) => lerp(v, to[i], holdWeight));
  bones.RightArm = { ...bones.RightArm, rot: mix(bones.RightArm?.rot, ARM_HOLD.RightArm) };
  bones.RightForeArm = { ...bones.RightForeArm, rot: mix(bones.RightForeArm?.rot, ARM_HOLD.RightForeArm) };
  return bones;
};
export const jiuhuHoldPose = ARM_HOLD; // 核对用

// ---------- 结构指南针（九胡右手里） ----------
// 平时握在手里跟着手动（`jiuhuCompassMatrix`，和 6-2-4～6-2-6 一样）；手放到身前低处看的时候，平托在手上，表盘朝上、往她的脸那边（后方）仰 25°，
// 贴图上方朝前（朝李樱），指针指着正下方（表盘上就是指针收在表心不动；原版指针对着水平方向，正下方的结构它会乱转）。两种拿法按 `holdK` 过渡。
// 指针一路上停在 0（同 6-2-4 递过去时），手拿到身前时晃着转到 180 停住，不交代方向
export const compassScale = 0.38; // 同 6-2-1～6-2-4
export const NEEDLE_SETTLED = 180; // 看过以后指针停住的角度，6-3-2 起接着用
export type CompassState = { pos: V3; quat: THREE.Quaternion; needle: number };
const tiltRad = 25 * D2R;
const compass = (t: number, bones: Record<string, BonePose>): CompassState => {
  // 握在手里（扫帚本地）
  const grip = new THREE.Matrix4().makeTranslation(0, RIDE.back, RIDE.jiuhuHipZ - JH_HIP * JIUHU.scale).multiply(jiuhuCompassMatrix(bones, true));
  const gripPos = new THREE.Vector3();
  const gripQuat = new THREE.Quaternion();
  grip.decompose(gripPos, gripQuat, new THREE.Vector3());
  // 平托在手上看（扫帚本地）：+y 朝前（李樱那边），+z 朝上。表盘法线往后（她那边）仰
  const hand = new THREE.Vector3(...jiuhuBonePoint(bones, 'RightHandLocator'));
  const normal = new THREE.Vector3(0, -Math.sin(tiltRad), Math.cos(tiltRad));
  const yv = new THREE.Vector3(0, Math.cos(tiltRad), Math.sin(tiltRad));
  const x = new THREE.Vector3().crossVectors(yv, normal);
  const showQuat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, yv, normal));
  // 表盘贴在手心上面：中心在握持点上方 0.05 格
  const showPos = hand.clone().addScaledVector(normal, 0.05);
  const k = holdK(t);
  const pos = gripPos.lerp(showPos, k);
  const qBroom = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(BM));
  const sinceGrab = Math.max(0, t - cues631.grab[0]);
  const needleDeg = NEEDLE_SETTLED - NEEDLE_SETTLED * Math.cos(2 * Math.PI * 1.2 * sinceGrab) * Math.exp(-sinceGrab / 0.35);
  return { pos: toWorld([pos.x, pos.y, pos.z]), quat: qBroom.multiply(gripQuat.slerp(showQuat, k)), needle: needleDeg };
};

// ---------- 机位 ----------
// 悬停机位（6-2-6 末帧 = 6-3-2 首帧，扫帚后上方 20 米往下看）→ 扫帚右前方略高处的两人中景 → 拉回悬停机位。
// 中景不放在扫帚后上方：从后面看九胡的大尾巴和后背把人挡住了；右前方看得到李樱的脸和他身后的九胡。
// 推拉时绕两人中间的一点走，方位角、仰角、距离分开插值（距离按对数插值，人在画面里匀匀地变大）：高处几乎朝正下方看时转方位，画面像横滚打转（用户嫌头晕），
// 所以推近时先降下来再绕到侧前方，拉回时先绕回后面再升上去。看的点在两头视线之间平移
const C0: fallChoreo.Cam = { pos: [...起点.camera.pos] as V3, tgt: [...起点.camera.tgt] as V3, lens: 起点.camera.lens };
const PIVOT = new THREE.Vector3(...toWorld([0.05, 0, 0.8]));
const MID: [fallChoreo.Cam, fallChoreo.Cam] = [
  // 说话时慢慢再推近一点
  { pos: toWorld([2.5, 2.3, 2.0]), tgt: toWorld([0.15, 0.1, 0.85]), lens: 32 },
  { pos: toWorld([2.3, 2.1, 1.9]), tgt: toWorld([0.15, 0.12, 0.87]), lens: 32 },
];
type SphCoord = { d: number; el: number; az: number; aim: THREE.Vector3 };
const sph = (cam: fallChoreo.Cam): SphCoord => {
  const offset = new THREE.Vector3(...cam.pos).sub(PIVOT);
  const dist = offset.length();
  // 看的点：视线上离镜头 d 远的那一点（和人差不多远）
  const look = new THREE.Vector3(cam.tgt[0] - cam.pos[0], cam.tgt[1] - cam.pos[1], cam.tgt[2] - cam.pos[2]).normalize();
  return { d: dist, el: Math.asin(offset.z / dist), az: Math.atan2(offset.y, offset.x), aim: new THREE.Vector3(...cam.pos).addScaledVector(look, dist) };
};
// k：距离和仰角的进度；ka：方位角的进度
const camBetween = (camA: fallChoreo.Cam, camB: fallChoreo.Cam, k: number, ka: number): fallChoreo.Cam => {
  const sphA = sph(camA);
  const sphB = sph(camB);
  let da = sphB.az - sphA.az;
  da -= 2 * Math.PI * Math.round(da / (2 * Math.PI));
  const dist = Math.exp(lerp(Math.log(sphA.d), Math.log(sphB.d), k));
  const el = lerp(sphA.el, sphB.el, k);
  const az = sphA.az + da * ka;
  const pos = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)).multiplyScalar(dist).add(PIVOT);
  const aim = sphA.aim.clone().lerp(sphB.aim, k);
  const dir = aim.sub(pos).normalize();
  return { pos: v3(pos), tgt: v3(pos.clone().addScaledVector(dir, 100)), lens: lerp(camA.lens, camB.lens, k) };
};
const camera = (t: number): fallChoreo.Cam => {
  const midFrac = ss((t - cues631.pushIn[1]) / (cues631.pullBack[0] - cues631.pushIn[1]));
  const mid = camBetween(MID[0], MID[1], midFrac, midFrac);
  if (t < cues631.pullBack[0]) {
    const pushFrac = t / cues631.pushIn[1];
    return camBetween(C0, mid, ss(pushFrac / 0.75), ss((pushFrac - 0.2) / 0.8));
  }
  const pullFrac = (t - cues631.pullBack[0]) / (cues631.pullBack[1] - cues631.pullBack[0]);
  return camBetween(mid, C0, ss((pullFrac - 0.25) / 0.75), ss(pullFrac / 0.8));
};

// ---------- 一帧的全部覆盖量（只在 G < 0 时用） ----------
export type BackToTownState = { cam: fallChoreo.Cam; liYing: fallChoreo.LiYingState; liYingMouth?: Mouth; jiuhuMouth?: Mouth; jiuhu: fallChoreo.JiuhuState; compass: CompassState | null };
export const backToTown = (globalFrame: number): BackToTownState => {
  const t = toSegSec(globalFrame);
  const physSec = 物理时间(globalFrame);
  const cam = camera(t);
  const ly = fallChoreo.liYing(physSec); // 物理时间 < 0：坐在扫帚上（扫帚的矩阵、髋都不变），只换姿势
  const jh = fallChoreo.jiuhu(physSec);
  const segFrame = globalFrame - G0;
  const jiuhuMouth = mouthAt(lines, '九胡', segFrame, FPS);
  const bones = { ...jiuhuBones(t, globalFrame), ...(jiuhuMouth ? JIUHU_TALK_BONES : {}) };
  const pose = liyingPose(t);
  return {
    cam: cam,
    liYing: { ...ly, pose },
    liYingMouth: mouthAt(lines, '李樱', segFrame, FPS),
    jiuhuMouth,
    jiuhu: { ...jh, bones },
    compass: compass(t, bones),
  };
};
