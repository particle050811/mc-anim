// 断曜流光（goety_revelation:valettein）的冲刺：照 RevelationFix 4.9 的 ValetteinItem.onEntitySwing（CFR 反编译，官方映射对的名）原样做。纯计算。
// 游戏里：服务端、拿着它潜行（isShiftKeyDown）时左键挥一下、物品不在冷却 → 沿视线 push(视线 × 3.6)（一刻 3.6 格，起手约 72 格/秒）、
// hurtMarked、setOnGround(false)、startAutoSpinAttack(15)（激流那样横着转 15 刻，碰到生物会撞伤、弹回）、物品冷却 15 刻、
// 放 TRIDENT_RIPTIDE_1（PLAYERS 声道，音量 1，音高 1.3）。物品自己不放粒子；冷却里拿在手上时摔落距离清零。
// 冲出去以后是原版的移动：每刻先按速度挪，再水平 × 0.91（在地上 × 下界岩滑度 0.6 × 0.91）、竖直 (vy − 0.08) × 0.98（LivingEntity.travel）。
// 所以冲多远全看仰角：视线平着或往下（起手竖直速度不为正）第一刻就贴地，10.8 格；仰 2～2.5 度 15.8 格；仰 5 度 23 格。
// 和游戏不一样：玩家这几刻没按方向键（按了会再加一点加速度）；地面一律当下界岩（滑度 0.6、不减速），灵魂沙那种减速方块没算。
import type { V3 } from '@engine/model/parts.tsx';
import { fallOneTick, vanillaMotion } from '@库/原版物理.ts';

export const valetteinDash = {
  /** 每刻 3.6 格 */
  pushSpeed: 3.6,
  cooldownTicks: 15,
  /** 横着转几刻（startAutoSpinAttack 的参数） */
  spinTicks: 15,
  sound: '音效/item.trident.riptide_1',
  音高: 1.3,
} as const;

/** 激流姿势下碰撞箱 0.6 × 0.6（Pose.SPIN_ATTACK） */
const halfWidth = 0.3;
/** 玩家一步能迈上 0.6 格（maxUpStep） */
const stepHeight = 0.6;
const { airHorizontalDrag: airDrag, groundHorizontalDrag: groundDrag, standingVertSpeed } = vanillaMotion;

export type DashSettings = {
  /** 起点脚底（本地坐标，z 是绝对高） */
  start: V3;
  /** 视线的水平朝向（单位向量） */
  dir: readonly [number, number];
  /** 视线仰角（度，往上为正；游戏里 xRot 往下为正，= −仰角） */
  elevationDeg: number;
  /** 这一列（碰撞箱罩住的格子里最高的）站得住的高度 */
  groundHeight: (x: number, y: number) => number;
  /** 算几刻，默认 旋刻 + 5 */
  刻数?: number;
};

export type DashTrail = {
  settings: DashSettings;
  /** 第 k 刻末的脚底（k = 0 是起点） */
  points: readonly V3[];
  /** 第 k 刻末在不在地上 */
  onGround: readonly boolean[];
  /** 第一次落地是第几刻 */
  landTick: number;
  /** 水平冲出去多远（算到的最后一刻） */
  farDist: number;
};

/** 碰撞箱四个角下面最高的地（箱子 0.6 宽，比一格小，四个角就罩住了它压着的格子） */
const boxGroundHeight = (groundHeight: DashSettings['groundHeight'], x: number, y: number) =>
  Math.max(groundHeight(x - halfWidth, y - halfWidth), groundHeight(x + halfWidth, y - halfWidth), groundHeight(x - halfWidth, y + halfWidth), groundHeight(x + halfWidth, y + halfWidth));

export const calcDash = (settings: DashSettings): DashTrail => {
  const elevationRad = (settings.elevationDeg * Math.PI) / 180;
  const pushSpeed = valetteinDash.pushSpeed;
  // 站在地上时竖直速度是 −0.0784（上一刻的重力），push 加在它上面
  let v: [number, number, number] = [settings.dir[0] * Math.cos(elevationRad) * pushSpeed, settings.dir[1] * Math.cos(elevationRad) * pushSpeed, Math.sin(elevationRad) * pushSpeed + standingVertSpeed];
  let p: V3 = [...settings.start];
  let onGround = false; // setOnGround(false)
  const points: V3[] = [p];
  const groundFlags: boolean[] = [true];
  let landTick = -1;
  const n = settings.刻数 ?? valetteinDash.spinTicks + 5;
  for (let k = 1; k <= n; k++) {
    const drag = onGround ? groundDrag : airDrag;
    // 先竖直、再水平（Entity.collide 先解 y）
    const prevGround = boxGroundHeight(settings.groundHeight, p[0], p[1]);
    let z = p[2] + v[2];
    let landed = z <= prevGround;
    if (landed) z = prevGround;
    let [x, y] = [p[0] + v[0], p[1] + v[1]];
    const nextGround = boxGroundHeight(settings.groundHeight, x, y);
    if (z < nextGround) {
      if ((landed || onGround) && nextGround - z <= stepHeight) z = nextGround; // 迈上去
      else [x, y, v[0], v[1]] = [p[0], p[1], 0, 0]; // 撞墙：水平停住
    }
    const groundBelow = boxGroundHeight(settings.groundHeight, x, y);
    landed = v[2] <= 0 && z <= groundBelow + 1e-9;
    if (landed) z = groundBelow;
    p = [x, y, z];
    v = [v[0] * drag, v[1] * drag, landed ? standingVertSpeed : fallOneTick(z, v[2]).速];
    onGround = landed;
    if (landed && landTick < 0) landTick = k;
    points.push(p);
    groundFlags.push(landed);
  }
  const lastPoint = points[points.length - 1]!;
  return { settings: settings, points: points, onGround: groundFlags, landTick, farDist: Math.hypot(lastPoint[0] - settings.start[0], lastPoint[1] - settings.start[1]) };
};

/** 冲出去后第 秒 秒的脚底：两刻之间线性插（同游戏的 partialTick）；冲之前在起点，算完以后停在最后一刻 */
export const dashPos = (track: DashTrail, sec: number): V3 => {
  const tick = Math.max(0, sec * 20);
  const k = Math.floor(tick);
  if (k >= track.points.length - 1) return track.points[track.points.length - 1]!;
  const [a, b] = [track.points[k]!, track.points[k + 1]!];
  const f = tick - k;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
};

/** 起手竖直速度不为正（第一刻就贴地）的最大仰角：这以下冲多远都一样 */
export const groundElevMax = (Math.asin(-standingVertSpeed / valetteinDash.pushSpeed) * 180) / Math.PI;
