// 亚波伦的演出：正片的段按「几秒到几秒做什么」排她的姿势（现身站立、起飞、悬停持杖、举杖指向目标、开盘、收盘、落地、第 4 幕出手前的回拉、收缩前的蓄势），加上每次出手的小幅抖杖。
// 姿势都是本片自己摆的（包里没有施法、举杖的动作，见 ../说明.md），没经用户看过；身子的底子是包里的 idle 和 fly（按「飞」的权重混）。
// 用法：模块里建一次 定演出({...})，画面里 演.在(秒) 拿到 <娘化亚波伦> 的属性，演.杖(秒) 拿到杖尖位姿（给 界面/杖尖轮盘.tsx 和法术的出手点）。
// 结果只看时间：姿势按关键帧表插值，指向目标的右臂每帧用 瞄杖 解一次（身子在 fly 里晃，杖尖照样指着目标）。
import { lerp, smoothstep01 } from '@engine/core/数学.ts';
import type { V3 } from '@engine/model/parts.tsx';
import type { BonePose } from '@engine/model/基岩模型.tsx';
import { animSkeletonTable, defineAct, holdWandPose, raisedPose, aimStaff, type YaBoLunAct, type WandPose } from '../娘化亚波伦.tsx';

export type PoseName = '站立' | '起飞' | '悬停' | '指向' | '开盘' | '收盘' | '落地' | '蓄势' | '回拉' | DodgePoseName;
/** 第 1、2 幕的动作（用户 11-10 要她现身就做动作、张盘前「只躲不还手」地躲史蒂夫的追砍）：现身低头、甩杖，和几种躲法 */
export type DodgePoseName = '低头' | '甩杖' | '后仰闪' | '侧飞' | '贴地滑' | '瞬移收' | '升空' | '飞行' | '升指';

type HandPose = Readonly<Record<string, BonePose>>;
export type PoseDef = {
  /** 身子的底子：0 = idle（站着），1 = fly（前倾侧身、蜘蛛腿扇、身后出缺口环），中间按权重混 */
  fly: number;
  /** 是不是浮在空中：1 = 位置上叠一层缓慢的起伏（见 浮动），0 = 踩在地上不动；两个姿势之间按过渡插 */
  hover: 0 | 1;
  /** 盖在动画上的骨骼转角；右臂三根（RightArm、RightForeArm、RightHand）都要写，杖才握得住 */
  手: HandPose;
  /** 杖身朝哪：目标 = 杖尖指着演出的 目标；上 = 竖起来。给了就用 瞄杖 改右肩，手 里的右臂只当起点 */
  staffFacing?: '目标' | '上';
};

// 右臂往前伸、杖从手里朝前指出去的起点（封面六稿的「前指」：肘微弯，手腕以绕小臂长轴转为主，杖从手的侧面穿过）；指哪由 瞄杖 解右肩
// 施法时把上身扶正一些：fly 原样是 UpBody [−5, −60, −43]（往右倒 43 度、拧 60 度），照它指向目标的话人是横躺着的、脸背着目标。
// 这里只留一点侧身；腿、蜘蛛腿、身后的缺口环照 fly。左臂从胸前放下来摊在身侧（封面六稿的左臂）
// 用户 11-10 定：正片里她站着飞，不用 fly 那个侧倒在缺口环（弯月）上的坐姿（「他可以站着飞呀」）。所以空中的姿势底子都是 idle（飞 = 0），上身不用再扶正
const uprightPose: HandPose = { LeftArm: { rot: [20, 0, -35] }, LeftForeArm: { rot: [-25, 0, 0] } };
const reachForward: HandPose = { ...uprightPose, RightArm: { rot: [-61, 25, -1.25] }, RightForeArm: { rot: [-22, 0, 0] }, RightHand: { rot: [33, -90, 0] } };
// 开盘那一下：肘伸直（杖往前送约 0.15 格），左臂往外后方甩开，头抬一点
const sendOutPose: HandPose = { ...reachForward, RightForeArm: { rot: [-3.75, 0, 0] }, LeftArm: { rot: [25, 0, -70] }, LeftForeArm: { rot: [-10, 0, 0] }, Head: { rot: [-8, 0, 0] } };
// 收盘：肘收回来，杖竖在身前右侧（杖朝上由 瞄杖 解）
const retractPose: HandPose = { ...uprightPose, RightArm: { rot: [-35, 10, 15] }, RightForeArm: { rot: [-70, 0, 0] }, RightHand: { rot: [0, 70, 0] } };
// 第 4 幕收缩结界前的蓄势：杖举过头顶竖起来（杖朝上由 瞄杖 解），左手朝前伸出去对着他，头抬一点；接 开盘 那一拍就是杖往前一挥
const raisedOverHead: HandPose = { RightArm: { rot: [-150, 15, -10] }, RightForeArm: { rot: [-25, 0, 0] }, RightHand: { rot: [33, -90, 0] }, LeftArm: { rot: [-70, 0, -15] }, LeftForeArm: { rot: [-15, 0, 0] }, Head: { rot: [-10, 0, 0] } };
// 第 4 幕一齐出手前的预备：杖照旧指着他、肘往回收（杖往回缩约 0.3 格），左臂收到身侧，头低一点盯着他；接 开盘 那一拍杖往前一顶。
// 不举过头：杖一抬盘就跟着翻成平躺的一片（用户 11-11 嫌「甩法术面板」诡异）
const pullBackPose: HandPose = { ...reachForward, RightForeArm: { rot: [-62, 0, 0] }, LeftArm: { rot: [12, 0, -22] }, LeftForeArm: { rot: [-35, 0, 0] }, Head: { rot: [6, 0, 0] } };
// 起飞前蓄一下、落地缓一下：两膝微屈（袍子里只露出一点）
const bendKnee: HandPose = { RightLeg: { rot: [-22, 0, 0] }, RightLowerLeg: { rot: [40, 0, 0] }, LeftLeg: { rot: [-22, 0, 0] }, LeftLowerLeg: { rot: [40, 0, 0] } };

