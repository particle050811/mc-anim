// 6-1-8 穿刺冰雪女王：极光宫殿这一处的几何和动作。一镜到底（镜头/一镜到底/）按这里的穿刺线排扫帚的路线、在这里的时刻放慢时钟。
// 时间一律是物理时间 t（秒）：t = 0 是矛尖贯穿冰雪女王的那一刻。坐标是极光宫殿网格的场景坐标（模型/场景/极光宫殿.tsx，Z 朝上、北 = +Y），
// 到世界坐标经 `宫殿框` 的 `到世界`（模型/场景/暮色新世界.tsx；网格转 −90，本地的北 = 世界的东）。下面说的南、北、东、西都是网格本地的方向，几何、碎块、冰盾跟着网格一起转。
//
// 极光冰川，一整块平的冰原上只立着极光宫殿。直航（用户 10-05 红线：雪怪洞窟一路往东直穿极光宫殿、在宫殿东边往北拐、直上云中小屋）：
// 扫帚穿出雪怪洞窟以后一路往东，先放平一小段再匀着爬 110 米上来（一镜到底/路线.ts 的 `climbProfile`），平端长矛由本地南往北撞穿宫殿顶层的南墙，贯穿冰雪女王，撞穿北墙飞出去，左转 109° 往北去云中小屋。镜头一直跟在扫帚后面，从破洞里进出。
// 扫帚物理速度 320 米/秒、在房间里不变；近景才缩放时间（用户要求，以便展示 boss 的死亡过程）：撞墙到贯穿只有 7.5 米、0.023 秒：
// 南墙一破，贯穿她，绕着她转的 7 块冰盾被连人带矛撞散 → 化成白烟 → 撞穿北墙。时钟在撞墙前后放慢（倍数见 一镜到底/路线.ts）。
// 冰盾、碎块、冰碴按物理时间走，速度按 320 米/秒的撞击算；粒子特效的时钟按 `特效倍速` 加快（同 6-1-5）。
//
// 宫殿顶层：冰雪女王的房间在一座高塔顶上（刷怪方块 (-28.5, 5, 174)，地板 z=171、天花板 z=180），四面墙各一格厚、外面都是空的（南墙 y -2.5～-1.5，北墙 y 11.5～12.5）。
// 冰雪女王会飞，平时悬在半空，这里让她悬在刷怪方块的高度（脚离地板 3 格）。
import type { V3 } from '../../../../engine/model/parts.tsx';
import { rng } from '../../../../engine/model/parts.tsx';
import { iceShieldCenters, SNOW_QUEEN } from '../../../../world/生物/冰雪女王.tsx';
import { broomFromTip, TIP_LOCAL } from '../../../../world/角色/骑扫帚持矛.tsx';
import { twilightLandmark } from '../../../../world/地点/暮色新世界.tsx';
import { SPEAR_FIT } from '../../../../world/物品/动力钻头.tsx';
import { closeupBreakClockScale } from '../../../../world/特效/方块破坏粒子.tsx';
import { bossDeathOpacity } from '../../../../world/特效/战利品箱碎裂.tsx';
import type { 矛管 } from '../../../../world/特效/方块飞溅.tsx';
import debrisRaw from 'asset:碎块/镜头/6-1-8/碎块';
import { toppleDuration, deathToFlatRatio, knockbackOffsetAt } from '../../../../world/特效/生物死亡.tsx';

export const 宫殿框 = twilightLandmark('极光宫殿');
export const V = 320;
export const FLOOR = 171;
export const QUEEN_AT: V3 = [-28.5, 5, 174];
const CHEST = QUEEN_AT[2] + SNOW_QUEEN.chest;
const SOUTH_FACE = -2.5;
const NORTH_FACE = 12.5;
export const YAW = 0; // 朝北
export const tipLocal = (a: number): V3 => [QUEEN_AT[0], QUEEN_AT[1] + a, CHEST];
export const toWorld = (p: number[]): V3 => 宫殿框.到世界(p);
const impactA = SOUTH_FACE - QUEEN_AT[1];
const exitA = NORTH_FACE - QUEEN_AT[1];
export const 穿刺线 = {
  名: '冰雪女王',
  V,
  朝向: 宫殿框.朝向(YAW),
  矛尖: (a: number) => toWorld(tipLocal(a)),
  // 前：撞墙前 320 米（1 秒）的对正直飞；后：穿出来再直飞 100 米才拐（一镜到底/路线.ts 的 对正、后余，各处一样）
  前: impactA - 320,
  后: exitA + 100,
  撞: impactA,
  出: exitA,
  // 她面朝南，矛尖扎进胸口正面：身子 4 像素厚 × 渲染放大 1.2 倍，-0.15 碰到（平伸的两手在肩膀高度、在矛尖两边，碰不到）
  身: [{ 心: 0, 触: -0.15 }],
};
export const broomLocal = (t: number): V3 => broomFromTip(tipLocal(V * t), YAW);

