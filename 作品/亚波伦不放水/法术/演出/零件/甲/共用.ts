// 甲组各法术共用的小工具（纯，.元.ts 也引）。坐标是场景坐标（Z 朝上）。
import type { 点 } from '../../接口.ts';
import { 命中刻, 抛到, 抛物线, 混, 长, type 弹道 } from '../弹道.ts';

/** 打史蒂夫的哪：胸口（脚底上 0.9 格），同样板 灵魂束 */
export const 瞄点 = (目标: 点): 点 => [目标[0], 目标[1], 目标[2] + 0.9];

/** 第一次落到 地 这个高度的刻（带小数）；上限刻内没落返回 null */
export const 落地刻 = (道: 弹道, 地: number, 上限刻 = 400): number | null => {
  for (let n = 0; n < 上限刻; n++) {
    const [a, b] = [道(n)[2], 道(n + 1)[2]];
    if (b <= 地 && a > 地) return n + (a - 地) / (a - b);
    if (a <= 地) return n;
  }
  return null;
};

/** 弹什么时候没：碰到史蒂夫（离瞄点 半径 以内）或落地，取先到的；都没有取 上限刻 */
export const 终刻 = (道: 弹道, 目标: 点, 半径 = 0.5, 上限刻 = 400): number => Math.min(命中刻(道, 瞄点(目标), 半径, 上限刻) ?? 上限刻, 落地刻(道, 目标[2], 上限刻) ?? 上限刻);

/** 带小数的刻的位置（同 弹道位置，这里给终点用） */
export const 道上 = (道: 弹道, 刻: number): 点 => {
  const n = Math.max(0, Math.floor(刻));
  return 混(道(n), 道(n + 1), Math.max(0, 刻) - n);
};

export const 高斯 = (r: () => number) => Math.sqrt(-2 * Math.log(1 - r() * 0.999999)) * Math.cos(2 * Math.PI * r());

/** ProjectileUtil.rotateTowardsMovement 的角（度）：yaw = atan2(vz, vx) + 90，pitch = atan2(水平, vy) − 90（游戏坐标：vy 竖直，vz = −场景 y） */
export const 转向角 = (向: 点): { yaw: number; pitch: number } => ({
  yaw: (Math.atan2(-向[1], 向[0]) * 180) / Math.PI + 90,
  pitch: (Math.atan2(Math.hypot(向[0], 向[1]), 向[2]) * 180) / Math.PI - 90,
});

/** 整数刻 a ≤ n < b（b 取到当前刻为止，免得给还没出生的粒子建表） */
export const 各刻 = (a: number, b: number): number[] => Array.from({ length: Math.max(0, Math.ceil(b) - Math.ceil(a)) }, (_, i) => Math.ceil(a) + i);

export const 十六色 = (hex: number): readonly [number, number, number] => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

/** Projectile.updateRotation 的角（度）：yaw = atan2(vx, vz)，pitch = atan2(vy, 水平)（箭、投掷物的渲染器用） */
export const 箭角 = (向: 点): { yaw: number; pitch: number } => {
  const [vx, vy, vz] = [向[0], 向[2], -向[1]];
  return { yaw: (Math.atan2(vx, vz) * 180) / Math.PI, pitch: (Math.atan2(vy, Math.hypot(vx, vz)) * 180) / Math.PI };
};

/**
 * 抛射物（箭、投掷物）朝 瞄 打：游戏里是照视线方向以 速率 出手、靠玩家自己抬枪口；片里要打中，
 * 这里挑最少的飞行刻数，让正好落在 瞄 上的初速不超过 速率（比 速率 慢一点点，方向略抬）。返回弹道和到 瞄 的刻。
 */
export const 抛射道 = (起: 点, 瞄: 点, 速率: number, 选: { 阻力?: number; 重力?: number } = {}): { 道: 弹道; 到刻: number } => {
  // 飞得越久要的初速越小（再久就成了高抛）：取平射那一支里第一个不超过 速率 的刻数
  let 好 = { n: 200 };
  for (let n = 1; n <= 200; n++) {
    if (长(抛到(起, 瞄, n, 选)) <= 速率) {
      好 = { n };
      break;
    }
  }
  return { 道: 抛物线(起, 抛到(起, 瞄, 好.n, 选), 选), 到刻: 好.n };
};