// 第 1、2 幕的几种躲法（Agent 摆的，用户没看过；身子的前倾、侧倾不在这里，由 演出设定 的 倾 按她的速度、加速度算，见 倾角）。
// 角度的正负照这个模型：腿、手臂 x 负 = 往前抬；UpBody、Head x 正 = 往前低；右臂 z 正 = 往外抬，左臂 z 负 = 往外抬
const bothKnees = (thigh: number, calf: number, leftThigh = thigh, leftCalf = calf): HandPose => ({
  RightLeg: { rot: [thigh, 0, 0] },
  RightLowerLeg: { rot: [calf, 0, 0] },
  LeftLeg: { rot: [leftThigh, 0, 0] },
  LeftLowerLeg: { rot: [leftCalf, 0, 0] },
});
const dodgePoses: Record<DodgePoseName, PoseDef> = {
  /** 刚现身：头垂着（眼睛闭着由 演出设定 的 闭眼 管），杖照斜举 */
  低头: { fly: 0, hover: 0, 手: { ...raisedPose.站, UpBody: { rot: [6, 0, 0] }, Head: { rot: [24, 0, 0] } } },
  /** 杖一甩：右臂把杖往外、往前甩开，左臂跟着摊开，头微抬；排完回 站立 */
  甩杖: { fly: 0, hover: 0, 手: { ...uprightPose, LeftArm: { rot: [10, 0, -48] }, RightArm: { rot: [-38, 0, 78] }, RightForeArm: { rot: [-8, 0, 0] }, RightHand: { rot: [0, 70, 0] }, Head: { rot: [-6, 0, 0] } } },
  /** 起身后退：上身往后仰、头跟着仰，左臂往上甩出去找平衡，杖往外撇，右膝提起来 */
  后仰闪: {
    fly: 0,
    hover: 1,
    手: {
      ...bothKnees(-42, 62, 8, 22),
      UpBody: { rot: [-26, 0, 0] },
      Head: { rot: [-10, 0, 0] },
      LeftArm: { rot: [-35, 0, -82] },
      LeftForeArm: { rot: [-20, 0, 0] },
      RightArm: { rot: [-15, 0, 72] },
      RightForeArm: { rot: [-15, 0, 0] },
      RightHand: { rot: [0, 70, 0] },
    },
  },
  /** 横着飞开：两臂往两边张开找平衡，两腿一前一后带一点弯 */
  侧飞: {
    fly: 0,
    hover: 1,
    手: { ...bothKnees(-18, 34, 12, 20), LeftArm: { rot: [0, 0, -62] }, LeftForeArm: { rot: [-18, 0, 0] }, RightArm: { rot: [-8, 0, 66] }, RightForeArm: { rot: [-22, 0, 0] }, RightHand: { rot: [0, 70, 0] } },
  },
  /** 贴着地面滑开：两膝深屈（像蹲着滑），上身前压、头抬着看人，左手往后垂着快擦到地，杖往后撇 */
  贴地滑: {
    fly: 0,
    hover: 0,
    手: {
      ...bothKnees(-55, 100, 18, 78),
      UpBody: { rot: [20, 0, 0] },
      Head: { rot: [-16, 0, 0] },
      LeftArm: { rot: [28, 0, -48] },
      LeftForeArm: { rot: [-8, 0, 0] },
      RightArm: { rot: [32, 0, 52] },
      RightForeArm: { rot: [-25, 0, 0] },
      RightHand: { rot: [0, 70, 0] },
    },
  },
  /** 瞬移前一收：身子缩一下、两手收到胸前，头低着 */
  瞬移收: {
    fly: 0,
    hover: 1,
    手: { ...bothKnees(-12, 26), UpBody: { rot: [12, 0, 0] }, Head: { rot: [12, 0, 0] }, LeftArm: { rot: [-25, 0, -12] }, LeftForeArm: { rot: [-85, 0, 0] }, RightArm: { rot: [-12, 0, 18] }, RightForeArm: { rot: [-62, 0, 0] }, RightHand: { rot: [0, 70, 0] } },
  },
  /** 平着快飞（第 2 幕飞出来、瞬移出来那一冲）：站着飞（用户 11-10「他可以站着飞呀」），身子往飞的方向倾由 倾 管（只倾一点），袍摆往后拖由 拖 管。
   *  六版这里用的 起飞（屈膝、右臂外甩）叠 30 度前倾，像蹲着往前扑；七版、八版两腿并着、手垂着，像挂着的人偶（用户 11-11「这样飞行姿势非常诡异」「飞行姿势很诡异」）。
   *  这里两腿一前一后错开、膝盖各弯一点（右腿在前），上身略往前、头抬着看前面，左臂往后下方甩开压着风，杖照斜举。Agent 摆的 */
  飞行: {
    fly: 0,
    hover: 1,
    手: { ...bothKnees(-14, 28, 16, 34), UpBody: { rot: [7, 0, 0] }, Head: { rot: [-10, 0, 0] }, LeftArm: { rot: [34, 0, -30] }, LeftForeArm: { rot: [-18, 0, 0] }, ...raisedPose.站 },
  },
  /** 往上拔高（他从她脚底下冲过去那一下）：两腿往下拖、一前一后错开、膝盖微屈（右腿在前），头低下来看下面冲过去的他，
   *  左臂往外后方甩开，拿杖的右臂已经往外抬起来要伸（下一拍 升指 接着伸出去指他）。八版两腿并拢垂着、杖垂在身侧（用户 11-11「飞行姿势很诡异」）。Agent 摆的 */
  升空: {
    fly: 0,
    hover: 1,
    手: {
      ...bothKnees(-16, 30, 12, 22),
      UpBody: { rot: [6, 0, 0] },
      Head: { rot: [26, 0, 0] },
      LeftArm: { rot: [24, 0, -46] },
      LeftForeArm: { rot: [-20, 0, 0] },
      RightArm: { rot: [-40, 0, 52] },
      RightForeArm: { rot: [-30, 0, 0] },
      RightHand: { rot: [0, 70, 0] },
    },
  },
  /** 拉升里伸杖指他（用户 11-11「飞行的时候伸出法杖」）：右臂整条伸出去、肘几乎伸直，杖尖指着他（瞄杖 解右肩）；上身往他那边探一点、头低着盯他，
   *  左臂往后下方甩开，两腿照 升空 错开。他在她前下方约 50 度，肘弯着的 指向（第 4 幕用的）从多数角度看杖贴着身子往下垂，所以这里另摆一个伸直的；
   *  拉升完、慢放过了再回到 指向（第 4 幕从 指向 接）。Agent 摆的 */
  升指: {
    fly: 0,
    hover: 1,
    手: {
      ...bothKnees(-16, 30, 12, 22),
      UpBody: { rot: [10, 0, 0] },
      Head: { rot: [14, 0, 0] },
      LeftArm: { rot: [30, 0, -40] },
      LeftForeArm: { rot: [-16, 0, 0] },
      RightArm: { rot: [-75, 25, 0] },
      RightForeArm: { rot: [-6, 0, 0] },
      RightHand: { rot: [33, -90, 0] },
    },
    staffFacing: '目标',
  },
};

