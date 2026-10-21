// 6-3-2 思索开头：扫帚上的戏和镜头（编排，纯函数）。6-3 下坠共用时间线上 6-3-1 和 6-3-3 之间的窗口（负的全局帧，见 6-3-下坠/时间线.ts 的 `段表`），
// 画面是 6-3-下坠/画面.tsx 画的世界（悬停的扫帚、两个人、云和城），思索界面叠在上面（思索.tsx）。
// 思索的底色不透明（用户 10-19），界面淡入的 `uiOpen` 秒以后扫帚这边就看不见了，所以这里只排开头：接 6-3-1 末帧的机位和姿势，
//   镜头往右前方两人中景推，李樱回头看九胡、九胡仰脸，界面在推的途中淡入盖住。之后两人停在这个样子，不再演（台词由思索里的李樱配音）。
import * as THREE from 'three';
import { track } from '../../../../engine/anim/anim.ts';
import type { V3 } from '../../../../engine/model/parts.tsx';
import { broomMatrix } from '../../../../world/角色/骑扫帚.tsx';
import { backToTown, type BackToTownState } from '../6-3-1/编排.ts';
import * as choreo from '../../../../world/地点/边城/6-3-下坠/编排.ts';
import { 段表, 物理时间, 起点 } from '../../../../world/地点/边城/6-3-下坠/时间线.ts';
import { FPS } from '../../../../world/地点/边城/6-3-2/台词.ts';

