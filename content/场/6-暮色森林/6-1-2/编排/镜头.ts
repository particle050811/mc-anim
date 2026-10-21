// 6-1-2 各镜头的机位：1 身后跟拍助跑起跳、2 侧拍迅冲、2c 横穿俯拍、2b 庭院中心、3 迷宫里的九胡（6-1-3 镜头 1 接着用 mazeCam）。
import { Key, VKey, rad, sample, sampleV } from '../../../../../engine/anim/anim.ts';
import type { V3 } from '../../../../../engine/model/parts.tsx';
import { S2, S2C, S2B, S3, ss, lerp3, lanePt, laneZ, GO } from './时间轴.ts';
import { TAKEOFF, DASH0, CUT_X, DASH_Y, lyL, lyLoc } from './李樱.ts';
import { mazeAt, mazeDist } from './九胡.ts';

// ---------- 镜头 ----------
type Cam = { lens: number; pos: number[]; tgt: number[] };
// 镜头 1（f1–91）：身后跟拍。开头机位抬高退到传送门后面，低头看刚落地的二人和紫光传送门、花圈；一起跑时压到贴地广角。李樱蹬出去后镜头先被拉开、九胡被甩出画外，追上后稳在身后。
// 起跳（f84–91）见 cam1。（机位在他上方往下看会像在地上跑过水沟，所以一直在他下方仰拍）
const CAM1_GAP: Key[] = [[1, 9.5], [GO, 9.5], [14, 8.6], [18, 7], [23, 5.4], [28, 3.4], [TAKEOFF, 3.4]];
const CAM1_LENS: Key[] = [[1, 24], [GO, 24], [18, 16], [TAKEOFF, 16], [88, 20], [S2, 20]]; // 起跑后拉到 16mm 超广角：两边的树飞快掠过
const CAM1_H: Key[] = [[1, 5.5], [GO, 5.5], [20, 1.45], [TAKEOFF, 1.45]];
const CAM1_AIM: Key[] = [[1, 0.3], [GO, 0.3], [20, 1.0], [TAKEOFF, 1.0]];
const CAM1_LEAD: Key[] = [[1, -1.2], [GO, -1.2], [20, 7], [TAKEOFF, 7]]; // 视线落点在人前方几格：开头落在人和身后的传送门之间
// 机位、视线高度按前后 6 格地面平均：直道有一格台阶，贴地走镜头会猛颠（审片以为是接缝）
const laneZs = (laneDist: number) => {
  let z = 0;
  for (let k = -6; k <= 6; k++) z += laneZ(laneDist + k) / 13;
  return z;
};
const cam1 = (frame: number): Cam => {
  const lens = sample(CAM1_LENS, frame);
  const laneDist = lyL(frame);
  const Lc = laneDist + sample(CAM1_GAP, frame);
  const follow = { pos: [...lanePt(Lc, 1.0), laneZs(Lc) + sample(CAM1_H, frame)], tgt: [...lanePt(laneDist - sample(CAM1_LEAD, frame), 0.2), laneZs(laneDist) + sample(CAM1_AIM, frame)] };
  if (frame < TAKEOFF) return { lens, ...follow };
  // 起跳：机位在起跳点身后（树冠已清空）跟他升到他高度八成，在下方仰拍；视线压到他下方 14°，水沟对岸树梢留在画面下沿当参照。
  // 视线 2 帧内转到他身上：转慢人会出画面上沿。
  const k = ss((frame - (TAKEOFF - 1)) / 2);
  const ly = lyLoc(frame);
  const pos = [follow.pos[0], follow.pos[1], follow.pos[2] + Math.max(0, ly[2] - laneZ(8)) * 0.78];
  const onHim = [ly[0], ly[1], ly[2] + 0.9];
  const horiz = Math.hypot(onHim[0] - pos[0], onHim[1] - pos[1]);
  const elev = Math.atan2(onHim[2] - pos[2], horiz);
  const aim = [onHim[0], onHim[1], pos[2] + horiz * Math.tan(elev - rad(14) * k)];
  return { lens, pos, tgt: lerp3(follow.tgt, aim, k) };
};
// 镜头 2（f92–112）：侧面跟拍，机位在他南边、比他高，俯看（仰拍只有天和一个人，看不出空间；用户 10-01）。已有结论：墙外顺冲刺方向拍看不出横向距离 → 从南边侧拍；
// 机位跑到他前面或几帧急升急转会让他先退后冲 → 机位只超前 1 格，横穿那下用硬切另一镜头。
// 滞空（f92–98）：机位南 12 格、高 8.6 格；迅冲（f98–112）：南 13 格、比他高 8 格、超前 1 格，跟着往东往下（最低离地 26 格，高过树冠、墙和树篱）。
const CAM2_HOVER = [-86, -13, 45];
const CAM2_ABOVE = 8;
const CAM2_LENS: Key[] = [[S2, 32], [DASH0, 32], [104, 26], [S2C, 24]];
const cam2 = (frame: number): Cam => {
  const lens = sample(CAM2_LENS, frame);
  const ly = lyLoc(Math.max(S2, frame - 0.6)); // 视线落后 0.6 帧：甩镜头追不上人，人在画面里往前冲
  const onHim = [ly[0], ly[1], ly[2] + 0.9];
  if (frame <= DASH0) return { lens, pos: CAM2_HOVER, tgt: onHim };
  const follow = [ly[0] + 1, -14, ly[2] + CAM2_ABOVE];
  return { lens, pos: lerp3(CAM2_HOVER, follow, ss((frame - DASH0) / 3)), tgt: onHim };
};
// 镜头 2c（f113–121）：横穿点西南上方 21 格固定俯拍（平视会被娜迦头脖挡住横穿那下）；他 f113–116 从左上冲进来，f117 穿脖子，f118–121 从右滑出，再切 2b
const CAM2C_POS = [-7, -12, 21];
const CROSS: V3 = [CUT_X - 0.5, DASH_Y, 0.5];
const cam2c = (): Cam => ({ lens: 24, pos: CAM2C_POS, tgt: CROSS });
// 镜头 2b（f122–211）：庭院中心，机位东北偏东、离地 6～6.5 格：李樱急停面朝镜头收刀，南北向的娜迦横在画面里，断开时前半截往右（北）窜、后半截留左。
// 别处不行：东南看两截重叠、东南偏东有近景树叶团；东北偏东一侧树篱在画外。
const CAM2B = {
  pos: [[S2B, [13, 3.5, 6.5]], [147, [12.8, 3.4, 6.4]], [175, [12.6, 3.2, 6.2]], [S3 - 1, [12.3, 3, 6]]] as VKey[],
  tgt: [[S2B, [1, DASH_Y, 1.0]], [147, [0.4, DASH_Y, 1.1]], [175, [0, DASH_Y, 1.0]], [S3 - 1, [1.8, DASH_Y, 1.2]]] as VKey[],
};
const cam2b = (f: number): Cam => ({ lens: 20, pos: sampleV(CAM2B.pos, f), tgt: sampleV(CAM2B.tgt, f) });
// 镜头 3（f212–243）：迷宫里，九胡刚被传送到通道西头，背后贴 6 格高树篱。开头机位在她东边 8 格、高 5 格迎面看（一眼是迷宫），她朝镜头跑来时机位升起转到后上方（7.5 格、高 8.5 格）顺通道往东看，尽头是李樱。
// 快到时视线挪到两人中间。6-1-3 镜头 1 接着这个函数（第 0 帧 = 本段末帧）。从她身后拍不行：她离树篱只有 1 格多，镜头得几乎垂直往下看。
const LY_SPOT: V3 = [2.6, -0.8, 1.0];
const CAM3_FRONT: V3 = [-12, -5.8, 5];
export const mazeCam = (t: number): Cam => {
  const at = (u: number) => mazeAt(mazeDist(u));
  const [x, y] = at(t - 3);
  const [x1, y1] = at(t - 15);
  let hx = x - x1;
  let hy = y - y1;
  const headingLen = Math.hypot(hx, hy);
  if (headingLen < 0.3) {
    hx = 1;
    hy = 0;
  } else {
    hx /= headingLen;
    hy /= headingLen;
  }
  const [px, py] = at(t);
  const follow = [x - hx * 7.5, y - hy * 7.5, 8.5];
  const ahead = [px + hx * 8, py + hy * 8, 0.6];
  const near = ss((9 - Math.hypot(px - LY_SPOT[0], py - LY_SPOT[1])) / 6);
  const mid = [(px + LY_SPOT[0]) / 2, (py + LY_SPOT[1]) / 2, 1.0];
  // 迎面 → 后上方：她跑近（t 12 起）后 18 帧转过去，从她左手边（北，水池一侧）绕过，不翻过头顶；视线晚几帧才挪到前方（一起挪她有几帧只剩半个头）
  const k = ss((t - 12) / 18);
  const swing = Math.sin(Math.PI * k);
  const pos = lerp3(CAM3_FRONT, follow, k);
  pos[1] += 3.5 * swing;
  pos[2] += 1 * swing;
  const kt = ss((t - 18) / 16);
  return { lens: 24, pos, tgt: lerp3([px, py, 1.0], lerp3(ahead, mid, near), kt) };
};

export const camera = (f: number): Cam =>
  f < S2 ? cam1(f) : f < S2C ? cam2(f) : f < S2B ? cam2c() : f < S3 ? cam2b(f) : mazeCam(f - S3);
