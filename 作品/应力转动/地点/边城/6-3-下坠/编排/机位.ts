// 6-3-3～6-3-6 的机位：俯冲跟拍、城防各拍、举锤跟拍、砸穿后追进竖井落进古城。
import * as THREE from 'three';
import type { V3 } from '@engine/model/parts.tsx';
import { BORDER_TOWN } from '../../../边城轮廓.tsx';
import { borderTownPos } from '../../../主世界116.ts';
import { 城防, 撞击段内帧, 段表, 物理时间, 起点, yawVec } from '../时间线.ts';
import { ss, lerp, lerp3, add, sub } from './工具.ts';
import { groundZ, caveCeilingZ, ancientCityFloorZ } from './地面.ts';
import { liYing, liYingShaft, maceHeadPos } from './李樱.ts';
import { shaftCellCenter } from './坑口.ts';
import { guardPositions, GUARD_I, guardEye, aimPoint, guardFeet } from './卫兵.ts';
import { diveCam } from '../../6-3-2/转场.ts';

// ---------- 机位 ----------
export type Cam = { pos: V3; tgt: V3; lens: number; scope?: number };
const WG = 物理时间;
const camAbs = (c: Cam, o: number[]): Cam => ({ pos: add(c.pos, o), tgt: add(c.tgt, o), lens: c.lens });
const { fwd: broomFwd, right: broomRight } = yawVec(起点.broom.朝向);
const at = (o: V3, f: number, r: number, u: number): V3 => [o[0] + broomFwd[0] * f + broomRight[0] * r, o[1] + broomFwd[1] * f + broomRight[1] * r, o[2] + u];
const norm = (vec: number[]): V3 => {
  const len = Math.hypot(vec[0], vec[1], vec[2]) || 1;
  return [vec[0] / len, vec[1] / len, vec[2] / len];
};
// 看向某个方向：目标点放在 100 米外（方向插值时用方向，不用目标点，免得近处的目标点让镜头乱甩）
const withDir = (pos: V3, d: V3, lens: number): Cam => ({ pos, tgt: add(pos, [d[0] * 100, d[1] * 100, d[2] * 100]), lens });

// 6-3-3 俯冲：思索推近以后接上的镜头，相对他的髋不动，在他斜后上方，见 6-3-2/转场.ts 的 `diveCam`

