// 史蒂夫的反应：把「这一刻他在干什么」（史蒂夫状态）换成姿势、部件转角、手里拿什么、红不红、倒到哪；画在 角色/反应史蒂夫.tsx。
// 能照原版的都照原版（1.20.1 SRG 客户端 jar，javap 读的常数）：
// - 站着、拿东西、两臂轻晃：库/角色/史蒂夫.tsx 的 stevePose（HumanoidModel.setupAnim）。
// - 举盾（副手，ArmPose.BLOCK，poseLeftArm）：左臂 xRot = xRot × 0.5 − 0.9424779、yRot = 0.5235988。游戏里一刻切过去，没有过渡。
// - 拉弓（主手，ArmPose.BOW_AND_ARROW）：右臂 yRot = −0.1 + 头 yRot、左臂 yRot = 0.1 + 头 yRot + 0.4，两臂 xRot = −π/2 + 头 xRot；
//   弓的贴图按 bow.json 的 overrides 换（pull = 拉了几刻 ÷ 20）；箭的初速 = 3 × 力，力 = (p² + 2p) ÷ 3 封顶 1（BowItem.getPowerForTime），
//   从眼高下 0.1 格出手，每刻先挪、再速度 × 0.99、再竖直 − 0.05（AbstractArrow.tick）。
// - 挥剑：空手、拿环时照原版挥手（库/角色/史蒂夫挥手.ts）；拿剑时换成 角色/剑招.ts 的剑招（用户 11-11 嫌原版挥剑「诡异」）。
// - 挨打：受伤色 10 刻（hurtTime，库里 EntityModel 的 hurt）。
// - 死亡：倒下照 库/特效/原版死亡.tsx（20 刻倒平、变红），第 20 刻人没了、放 20 个白烟。
// - 潜行：stevePose 的 crouch（原版潜行的身子、手臂、部件下移）。
// - 激流姿势（Pose.SPIN_ATTACK，三叉戟激流、断曜流光冲刺）：PlayerRenderer.setupRotations 在转身之后绕脚底 XP(−90 − xRot)、再绕身子长轴 YP((tickCount + pt) × −75)，
//   人顺着视线横躺、头朝前打转；外面一层 SpinAttackEffectLayer 的旋风（特效/激流旋风.tsx）。画在 角色/反应史蒂夫.tsx。
// 游戏里没有、本片自己补的（都做的最朴素的，段里可以关）：
// - 挣扎：游戏里被炼狱结界钉住只是位置每刻被拉回，人没有任何动作。这里补成原地摆腿（走路的摆法，脚不挪地方）加胸左右拧。
// - 后仰：原版第三人称挨打只变红，身子不动（结界里也不会被击退）。这里补成身子往后仰一下再回正。
// 用户 11-10 定：史蒂夫要改绑骨骼、加关节，不再完全照原版。上面这些姿势最后都过一遍 角色/史蒂夫关节动作.ts 加肘、膝
// （走跑收小腿、起跳蓄力、空中收腿、落地缓冲、剑招、挣扎、挨打腿软）；原版的拍子（摆腿相位、空手挥手 6 刻、受伤 10 刻、死亡 20 刻）不动。
import type { PartPose } from '@engine/model/实体模型.tsx';
import type { V3 } from '@engine/model/parts.tsx';
import { steveLookAt, stevePose, steveSize, STEVE } from '@库/角色/史蒂夫姿势.ts';
import { waveProgress, waveParts } from '@库/角色/史蒂夫挥手.ts';
import { vanillaToppleAngle } from '@库/特效/原版死亡.tsx';
import type { MoveName } from './剑招.ts';
import type { JointPose } from './史蒂夫关节.ts';
import { addJointAction } from './史蒂夫关节动作.ts';
import type { AirSnapshot } from './史蒂夫走位.ts';

/** 勋章 = 末日勋章（第 1 幕他拿着放到祭坛上） */
export type RightHandItem = '剑' | '弓' | '空' | '勋章';
export type LeftHandItem = '盾' | '图腾' | '空';
export type BowTexture = '弓' | '弓拉0' | '弓拉1' | '弓拉2';