export const poses: Record<PoseName, PoseDef> = {
  ...dodgePoses,
  /** 现身站立：idle，杖斜举（用户 11-10 定魔杖平时「斜举着」） */
  站立: { fly: 0, hover: 0, 手: raisedPose.站 },
  /** 起飞的中间一拍：还没完全进 fly，两膝屈着、杖略收 */
  起飞: { fly: 0, hover: 0, 手: { ...raisedPose.站, ...bendKnee, RightArm: { rot: [0, 0, 28] } } },
  /** 悬停持杖：站着浮在空中，杖斜举 */
  悬停: { fly: 0, hover: 1, 手: raisedPose.站 },
  /** 举杖指向目标：杖尖朝目标 */
  指向: { fly: 0, hover: 1, 手: reachForward, staffFacing: '目标' },
  /** 张开轮盘的一下：杖往前一送、左臂甩开；排完这一拍再回到 指向 */
  开盘: { fly: 0, hover: 1, 手: sendOutPose, staffFacing: '目标' },
  /** 收盘：杖收回来竖在身前 */
  收盘: { fly: 0, hover: 1, 手: retractPose, staffFacing: '上' },
  /** 落地的一拍：回到 idle，两膝屈着缓一下；之后接 站立 */
  落地: { fly: 0, hover: 0, 手: { ...raisedPose.站, ...bendKnee } },
  /** 蓄势：杖举过头顶竖着，左手前伸对着目标；下一拍接 开盘（杖往前挥出去） */
  蓄势: { fly: 0, hover: 1, 手: raisedOverHead, staffFacing: '上' },
  /** 回拉：杖还指着目标，肘往回收；下一拍接 开盘（杖往前一顶），杖的方向一直不变，杖尖的盘不翻 */
  回拉: { fly: 0, hover: 1, 手: pullBackPose, staffFacing: '目标' },
};

