// 2-第一晚 每一帧的状态：哪个机位、天上几刻、调子、聊天栏、死亡画面、你在哪什么姿势、坑挖到哪、裂纹、掉落物、洞里多暗、生物走到哪。
// 纯模块（画面和测试都引）：时刻取 分镜.ts 的正片事件，分寸取 场/2-第一晚/参数.ts。原版的东西按刻走（20 刻一秒），段内帧 × 20/24。
// 生物的姿势（走路摆腿）要引 库/ 的 tsx，在 画面.tsx 里按这里的 生物秒、走到 算。
import { clamp01 } from '@engine/anim/anim.ts';
import { 插调子, type 调子 as 调子类型 } from '@engine/三渲二/调子.ts';
import { fps, 段内正片事件帧, 段时钟, 段窗口 } from '../../分镜.ts';
import { 天亮 } from '../../地点/天体.ts';
import {
  光标,
  出生点x,
  地层,
  头,
  天窗挖帧,
  崖,
  快进,
  抬头帧,
  挖朝向,
  掉落物,
  摔时朝向,
  死亡消息们,
  洞里暗,
  站着vy,
  缩下帧,
  落点x,
  起始刻,
  重生关帧,
  重生到挖,
} from '../../场/2-第一晚/参数.ts';
import type { 坑态 as 坑态类型 } from '../../场/2-第一晚/地形.ts';
import { 在按钮上 } from '../../场/2-第一晚/界面布局.ts';
import { 色板 } from '../../色板.ts';

const 键 = '2-第一晚';
export const 事 = 段内正片事件帧(键);
export const 帧数 = 段时钟(键).帧数;
const 起帧 = 段窗口(键).起帧;
/** 段内帧 → 歌曲帧（颗粒的种子用它） */
export const 歌曲帧 = (f: number) => 起帧 + f;
/** 段内帧 → 歌上的秒（两臂轻晃按它走） */
export const 歌秒 = (f: number) => (起帧 + f) / fps;
/** 段内帧 → 段首起的游戏刻（不快进的真时间）。先乘后除：整帧数换整刻数时没有浮点零头（12 帧正好 10 刻） */
export const 刻 = (f: number) => (f * 20) / fps;

const 插 = (a: number, b: number, t: number) => a + (b - a) * t;
const 平滑 = (t: number) => {
  const q = clamp01(t);
  return q * q * (3 - 2 * q);
};

// ---------- 机位 ----------
export type 镜头 = '远' | '近';
/** 6.50（挖一）切近景，之后一镜不切 */
export const 镜头 = (f: number): 镜头 => (f < 事.挖一 ? '远' : '近');

// ---------- 快进 ----------
export const 快进起 = 事.填土 + 快进.起;
export const 夜止 = 快进起 + 快进.夜帧;
export const 快进止 = 事.挖开天窗 - 快进.止前;
const 实天刻 = (f: number) => 起始刻 + 刻(f);

/** 天上的刻（天色、太阳月亮）：快进前后照真时间走；快进里先缓入缓出翻到 夜到刻，再匀速走到 到刻 */
export const 天刻 = (f: number) => {
  if (f <= 快进起) return 实天刻(f);
  if (f <= 夜止) return 插(实天刻(快进起), 快进.夜到刻, 平滑((f - 快进起) / (夜止 - 快进起)));
  if (f <= 快进止) return 插(快进.夜到刻, 快进.到刻, (f - 夜止) / (快进止 - 夜止));
  return 快进.到刻 + 刻(f - 快进止);
};

/** 3D 和后期的调子：夜和夏日白天按原版天亮程度插 */
export const 调子 = (f: number): 调子类型 => 插调子(色板.夜, 色板.夏日白天, 天亮(天刻(f)));

/** 生物的钟（秒）：快进里按 生物倍速 走 */
export const 生物秒 = (f: number) => {
  const 快 = clamp01((f - 快进起) / (快进止 - 快进起)) * (快进止 - 快进起);
  return (f + 快 * (快进.生物倍速 - 1)) / fps;
};
/** 一只匀速往左（−x）走的生物：第 到帧 帧走到 到x，速度 米/秒（按生物的钟） */
export const 走到 = (f: number, 到x: number, 到帧: number, 速度: number) => 到x + 速度 * (生物秒(到帧) - 生物秒(f));

