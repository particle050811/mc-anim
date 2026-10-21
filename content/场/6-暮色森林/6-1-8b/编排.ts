// 6-1-8b 穿刺巨人：荆棘高地上空的云中小屋（模型/场景/云中小屋.tsx），两个巨人都在屋里。一镜到底（镜头/一镜到底/）按这里的穿刺线排扫帚路线、在这里的时刻放慢时钟。
// 时间一律是物理时间 t（秒）：t = 0 是矛尖贯穿第一个巨人的那一刻。坐标是云中小屋网格的本地坐标（Z 朝上、北 = +Y），
// 小屋在世界里的位置见 模型/场景/暮色新世界.tsx 的地标表（'云中小屋'：只平移、不转，本地方位就是世界方位）。
// 小屋 16×16 格（本地 x -16.5～-0.5、y -7.5～8.5），巨石墙 4 格厚、12 格高，屋里只有 8×8×12（x -12.5～-4.5、y -3.5～4.5、地面 z=10、顶 z=22），门在西墙。
// 两个巨人（模型/角色/巨人.tsx，8 格高、胸口 5.5）一前一后站在穿刺线上：矿工在前（南）、武装巨人在后，都面朝来向。
// 穿刺方位 345°（由南偏东往北偏西；用户 10-05 在航线图上画红线定「在宫殿东边往北拐、直上云中小屋」）：宫殿出来去小屋的方向约 335°，
// 瞄正北的话进对正前还要右转 26°、是个 S 弯；瞄 345° 只剩 4°，差的 15° 挪到穿出小屋 110 米以后、降落以前低速时补一个右转
// （归档/参考模型库/工具/一镜到底/直航设计.ts 的 `spots`；小屋为此往东挪了 37 米，见 暮色新世界.tsx）。体素扫过，345° 撞南墙、穿过屋里、撞穿北墙，西墙的门、东墙都碰不到。
// 矿工留在原位，武装巨人往线上挪到它身后 3.6 格；两个都转过来面朝扫帚来的方向（方位 165°）。
// 屋里只有 8 格见方，按近景放慢（子弹时间，同巫妖、冰雪女王）演两个巨人被串起来、化成白烟；扫帚物理速度 320 米/秒、在屋里不变。
// 镜头（用户 10-02 要求侧视角）：接近小屋时绕到穿刺线右手边（方位 75°，偏东），隔着做成剖面的东墙从侧面看完撞墙、贯穿两个巨人和化烟，
// 再跟着扫帚从小屋东侧并排飞出去、绕回扫帚后方（见下面 `CUT_BOX` 和 一镜到底/镜头.ts 的 `nearCutaway`）。
import type { V3 } from '../../../../engine/model/parts.tsx';
import { GIANT } from '../../../../world/角色/巨人.tsx';
import { broomFromTip, TIP_LOCAL } from '../../../../world/角色/骑扫帚持矛.tsx';
import { twilightLandmark } from '../../../../world/地点/暮色新世界.tsx';
import { SPEAR_FIT } from '../../../../world/物品/动力钻头.tsx';
import { closeupBreakClockScale } from '../../../../world/特效/方块破坏粒子.tsx';
import { bossDeathOpacity } from '../../../../world/特效/战利品箱碎裂.tsx';
import type { 矛管 } from '../../../../world/特效/方块飞溅.tsx';
import debrisRaw from 'asset:碎块/镜头/6-1-8b/碎块';
import { toppleDuration, deathToFlatRatio, knockbackOffsetAt } from '../../../../world/特效/生物死亡.tsx';