/** 一条：从 起 秒开始往 做 这个姿势过渡，到 到 秒摆好（不写 = 起 + 0.4 秒），之后保持到下一条的 起。第一条从它的 起 之前就是这个姿势。
 *  缓：过渡的曲线，默认两头缓（smoothstep）；线性 = 出手那一下（打戏的出手段用线性，到位那一帧直接到，不在末尾减速） */
export type PerformanceBar = { 起: number; 到?: number; pose: PoseName; ease?: '线性' };

type TimeValue<T> = T | ((sec: number) => T);
const valueAt = <T>(x: TimeValue<T>, sec: number): T => (typeof x === 'function' ? (x as (sec: number) => T)(sec) : x);

export type PerformanceSettings = {
  timeline: readonly PerformanceBar[];
  /** 她脚底在哪（场景坐标，格）：起飞、换位、落地的位移由段来写 */
  位: TimeValue<V3>;
  /** 身子朝哪（度，0 朝北、180 朝南）；不给 = 水平上朝着目标 */
  yaw?: TimeValue<number>;
  /** 杖指着谁（史蒂夫、结界中心） */
  目标: TimeValue<V3>;
  /** 每次出手的时刻（秒）：杖小幅抖一下 */
  swingTimes?: readonly number[];
  /** 弹簧（头发、胸）：默认 '推进' */
  springMode?: '推进' | '稳态';
  /** 身子跟着动作倾（见 倾角）；不给 = 不倾（第 4、5 幕照旧） */
  lean?: TiltSettings;
  /** 袍摆、身后两片披风跟着动作往后拖、往下拖（见 拖角）；不给 = 不拖（第 4、5 幕照旧） */
  dragSettings?: DragSettings;
  /** 位 在这些秒上跳变（瞬移）：算速度、加速度时不跨过去 */
  breakpoints?: readonly number[];
  /** 闭眼 0～1（1 = 闭着）；不给 = 照动画眨眼 */
  eyeClose?: (sec: number) => number;
};

/** 倾：前倾、侧倾（度）= 速度（格/秒）× 每速 + 加速度（格/秒²）× 每加速，各自夹在 ±上限；加速度在前后 窗 秒里取三角加权平均，免得关键点上一顿 */
export type TiltSettings = { perSpeed: number; perAccel: number; limit: number; 窗: number };
/** 拖：袍摆往后拖（度）= 水平速度 × 每速 + 水平加速度 × 每加速；往上飞时下摆往里收（度）= 竖直速度 × 每速 + 竖直加速度 × 每加速（刹住时反过来往外甩）；
 *  各自夹在 ±上限；再叠一层抖（幅度 = 速度 × 每速抖，夹在 抖上限，频率 抖频 次/秒，走演出的钟，慢放里跟着慢）。窗 同 倾设定 */
