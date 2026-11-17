// 史蒂夫的尺寸、速度、取色和原版姿势（走路摆臂摆腿、潜行、看向）：纯数，不带模型字节、react、three。依据见 史蒂夫.tsx 文件头。
// 编排、测试要这些数就从这里引，不用把 史蒂夫.tsx（模型、皮肤、部件矩阵）拖进闭包；史蒂夫.tsx 原样转出。
import type { V3 } from '../../engine/core/坐标.ts';
import { clamp } from '../../engine/core/数学.ts';
import { type FigurePose, standPose } from './骨架姿势.ts';

/** 整体倍数 s 时的高度（格，脚底起）：头顶（头方块顶，不算帽子层）、潜行头顶（含往下 0.125 格）、眼高。
 *  眼高照 Player 的站、潜行尺寸（1.62、1.27，对应 0.9375 倍），别的倍数按比例换算，潜行往下的 0.125 格不跟着缩 */
export const steveSize = (s: number) => ({
  height: (32 * s) / 16,
  crouchHeight: ((32 - 4.2) * s) / 16 - 0.125,
  eye: (1.62 * s) / 0.9375,
  eyeCrouch: ((1.27 + 0.125) * s) / 0.9375 - 0.125,
});

export const STEVE = {
  // 原版 PlayerRenderer 的整体缩放，StevePose.scale 不给时用它。三渲二正交镜头里一个贴图像素就成了 0.9375 × N 个输出像素，
  // 最近邻下一格宽一格窄，和 05-画风 原则 3（像素密度对齐）冲突，要不要改 1 倍待用户定（核对-史蒂夫苦力怕 的对比帧）
  scale: 0.9375,
  ...steveSize(0.9375), // height 1.875、crouchHeight 1.504、eye 1.62、eyeCrouch 1.27
  box: [0.6, 1.8] as [number, number],
  boxCrouch: [0.6, 1.5] as [number, number],
  headYawMax: 50,
  headPitchMax: 90,
  // 平地上的速度（米/秒）：原版移动速度 0.1、疾跑 ×1.3、潜行 ×0.3 推出来的
  speed: { walk: 4.317, sprint: 5.612, sneak: 1.295 },
  // 贴图取色，给碎屑、粒子、剪影用
  colors: { shirt: '#00afaf', pants: '#463aa5', skin: '#aa7259', hair: '#332411', shoe: '#4a4a4a' },
};

/** FigurePose 再加两样：crouch 潜行，0 站、1 原版潜行（游戏里一刻切过去，中间值按比例插，给过渡用）；
 *  scale 整体倍数，不给按 STEVE.scale（0.9375）。放在姿势里是为了 steveLookAt、steveHeldItemMatrix 都跟着同一个倍数走 */
export type StevePose = FigurePose & { crouch?: number; scale?: number };

const DEG = 180 / Math.PI;
const wrap180 = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;
/** 原版走路时的 limbSwing、limbSwingAmount（WalkAnimationState：目标 = min(1, 每刻水平位移 × 4)，每刻往目标靠 0.4，位置每刻加当前值）。
 *  speed 米/秒，sec 走了多久；fromRest 从站着起步（不给就是一直以这个速度在走） */
export const vanillaWalk = (speed: number, sec: number, fromRest = false) => {
  const target = Math.min(1, (Math.max(0, speed) / 20) * 4);
  const ticks = Math.max(0, sec) * 20;
  if (!fromRest) return { limbSwing: target * ticks, stride: target };
  // 从 0 起步：第 n 刻 步幅 = target·(1 − 0.6ⁿ)，位置是它的累加
  const k = 0.6 ** ticks;
  return { limbSwing: target * (ticks - (0.6 * (1 - k)) / 0.4), stride: target * (1 - k) };
};