const cottageFrame = twilightLandmark('云中小屋');
if (cottageFrame.转 !== 0) throw new Error('6-1-8b：云中小屋转了向，toWorld、戏.tsx 的摆放要改成按 地标位 / 到世界');
export const 小屋原点 = cottageFrame.原点;
export const V = 320;
export const FLOOR = 10;
// 穿刺方位（度，0 = 北、顺时针）；YAW 是编排用的朝向（0 = 北、往左为正）= 360 − 方位 = 15
export const 方位 = 345;
export const YAW = 360 - 方位;
const RAD = Math.PI / 180;
// 穿刺线的前向、右手方向（本地水平单位向量）
const FX = Math.sin(方位 * RAD);
const FY = Math.cos(方位 * RAD);
export const 击退向: V3 = [FX, FY, 0];
const RX = FY;
const RY = -FX;
// 矛尖贯穿矿工（a = 0）的地方：矿工站的位置，没挪
const G0 = [-8.5, -1.3];
// 穿刺线上 a 处（矛尖沿线走的水平距离，贯穿矿工 = 0）往右手边偏 右 米的点（本地水平坐标）
export const 线上 = (a: number, rightOffset = 0): [number, number] => [G0[0] + FX * a + RX * rightOffset, G0[1] + FY * a + RY * rightOffset];
// 本地的点离穿刺线往右手边（镜头那一侧）多远
export const 右偏 = (p: number[]) => (p[0] - G0[0]) * RX + (p[1] - G0[1]) * RY;
// 穿刺线碰到 y = 常数的墙面时的 a（南北墙面都是 y 常数）
const wallA = (y: number) => (y - G0[1]) / FY;
export const GIANTS: { 种类: '矿工' | '武装'; a: number; at: V3 }[] = [
  { 种类: '矿工', a: 0, at: [...线上(0), FLOOR] },
  { 种类: '武装', a: 3.6, at: [...线上(3.6), FLOOR] },
];
// 巨人模型面朝 -Y（南）；绕 Z 逆时针转 15°，面朝方位 165°，正对冲过来的扫帚（弧度）
export const GIANT_YAW = YAW * RAD;
const CHEST = FLOOR + GIANT.chest;
const SOUTH_FACE = -7.5;
const NORTH_FACE = 8.5;
export const tipLocal = (a: number): V3 => [...线上(a), CHEST];
export const toWorld = (p: number[]): V3 => [p[0] + 小屋原点[0], p[1] + 小屋原点[1], p[2] + 小屋原点[2]];
// 撞、出：矛尖碰到南墙外表面、北墙外表面（斜着走 15°，比正北时长 1/cos15°：-6.42、+10.15；直航设计 按网格体素沿这条线量过，一样）
const impactA = wallA(SOUTH_FACE);
const exitA = wallA(NORTH_FACE);
export const 穿刺线 = {
  名: '巨人',
  V,
  朝向: cottageFrame.朝向(YAW),
  矛尖: (a: number) => toWorld(tipLocal(a)),
  // 前：撞墙前平着对正 320 米（同各处）；后：穿出后直飞 100 米，再右转 15° 接降落航线（直航设计 的 对正、后余）
  前: impactA - 320,
  后: exitA + 100,
  撞: impactA,
  出: exitA,
  // 两个巨人都面朝来向，矛尖扎进胸口正面：身子 4 像素厚 × 放大 4 倍 = 1 格，各在身子中心前 0.5 碰到（这一刻死，东西掉在脚下，见 一镜到底/战利品.tsx）
  身: GIANTS.map((g) => ({ 心: g.a, 触: g.a - 0.5 })),
};
export const broomLocal = (t: number): V3 => broomFromTip(tipLocal(V * t), YAW);

// ---------- 物理时刻（秒，贯穿第一个巨人 = 0） ----------
export const T_SOUTH = 穿刺线.撞 / V;
export const T_SECOND = GIANTS[1].a / V; // 贯穿第二个
export const T_NORTH = 穿刺线.出 / V;
// 矛尖碰到各自身子的时刻：这一刻就死了，一下子变成半透明（同 6-1-5 巫妖；巨人不出箱子，掉落物同一刻掉在脚下，半透明的身子不挡着它们被吸走）
export const T_TOUCH = 穿刺线.身.map((b) => b.触 / V);
// 倒平、化成白烟（模型/特效/生物死亡.tsx 的 倒地：胸口绕脚底的线速度 = 飞行速度，胸口离脚底 5.5 米，倒平 27 毫秒，化烟 40 毫秒）
export const T_倒 = toppleDuration(GIANT.chest, V);
export const T_DEATH = T_TOUCH.map((t) => t + T_倒 * deathToFlatRatio);
export const 放慢 = { 起: T_SOUTH - 0.003, 止: T_DEATH[1] + 0.004 };
export const 特效倍速 = 28;

