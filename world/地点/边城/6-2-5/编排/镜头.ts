// 镜头：首帧贴在草束后面，起飞 14 帧追到后上方，之后追拍（拉近、俯冲绕上、进城转向城），悬停时在扫帚上方往下看城。
import { Key, sample } from '../../../../../engine/anim/anim.ts';
import type { V3 } from '../../../../../engine/model/parts.tsx';
import { WIDE_LENS, triangleSmooth } from '../../../../../engine/flight/飞行路径.ts';
import { BROOM } from '../../../../物品/扫帚.tsx';
import { ss, lerp, lerp3, norm } from './工具.ts';
import { townCenter } from './航线.ts';
import { beats } from './时间线.ts';
import { perturb } from './真实飞行.ts';
import { broom, routeYaw, type BroomState } from './扫帚.ts';

// ---------- 镜头 ----------
export type Cam = { pos: number[]; tgt: number[]; lens: number; roll?: number };
// 扫帚本地坐标 → 场景（先俯仰再朝向；首帧要贴在草束后面，不考虑横滚）
const local = (state: BroomState, localPt: number[]) => {
  const y = (state.朝向 * Math.PI) / 180;
  const pi = (state.俯仰 * Math.PI) / 180;
  const x1 = localPt[0];
  const y1 = localPt[1] * Math.cos(pi) - localPt[2] * Math.sin(pi);
  const z1 = localPt[1] * Math.sin(pi) + localPt[2] * Math.cos(pi);
  return [state.位置[0] + x1 * Math.cos(y) - y1 * Math.sin(y), state.位置[1] + x1 * Math.sin(y) + y1 * Math.cos(y), state.位置[2] + z1];
};
// 首帧镜头：草束尾端后面 0.14 格、稍高一点，顺着扫帚往前看（6-2-4 末帧）。草丝末端散到半高 0.3、半宽 0.5，这个距离上盖满 24mm 的画面
const TAIL = BROOM.tailY;
export const FIRST_CAM = (): Cam => {
  const state = broom(0);
  return { pos: local(state, [0, TAIL - 0.14, 0.04]), tgt: local(state, [0, TAIL + 6, 0.1]), lens: 24 };
};
// 追拍：往后 BACK、往上 UP（水平按朝向），视线落在前方 AHEAD、下方 DOWN；进城那段往扫帚右手边偏 SIDE、视线按 AIM 往城那边偏。
// 开头（同原来）：云海上方视线只略往下，34.1 起往下看云团，穿云以后拉平；
// 离地 80 米巡航（拉平到城墙前 1 秒，同一组值）：后 18、高 7，视线落在前方 90 米、下方 24 米，往下看约 16°，
//   地平线在离画面顶四分之一处（暮色是后 18、高 7、前 70、低 28，地平线离顶 15%；主世界远处有雪山、台地，城还要从山后露出来，地平线放低一点）；
// 城墙（急刹前 3 秒）起视线慢慢转向城，城从石山后面露出来时已经在画面里，扫帚和城一直都在画面里；急刹时镜头升到扫帚上方，
// 悬停时几乎在扫帚正上方往下看：扫帚在画面上半，整座城在画面下半，周围是给这个视锥让开的云壁（接 6-3-1）。
// 悬停的焦距从 33 换成 27：悬停降到离地 1300 米以后城的南北两墙在镜头里差 17°，33mm 的半个画面只有 17°，城放不进下半个画面；
// 27mm 时城占画面 0.52～0.94（高）、0.36～0.64（宽），面积约是原来（2090 米、33mm）的 1.7 倍，扫帚在 0.40
const cruiseEnd = beats.townWall - 24; // 巡航机位保持到这一帧，再过渡到进城的机位
// 俯冲（34.1）机位后 17、高 9.2：仰角 28°，离人和巡航一样约 19.3 米（推近以后 6.6 米），起飞到巡航一路不远不近（退到后 26、高 14 的话人先变小再变大）。
const BACK: Key[] = [[14, 16], [beats.dive, 17], [beats.cloudPierce, 18], [beats.levelOff, 18], [cruiseEnd, 18], [beats.townWall, 15], [beats.decelStart, 14], [beats.hardBrake, 13], [beats.hardBrake + 14, 10], [beats.stopFrame, 7], [beats.lastFrame, 7]];
const UP: Key[] = [[14, 9], [beats.dive, 9.2], [beats.cloudPierce, 9], [beats.levelOff, 7], [cruiseEnd, 7], [beats.townWall, 6], [beats.decelStart, 8], [beats.hardBrake, 11], [beats.hardBrake + 14, 15], [beats.stopFrame, 19], [beats.lastFrame, 20]];
const SIDE: Key[] = [[beats.townWall - 40, 0], [beats.townWall, 7], [beats.decelStart, 7], [beats.hardBrake, 6], [beats.stopFrame, 0]];
const AHEAD: Key[] = [[14, 80], [45, 150], [beats.dive, 200], [beats.cloudPierce, 60], [beats.levelOff, 90], [cruiseEnd, 90], [beats.townWall, 150]];
const DOWN: Key[] = [[14, 30], [45, 45], [beats.dive, 120], [beats.cloudPierce, 60], [beats.levelOff, 24], [cruiseEnd, 24], [beats.townWall, 18]];
const AIM: Key[] = [[beats.townWall - 10, 0.35], [beats.decelStart, 0.45], [beats.hardBrake, 0.5], [beats.stopFrame, 0.36]];
// 第三人称追拍（用户 10-14 比过第一人称，第三人称效果好）
const LENS: Key[] = [[0, 24], [12, 18], [beats.dive, 16], [beats.levelOff, 18], [beats.townWall, 18], [beats.hardBrake, 20], [beats.stopFrame, 27], [beats.lastFrame, 27]];
const TOWN_AIM: V3 = [townCenter[0], townCenter[1] - 40, townCenter[2]]; // 城的视觉中心（城中心略往南：北墙一侧离镜头近、在画面下沿）
// 拉近（用户 10-06 嫌画面中的人太小，在巡航的一帧上画框：人连扫帚从约画高 14% 放到约 44%，位置不变）：
// 上面 BACK、UP、AHEAD、DOWN、AIM 照旧算出机位和视线，再把机位沿「镜头 → 骑手中心」连线推近到原距离的 拉近 倍，视线方向不动：
// 骑手在画面上的位置不变、人按距离反比放大，地平线和远景构图不变，离地物顶面仍约 80 米、近处地面看得见。
// 不靠缩窄焦距：用户嫌过「下面几乎都看不清」，视角一窄下面看得更少。
// 0.34 的取法：用户画的框比人多留了边，按「人连扫帚的外接框高度 ≈ 原来 3 倍」取；近的那头放大得多，所以不是 1/3。
// 起飞：33.1 停在原地 3 帧后 14 帧追到拉近后的机位（见 camera），俯冲、穿云、拉平、巡航一路都是这个距离。
// 进城：巡航尾（城墙前 1 秒）起用 4 秒拉回原距离，到急刹那一帧正好是 1，急刹、悬停和原来逐字段一样（第 3 场从末帧接）；拉回、视线转向城叠在一起，是一个往后退、把城让出来的镜头。
const pullInRatio = 0.34;
const pullIn: Key[] = [[0, pullInRatio], [cruiseEnd, pullInRatio], [beats.hardBrake, 1]];
// 高速广角（见 lib/飞行路径.ts 的 WIDE_LENS）：按扫帚速度，每秒 200 米以下不变、800 米以上全用（起飞加速、俯冲、巡航是广角，急刹到悬停退回原焦距）
const wideWeight = (speed: number) => ss((speed - 200) / 600);
// 骑手中心：扫帚杆中心往上 0.2 格（扫帚本地坐标）。推近时离镜头近的扫帚尾、腿放大得多，外接框会往下长；
// 支点取 0.2，外接框中心才和原来一样在画高 56% 上下（取 0.45 往下移 2%，取 0 往上移 2%）
const riderCenter = (b: BroomState) => local(b, [0, 0, 0.2]);
// 俯冲时镜头绕到人上方（用户 10-06 要求裙底不能露出来）：扫帚扎到 58° 时，后上方 28° 的镜头在九胡坐的面以下 30°，会从后下方看进裙子。
// 镜头连视线一起绕骑手中心（水平右手轴，不横滚）往上转 俯冲绕上(G) 度：扎得比 俯冲留量 深多少就转多少，镜头始终在坐的面以上 10° 以上；
// 人在画面上的位置、大小不变，穿云拉起后转回巡航角度，拉平时为 0。
// 软化（softplus，3°）+ 前后 24 帧三角平滑，镜头提前慢慢跟上去，不是一下子掀起来（8 帧的话视线角速度最大 80°/秒，24 帧 59°/秒）。平滑会削掉一点转角，所以留量取 10
const diveMargin = 10; // 度：镜头离骑手的仰角约 28°，扫帚扎得比 10° 深多少，镜头就绕上去多少
const diveOrbitUp = (globalFrame: number) => {
  if (globalFrame >= beats.levelOff || globalFrame <= 14) return 0;
  const soft = (x: number) => 3 * Math.log1p(Math.exp(x / 3));
  return triangleSmooth((g) => soft(-broom(g).俯仰 - diveMargin), globalFrame, 24) * (1 - ss((globalFrame - (beats.levelOff - 20)) / 20));
};
const cross3 = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// 绕水平轴 a（单位向量）转 θ 弧度（Rodrigues）
const rotateAbout = (vec: number[], axis: number[], θ: number) => {
  const [cos, sin] = [Math.cos(θ), Math.sin(θ)];
  const x = cross3(axis, vec);
  const dot = axis[0] * vec[0] + axis[1] * vec[1] + axis[2] * vec[2];
  return vec.map((vi, i) => vi * cos + x[i] * sin + axis[i] * dot * (1 - cos));
};
// 真实飞行（见 真实飞行.ts）：只剩慢的大弯，镜头位置钉在扫帚后上方。
// 视线用 真实飞行 的弹簧跟随（临界阻尼、ω 2.5，半衰期约 0.67 秒）：水平方向 = 航线朝向 + 镜头.航向，也就是扫帚的朝向 + 镜头.相对航向，
// 视线比扫帚慢半拍，扫帚在画面里左右漂一两度；竖直方向加 镜头.俯仰（原来的视线只按 DOWN 往下看、不跟航线俯仰，所以加的是跟随后的扰动俯仰本身）。
// 镜头不横滚（用户 2026-10-01 嫌翻滚晕），地平线保持水平
const chase = (globalFrame: number): Cam => {
  const state = broom(globalFrame);
  const pert = perturb.at(globalFrame);
  // 航线自己的转弯照原来晚 5 帧跟（摆位、视线都是）；扰动的那一份：摆位按扫帚当前的航向扰动放在它正后方，视线按弹簧跟随后的
  const baseYaw = routeYaw(Math.max(0, globalFrame - 5));
  const yaw = ((baseYaw + pert.航向) * Math.PI) / 180;
  const fwd = [-Math.sin(yaw), Math.cos(yaw)];
  const lookYaw = ((baseYaw + pert.镜头.航向) * Math.PI) / 180;
  const fwdV = [-Math.sin(lookYaw), Math.cos(lookYaw)];
  const back = sample(BACK, globalFrame);
  const up = sample(UP, globalFrame);
  const side = sample(SIDE, globalFrame); // 往扫帚右手边偏（右 = 朝向往右转 90°）
  const pos = [state.位置[0] - fwd[0] * back + fwd[1] * side, state.位置[1] - fwd[1] * back - fwd[0] * side, state.位置[2] + up];
  const ahead = sample(AHEAD, globalFrame);
  const run = [state.位置[0] + fwdV[0] * ahead, state.位置[1] + fwdV[1] * ahead, state.位置[2] - sample(DOWN, globalFrame)];
  // 往城看：镜头到扫帚、镜头到城两个方向按 AIM 混合
  const uRun = norm([run[0] - pos[0], run[1] - pos[1], run[2] - pos[2]]);
  const uB = norm([state.位置[0] - pos[0], state.位置[1] - pos[1], state.位置[2] - pos[2]]);
  const uT = norm([TOWN_AIM[0] - pos[0], TOWN_AIM[1] - pos[1], TOWN_AIM[2] - pos[2]]);
  const aimWeight = ss((globalFrame - (beats.townWall - 10)) / (beats.decelStart - beats.townWall + 10));
  const dir0 = norm(lerp3(uRun, norm(lerp3(uB, uT, sample(AIM, globalFrame))), aimWeight));
  const elevation = Math.asin(Math.max(-1, Math.min(1, dir0[2]))) + (pert.镜头.俯仰 * Math.PI) / 180;
  const horizLen = Math.hypot(dir0[0], dir0[1]) || 1;
  const dir = pert.镜头.俯仰 === 0 ? dir0 : [(dir0[0] / horizLen) * Math.cos(elevation), (dir0[1] / horizLen) * Math.cos(elevation), Math.sin(elevation)];
  // 视线按原来的机位算好，机位再往骑手推近（见上面「拉近」），俯冲时再连视线一起绕到上方（见上面「俯冲绕上」）
  const k = sample(pullIn, globalFrame);
  const riderPt = riderCenter(state);
  let camPos = k === 1 ? pos : pos.map((v, i) => riderPt[i] + (v - riderPt[i]) * k);
  let viewDir = dir;
  const orbitDeg = diveOrbitUp(globalFrame);
  if (orbitDeg > 0) {
    const right = norm(cross3(dir, [0, 0, 1]));
    const θ = (-orbitDeg * Math.PI) / 180; // 绕右手轴转负角：视线往下压，镜头往上走
    const offset = rotateAbout(camPos.map((v, i) => v - riderPt[i]), right, θ);
    camPos = offset.map((v, i) => riderPt[i] + v);
    viewDir = rotateAbout(dir, right, θ);
  }
  const lens = sample(LENS, globalFrame);
  const wideLens = lens > WIDE_LENS ? Math.exp(lerp(Math.log(lens), Math.log(WIDE_LENS), wideWeight(state.速度))) : lens;
  camPos = camPos.map((v, i) => riderPt[i] + (v - riderPt[i]) * (wideLens / lens));
  return { pos: camPos, tgt: [camPos[0] + viewDir[0] * 100, camPos[1] + viewDir[1] * 100, camPos[2] + viewDir[2] * 100], lens: wideLens };
};
export const camera = (globalFrame: number): Cam => {
  const first = FIRST_CAM();
  if (globalFrame <= 0) return first;
  // 33.1 起：镜头先停在原地 3 帧（草束往下抽走，露出天空和两人的背影），然后 14 帧内追到后上方的近机位。
  // 追的时候按「镜头相对骑手中心」插值：第 3 帧的相对位置（离骑手 2.4 米）→ 追拍机位的相对位置（6 米），方向球面插值、距离等比插值，离人一路只涨不会更远。
  // 按世界坐标插值的话，镜头起点钉在原地，扫帚 14 帧里冲出去 90 米，第 11 帧离人 17 米再追回 6 米（用户 10-06 嫌 0～30 帧镜头远了再拉回来）。
  // 视线按方向插值、不按目标点插值：首帧目标点在镜头前 6 米向上 55° 看，追拍目标点在 100 米外往下看，直接插值第 3～6 帧视线会从仰望天空甩到俯视地面，
  // 两人从画面下沿出去、有六七帧只有天。所以第 2～6 帧先把视线转到两人身上，再随镜头转成追拍的视线
  const k = ss((globalFrame - 3) / 14);
  if (k >= 1) return chase(globalFrame);
  const chaseCam = chase(globalFrame);
  const state = broom(globalFrame);
  let pos = first.pos;
  if (k > 0) {
    const o0 = first.pos.map((v, i) => v - riderCenter(broom(3))[i]);
    const bc = riderCenter(state);
    const o1 = chaseCam.pos.map((v, i) => v - bc[i]);
    const [l0, l1] = [Math.hypot(...o0), Math.hypot(...o1)];
    const [u0, u1] = [o0.map((v) => v / l0), o1.map((v) => v / l1)];
    const θ = Math.acos(Math.max(-1, Math.min(1, u0[0] * u1[0] + u0[1] * u1[1] + u0[2] * u1[2])));
    const slerped = θ < 1e-6 ? u1 : u0.map((v, i) => (Math.sin((1 - k) * θ) * v + Math.sin(k * θ) * u1[i]) / Math.sin(θ));
    // 距离用先快后慢的二次（1 − (1 − t)²）：停住的 3 帧里两人正离开镜头，ss 在第 3 帧速度一下掉到 0，两人在画面里先一顿；二次的起始斜率接得上。
    // 三次（起始斜率更陡）距离收得太早，视线还在转，两人的头离镜头在第 13 帧前后先到 5.5 米再回 5.4 米，又是一点「远了再拉回来」
    const t = (globalFrame - 3) / 14;
    const kl = 1 - (1 - t) ** 2;
    const dist = l0 ** (1 - kl) * l1 ** kl;
    pos = bc.map((v, i) => v + slerped[i] * dist);
  }
  const d0 = norm(first.tgt.map((v, i) => v - first.pos[i]));
  const dB = norm([state.位置[0] - pos[0], state.位置[1] - pos[1], state.位置[2] + 0.8 - pos[2]]);
  const d1 = norm(chaseCam.tgt.map((v, i) => v - chaseCam.pos[i]));
  const viewDir = globalFrame < 6 ? norm(lerp3(d0, dB, ss((globalFrame - 2) / 4))) : norm(lerp3(dB, d1, ss((globalFrame - 6) / 11)));
  return { pos, tgt: pos.map((v, i) => v + viewDir[i] * 100), lens: lerp(first.lens, chaseCam.lens, k) };
};