// ---------- 聊天栏 ----------
export type 聊天行 = { text: string; 起刻: number };
/** 三条死亡消息：第1句尾死亡消息、死亡消息二各一拍一行，第三条是摔死这一下的广播 */
export const 聊天行们: readonly 聊天行[] = [事.第1句尾死亡消息, 事.死亡消息二, 事.摔死].map((帧, i) => ({ text: 死亡消息们[i]!, 起刻: 刻(帧) }));
/** 快进前后聊天钟比真时间多走的刻：快进里每帧多走 聊天刻每帧，停的那一帧最后一行正好 200 刻（原版那一行消失） */
const 聊天跳 = 聊天行们[聊天行们.length - 1]!.起刻 + 200 - 刻(快进止) - 快进.聊天刻每帧 * (快进止 - 快进起);
/** 聊天栏的钟（刻）：快进那一帧起跳一截，快进里每帧多走 聊天刻每帧 */
export const 聊天刻 = (f: number) => (f < 快进起 ? 刻(f) : 刻(f) + 聊天跳 + 快进.聊天刻每帧 * (Math.min(f, 快进止) - 快进起));

// ---------- 死亡画面 ----------
export type 死亡画面态 = { 光标: readonly [number, number]; 重生: '不能按' | '平常' | '指着' };
/** 摔死那一拍打开，点重生后 重生关帧 帧关掉；光标打开后第 移起 帧起缓入缓出移到重生按钮上 */
export const 死亡画面态 = (f: number): 死亡画面态 | null => {
  if (f < 事.摔死 || f >= 事.点重生 + 重生关帧) return null;
  const t = 平滑((f - 事.摔死 - 光标.移起) / 光标.移帧);
  const 位 = [插(光标.起[0], 光标.到[0], t), 插(光标.起[1], 光标.到[1], t)] as const;
  const 重生 = f >= 事.点重生 ? '不能按' : 在按钮上(0, 位[0], 位[1]) ? '指着' : '平常';
  return { 光标: 位, 重生 };
};

// ---------- 坑、裂纹 ----------
/** 挖掉的三格（草方块、两格泥土），各在哪一帧挖掉 */
export const 挖们 = [事.挖一, 事.挖二, 事.挖三] as const;
export const 坑态 = (f: number): 坑态类型 => ({ 挖掉: 挖们.filter((b) => f >= b).length, 顶土: f >= 事.填土 && f < 事.挖开天窗 });

/** 四次方块碎掉（崩粒子、掉东西）：帧、哪一格（格中心，场景坐标） */
export const 碎们: readonly { 帧: number; 格: readonly [number, number, number] }[] = [
  ...挖们.map((帧, i) => ({ 帧, 格: [出生点x, 0.5, 地层.草 - i + 0.5] as const })),
  { 帧: 事.挖开天窗, 格: [出生点x, 0.5, 地层.草 + 0.5] as const },
];

/** 按住左键挖的几段：[起, 碎]，裂纹在这段里从 0 长到满 */
const 挖段们: readonly (readonly [number, number, number])[] = [
  // 重生后先低头，再开挖第一格（远景里就开始挥）；后两格接着上一格碎掉的下一帧
  [事.点重生 + 重生关帧 + 重生到挖, 事.挖一, 0],
  [事.挖一 + 1, 事.挖二, 1],
  [事.挖二 + 1, 事.挖三, 2],
];
const 天窗挖起 = 事.挖开天窗 - 天窗挖帧;

/** 裂纹：原版 destroyBlockProgress = (int)(进度 × 10) − 1，−1 不画。进度按帧末算（起的那一帧已经挖了一帧），碎前最后一帧是满的第 9 级 */
export const 裂纹态 = (f: number): { 格: readonly [number, number, number]; 级: number } | null => {
  const 段 = [...挖段们, [天窗挖起, 事.挖开天窗, 3] as const].find(([起, 碎]) => f >= 起 && f < 碎);
  if (!段) return null;
  const [起, 碎, i] = 段;
  const 级 = Math.floor(((f + 1 - 起) / (碎 - 起)) * 10) - 1;
  return 级 < 0 ? null : { 格: 碎们[i]!.格, 级 };
};

// ---------- 你 ----------
/** 挖方块按住左键时第 刻 刻的出手进度（刻从按下数起）：原版每刻调一次 swing()，挥过一半（3 刻）才重来，
 *  所以 0 → ½ 走三刻、½ → 1 一刻（getAttackAnim 跨过重来那一刻时按 +1 插值） */