export type SteveMotion = {
  sec?: number; // 游戏时间（秒）：两臂随时间轻晃（bobModelPart）；不给按 0
  limbSwing?: number; // 原版 limbSwing（见 vanillaWalk）
  stride?: number; // 原版 limbSwingAmount，0～1：走 0.86、疾跑 1、潜行走 0.26
  crouch?: number; // 0～1
  headYaw?: number; // 度，正 = 往左（同 FigurePose）
  headPitch?: number; // 度，负 = 低头（同 FigurePose）
  holdR?: boolean; // 右手拿着东西（ArmPose.ITEM）
  holdL?: boolean;
  scale?: number; // 整体倍数，原样放进 StevePose.scale
};

/** 原版 HumanoidModel.setupAnim 的姿势（不骑、不游泳、不鞘翅、不出手），换成 FigurePose。yaw：身子朝向（度，0 朝 +Y，正 = 往左）。
 *  潜行的身子、手臂多出来的转角和各部件下移在画的时候加（见 steveParts），这里的手臂角是潜行之前的 */
export const stevePose = (loc: V3, yaw: number, m: SteveMotion = {}): StevePose => {
  const ls = m.limbSwing ?? 0;
  const la = m.stride ?? 0;
  const age = (m.sec ?? 0) * 20;
  let rArm = Math.cos(ls * 0.6662 + Math.PI) * la;
  let lArm = Math.cos(ls * 0.6662) * la;
  if (m.holdR) rArm = rArm * 0.5 - Math.PI / 10;
  if (m.holdL) lArm = lArm * 0.5 - Math.PI / 10;
  const bobZ = Math.cos(age * 0.09) * 0.05 + 0.05;
  const bobX = Math.sin(age * 0.067) * 0.05;
  rArm += bobX;
  lArm -= bobX;
  const rLeg = Math.cos(ls * 0.6662) * 1.4 * la;
  const lLeg = Math.cos(ls * 0.6662 + Math.PI) * 1.4 * la;
  // 原版 xRot 正 = 往后摆，FigurePose 正 = 往前；右臂 zRot 正 = 往外张，FigurePose 的 roll 正 = 往里收
  return {
    ...standPose([...loc]),
    yaw,
    ground: 0, // 原版走路身子不起伏，脚离地
    headYaw: m.headYaw ?? 0,
    headPitch: m.headPitch ?? 0,
    armR: -rArm * DEG,
    armRRoll: -bobZ * DEG,
    armL: -lArm * DEG,
    armLRoll: -bobZ * DEG,
    legR: -rLeg * DEG,
    legL: -lLeg * DEG,
    crouch: m.crouch ?? 0,
    ...(m.scale === undefined ? {} : { scale: m.scale }),
  };
};

/** 看向 target（场景坐标）：从眼睛（0.9375 倍时站 1.62、潜行 1.27，见 steveSize）算头的偏航和俯仰。头偏离身子超过 50° 时，turnBody 就照原版让身子跟着转过去，
 *  否则头停在 50°。只认 yaw、twist（头相对胸），不管整体前倾 pitch */
export const steveLookAt = (pose: StevePose, target: V3, turnBody = true): StevePose => {
  const c = clamp(pose.crouch ?? 0, 0, 1);
  const size = steveSize(pose.scale ?? STEVE.scale);
  const eye = size.eye + (size.eyeCrouch - size.eye) * c;
  const [x, y, z] = pose.loc;
  const dx = target[0] - x;
  const dy = target[1] - y;
  const dz = target[2] - (z + eye);
  let yaw = pose.yaw ?? 0;
  let rel = wrap180(Math.atan2(-dx, dy) * DEG - yaw - (pose.twist ?? 0));
  if (Math.abs(rel) > STEVE.headYawMax) {
    const lim = Math.sign(rel) * STEVE.headYawMax;
    if (turnBody) yaw += rel - lim;
    rel = lim;
  }
  const pitch = clamp(Math.atan2(dz, Math.hypot(dx, dy)) * DEG, -STEVE.headPitchMax, STEVE.headPitchMax);
  return { ...pose, yaw, headYaw: rel, headPitch: pitch };
};
