// 史蒂夫的反应：把「这一刻他在干什么」（史蒂夫状态）换成姿势、部件转角、手里拿什么、红不红、倒到哪；画在 角色/反应史蒂夫.tsx。
// 能照原版的都照原版（1.20.1 SRG 客户端 jar，javap 读的常数）：
// - 站着、拿东西、两臂轻晃：库/角色/史蒂夫.tsx 的 stevePose（HumanoidModel.setupAnim）。
// - 举盾（副手，ArmPose.BLOCK，poseLeftArm）：左臂 xRot = xRot × 0.5 − 0.9424779、yRot = 0.5235988。游戏里一刻切过去，没有过渡。
// - 拉弓（主手，ArmPose.BOW_AND_ARROW）：右臂 yRot = −0.1 + 头 yRot、左臂 yRot = 0.1 + 头 yRot + 0.4，两臂 xRot = −π/2 + 头 xRot；
//   弓的贴图按 bow.json 的 overrides 换（pull = 拉了几刻 ÷ 20）；箭的初速 = 3 × 力，力 = (p² + 2p) ÷ 3 封顶 1（BowItem.getPowerForTime），
//   从眼高下 0.1 格出手，每刻先挪、再速度 × 0.99、再竖直 − 0.05（AbstractArrow.tick）。
// - 挥剑：库/角色/史蒂夫挥手.ts。
// - 挨打：受伤色 10 刻（hurtTime，库里 EntityModel 的 hurt）。
// - 死亡：倒下照 库/特效/原版死亡.tsx（20 刻倒平、变红），第 20 刻人没了、放 20 个白烟。
// 游戏里没有、本片自己补的（都做的最朴素的，段里可以关）：
// - 挣扎：游戏里被炼狱结界钉住只是位置每刻被拉回，人没有任何动作。这里补成原地摆腿（走路的摆法，脚不挪地方）加胸左右拧。
// - 后仰：原版第三人称挨打只变红，身子不动（结界里也不会被击退）。这里补成身子往后仰一下再回正。
// 用户 11-10 定：史蒂夫要改绑骨骼、加关节，不再完全照原版。上面这些姿势最后都过一遍 角色/史蒂夫关节动作.ts 加肘、膝
// （走跑收小腿、起跳蓄力、空中收腿、落地缓冲、挥剑屈伸、挣扎、挨打腿软）；原版的拍子（摆腿相位、挥手 6 刻、受伤 10 刻、死亡 20 刻）不动。
import type { PartPose } from '@engine/model/实体模型.tsx';
import type { V3 } from '@engine/model/parts.tsx';
import { type StevePose, steveLookAt, stevePose, steveSize, STEVE } from '@库/角色/史蒂夫.tsx';
import { 挥手进度, 挥手部件 } from '@库/角色/史蒂夫挥手.ts';
import { vanillaToppleAngle } from '@库/特效/原版死亡.tsx';
import { 加关节动作 } from './史蒂夫关节动作.ts';
import type { 腾空此刻 } from './史蒂夫走位.ts';

export type 右手物 = '剑' | '弓' | '空';
export type 左手物 = '盾' | '图腾' | '空';
export type 弓贴图 = '弓' | '弓拉0' | '弓拉1' | '弓拉2';

export type 史蒂夫状态 = {
  /** 脚底中心（场景坐标，Z 朝上，格） */
  位置: V3;
  /** 身子朝向（度，0 朝 +Y，正 = 往左） */
  朝向: number;
  /** 头看向的点；偏出 50 度身子跟着转（原版）。不给 = 平视前方 */
  看?: V3;
  /** 时钟（秒）：两臂轻晃、挣扎的摆动 */
  秒: number;
  /** 不给 = 剑 */
  右手?: 右手物;
  /** 不给 = 空 */
  左手?: 左手物;
  /** 举着盾挡（左手要是盾） */
  举盾?: boolean;
  /** 开始拉弓过了几秒（右手要是弓）；不给 = 没在拉 */
  拉弓秒?: number;
  /** 距上次挥剑点击几秒；不给 = 没挥 */
  挥剑秒?: number;
  /** 距上次挨打几秒；不给 = 没挨打 */
  受击秒?: number;
  /** 挨打后仰的幅度（度，自己补的）；不给 = 10，0 = 只变红（原版） */
  后仰度?: number;
  /** 被钉住挣扎的强度 0～1（自己补的）；不给 = 0 */
  挣扎?: number;
  /** 走路的摆腿（原版 limbSwing、limbSwingAmount，角色/史蒂夫走位.ts 照轨迹算的）；不给 = 腿不动。向：1 往前走、−1 倒着走（哪条腿收小腿），不给 = 1 */
  走?: { 摆: number; 步幅: number; 向?: number };
  /** 这一刻和跳的关系（角色/史蒂夫走位.ts 从轨迹里认的）：起跳前下蹲、空中收腿、落地缓冲；不给 = 一直在地上 */
  跳?: 腾空此刻;
  /** 举剑蓄力 0～1（上臂抬起、肘屈，剑举过头）；不给 = 拿着剑往前跳、这一段还没挥过剑时自己举 */
  蓄力?: number;
  /** 死了几秒；不给 = 活着。1 秒（20 刻）后人消失 */
  死后秒?: number;
};