export const 挖的出手 = (k: number) => {
  const φ = ((k % 4) + 4) % 4;
  return φ < 3 ? φ / 6 : 0.5 + (φ - 3) * 0.5;
};
/** 右键放方块挥一下：6 刻挥完 */
const 放的出手 = (k: number) => (k >= 0 && k < 6 ? k / 6 : 0);

/** 原版下落（每刻先挪 vy，再 vy = (vy − 0.08) × 0.98），从 0 掉 高 格，每刻的 z（最后一项落地 = −高） */
export const 下落 = (高: number, vy0 = 站着vy): number[] => {
  const out = [0];
  let z = 0;
  let vy = vy0;
  while (z > -高) {
    z = Math.max(-高, z + vy);
    vy = (vy - 0.08) * 0.98;
    out.push(z);
  }
  return out;
};
const 按刻取 = (路: readonly number[], k: number) => {
  if (k <= 0) return 路[0]!;
  const i = Math.floor(k);
  if (i >= 路.length - 1) return 路[路.length - 1]!;
  return 插(路[i]!, 路[i + 1]!, k - i);
};

const 摔路 = 下落(崖.顶);
const 一格路 = 下落(1);
/** 摔下来那一路要几刻（崖顶到地面） */
export const 摔刻数 = 摔路.length - 1;

export type 史蒂夫态 = {
  x: number;
  z: number;
  yaw: number;
  /** 头的俯仰（度，负 = 低头） */
  头: number;
  出手: number;
  蹲: boolean;
  /** 倒地角（度） */
  倒: number;
  红: boolean;
  拿土: boolean;
};

/** 第 i 块掉落物被捡起来的那一帧 */
export const 捡起帧 = (i: number) => 碎们[i]!.帧 + Math.ceil((掉落物.拾取延迟刻 * fps) / 20);

export const 史蒂夫态 = (f: number): 史蒂夫态 => {
  if (f < 事.摔死) {
    // 从崖顶掉下来，摔死那一拍落地
    const z = 按刻取(摔路, 摔刻数 + 刻(f - 事.摔死)) - 摔路[摔路.length - 1]!;
    return { x: 落点x, z, yaw: 摔时朝向, 头: 0, 出手: 0, 蹲: false, 倒: 0, 红: false, 拿土: false };
  }
  if (f < 事.点重生 + 重生关帧) {
    // 原版倒地：f = min(1, √((死后刻 − 1) / 20 × 1.6))，倒到 90°
    const 死后 = 刻(f - 事.摔死);
    const 倒 = 90 * Math.min(1, Math.sqrt(Math.max(0, ((死后 - 1) / 20) * 1.6)));
    return { x: 落点x, z: 0, yaw: 摔时朝向, 头: 0, 出手: 0, 蹲: false, 倒, 红: true, 拿土: false };
  }
  // 重生在出生点，往脚下挖：每挖掉一格掉一格
  let z = 0;
  挖们.forEach((b, i) => {
    if (f >= b) z = -i + 按刻取(一格路, 刻(f - b));
  });
  const 放抬起 = 事.填土 - 抬头帧;
  const 缩 = 事.填土 + 缩下帧;
  const 头角 =
    f < 放抬起 ? 头.挖 : f < 事.填土 ? 插(头.挖, 头.放, (f - 放抬起) / 抬头帧) : f < 缩 ? 头.放 : f < 天窗挖起 ? 头.缩 : 头.看天;
  const 挖起 = 挖段们[0]![0];
  let 出手 = 0;
  if (f >= 挖起 && f < 事.挖三) 出手 = 挖的出手(刻(f - 挖起));
  else if (f >= 天窗挖起 && f < 事.挖开天窗) 出手 = 挖的出手(刻(f - 天窗挖起));
  else if (f >= 事.填土) 出手 = 放的出手(刻(f - 事.填土));
  return { x: 出生点x, z, yaw: 挖朝向, 头: 头角, 出手, 蹲: f >= 缩 && f < 天窗挖起, 倒: 0, 红: false, 拿土: f >= 捡起帧(0) };
};