// ---------- 物理时刻（秒，贯穿 = 0） ----------
export const T_SOUTH = 穿刺线.撞 / V;
export const T_NORTH = 穿刺线.出 / V;
// 矛尖碰到她：这一刻就死了，一下子变成半透明（同 6-1-5 巫妖：战利品箱同一刻冒在她身上，见 一镜到底/战利品.tsx）
export const T_TOUCH = 穿刺线.身[0].触 / V;
// 倒平、化成白烟（模型/特效/生物死亡.tsx 的 倒地：胸口绕脚底的线速度 = 飞行速度）
export const T_倒 = toppleDuration(SNOW_QUEEN.chest, V);
export const T_DEATH = T_TOUCH + T_倒 * deathToFlatRatio;
// 白烟的时钟：比 特效倍速 再快一倍（同 6-1-5 巫妖的白烟、药水），散得快
export const 白烟倍速 = 55;
export const 放慢 = { 起: T_SOUTH - 0.003, 止: T_DEATH + 0.005 };
export const 特效倍速 = 28;

// ---------- 墙 ----------
export const HOLE_BOXES = [
  [-30.6, -3.9, 172.6, -26.4, -1.6, 176.9], // 0 南墙（进）
  [-30.6, 10.6, 172.6, -26.4, 12.9, 176.9], // 1 北墙（出）
];
// 房间里的刷怪方块：游戏里冰雪女王刷出来以后就没了。上沿压在 178 以下：天花板底面高低不平（178、179、180 三层），盒子盖到上面会把下垂的两层藏掉、从屋里往上看露天
export const ROOM_CLEAR = [-34.9, -1.4, 171.05, -22.6, 11.4, 177.9];
// 碎块往北偏东、往上飞（背着从扫帚左手边（西）侧看的镜头，也别糊在跟着出墙的镜头前），散得慢一点
const DEB = { speed: 0.55 * V, spread: 24, spin: 70 };
const AWAY: V3 = [0.4, 0.88, 0.25];
// 矛管：矛尖连钻头虚影扫过的那一管方块当场崩成原版破坏粒子，不整块飞（用户 10-02；模型/特效/方块飞溅.tsx）；点的时刻相对各自那次撞击（南墙、北墙）。常量对象：哪些格子在管里只算一次
const tubeFor = (impactTime: number): 矛管 => ({
  点: Array.from({ length: 31 }, (_, k) => {
    const dist = k - 15;
    return [...tipLocal(dist), dist / V - impactTime];
  }),
  半径: SPEAR_FIT.tubeRadius,
  particleClockScale: closeupBreakClockScale.墙,
});
const southTube = tubeFor(T_SOUTH);
const northTube = tubeFor(T_NORTH);
// 北墙的洞分两步藏：撞南墙时一起藏、北墙的洞由碎块原位补画的话，补画颜色和网格对不上（碎块染色按整份数据里同一张贴图最亮的那一面取，极光块在网格里是另一种染色），
// 绿墙上会多出一块青色方框一直挂到北墙被撞开，正好是整段绕圈的背景。所以矛尖快进北墙那一行（洞盒子靠屋里的一边，宫殿本地 y 10.6）前半毫秒才藏北墙那一组。代价是放慢的几秒里多重建一次网格
export const T_北藏 = (HOLE_BOXES[1][1] - QUEEN_AT[1]) / V - 0.0005;
export const debrisBursts = (t: number) => [
  { sec: t - T_SOUTH, dir: AWAY, origin: [-29.6, -2, 175.2] as V3, speed: DEB.speed, spread: DEB.spread, seed: 31, gravity: 16, stagger: 0.0004, chips: 14, spin: DEB.spin, 管: southTube },
  { sec: t - T_NORTH, dir: AWAY, origin: [-29.6, 12, 175.2] as V3, speed: DEB.speed, spread: DEB.spread * 1.3, seed: 32, gravity: 16, stagger: 0.0004, chips: 18, spin: DEB.spin, hidden: t >= T_北藏, 管: northTube },
];
// 洞的盒子各自外扩一格以后的范围（碎块.json 的 `hide`，南墙一个、北墙一个）：整块从网格里拿掉，由碎块和原地的外圈方块顶替。三种组合各用同一个数组对象
const HIDES = (debrisRaw as unknown as { hide: number[][] }).hide;
const HIDE_BEFORE = [ROOM_CLEAR];
const HIDE_SOUTH = [ROOM_CLEAR, HIDES[0]];
const HIDE_ALL = [ROOM_CLEAR, ...HIDES];
export const hideFor = (t: number) => (t < T_SOUTH ? HIDE_BEFORE : t < T_北藏 ? HIDE_SOUTH : HIDE_ALL);
// 冰碴：撞墙时迸出的碎冰片（速度按撞击放大）
export const iceShards = (t: number) => [
  { sec: (t - T_SOUTH) * 特效倍速 * 0.5, origin: [-28.5, -2.2, 175.2] as V3, dir: [0, 1, 0.05] as V3, seed: 1, count: 30, speed: 14 },
  { sec: (t - T_NORTH) * 特效倍速 * 0.5, origin: [-28.5, 12.6, 175.2] as V3, dir: [0, 1, 0.05] as V3, seed: 2, count: 36, speed: 18 },
];