export type SteveState = {
  /** 脚底中心（场景坐标，Z 朝上，格） */
  位置: V3;
  /** 身子朝向（度，0 朝 +Y，正 = 往左） */
  facing: number;
  /** 头看向的点；偏出 50 度身子跟着转（原版）。不给 = 平视前方 */
  看?: V3;
  /** 时钟（秒）：两臂轻晃、挣扎的摆动 */
  sec: number;
  /** 不给 = 剑 */
  rightHand?: RightHandItem;
  /** 不给 = 空 */
  leftHand?: LeftHandItem;
  /** 举着盾挡（左手要是盾） */
  shieldUp?: boolean;
  /** 开始拉弓过了几秒（右手要是弓）；不给 = 没在拉 */
  drawSec?: number;
  /** 距上次挥剑点击几秒；不给 = 没挥 */
  swingSec?: number;
  /** 拿剑时上次点下去的是哪一招、正在蓄的是哪一招（角色/剑招.ts）；不给 = 下劈 */
  move?: MoveName;
  chargeMove?: MoveName;
  /** 距上次挨打几秒；不给 = 没挨打 */
  hitReactSec?: number;
  /** 挨打后仰的幅度（度，自己补的）；不给 = 10，0 = 只变红（原版） */
  backLeanDeg?: number;
  /** 后仰几秒仰到头、几秒回正（从挨打那一刻算）；不给 = 0.06、0.3。第 4 幕照 Linker 打戏知识库的受击反应拉长 */
  leanTiming?: { peakSec: number; restoreSec: number };
  /** 被钉住挣扎的强度 0～1（自己补的）；不给 = 0 */
  struggle?: number;
  /** 走路的摆腿（原版 limbSwing、limbSwingAmount，角色/史蒂夫走位.ts 照轨迹算的）；不给 = 腿不动。向：1 往前走、−1 倒着走（哪条腿收小腿），不给 = 1 */
  走?: { swing: number; stride: number; walkDir?: number };
  /** 这一刻和跳的关系（角色/史蒂夫走位.ts 从轨迹里认的）：起跳前下蹲、空中收腿、落地缓冲；不给 = 一直在地上 */
  跳?: AirSnapshot;
  /** 举剑蓄力 0～1（摆到 蓄招 的蓄）；不给 = 拿着剑往前跳、这一段还没挥过剑时自己举 */
  charge?: number;
  /** 死了几秒；不给 = 活着。1 秒（20 刻）后人消失 */
  afterDeathSec?: number;
  /** 潜行 0～1（原版一刻切过去，中间值给过渡）；不给 = 0 */
  sneak?: number;
  /** 激流姿势：转了几刻（tickCount 从开始转算）、视线仰角（度，往上为正）、权（1 = 横躺，0 = 站着，给收势的过渡）；不给 = 不在转 */
  surge?: { 刻: number; elevationDeg: number; weight?: number };
};

export const hurtSec = 0.5; // hurtTime 10 刻
export const deathVanishSec = 1; // deathTime 20 刻
const leanBackSec = 0.3;

/** 自己补的后仰包络（0～1）：默认 0.06 秒仰到头，再到 0.3 秒回正 */
export const leanBackEnvelope = (sec: number, peakSec = 0.06, restoreSec = leanBackSec) => {
  if (sec < 0 || sec >= restoreSec) return 0;
  if (sec < peakSec) return sec / peakSec;
  const u = (sec - peakSec) / (restoreSec - peakSec);
  return (1 - u) * (1 - u);
};

/** bow.json 的 overrides：拉了几秒 → 用哪张贴图 */
export const bowTextureByPull = (drawSec: number | undefined): BowTexture => {
  if (drawSec === undefined || drawSec < 0) return '弓';
  const pull = Math.min(1, drawSec);
  return pull >= 0.9 ? '弓拉2' : pull >= 0.65 ? '弓拉1' : '弓拉0';
};
/** 箭出手的位置：眼高下 0.1 格（AbstractArrow 的构造） */
export const arrowLaunchPoint = (position: V3): V3 => [position[0], position[1], position[2] + steveSize(STEVE.scale).eye - 0.1];

/** 箭出手后第 秒 秒的位置和飞行方向（AbstractArrow.tick，不算随机散布）。朝：出手方向（不用归一），力：弓力 */
export const arrowFlight = (startPos: V3, dir: V3, force: number, sec: number): { p: V3; dir: V3 } => {
  const vecLength = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  let v: V3 = [(dir[0] / vecLength) * force * 3, (dir[1] / vecLength) * force * 3, (dir[2] / vecLength) * force * 3];
  let p: V3 = [...startPos];
  let prev: V3 = p;
  const tick = Math.max(0, sec) * 20;
  for (let k = 0; k < Math.ceil(tick); k++) {
    prev = p;
    p = [p[0] + v[0], p[1] + v[1], p[2] + v[2]];
    v = [v[0] * 0.99, v[1] * 0.99, v[2] * 0.99 - 0.05];
  }
  // 两刻之间线性插值（同游戏的 partialTick）
  const f = tick - Math.floor(tick);
  const pos: V3 = f === 0 ? p : [prev[0] + (p[0] - prev[0]) * f, prev[1] + (p[1] - prev[1]) * f, prev[2] + (p[2] - prev[2]) * f];
  return { p: pos, dir: v };
};

const addSway = (rot: number[], tick: number, sign: 1 | -1): number[] => [
  rot[0]! + sign * Math.sin(tick * 0.067) * 0.05,
  rot[1]!,
  rot[2]! + sign * (Math.cos(tick * 0.09) * 0.05 + 0.05),
];