// ---------- 掉落物 ----------
/** 定死的伪随机（mulberry32），同一个种子每次一样 */
const 随机 = (种子: number) => {
  let a = 种子 >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

type 物路 = { 路: (readonly [number, number, number])[]; 偏: number };
const 半 = 掉落物.大小 / 2;
/** 第 i 块碎掉时掉的那块泥土：原版 popResource 生成、ItemEntity.tick 的物理；坑是一格宽的竖井（j = 0 那排），四面贴墙，底随挖的进度往下 */
const 物路们: 物路[] = 碎们.map(({ 帧, 格 }, i) => {
  const r = 随机(2024 + i * 7919);
  const 在 = (a: number) => a - 0.25 + r() * 0.5;
  let [x, y, z] = [在(格[0]), 在(格[1]), 在(格[2]) - 半];
  let [vx, vy, vz] = [r() * 0.2 - 0.1, r() * 0.2 - 0.1, 0.2];
  const 偏 = r() * Math.PI * 2;
  const 路: (readonly [number, number, number])[] = [[x, y, z]];
  for (let n = 1; n <= 40; n++) {
    const 底 = 地层.草 + 1 - 坑态(帧 + (n * fps) / 20).挖掉;
    vz -= 0.04;
    x += vx;
    y += vy;
    z += vz;
    let 着地 = false;
    if (z < 底) {
      z = 底;
      vz = 0;
      着地 = true;
    }
    const 夹 = (v: number, lo: number, hi: number, 速: number): [number, number] => (v < lo ? [lo, 0] : v > hi ? [hi, 0] : [v, 速]);
    [x, vx] = 夹(x, 格[0] - 0.5 + 半, 格[0] + 0.5 - 半, vx);
    [y, vy] = 夹(y, 半, 1 - 半, vy);
    const 摩 = 着地 ? 0.6 * 0.98 : 0.98;
    vx *= 摩;
    vy *= 摩;
    vz *= 0.98;
    路.push([x, y, z]);
  }
  return { 路, 偏 };
});

const 路上 = (路: 物路['路'], k: number): [number, number, number] => {
  const i = Math.max(0, Math.min(路.length - 2, Math.floor(k)));
  const t = clamp01(k - i);
  return [插(路[i]![0], 路[i + 1]![0], t), 插(路[i]![1], 路[i + 1]![1], t), 插(路[i]![2], 路[i + 1]![2], t)];
};

/** 这一帧看得见的掉落物：方块中心（含原版的上下浮）、绕竖轴转角（弧度）。捡起时 3 刻飞到你脚底往上 0.5 格（按平方缓入） */
export const 掉落物们 = (f: number): { 位: readonly [number, number, number]; 转: number }[] => {
  const out: { 位: readonly [number, number, number]; 转: number }[] = [];
  碎们.forEach(({ 帧 }, i) => {
    if (f < 帧) return;
    const 龄 = 刻(f - 帧);
    const { 路, 偏 } = 物路们[i]!;
    const 浮 = Math.sin(龄 / 10 + 偏) * 0.1 + 0.1;
    const 转 = 龄 / 20 + 偏;
    const 显示高 = 掉落物.大小; // ground 显示变换：0.25 × 缩放 0.25 + 3/16 = 0.25
    if (龄 < 掉落物.拾取延迟刻) {
      const p = 路上(路, 龄);
      out.push({ 位: [p[0], p[1], p[2] + 浮 + 显示高], 转 });
      return;
    }
    const 飞 = 龄 - 掉落物.拾取延迟刻;
    if (飞 >= 掉落物.飞刻) return;
    const p = 路上(路, 掉落物.拾取延迟刻);
    const 你 = 史蒂夫态(f);
    const 到: [number, number, number] = [你.x, 0.5, 你.z + 0.5];
    const t = (飞 / 掉落物.飞刻) ** 2;
    out.push({ 位: [插(p[0], 到[0], t), 插(p[1], 到[1], t), 插(p[2], 到[2], t) + 浮 + 显示高], 转 });
  });
  return out;
};

// ---------- 洞里的暗 ----------
const 亮度 = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
};
/** 封顶那段压在坑里的黑的不透明度：洞里看到的亮度一直是夜里地面的 洞里暗 倍，外面天亮了洞里不跟着亮 */
export const 洞暗 = (f: number) => {
  if (f < 事.填土 || f >= 事.挖开天窗) return 0;
  return clamp01(1 - (亮度(色板.夜.色调) * (1 - 洞里暗)) / 亮度(调子(f).色调));
};