export const 受伤秒 = 0.5; // hurtTime 10 刻
export const 死亡消失秒 = 1; // deathTime 20 刻
const 后仰用秒 = 0.3;

/** 自己补的后仰包络：0.06 秒仰到头，再到 0.3 秒回正 */
const 后仰包络 = (秒: number) => {
  if (秒 < 0 || 秒 >= 后仰用秒) return 0;
  if (秒 < 0.06) return 秒 / 0.06;
  const u = (秒 - 0.06) / (后仰用秒 - 0.06);
  return (1 - u) * (1 - u);
};

/** bow.json 的 overrides：拉了几秒 → 用哪张贴图 */
export const 弓贴图按拉 = (拉弓秒: number | undefined): 弓贴图 => {
  if (拉弓秒 === undefined || 拉弓秒 < 0) return '弓';
  const pull = Math.min(1, 拉弓秒);
  return pull >= 0.9 ? '弓拉2' : pull >= 0.65 ? '弓拉1' : '弓拉0';
};

/** BowItem.getPowerForTime：拉了几秒 → 力 0～1（1 秒拉满） */
export const 弓力 = (拉弓秒: number) => {
  const p = Math.max(0, 拉弓秒);
  return Math.min(1, (p * p + 2 * p) / 3);
};

/** 箭出手的位置：眼高下 0.1 格（AbstractArrow 的构造） */
export const 出箭点 = (位置: V3): V3 => [位置[0], 位置[1], 位置[2] + steveSize(STEVE.scale).eye - 0.1];

/** 箭出手后第 秒 秒的位置和飞行方向（AbstractArrow.tick，不算随机散布）。朝：出手方向（不用归一），力：弓力 */
export const 箭飞行 = (起: V3, 朝: V3, 力: number, 秒: number): { p: V3; dir: V3 } => {
  const 长 = Math.hypot(朝[0], 朝[1], 朝[2]) || 1;
  let v: V3 = [(朝[0] / 长) * 力 * 3, (朝[1] / 长) * 力 * 3, (朝[2] / 长) * 力 * 3];
  let p: V3 = [...起];
  let 前: V3 = p;
  const 刻 = Math.max(0, 秒) * 20;
  for (let k = 0; k < Math.ceil(刻); k++) {
    前 = p;
    p = [p[0] + v[0], p[1] + v[1], p[2] + v[2]];
    v = [v[0] * 0.99, v[1] * 0.99, v[2] * 0.99 - 0.05];
  }
  // 两刻之间线性插值（同游戏的 partialTick）
  const f = 刻 - Math.floor(刻);
  const 位: V3 = f === 0 ? p : [前[0] + (p[0] - 前[0]) * f, 前[1] + (p[1] - 前[1]) * f, 前[2] + (p[2] - 前[2]) * f];
  return { p: 位, dir: v };
};

const 加晃 = (rot: number[], 刻: number, 号: 1 | -1): number[] => [
  rot[0]! + 号 * Math.sin(刻 * 0.067) * 0.05,
  rot[1]!,
  rot[2]! + 号 * (Math.cos(刻 * 0.09) * 0.05 + 0.05),
];