export type SteveReactionResult = {
  pose: JointPose;
  /** 给 装备史蒂夫 的 改部件 */
  editParts: (poses: Record<string, PartPose>) => Record<string, PartPose>;
  rightHand: RightHandItem;
  leftHand: LeftHandItem;
  shieldUp: boolean;
  bowTexture: BowTexture;
  /** 受伤色 0 或 1 */
  hurt: number;
  /** 照原版倒下的角（弧度），0 = 没倒 */
  toppleAngle: number;
  /** 人还画不画（死后 20 刻消失） */
  在: boolean;
  surge?: SteveState['surge'];
};

export const steveReaction = (state: SteveState): SteveReactionResult => {
  const rightHand = state.rightHand ?? '剑';
  const leftHand = state.leftHand ?? '空';
  const shieldUp = !!state.shieldUp && leftHand === '盾';
  const drawBow = state.drawSec !== undefined && rightHand === '弓';
  const struggleAmount = Math.min(1, Math.max(0, state.struggle ?? 0));
  // 挣扎：照走路的摆法原地摆腿（步幅 0.5 × 强度，约每秒一步），脚不挪
  const stride = state.走 ? state.走.stride : 0.5 * struggleAmount;
  const swing = state.走 ? state.走.swing : stride * state.sec * 20;
  let pose = stevePose(state.位置, state.facing, { sec: state.sec, limbSwing: swing, stride: stride, holdR: rightHand !== '空', holdL: leftHand !== '空', crouch: state.sneak ?? 0 });
  if (state.看) pose = steveLookAt(pose, state.看);
  if (struggleAmount > 0) pose = { ...pose, twist: (pose.twist ?? 0) + Math.sin(state.sec * Math.PI * 2 * 0.7) * 12 * struggleAmount };
  const backLean = state.hitReactSec === undefined ? 0 : leanBackEnvelope(state.hitReactSec, state.leanTiming?.peakSec, state.leanTiming?.restoreSec) * (state.backLeanDeg ?? 10);
  if (backLean > 0) pose = { ...pose, pitch: pose.pitch + backLean }; // FigurePose 的 pitch 负 = 前倾
  // 原版挥手只给空手、拿环的时候用；拿剑时由 加关节动作 照剑招摆
  const holdingSword = rightHand === '剑';
  const swingProgress = state.swingSec === undefined || holdingSword ? 0 : waveProgress(state.swingSec);
  const jointPose = addJointAction(pose, {
    swing,
    stride,
    walkDir: state.走?.walkDir,
    跳: state.跳,
    struggleAmount,
    sec: state.sec,
    backLean: backLean / 10,
    holdRight: rightHand !== '空',
    holdLeft: leftHand !== '空',
    holdingSword,
    drawBow,
    shieldUp,
    ...(state.swingSec !== undefined ? { swingSec: state.swingSec } : {}),
    swungPast: state.swingSec !== undefined && state.swingSec >= 0,
    ...(state.move ? { move: state.move } : {}),
    ...(state.chargeMove ? { chargeMove: state.chargeMove } : {}),
    ...(state.charge !== undefined ? { charge: state.charge } : {}),
  });

  const tick = state.sec * 20;
  const armSwingL = Math.cos(swing * 0.6662) * stride;
  const editParts = (poses: Record<string, PartPose>): Record<string, PartPose> => {
    let parts = { ...poses };
    const headRot = poses.head?.rot ?? [0, 0, 0];
    const bodyTwist = poses.body?.rot?.[1] ?? 0;
    const setArm = (sideName: 'right' | 'left', rot: number[]) => {
      const armPart = { ...parts[`${sideName}_arm`], rot };
      parts = { ...parts, [`${sideName}_arm`]: armPart, [`${sideName}_sleeve`]: armPart };
    };
    if (drawBow) {
      setArm('right', addSway([-Math.PI / 2 + headRot[0]!, -0.1 + headRot[1]! + bodyTwist, 0], tick, 1));
      setArm('left', addSway([-Math.PI / 2 + headRot[0]!, 0.1 + headRot[1]! + 0.4 + bodyTwist, 0], tick, -1));
    } else if (shieldUp) {
      setArm('left', addSway([armSwingL * 0.5 - 0.9424779, 0.5235988 + bodyTwist, 0], tick, -1));
    }
    if (swingProgress > 0) parts = waveParts(parts, swingProgress);
    return parts;
  };

  const sinceDeath = state.afterDeathSec;
  return {
    pose: jointPose,
    editParts,
    rightHand,
    leftHand,
    shieldUp,
    bowTexture: drawBow ? bowTextureByPull(state.drawSec) : '弓',
    hurt: (state.hitReactSec !== undefined && state.hitReactSec >= 0 && state.hitReactSec < hurtSec) || (sinceDeath !== undefined && sinceDeath >= 0) ? 1 : 0,
    toppleAngle: sinceDeath === undefined ? 0 : vanillaToppleAngle(sinceDeath),
    在: sinceDeath === undefined || sinceDeath < deathVanishSec,
    ...(state.surge ? { surge: state.surge } : {}),
  };
};