// ---------- 墙 ----------
// 洞 4.8 格宽、5.6 格高（矛尖高度往下 2、往上 3.6），顺着矛斜着钻过 4 格厚的墙：墙里每一排方块（y 方向一格，方块中心在整数 y 上，
// 南墙 -7～-4、北墙 5～8）一个盒子，按矛尖线在这一排正中的 x 左右各 2.4。线斜 15°，穿一面墙往西挪 1.1 格，
// 整面墙用一个直的盒子的话要宽出一格多，洞口成了一个歪着的大方框。盒子由 工具/一镜到底/巨人洞.ts 打印给 npm run 取材 -- 6-1-8b碎块。
// 南墙外面两排的洞往东够到 x -5 那一列，那一列是东墙剖面外扩的一格，从藏东墙起就由剖面的外圈画；
// 洞再挖进去的话，藏东墙到撞墙之间那几格网格里藏了、碎块又还没出来，断面上缺一块，所以洞的东边截在 x -5.5
const holeEastEdge = -5.5;
const rowBox = (y: number): number[] => {
  const x = 线上(wallA(y))[0];
  return [x - 2.4, y - 0.5, CHEST - 2, Math.min(x + 2.4, holeEastEdge), y + 0.5, CHEST + 3.6].map((v) => Math.round(v * 100) / 100);
};
export const HOLE_BOXES = { 南: [-7, -6, -5, -4].map(rowBox), 北: [5, 6, 7, 8].map(rowBox) };
// 东墙（x -4.7～-0.3、整面、地面到屋顶下沿）在镜头这一侧做成剖面：整面藏掉，墙的断面由碎块数据的洞壁补上，
// 屋顶、地面、南北墙和西墙都留着，像剖开的娃娃屋。
export const CUT_BOX = [-4.7, -7.7, FLOOR - 0.2, -0.3, NORTH_FACE + 0.2, 22.2];
// 什么时候藏东墙：镜头一路在东墙那个面的东边，看得到东墙外面，藏早了屋子东边会当着镜头一下子少一截（藏得太晚也不行：375 米外就看得见屋里的白墙和巨人）。
// 所以藏在镜头往右绕出去、视线跟着扫帚转开的那几帧里：一镜到底 镜头.ts 的屋外侧视（`nearCutaway`）撞墙前 26～11 帧东墙整个在画面外
// （贯穿前 0.76～0.18 秒，离小屋 240～60 米），取中间。改了 路线.ts 巨人那一程的速度或 镜头.ts 的 `nearCutaway`、保画内 以后，
// 跑 工具/一镜到底/巨人剖面.ts 核对藏的那一刻东墙还在不在画面外
export const T_CUT = -0.47;
// 碎块往前偏左（背着右手边的镜头）、往上飞，散得慢一点，不糊到镜头前：沿线往前 0.9、往右 -0.38、往上 0.2（正北时就是 [-0.38, 0.9, 0.2]）
const DEB = { speed: 0.45 * V, spread: 26, spin: 70 };
const AWAY: V3 = [0.9 * FX - 0.38 * RX, 0.9 * FY - 0.38 * RY, 0.2];
// 矛管（用户 2026-10-02 追加）：矛尖连钻头虚影扫过的那一管方块当场崩成原版破坏粒子，不整块飞（模型/特效/方块飞溅.tsx）；
// 点的时刻相对各自那次撞击（南墙、北墙）。常量对象：哪些格子在管里只算一次
const tubeFor = (impactTime: number): 矛管 => ({
  点: Array.from({ length: 27 }, (_, k) => {
    const dist = k - 9;
    return [...tipLocal(dist), dist / V - impactTime];
  }),
  半径: SPEAR_FIT.tubeRadius,
  particleClockScale: closeupBreakClockScale.墙,
});
const southTube = tubeFor(T_SOUTH);
const northTube = tubeFor(T_NORTH);
// 撞击中心：矛尖线进墙半格处往右手边挪 1.2（碎块从这里往外散，多数往左手边、背着镜头飞）
const impactCenter = (y: number): V3 => [...线上(wallA(y), 1.2), CHEST + 0.4];
// 碎块分三组（碎块.json 里每格的 box），debrisBursts 按组号排：
// 0 剖面（只藏、不出碎块，断面的洞壁照画）、1 南墙洞、2 北墙洞
export const 碎块组 = { 剖面: 0, 南: 1, 北: 2 } as const;
export const debrisBursts = (t: number) => [
  { sec: -1, dir: AWAY, origin: [-2.5, 0, 16] as V3, speed: 0, spread: 0, seed: 53, skip: true, hidden: t >= T_CUT },
  { sec: t - T_SOUTH, dir: AWAY, origin: impactCenter(SOUTH_FACE + 0.5), speed: DEB.speed, spread: DEB.spread, seed: 51, gravity: 16, stagger: 0.0004, chips: 12, spin: DEB.spin, 管: southTube },
  { sec: t - T_NORTH, dir: AWAY, origin: impactCenter(NORTH_FACE - 0.5), speed: DEB.speed, spread: DEB.spread * 1.3, seed: 52, gravity: 16, stagger: 0.0004, chips: 16, spin: DEB.spin, hidden: t >= T_SOUTH, 管: northTube },
];
// 碎块.json 的盒子按 剖面、南墙各排、北墙各排 的顺序导出，碎块分组.py 再按 碎块分组 把格子并成上面三组。
// 剖面排第一：洞外扩的那一圈和剖面外扩的那一圈重叠的格子（x -5 那一列）算第一个碰到的盒子，要归剖面，藏东墙时一起画出来
export const 碎块盒子 = [CUT_BOX, ...HOLE_BOXES.南, ...HOLE_BOXES.北];
export const 碎块分组 = [1, 1 + HOLE_BOXES.南.length];
// 盒子各自外扩一格以后的范围（碎块.json 的 hide，每个盒子一个，顺序同 碎块盒子）：整块从网格里拿掉，由碎块和原地的外圈方块顶替
const HIDES = (debrisRaw as { hide: number[][] }).hide;
const HIDE_BEFORE: number[][] = [];
const HIDE_CUT = [HIDES[0]];
const HIDE_ALL = HIDES;
export const hideFor = (t: number) => {
  // 碎块.json 是旧的（盒子数对不上）时不能悄悄画错：藏的范围会和碎块对不上，墙上缺块
  if (HIDES.length !== 碎块盒子.length) throw new Error(`6-1-8b/碎块.json 有 ${HIDES.length} 个盒子，编排是 ${碎块盒子.length} 个：npm run 取材 -- 6-1-8b碎块 重导`);
  return t < T_CUT ? HIDE_BEFORE : t < T_SOUTH ? HIDE_CUT : HIDE_ALL;
};