export type DragSettings = { perSpeed: number; perAccel: number; limit: number; jitterPerSpeed: number; shakeMax: number; shakeFreq: number; 窗: number };

export type PerformanceSnapshot = {
  /** 直接摊给 <娘化亚波伦 {...属性} 持杖 /> */
  props: { pose: { loc: V3; yaw: number }; 秒: number; act: YaBoLunAct; bonePose: Record<string, BonePose> };
  /** 这一刻在两条之间：从哪个姿势到哪个、走了多少（0～1，已缓动） */
  transition: { 从: PoseName; 到: PoseName; 比: number };
};


/** 抖杖：出手后 0.3 秒里手腕带着杖头往上一挑再落回（最大约 4 度），不改瞄准的右肩。原创，幅度小是因为轮盘钉在杖尖上，杖一甩整个盘跟着甩 */
export const staffShakeSec = 0.3;
export const staffShakeAngle = (sec: number, swingTimes: readonly number[]): number => {
  let sum = 0;
  for (const t0 of swingTimes) {
    const t = (sec - t0) / staffShakeSec;
    if (t > 0 && t < 1) sum += 4 * Math.sin(Math.PI * Math.min(1, t * 2.5)) * (1 - t) ** 2;
  }
  return sum;
};

/**
 * 悬在空中时的起伏：竖直 ±0.1 格、3.4 秒一个来回，水平再带一点不同周期的漂（±0.04 格）。原创（游戏里的亚波伦不会飞）；
 * 位置一动不动地钉在空中看着像贴上去的（用户 11-10 要人物动作流畅）。叠在 位 上，杖、盘、出手点都跟着走；编排里算距离、站点用的还是不带起伏的 位。
 */
export const floatOffsetAt = (sec: number): V3 => [0.04 * Math.sin((2 * Math.PI * sec) / 5.3 + 1.1), 0.04 * Math.sin((2 * Math.PI * sec) / 4.1), 0.1 * Math.sin((2 * Math.PI * sec) / 3.4)];

/** 这一刻在轴上的位置：前一个姿势、后一个姿势、走了多少 */
export const transitionAt = (axis: readonly PerformanceBar[], sec: number): PerformanceSnapshot['transition'] => {
  if (!axis.length) throw new Error('亚波伦演出：轴是空的');
  let i = 0;
  while (i + 1 < axis.length && axis[i + 1]!.起 <= sec) i++;
  const keyframe = axis[i]!;
  if (i === 0) return { 从: keyframe.pose, 到: keyframe.pose, 比: 1 };
  const endSec = keyframe.到 ?? keyframe.起 + 0.4;
  const t = endSec <= keyframe.起 ? 1 : Math.min(1, Math.max(0, (sec - keyframe.起) / (endSec - keyframe.起)));
  // 上一条还没摆好就被这一条接走：从上一条的目标姿势出发（不追中间态），段里别把两条排得比过渡还密
  return { 从: axis[i - 1]!.pose, 到: keyframe.pose, 比: keyframe.ease === '线性' ? t : smoothstep01(t) };
};

const diffStep = 1 / 60;
/** 秒 附近 [a, b] 里没有断点就返回 true */
const noCross = (breakpoints: readonly number[], a: number, b: number) => !breakpoints.some((d) => d > a && d <= b);
/** 位置的一阶、二阶差分（水平两分量），跨断点时换成单边差分 */
export const speedAccel = (posAt: (sec: number) => V3, sec: number, breakpoints: readonly number[] = []): { 速: [number, number]; accel: [number, number] } => {
  const h = diffStep;
  let [a, b] = [sec - h, sec + h];
  if (!noCross(breakpoints, a, b)) [a, b] = noCross(breakpoints, sec - 2 * h, sec) ? [sec - 2 * h, sec] : [sec, sec + 2 * h];
  const m = (a + b) / 2;
  const [p, q, r] = [posAt(a), posAt(m), posAt(b)];
  const H = (b - a) / 2;
  return {
    速: [(r[0] - p[0]) / (2 * H), (r[1] - p[1]) / (2 * H)],
    accel: [(r[0] - 2 * q[0] + p[0]) / (H * H), (r[1] - 2 * q[1] + p[1]) / (H * H)],
  };
};
/**
 * 跟着动作倾的角度（度，原创）：往哪边加速、往哪边飞，身子就往哪边倒（起步前压、刹住后仰、拐弯往里侧倒），这样闪避有预备和收势，
 * 位置写成速度连续的曲线，倾也就跟着连续。前 = 身子正面的方向（yaw 0 朝 +y），右 = 她的右手边。返回 [前倾, 右倾]
 */