// 6-3-4 城防（用户 10-13：先瞭望，听到声音回头，看到金光再拿望远镜细看）。几拍之间硬切（用户 10-13），世界和物理时间连续：
// ① 瞭望（`切墙`，段首帧）：从 6-3-3 俯冲硬切到北城墙走道里侧上方，焦距 20 斜着往西北看，慢慢西移；下坠的嘈杂到这里一下安静（声音.tsx 按距离听不见）；
// ② 回头（`察觉`）：同一镜头，4 号先回头，其余由近到远陆续回头；③ 见光（`回看`）：硬切到他们背后高处往下看背影，再顺着目光抬到天上，推到焦距 100，停 10 帧；
// ④ 举镜（`举镜`）：硬切到城里一侧仰看一排人举镜的中景；⑤ 镜中（`镜中`）：切进望远镜（原版镜筒遮罩），10 帧里焦距 330 拉到 1000，跟着卫兵视线追李樱，段末硬切 6-3-5。
const townOrigin = borderTownPos;
const NORTH = BORDER_TOWN.d / 2;
const WALK = BORDER_TOWN.h + 0.5; // 走道顶面（城的局部高度）
const town = (x: number, y: number, z: number): V3 => [townOrigin[0] + x, townOrigin[1] + y, townOrigin[2] + z];
// ①② 瞭望、回头：走道里沿外 1～2 米、比走道高 2.6 米，从 x 42.4 往西北慢慢挪到 41.4（回头时略推近），看向北偏西 20°；4 号在画面正中、离镜头 7 米，5 号从右边走进来停在右前方 5 米。
// 太靠东（x 46～54）时最近的是 5 号、先听见的 4 号反而不显眼，所以放在 x 42.4
const WIDE = { pos0: town(42.4, NORTH - 5.0, WALK + 2.7), pos1: town(41.4, NORTH - 4.2, WALK + 2.5), tgt0: town(37.0, NORTH + 10, WALK + 1.0), tgt1: town(37.4, NORTH + 10, WALK + 1.2), lens: 20 };
// ③ 见光：他们身后 5.5 米、比走道高 3.4 米，往下 15° 看 4 号和左右两三个人。再高的话仰着的脸像是转过来对着镜头
const HIGH = town(42.0, NORTH + 7.7, WALK + 3.4);
const rowTarget = town(38.8, NORTH + 2.0, WALK + 1.4);
// 镜头顺着目光抬到李樱身上，同时推到焦距 100（竖直视角 11.6°），他是画面正中一团金光（55 时只是小亮点）
const LENS_FIND = 100;
const LENS_WIDE = 18;
// 望远镜倍率放宽到焦距 1000（竖直视角 1.15°，用户 10-03）：原版缩到 1/10（焦距约 165）时他只占画面高一成，认不出头朝下举锤。他占画面高三分之一上下，遮罩照旧是原版的
const LENS_SCOPE = 1000;
// 切进望远镜的变焦：330 拉到 1000，10 帧（不照慢放算）
const SCOPE_IN = { startLens: 330, frames: 10 };
// 镜中瞄着李樱（脚到锤头）的正中：卫兵的 `aimPoint` 在髋往锤头 0.2 处，视角 1.15° 时偏差会让锤头贴到画面下沿，所以视线跟着变焦从卫兵视线挪到他正中
const scopeCenter = (physSec: number): V3 => {
  const ly = liYing(physSec);
  const feet = new THREE.Vector3(0, 0, 0).applyMatrix4(ly.matrix);
  return lerp3([feet.x, feet.y, feet.z], maceHeadPos(ly), 0.5);
};
const scopeViewDir = (G: number, eye: { pos: V3; dir: V3 }, k: number) => slerpDir(eye.dir, norm(sub(scopeCenter(WG(G)), eye.pos)), k);
// 两个方向之间按球面插值（转大角度时不从中间穿过去）
const slerpDir = (fromDir: V3, toDir: V3, k: number): V3 => {
  const va = new THREE.Vector3(...fromDir);
  const rot = new THREE.Quaternion().setFromUnitVectors(va, new THREE.Vector3(...toDir));
  const rotated = va.applyQuaternion(new THREE.Quaternion().slerp(rot, k));
  return [rotated.x, rotated.y, rotated.z];
};
// 焦距按对数插值（视角均匀地缩放）
const lensLerp = (a: number, b: number, k: number) => Math.exp(lerp(Math.log(a), Math.log(b), k));
// ④ 举镜：一排人的中景，不给单个卫兵特写（用户 10-19：「给这个人一个特写是何意味」）。镜头悬在走道里沿往城里 3.5 米、略高于走道，往北微仰看 2～5 号和停在走道上的巡逻那个，
// 他们朝南仰着头，陆续把望远镜举到眼前。巡逻的 5 号离镜头近，放在画面右边，不挡 4 号；整镜横着慢慢往西挪 1 米
const ROW = { pos0: town(37.5, NORTH - 6.5, WALK + 0.4), pos1: town(36.5, NORTH - 6.5, WALK + 0.4), tgt: town(39, NORTH + 2, WALK + 2.0), lens: 24 };
const cam634 = (globalFrame: number): Cam => {
  if (globalFrame < 城防.回看) {
    // ①② 开阔的中远景：整个瞭望、回头一个镜头，慢慢平移
    const k = ss((globalFrame - 城防.切墙) / (城防.回看 - 城防.切墙));
    const pos = lerp3(WIDE.pos0, WIDE.pos1, k);
    return withDir(pos, norm(sub(lerp3(WIDE.tgt0, WIDE.tgt1, k), pos)), WIDE.lens);
  }
  if (globalFrame < 城防.举镜) {
    // ③ 背后往下看一排仰着的头，前 1/5 停住，再顺着目光抬到天上的金光、推到 LENS_FIND，最后 1/4 停在金光上（看见了）
    const g0 = 城防.回看 + Math.round(0.2 * (城防.举镜 - 城防.回看));
    const g1 = 城防.举镜 - Math.round(0.25 * (城防.举镜 - 城防.回看));
    const k = ss((globalFrame - g0) / (g1 - g0));
    const viewDir = slerpDir(norm(sub(rowTarget, HIGH)), norm(sub(aimPoint(WG(globalFrame)), HIGH)), k);
    return withDir(HIGH, viewDir, lensLerp(LENS_WIDE, LENS_FIND, ss((globalFrame - g0 - 4) / (g1 - g0 - 2))));
  }
  if (globalFrame < 城防.镜中) {
    const k = ss((globalFrame - 城防.举镜) / (城防.镜中 - 1 - 城防.举镜));
    const pos = lerp3(ROW.pos0, ROW.pos1, k);
    return withDir(pos, norm(sub(lerp3(ROW.tgt, add(ROW.tgt, [-1, 0, 0]), k), pos)), ROW.lens);
  }
  const eye = guardEye(GUARD_I, globalFrame);
  // ⑤ 望远镜里：镜头就在他右眼上；切进来时遮罩已经在，焦距 10 帧里拉到放宽的望远镜倍率，视线同时挪到李樱正中
  const z = ss((globalFrame - 城防.镜中) / SCOPE_IN.frames);
  return { ...withDir(eye.pos, scopeViewDir(globalFrame, eye, z), lensLerp(SCOPE_IN.startLens, LENS_SCOPE, z)), scope: 1 };
};
// 镜头离卫兵的身子（脚上 0.2 到头顶 1.9 米那一段）不到 1 米就不画他：望远镜里镜头在他眼睛上
export const hiddenGuardIdx = (cam: number[]) => {
  for (let i = 0; i < guardPositions.length; i++) {
    const feet = guardFeet(i);
    const dz = Math.max(feet[2] + 0.2 - cam[2], 0, cam[2] - (feet[2] + 1.9));
    if (Math.hypot(cam[0] - feet[0], cam[1] - feet[1], dz) < 1) return i;
  }
  return -1;
};
// 6-3-5：从望远镜硬切到他左侧（垂直于抡锤的那个竖直面：锤头在他前方、头顶之间来回，见 李樱.ts 的 `STRIKE`），跟着往下掉，一直慢慢推近到砸地。
// 正侧面抡起、砸下的弧线在画面里整段看得清；锤在右手，从左边拍身子在压路机虚影前面，虚影不挡他（用户 10-19：「6-3-5 抡锤看不出来」）
const cam635Rel = (globalFrame: number): Cam => {
  const g0 = 段表['6-3-5'].起;
  const progress = ss((globalFrame - g0) / (段表['6-3-6'].起 + 撞击段内帧 - g0));
  const pos: V3 = lerp3(at([0, 0, 0], 0.5, -7, 0.6), at([0, 0, 0], 0.4, -5.6, 0.5), progress);
  return { pos, tgt: at([0, 0, 0], 0.5, 0, -0.6), lens: 28 };
};
const cam635 = (globalFrame: number): Cam => camAbs(cam635Rel(globalFrame), liYing(WG(globalFrame)).hip);
// 6-3-6：撞击前同 6-3-5；撞上后镜头先停在地面上方 5 米、6 帧挪到坑口正上方，再追进竖井（他上方 6 米，略偏心免得正对竖直往下），
// 打穿洞顶后跟进古城，在古城地面上方 16 米缓缓停住，看他砸地、翻身站起
const cam636 = (globalFrame: number): Cam => {
  const g6 = 段表['6-3-6'].起;
  const segFrame = globalFrame - g6;
  const shaft = liYingShaft();
  const ly = liYing(WG(globalFrame)).hip;
  if (segFrame <= 撞击段内帧) return camAbs(cam635Rel(globalFrame), ly);
  const center = shaftCellCenter();
  const start = camAbs(cam635Rel(g6 + 撞击段内帧), liYing(WG(g6 + 撞击段内帧)).hip);
  const kIn = ss((segFrame - 撞击段内帧) / 6);
  const hover = lerp(start.pos[2], groundZ + 5, kIn);
  const stopZ = ancientCityFloorZ + 16;
  const gap = lerp(18, 6, ss((segFrame - 撞击段内帧 - 6) / 18));
  // 往下追：取「悬在坑口」和「李樱上方 gap 米」里低的那个；快到停的高度时按指数贴近
  let zz = Math.min(hover, ly[2] + gap);
  const x = zz - stopZ;
  zz = stopZ + (x >= 6 ? x : 6 * Math.exp((x - 6) / 6));
  const off = 0.35;
  const pos: V3 = [lerp(start.pos[0], center[0] + off, kIn), lerp(start.pos[1], center[1] - off, kIn), zz];
  const look: V3 = [lerp(start.tgt[0], ly[0], kIn), lerp(start.tgt[1], ly[1], kIn), Math.min(ly[2], zz - 4)];
  const cam: Cam = { pos, tgt: look, lens: zz < caveCeilingZ ? 28 : lerp(start.lens, 22, kIn) };
  // 落地以后：镜头往东、往下退到离地 4 米（竖井这列往东几格从地面到洞顶都是空的），看点在他身上，往西斜着往下看他半蹲、起身、扭头。
  // 锤砸地前 0.05 秒就开始往下落、0.6 秒到位
  const k = ss((WG(globalFrame) - shaft.落地 + 0.05) / 0.6);
  if (k <= 0) return cam;
  const end: Cam = { pos: [center[0] + 4, center[1] - 0.5, ancientCityFloorZ + 4], tgt: [center[0] - 1, center[1], ancientCityFloorZ + 1.0], lens: 20 };
  // 砸地不震屏、不推焦（用户 10-18 嫌冲击镜头不好，全删）
  return { pos: lerp3(cam.pos, end.pos, k), tgt: lerp3(cam.tgt, end.tgt, k), lens: lerp(cam.lens, end.lens, k) };
};
export const camPose = (globalFrame: number): Cam => {
  if (globalFrame < 段表['6-3-4'].起) return diveCam(globalFrame);
  if (globalFrame < 段表['6-3-5'].起) return cam634(globalFrame);
  if (globalFrame < 段表['6-3-6'].起) return cam635(globalFrame);
  return cam636(globalFrame);
};