// ---------- 巨人 ----------
// 两个巨人原地不动（用户 10-07 定：从南墙破到矛串上它们不到 0.03 秒，巨人根本反应不过来）。矛尖碰到就死：变红、变半透明（同巫妖），
// 朝矛的方向倒下、被击退，化成白烟
export const giant = (i: number, t: number) => {
  const giantDef = GIANTS[i];
  return {
    pos: giantDef.at,
    受伤: t >= T_TOUCH[i] ? 1 : 0,
    倒: t >= T_TOUCH[i] ? (t - T_TOUCH[i]) / T_倒 : 0,
    knockbackOffset: knockbackOffsetAt(击退向, t - T_TOUCH[i]),
    opacity: t >= T_TOUCH[i] ? bossDeathOpacity : 1,
    alive: t < T_DEATH[i],
  };
};
// 白烟在它被击退以后站的地方（原版按碰撞箱放，碰撞箱不跟着倒）
export const deathPos = (i: number): V3 => {
  const giantDef = GIANTS[i];
  const knockback = knockbackOffsetAt(击退向, T_DEATH[i] - T_TOUCH[i]);
  return [giantDef.at[0] + knockback[0], giantDef.at[1] + knockback[1], giantDef.at[2] + knockback[2] + GIANT.height / 2];
};
export const 出场 = { 起: -40, 止: 30 };
export { TIP_LOCAL };