export const tiltAt = (settings: TiltSettings, posAt: (sec: number) => V3, yaw: number, sec: number, breakpoints: readonly number[] = []): [number, number] => {
  const n = 4;
  let [vx, vy, ax, ay, weightSum] = [0, 0, 0, 0, 0];
  for (let k = -n; k <= n; k++) {
    const t = sec + (k / n) * settings.窗;
    if (!noCross(breakpoints, Math.min(t, sec), Math.max(t, sec))) continue;
    const w = n + 1 - Math.abs(k);
    const { 速: speedVec, accel } = speedAccel(posAt, t, breakpoints);
    vx += w * speedVec[0];
    vy += w * speedVec[1];
    ax += w * accel[0];
    ay += w * accel[1];
    weightSum += w;
  }
  const r = (yaw * Math.PI) / 180;
  const [forwardX, forwardY, rightX, rightY] = [-Math.sin(r), Math.cos(r), Math.cos(r), Math.sin(r)];
  const clampLimit = (x: number) => Math.max(-settings.limit, Math.min(settings.limit, x));
  const leanAt = (dx: number, dy: number) => clampLimit((settings.perSpeed * (vx * dx + vy * dy) + settings.perAccel * (ax * dx + ay * dy)) / weightSum);
  return [leanAt(forwardX, forwardY), leanAt(rightX, rightY)];
};

/** 位置的一阶、二阶差分（三个分量），在前后 窗 秒里三角加权平均（同 倾角），不跨断点 */
const avgSpeedAccel = (posAt: (sec: number) => V3, sec: number, span: number, breakpoints: readonly number[]): { 速: V3; accel: V3 } => {
  const n = 4;
  const sum = [0, 0, 0, 0, 0, 0];
  let weightSum = 0;
  for (let k = -n; k <= n; k++) {
    const t = sec + (k / n) * span;
    if (!noCross(breakpoints, Math.min(t, sec), Math.max(t, sec))) continue;
    const w = n + 1 - Math.abs(k);
    const h = diffStep;
    let [a, b] = [t - h, t + h];
    if (!noCross(breakpoints, a, b)) [a, b] = noCross(breakpoints, t - 2 * h, t) ? [t - 2 * h, t] : [t, t + 2 * h];
    const [p, q, r] = [posAt(a), posAt((a + b) / 2), posAt(b)];
    const H = (b - a) / 2;
    for (let j = 0; j < 3; j++) {
      sum[j] += (w * (r[j]! - p[j]!)) / (2 * H);
      sum[j + 3] += (w * (r[j]! - 2 * q[j]! + p[j]!)) / (H * H);
    }
    weightSum += w;
  }
  return { 速: [sum[0]! / weightSum, sum[1]! / weightSum, sum[2]! / weightSum], accel: [sum[3]! / weightSum, sum[4]! / weightSum, sum[5]! / weightSum] };
};
/**
 * 袍摆、身后披风跟着动作拖的转角（原创，用户 11-11 嫌「站着飞」时两腿并拢、衣服一动不动像挂着的人偶）：往前飞下摆往后拖、往上蹿下摆往里收（布被往下拽），
 * 刹住、拐弯反过来甩一下，再按速度叠一点抖。返回要盖上去的骨骼转角（前、后、左、右四片袍摆和 pfh1、pfh2），停着不动时全是 0。
 * 正负照这个模型：袍摆、披风 x 正 = 下摆往后，LeftSkirt z 正、RightSkirt z 负 = 往里收
 */