const ss = (x: number) => {
  const clamped = Math.min(1, Math.max(0, x));
  return clamped * clamped * (3 - 2 * clamped);
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const v3 = (v: THREE.Vector3): V3 => [v.x, v.y, v.z];
const D2R = Math.PI / 180;

const G0 = 段表['6-3-2'].起;
const sec = (G: number) => (G - G0) / FPS;

// ---------- 时刻（段内秒数） ----------
const cues632 = {
  pushIn: [0, 2.2] as const, // 镜头从 6-3-1 末帧推到两人中景（界面 0.75 秒淡入，看得见的是前一段）
  glanceBack: [0.35, 1.1] as const, // 李樱回头看九胡
};

// ---------- 扫帚本地坐标（悬停，不动） ----------
const broom = 起点.broom;
const BM = broomMatrix(broom.位置, broom.朝向, broom.俯仰, broom.横滚);
const toWorld = (p: number[]): V3 => v3(new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(BM));

// ---------- 李樱 ----------
// 头的增量（相对默认骑乘姿势；往右转为负）。九胡坐在他正后方，回头要往右转约 30°、连胸口拧一点
const LY_YAW: [number, number][] = [[cues632.glanceBack[0], 0], [cues632.glanceBack[1], -32]];
const LY_TWIST: [number, number][] = [[cues632.glanceBack[0], 0], [cues632.glanceBack[1], -10]];
const LY_PITCH: [number, number][] = [[cues632.glanceBack[0], 0], [cues632.glanceBack[1], 4]];

// ---------- 九胡（抱着他的腰，仰脸看他） ----------
const JH_LOOKUP: [number, number][] = [[0.9, 0], [1.6, 12]];

// ---------- 机位 ----------
// 推近照 6-3-1 的做法：绕两人中间的一点走，按方位角、仰角、距离（对数）分开插值，镜头在高处几乎朝正下方看时先降下来再绕（不然整个画面跟着打转，用户嫌头晕）。
const PIVOT = new THREE.Vector3(...toWorld([0.05, 0, 0.8]));
type SphCoord = { d: number; el: number; az: number; aim: THREE.Vector3 };
const sph = (cam: choreo.Cam): SphCoord => {
  const offset = new THREE.Vector3(...cam.pos).sub(PIVOT);
  const dist = offset.length();
  const look = new THREE.Vector3(cam.tgt[0] - cam.pos[0], cam.tgt[1] - cam.pos[1], cam.tgt[2] - cam.pos[2]).normalize();
  return { d: dist, el: Math.asin(offset.z / dist), az: Math.atan2(offset.y, offset.x), aim: new THREE.Vector3(...cam.pos).addScaledVector(look, dist) };
};
const camBetween = (camA: choreo.Cam, camB: choreo.Cam, k: number, ka: number): choreo.Cam => {
  const sphA = sph(camA);
  const Bs = sph(camB);
  let da = Bs.az - sphA.az;
  da -= 2 * Math.PI * Math.round(da / (2 * Math.PI));
  const dist = Math.exp(lerp(Math.log(sphA.d), Math.log(Bs.d), k));
  const el = lerp(sphA.el, Bs.el, k);
  const az = sphA.az + da * ka;
  const pos = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)).multiplyScalar(dist).add(PIVOT);
  const aim = sphA.aim.clone().lerp(Bs.aim, k);
  const dir = aim.sub(pos).normalize();
  return { pos: v3(pos), tgt: v3(pos.clone().addScaledVector(dir, 100)), lens: lerp(camA.lens, camB.lens, k) };
};
// 两人中景：镜头在扫帚右前方，先对着两人，再往右偏 20°、往上抬 2°（给界面的场景板让出画面正中）
const mediumShot = (offRight: number, offFwd: number, offUp: number, lens: number): choreo.Cam => {
  const pos = new THREE.Vector3(...toWorld([offRight, offFwd, offUp]));
  const pairCenter = new THREE.Vector3(...toWorld([0, 0.1, 0.95]));
  const dir = pairCenter.sub(pos).normalize();
  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 0, 1)).normalize();
  const yawOff = 20 * D2R;
  const pitchOff = -2 * D2R;
  const d1 = dir.clone().multiplyScalar(Math.cos(yawOff)).addScaledVector(right, Math.sin(yawOff)).normalize();
  const up = new THREE.Vector3().crossVectors(right, d1).normalize();
  const d2 = d1.multiplyScalar(Math.cos(pitchOff)).addScaledVector(up, Math.sin(pitchOff)).normalize();
  return { pos: v3(pos), tgt: v3(pos.clone().addScaledVector(d2, 100)), lens };
};
const MID = mediumShot(6.2, 5.0, 2.4, 28);
// 段首：6-3-1 末帧的机位（现在是悬停机位）
let startCam: choreo.Cam | null = null;
const camera = (t: number): choreo.Cam => {
  startCam ??= backToTown(段表['6-3-1'].止).cam;
  const pushFrac = Math.min(1, t / cues632.pushIn[1]);
  return camBetween(startCam, MID, ss(pushFrac / 0.75), ss((pushFrac - 0.2) / 0.8));
};

// ---------- 一帧的全部覆盖量（只在 6-3-2 的帧上用，类型同 6-3-1） ----------
export const onBroomState = (globalFrame: number): BackToTownState => {
  const t = sec(globalFrame);
  const physSec = 物理时间(globalFrame); // 负的：两人坐在扫帚上（扫帚的矩阵、髋都不变），只换头的姿势
  const ly = choreo.liYing(physSec);
  const jh = choreo.jiuhu(physSec);
  const pose = { ...ly.pose, loc: [...ly.pose.loc] as V3 };
  pose.headYaw += track(LY_YAW, t);
  pose.headPitch += track(LY_PITCH, t);
  pose.twist = (pose.twist ?? 0) + track(LY_TWIST, t);
  // 九胡的头：jiuhuRideBones 里 Head 的 x = −前倾×0.7 − 抬头，这里在默认的骨骼上再减去抬头的增量（尾巴、手、腿都照默认）
  const head = jh.bones.Head?.rot ?? [0, 0, 0];
  const bones = { ...jh.bones, Head: { ...jh.bones.Head, rot: [head[0] - track(JH_LOOKUP, t), head[1], head[2]] } };
  return { cam: camera(t), liYing: { ...ly, pose }, jiuhu: { ...jh, bones }, compass: null }; // 指南针挂在九胡右手上（6-3-下坠/画面.tsx）
};