// ---------- 冰雪女王 ----------
// 平时面朝南（扫帚飞来的方向，镜头看得到她的脸）悬着，反应不过来、一动不动（同巨人，用户 10-07；南墙一破就两手平伸要放光束的做法删了）。
// 矛尖一碰到就死：变红、变半透明（同巫妖），朝北（矛的方向）倒下、被击退，化成白烟
export const 击退向: V3 = [0, 1, 0];
export const queen = (t: number) => ({
  pos: QUEEN_AT,
  受伤: t >= T_TOUCH ? 1 : 0,
  倒: t >= T_TOUCH ? (t - T_TOUCH) / T_倒 : 0,
  knockbackOffset: knockbackOffsetAt(击退向, t - T_TOUCH),
  opacity: t >= T_TOUCH ? bossDeathOpacity : 1,
  alive: t < T_DEATH,
});
// 白烟的中心往扫帚左手边（本地西）挪开 2.3 米、压到腰的高度（同 6-1-5 巫妖的 `LICH_DEATH_POS`）：化烟时镜头正从右边绕回扫帚身后、顺着矛的路线钻过去，烟放在她身上镜头会穿过烟团，画面几乎全白
const smokeOffset = knockbackOffsetAt(击退向, T_DEATH - T_TOUCH);
export const DEATH_POS: V3 = [QUEEN_AT[0] + smokeOffset[0] - 2.3, QUEEN_AT[1] + smokeOffset[1], QUEEN_AT[2] + smokeOffset[2] + 0.9];

// 冰盾（7 块浮冰，见 模型/角色/冰雪女王.tsx）：平时绕着女王脚边转（按物理时间，放慢以后几乎不动）；贯穿那一刻被扫帚连人带矛撞散，每块往外、顺着扫帚的方向翻滚着飞出去，速度按 320 米/秒的撞击算
export const QUEEN_CLOCK0 = 11.3;
// 冰盾撞散以后的运动：贯穿那一刻的位置、速度、翻滚轴和转速。
// 撞散的速度按随机数给，再收一下，让每一块都从北墙撞开的洞里飞出去（不收的话有的在北墙还没撞开时就碰到墙，有的 x 在洞外）：
// 照原速度算出前缘碰到北墙内表面（宫殿本地 y 11.5）的时刻和位置，位置夹进洞口（洞的 x、z 范围往里收 0.6 格，冰盾一格见方），时刻不早于北墙撞开（`T_NORTH`，碎块飞起来）以后 1 毫秒，再反解出速度。
// 横向最多改二三十米/秒，放慢以后看着还是往四周散开，只是散得没那么开
const northWallInner = 11.5;
const shieldHalf = 0.5;
const shieldMotions = (() => {
  const c0 = iceShieldCenters(QUEEN_CLOCK0);
  const hole = HOLE_BOXES[1];
  const clampInHole = (x: number, a: number, b: number) => Math.min(b - shieldHalf - 0.1, Math.max(a + shieldHalf + 0.1, x));
  return c0.map((center, i) => {
    const p0: V3 = [QUEEN_AT[0] + center[0], QUEEN_AT[1] + center[1], QUEEN_AT[2] + center[2]];
    const rand = rng(41 + i * 7);
    const out = 40 + 40 * rand();
    const horizDist = Math.hypot(center[0], center[1]) || 1;
    const v0 = [(center[0] / horizDist) * out + (rand() - 0.5) * 20, (center[1] / horizDist) * out + 0.4 * V + 0.3 * V * rand(), 20 + 30 * rand()];
    const axis: V3 = [rand() - 0.5, rand() - 0.5, rand() - 0.5];
    const spinRate = 60 + 60 * rand();
    const hitY = northWallInner - shieldHalf;
    const t0 = (hitY - p0[1]) / v0[1];
    const hitTime = Math.max(t0, T_NORTH + 0.001);
    const x = clampInHole(p0[0] + v0[0] * t0, hole[0], hole[3]);
    const z = clampInHole(p0[2] + v0[2] * t0 - 8 * t0 * t0, hole[2], hole[5]);
    const vel = [(x - p0[0]) / hitTime, (hitY - p0[1]) / hitTime, (z - p0[2] + 8 * hitTime * hitTime) / hitTime];
    return { p0, v: vel, axis, w: spinRate };
  });
})();
export const shields = (t: number): { p: V3; axis: V3; angle: number }[] => {
  const c0 = iceShieldCenters(QUEEN_CLOCK0 + Math.min(t, 0));
  return c0.map((center, i) => {
    if (t <= 0) return { p: [QUEEN_AT[0] + center[0], QUEEN_AT[1] + center[1], QUEEN_AT[2] + center[2]], axis: [0, 0, 1], angle: 0 };
    const motion = shieldMotions[i];
    return { p: [motion.p0[0] + motion.v[0] * t, motion.p0[1] + motion.v[1] * t, motion.p0[2] + motion.v[2] * t - 8 * t * t], axis: motion.axis, angle: motion.w * t };
  });
};
export const 出场 = { 起: -40, 止: 30 };
export { TIP_LOCAL };