export type 史蒂夫反应结果 = {
  pose: StevePose;
  /** 给 装备史蒂夫 的 改部件 */
  改部件: (部件: Record<string, PartPose>) => Record<string, PartPose>;
  右手: 右手物;
  左手: 左手物;
  举盾: boolean;
  弓贴图: 弓贴图;
  /** 受伤色 0 或 1 */
  受伤: number;
  /** 照原版倒下的角（弧度），0 = 没倒 */
  倒角: number;
  /** 人还画不画（死后 20 刻消失） */
  在: boolean;
};

export const 史蒂夫反应 = (状: 史蒂夫状态): 史蒂夫反应结果 => {
  const 右手 = 状.右手 ?? '剑';
  const 左手 = 状.左手 ?? '空';
  const 举盾 = !!状.举盾 && 左手 === '盾';
  const 拉弓 = 状.拉弓秒 !== undefined && 右手 === '弓';
  const 挣 = Math.min(1, Math.max(0, 状.挣扎 ?? 0));
  // 挣扎：照走路的摆法原地摆腿（步幅 0.5 × 强度，约每秒一步），脚不挪
  const 步幅 = 状.走 ? 状.走.步幅 : 0.5 * 挣;
  const 摆 = 状.走 ? 状.走.摆 : 步幅 * 状.秒 * 20;
  let pose = stevePose(状.位置, 状.朝向, { sec: 状.秒, limbSwing: 摆, stride: 步幅, holdR: 右手 !== '空', holdL: 左手 !== '空' });
  if (状.看) pose = steveLookAt(pose, 状.看);
  if (挣 > 0) pose = { ...pose, twist: (pose.twist ?? 0) + Math.sin(状.秒 * Math.PI * 2 * 0.7) * 12 * 挣 };
  const 仰 = 状.受击秒 === undefined ? 0 : 后仰包络(状.受击秒) * (状.后仰度 ?? 10);
  if (仰 > 0) pose = { ...pose, pitch: pose.pitch + 仰 }; // FigurePose 的 pitch 负 = 前倾
  const 挥 = 状.挥剑秒 === undefined ? 0 : 挥手进度(状.挥剑秒);
  pose = 加关节动作(pose, {
    摆,
    步幅,
    向: 状.走?.向,
    跳: 状.跳,
    挣,
    秒: 状.秒,
    仰: 仰 / 10,
    右持: 右手 !== '空',
    左持: 左手 !== '空',
    持剑: 右手 === '剑',
    拉弓,
    举盾,
    挥,
    挥过: 状.挥剑秒 !== undefined && 状.挥剑秒 >= 0,
    蓄力: 状.蓄力,
  });

  const 刻 = 状.秒 * 20;
  const 臂摆左 = Math.cos(摆 * 0.6662) * 步幅;
  const 改部件 = (部件: Record<string, PartPose>): Record<string, PartPose> => {
    let 出 = { ...部件 };
    const 头 = 部件.head?.rot ?? [0, 0, 0];
    const 身转 = 部件.body?.rot?.[1] ?? 0;
    const 设臂 = (名: 'right' | 'left', rot: number[]) => {
      const 臂 = { ...出[`${名}_arm`], rot };
      出 = { ...出, [`${名}_arm`]: 臂, [`${名}_sleeve`]: 臂 };
    };
    if (拉弓) {
      设臂('right', 加晃([-Math.PI / 2 + 头[0]!, -0.1 + 头[1]! + 身转, 0], 刻, 1));
      设臂('left', 加晃([-Math.PI / 2 + 头[0]!, 0.1 + 头[1]! + 0.4 + 身转, 0], 刻, -1));
    } else if (举盾) {
      设臂('left', 加晃([臂摆左 * 0.5 - 0.9424779, 0.5235988 + 身转, 0], 刻, -1));
    }
    if (挥 > 0) 出 = 挥手部件(出, 挥);
    return 出;
  };

  const 死 = 状.死后秒;
  return {
    pose,
    改部件,
    右手,
    左手,
    举盾,
    弓贴图: 拉弓 ? 弓贴图按拉(状.拉弓秒) : '弓',
    受伤: (状.受击秒 !== undefined && 状.受击秒 >= 0 && 状.受击秒 < 受伤秒) || (死 !== undefined && 死 >= 0) ? 1 : 0,
    倒角: 死 === undefined ? 0 : vanillaToppleAngle(死),
    在: 死 === undefined || 死 < 死亡消失秒,
  };
};
