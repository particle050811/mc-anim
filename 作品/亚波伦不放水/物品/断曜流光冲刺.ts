// 断曜流光（goety_revelation:valettein）的冲刺：照 RevelationFix 4.9 的 ValetteinItem.onEntitySwing（CFR 反编译，官方映射对的名）原样做。纯计算。
// 游戏里：服务端、拿着它潜行（isShiftKeyDown）时左键挥一下、物品不在冷却 → 沿视线 push(视线 × 3.6)（一刻 3.6 格，起手约 72 格/秒）、
// hurtMarked、setOnGround(false)、startAutoSpinAttack(15)（激流那样横着转 15 刻，碰到生物会撞伤、弹回）、物品冷却 15 刻、
// 放 TRIDENT_RIPTIDE_1（PLAYERS 声道，音量 1，音高 1.3）。物品自己不放粒子；冷却里拿在手上时摔落距离清零。
// 冲出去以后是原版的移动：每刻先按速度挪，再水平 × 0.91（在地上 × 下界岩滑度 0.6 × 0.91）、竖直 (vy − 0.08) × 0.98（LivingEntity.travel）。
// 所以冲多远全看仰角：视线平着或往下（起手竖直速度不为正）第一刻就贴地，10.8 格；仰 2～2.5 度 15.8 格；仰 5 度 23 格。
// 和游戏不一样：玩家这几刻没按方向键（按了会再加一点加速度）；地面一律当下界岩（滑度 0.6、不减速），灵魂沙那种减速方块没算。
import type { V3 } from '@engine/model/parts.tsx';
import { 下落一刻, 原版运动 } from '@库/原版物理.ts';

export const 断曜流光冲刺 = {
  /** 每刻 3.6 格 */
  推: 3.6,
  冷却刻: 15,
  /** 横着转几刻（startAutoSpinAttack 的参数） */
  旋刻: 15,
  音: '音效/item.trident.riptide_1',
  音高: 1.3,
} as const;

/** 激流姿势下碰撞箱 0.6 × 0.6（Pose.SPIN_ATTACK） */
const 半宽 = 0.3;
/** 玩家一步能迈上 0.6 格（maxUpStep） */
const 迈高 = 0.6;
const { 空中水平阻力: 空气阻, 地面水平阻力: 地阻, 站着竖直速度 } = 原版运动;

export type 冲刺设定 = {
  /** 起点脚底（本地坐标，z 是绝对高） */
  起: V3;
  /** 视线的水平朝向（单位向量） */
  向: readonly [number, number];
  /** 视线仰角（度，往上为正；游戏里 xRot 往下为正，= −仰角） */
  仰角: number;
  /** 这一列（碰撞箱罩住的格子里最高的）站得住的高度 */
  地高: (x: number, y: number) => number;
  /** 算几刻，默认 旋刻 + 5 */
  刻数?: number;
};

export type 冲刺轨迹 = {
  设定: 冲刺设定;
  /** 第 k 刻末的脚底（k = 0 是起点） */
  点: readonly V3[];
  /** 第 k 刻末在不在地上 */
  在地: readonly boolean[];
  /** 第一次落地是第几刻 */
  落地刻: number;
  /** 水平冲出去多远（算到的最后一刻） */
  远: number;
};

/** 碰撞箱四个角下面最高的地（箱子 0.6 宽，比一格小，四个角就罩住了它压着的格子） */
const 箱下地高 = (地高: 冲刺设定['地高'], x: number, y: number) =>
  Math.max(地高(x - 半宽, y - 半宽), 地高(x + 半宽, y - 半宽), 地高(x - 半宽, y + 半宽), 地高(x + 半宽, y + 半宽));

export const 算冲刺 = (设: 冲刺设定): 冲刺轨迹 => {
  const 角 = (设.仰角 * Math.PI) / 180;
  const 推 = 断曜流光冲刺.推;
  // 站在地上时竖直速度是 −0.0784（上一刻的重力），push 加在它上面
  let v: [number, number, number] = [设.向[0] * Math.cos(角) * 推, 设.向[1] * Math.cos(角) * 推, Math.sin(角) * 推 + 站着竖直速度];
  let p: V3 = [...设.起];
  let 在地 = false; // setOnGround(false)
  const 点: V3[] = [p];
  const 地: boolean[] = [true];
  let 落地刻 = -1;
  const n = 设.刻数 ?? 断曜流光冲刺.旋刻 + 5;
  for (let k = 1; k <= n; k++) {
    const 阻 = 在地 ? 地阻 : 空气阻;
    // 先竖直、再水平（Entity.collide 先解 y）
    const 原地 = 箱下地高(设.地高, p[0], p[1]);
    let z = p[2] + v[2];
    let 落 = z <= 原地;
    if (落) z = 原地;
    let [x, y] = [p[0] + v[0], p[1] + v[1]];
    const 新地 = 箱下地高(设.地高, x, y);
    if (z < 新地) {
      if ((落 || 在地) && 新地 - z <= 迈高) z = 新地; // 迈上去
      else [x, y, v[0], v[1]] = [p[0], p[1], 0, 0]; // 撞墙：水平停住
    }
    const 脚下 = 箱下地高(设.地高, x, y);
    落 = v[2] <= 0 && z <= 脚下 + 1e-9;
    if (落) z = 脚下;
    p = [x, y, z];
    v = [v[0] * 阻, v[1] * 阻, 落 ? 站着竖直速度 : 下落一刻(z, v[2]).速];
    在地 = 落;
    if (落 && 落地刻 < 0) 落地刻 = k;
    点.push(p);
    地.push(落);
  }
  const 末 = 点[点.length - 1]!;
  return { 设定: 设, 点, 在地: 地, 落地刻, 远: Math.hypot(末[0] - 设.起[0], 末[1] - 设.起[1]) };
};

/** 冲出去后第 秒 秒的脚底：两刻之间线性插（同游戏的 partialTick）；冲之前在起点，算完以后停在最后一刻 */
export const 冲刺位 = (轨: 冲刺轨迹, 秒: number): V3 => {
  const 刻 = Math.max(0, 秒 * 20);
  const k = Math.floor(刻);
  if (k >= 轨.点.length - 1) return 轨.点[轨.点.length - 1]!;
  const [a, b] = [轨.点[k]!, 轨.点[k + 1]!];
  const f = 刻 - k;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
};

/** 起手竖直速度不为正（第一刻就贴地）的最大仰角：这以下冲多远都一样 */
export const 贴地仰角上限 = (Math.asin(-站着竖直速度 / 断曜流光冲刺.推) * 180) / Math.PI;