export const dragAngles = (settings: DragSettings, posAt: (sec: number) => V3, yaw: number, sec: number, breakpoints: readonly number[] = []): Record<string, BonePose> => {
  const { 速: speedVec, accel } = avgSpeedAccel(posAt, sec, settings.窗, breakpoints);
  const r = (yaw * Math.PI) / 180;
  const [forwardX, forwardY, rightX, rightY] = [-Math.sin(r), Math.cos(r), Math.cos(r), Math.sin(r)];
  const clampLimit = (x: number, limit = settings.limit) => Math.max(-limit, Math.min(limit, x));
  const measure = (dx: number, dy: number, dz: number) => settings.perSpeed * (speedVec[0] * dx + speedVec[1] * dy + speedVec[2] * dz) + settings.perAccel * (accel[0] * dx + accel[1] * dy + accel[2] * dz);
  const backAngle = clampLimit(measure(forwardX, forwardY, 0));
  const sideLean = clampLimit(measure(rightX, rightY, 0));
  const dragAmount = clampLimit(measure(0, 0, 1));
  const shakeAmp = Math.min(settings.shakeMax, settings.jitterPerSpeed * Math.hypot(...speedVec));
  const jitter = (phase: number) => shakeAmp * Math.sin(2 * Math.PI * settings.shakeFreq * sec + phase);
  return {
    FrontSkirt: { rot: [backAngle + dragAmount + jitter(0), 0, 0] },
    BackSkirt: { rot: [backAngle - dragAmount + jitter(1.7), 0, 0] },
    LeftSkirt: { rot: [0, 0, 0.6 * dragAmount - sideLean + 0.6 * jitter(3.1)] },
    RightSkirt: { rot: [0, 0, -0.6 * dragAmount - sideLean + 0.6 * jitter(4.4)] },
    pfh1: { rot: [1.2 * backAngle - 0.5 * dragAmount + jitter(2.3), 0, 0] },
    pfh2: { rot: [1.2 * backAngle - 0.5 * dragAmount + jitter(5.2), 0, 0] },
  };
};

export const definePerformance = (settings: PerformanceSettings) => {
  const posAt = (sec: number) => valueAt(settings.位, sec);
  const targetAt = (sec: number) => valueAt(settings.目标, sec);
  const yaw = (sec: number) => {
    if (settings.yaw !== undefined) return valueAt(settings.yaw, sec);
    const [p, q] = [posAt(sec), targetAt(sec)];
    // yaw 0 朝北（+y），逆时针为正：朝向 = (−sin, cos)
    return (Math.atan2(-(q[0] - p[0]), q[1] - p[1]) * 180) / Math.PI;
  };
  const flyWeight = (sec: number) => {
    const { 从: fromIndex, 到: toIndex, 比: progress } = transitionAt(settings.timeline, sec);
    return lerp(poses[fromIndex].fly, poses[toIndex].fly, progress);
  };
  const h = 1 / 120;
  const act = defineAct({
    主: (sec) => {
      const w = flyWeight(sec);
      return w <= 0 ? [{ 名: 'idle' }] : w >= 1 ? [{ 名: 'fly' }] : [{ 名: 'idle' }, { 名: 'fly', weight: w }];
    },
    // 头发、胸的弹簧吃速度：竖直速度按米/秒（YSM wiki）；水平速度 YSM 的单位没查到，飞行时写的是 20，这里按 10 格/秒 ≈ 20 估
    环境: (sec) => {
      const breakPoints = settings.breakpoints ?? [];
      const [rangeStart, endSec] = noCross(breakPoints, sec - h, sec + h) ? [sec - h, sec + h] : noCross(breakPoints, sec - 2 * h, sec) ? [sec - 2 * h, sec] : [sec, sec + 2 * h];
      const [a, b] = [posAt(rangeStart), posAt(endSec)];
      return { query: { vertical_speed: (b[2] - a[2]) / (2 * h), ground_speed: Math.min(20, (Math.hypot(b[0] - a[0], b[1] - a[1]) / (2 * h)) * 2) } };
    },
    springMode: settings.springMode,
  });

  const stateCache = new Map<number, PerformanceSnapshot>();
  const stateAt = (sec: number): PerformanceSnapshot => {
    const cached = stateCache.get(sec);
    if (cached) return cached;
    const transition = transitionAt(settings.timeline, sec);
    const [fromPose, toPose] = [poses[transition.从], poses[transition.到]];
    const k = transition.比;
    const floatWeight = lerp(fromPose.hover, toPose.hover, k);
    const [basePos, floatOffset] = [posAt(sec), floatOffsetAt(sec)];
    const pose = { loc: [basePos[0] + floatOffset[0] * floatWeight, basePos[1] + floatOffset[1] * floatWeight, basePos[2] + floatOffset[2] * floatWeight] as V3, yaw: yaw(sec) };
    // 手摆的转角在两个姿势间插；一边没摆的骨骼，从动画这一刻的转角插过去
    const animPose = animSkeletonTable(sec, act);
    const blended: Record<string, BonePose> = {};
    for (const boneName of new Set([...Object.keys(fromPose.手), ...Object.keys(toPose.手)])) {
      const bottomRot = animPose[boneName]?.rot ?? [0, 0, 0];
      const [a, b] = [fromPose.手[boneName]?.rot ?? bottomRot, toPose.手[boneName]?.rot ?? bottomRot];
      blended[boneName] = { rot: [0, 1, 2].map((j) => lerp(a[j]!, b[j]!, k)) };
    }
    const aimPose = (aimMode: '目标' | '上') => aimStaff({ pose, 秒: sec, act, bonePose: blended, aim: aimMode === '目标' ? { 点: targetAt(sec) } : { dir: [0, 0, 1] } });
    let bonePose = blended;
    if (fromPose.staffFacing && fromPose.staffFacing === toPose.staffFacing) bonePose = aimPose(fromPose.staffFacing);
    else if (fromPose.staffFacing || toPose.staffFacing) {
      // 两头瞄的不一样（或只有一头瞄）：各解各的右肩，再按过渡插
      const shoulderRot = (poseDef: PoseDef) => (poseDef.staffFacing ? aimPose(poseDef.staffFacing) : blended).RightArm!.rot!;
      const [a, b] = [shoulderRot(fromPose), shoulderRot(toPose)];
      bonePose = { ...blended, RightArm: { rot: [0, 1, 2].map((j) => lerp(a[j]!, b[j]!, k)) } };
    }
    if (settings.lean) {
      // MAllBody（轴心在髋，idle 和 fly 都不动它）整个转：前倾 = 绕 x，侧倾 = 绕 z
      const [pitch, rightTilt] = tiltAt(settings.lean, posAt, pose.yaw, sec, settings.breakpoints);
      bonePose = { ...bonePose, MAllBody: { rot: [pitch, 0, rightTilt] } };
    }
    if (settings.dragSettings) {
      // 姿势里自己摆了袍摆的（加在上面）
      const dragPose = dragAngles(settings.dragSettings, posAt, pose.yaw, sec, settings.breakpoints);
      const overrides: Record<string, BonePose> = {};
      for (const [boneName, p] of Object.entries(dragPose)) {
        const baseRot = bonePose[boneName]?.rot ?? [0, 0, 0];
        overrides[boneName] = { ...bonePose[boneName], rot: [0, 1, 2].map((j) => baseRot[j]! + p.rot![j]!) };
      }
      bonePose = { ...bonePose, ...overrides };
    }
    const eyeClosed = settings.eyeClose ? Math.min(1, Math.max(0, settings.eyeClose(sec))) : 0;
    if (eyeClosed > 0) {
      const eyelid = { scale: [1, 1 - eyeClosed, 1] };
      bonePose = { ...bonePose, LeftEyelid: eyelid, RightEyelid: eyelid };
    }
    const staffShake = staffShakeAngle(sec, settings.swingTimes ?? []);
    if (staffShake) {
      const wrist = bonePose.RightHand?.rot ?? [0, 0, 0];
      bonePose = { ...bonePose, RightHand: { rot: [wrist[0]! - staffShake, wrist[1]!, wrist[2]!] } };
    }
    const moment: PerformanceSnapshot = { props: { pose, 秒: sec, act, bonePose }, transition };
    stateCache.set(sec, moment);
    return moment;
  };
  /** 这一刻杖在场景里的位置和朝向（界面/杖尖轮盘.tsx 的 杖、法术的出手点） */
  // 按时刻留着（和 在 一样）：法术的出手点、跟着杖走的法术每帧都按各自的时刻来要，骨骼正解要把那一刻的动画整个求一遍
  const staffCache = new Map<number, WandPose>();
  const staffAt = (sec: number): WandPose => {
    let cachedStaffPose = staffCache.get(sec);
    if (!cachedStaffPose) staffCache.set(sec, (cachedStaffPose = holdWandPose(stateAt(sec).props)));
    return cachedStaffPose;
  };
  return { 在: stateAt, 杖: staffAt, act, settings };
};
