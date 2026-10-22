// 6-1-5 穿塔杀巫妖：巫妖怪塔这一处的几何和动作。一镜到底（镜头/一镜到底/）按这里的穿刺线排扫帚的路线、在这里的时刻放慢时钟。
// 时间一律是物理时间 t（秒）：t = 0 是矛尖贯穿巫妖的那一刻（一镜到底的 路线.ts 给出），撞墙在它之前。
// 坐标是巫妖怪塔网格的场景坐标（模型/场景/巫妖怪塔.tsx，Z 朝上、本地北 = +Y，1 格 = 1 米）。塔在暮色世界里经 `塔框` 摆
// （模型/场景/暮色新世界.tsx 的地标表：网格逆时针转 90°，本地北 = 世界西、本地东 = 世界北），到世界坐标用 `toWorld`。
//
// 戏（用户 10-02）：扫帚从北墙外的空处平端长矛撞进巫妖的房间，贯穿巫妖，穿出南边的副楼，镜头一直跟在扫帚后面从破洞里进出。
// 扫帚物理速度 320 米/秒、在塔里不变（用户要求不减速，至少 300）；近景用时钟缩放（子弹时间）演破盾到死：扫帚、碎块、药水、护盾碎片、粒子都按物理时间走，只是画面时钟变慢（倍数见 一镜到底/路线.ts）。
// 撞墙到贯穿只有 11.4 米、0.036 秒，药水、六层盾、贯穿都在这里面（各时刻见下面「物理时刻」）：
// 药水比扫帚还快（鼓风机加速弹射物），约 600～900 米/秒；墙的碎块被扫帚撞出去，速度按扫帚速度算（约 200 米/秒）。
// 粒子特效（药水炸开、护盾碎裂、白烟）的游戏参数是日常速度的，这里的撞击猛得多：特效时钟按 `特效倍速` 加快，放慢以后在画面上是慢慢炸开的。
//
// 方向（用户 10-05 直航）：房间只能从本地北墙进（见下面跑位）；网格转 90°（本地北 = 世界西），穿刺线在塔里斜过来 15°、瞄本地方位 195°（世界 105°，由西北偏西往东南偏东）：
// 起飞朝东南直飞，进对正前左转 30°，穿出来右转 8° 就是去巢穴的直线（归档/参考模型库/工具/一镜到底/直航设计.ts）。本地 185°～195° 只撞北墙、屋里、副楼三截，
// 200° 起多撞别的塔楼（工具/一镜到底/离树3D.py --穿墙）。巫妖、药水、护盾、碎块、镜头绕圈都跟着穿刺线一起转 15°。
//
// 跑位（按网格原始的面量的，不体素化）：
// - 巫妖的房间在塔顶簇里，地板 z=64、天花板 z=73，室内 x 1～14、y -2.5～10.5。西、南、东三面都贴着别的塔楼，只有北墙（y 10.5～11.5）外面是空的；
//   南墙（y -2.5～-3.5）外面紧贴着一座副楼。所以扫帚从北边空处撞进北墙，穿过房间，从南墙撞进副楼、一路穿出。
// - 矛尖线过巫妖胸口 (7.5, 0.5, 65.3)，在北墙上是 x 10.3、在南墙上是 x 6.7。副楼南面在 x 4～8 一段是 y -12.5，西面从 y -9.5 往南是 x 4：斜着出去正好从副楼西南角 (4, -12.5) 出来（矛尖 a +13.46）。
// 李樱右手的矛在扫帚右边 0.35 格，扫帚杆高 65.04，骑手的脚最低到 64.6，不擦地板；巫妖站在房间南半边 (7.5, 0.5)，矛尖对准胸口 65.3。
import * as THREE from 'three';
import type { V3 } from '@engine/model/parts.tsx';
import { LICH, lichShieldCenter, lichShieldMatrix } from '@库/生物/巫妖.tsx';
import { broomMatrix, toScene } from '@库/角色/骑扫帚.tsx';
import { broomFromTip, TIP_LOCAL } from '../../../角色/骑扫帚持矛.tsx';
import { bossDeathOpacity } from '@库/特效/战利品箱碎裂.tsx';
import { SPEAR_FIT } from '@库/物品/动力钻头.tsx';
import { closeupBreakClockScale } from '@库/特效/方块破坏粒子.tsx';
import type { 矛管 } from '@库/特效/方块飞溅.tsx';
import { twilightLandmark } from '../../../地点/暮色新世界.tsx';
import debrisRaw from 'asset:碎块/镜头/6-1-5/碎块';
import { toppleDuration, deathToFlatRatio, knockbackOffsetAt } from '@库/特效/生物死亡.tsx';

export const 塔框 = twilightLandmark('巫妖怪塔');
export const V = 320; // 扫帚穿塔的物理速度（米/秒）

// ---------- 几何（塔的本地坐标） ----------
export const FLOOR = 64;
export const LICH_AT: V3 = [7.5, 0.5, FLOOR];
const CHEST = FLOOR + LICH.chest; // 矛尖高度
// 扫帚在塔本地的朝向（度，0 = 本地北 +Y、往左为正）：165 = 本地方位 195°
export const BROOM_YAW = 165;
const yawR = (BROOM_YAW * Math.PI) / 180;
// 飞行方向、扫帚左手边（本地水平单位向量）；来向：扫帚和药水从哪边过来
export const 前向: V3 = [-Math.sin(yawR), Math.cos(yawR), 0];
export const 左向: V3 = [-Math.cos(yawR), -Math.sin(yawR), 0];
const incomingDir = [-前向[0], -前向[1]];
// 巫妖侧着身子对着扫帚飞来的方向站（原来由北往南穿时朝东站，左侧对着北边），跟着穿刺线一起转：本地朝向 75°，方位 105°
export const LICH_YAW = BROOM_YAW - 90;
const NORTH_FACE = 11.5; // 北墙外表面
const SOUTH_INNER = -2.5; // 房间南墙内表面
const EXIT_Y = -12.5; // 副楼西南角（矛尖从这里出来）
// 矛尖走到本地 y 处时的 a（墙都是东西走向，按 y 量）
const aAtY = (y: number) => (y - LICH_AT[1]) / 前向[1];

// 穿刺线：a = 矛尖从贯穿点沿飞行方向走过的距离（米，贯穿 = 0，撞墙在负的那边）。一镜到底按这条线排路线（见 一镜到底/路线.ts 的 穿刺）
export const tipLocal = (a: number): V3 => [LICH_AT[0] + 前向[0] * a, LICH_AT[1] + 前向[1] * a, CHEST];
export const toWorld = (p: number[]): V3 => 塔框.到世界(p);
const impactA = aAtY(NORTH_FACE); // -11.39：矛尖碰到北墙外表面（正南穿时是 -11，斜 15° 长 1/cos15°）
const exitA = aAtY(EXIT_Y);
export const 穿刺线 = {
  名: '巫妖',
  V,
  朝向: ((((塔框.朝向(BROOM_YAW) + 180) % 360) + 360) % 360) - 180, // 世界朝向 -105（方位 105°）
  矛尖: (a: number) => toWorld(tipLocal(a)),
  前: impactA - 320, // 撞墙前对准北墙直飞 320 米（1 秒），镜头里塔越来越近（直航定稿的对正段）
  后: exitA + 100, // 穿出以后直飞 100 米再拐（右转 8° 往九头蛇巢穴）
  撞: impactA,
  出: exitA,
  // 巫妖侧着身子，矛从来向扎进它的左侧：身子 8 像素宽，矛尖在 -0.25 碰到它（举过头顶的左臂在胸口高度以上，碰不到）
  身: [{ 心: 0, 触: -0.25 }],
};
// 扫帚在塔本地坐标里的位置（t：贯穿后的物理秒数）。平飞
export const broomLocal = (t: number): V3 => broomFromTip(tipLocal(V * t), BROOM_YAW);
// 扫帚本地（+X 右、+Y 前、+Z 上）→ 塔本地
export const broomToLocal = (t: number, p: number[]): V3 => toScene(broomMatrix(broomLocal(t), BROOM_YAW), p);

// ---------- 物理时刻（秒，贯穿 = 0） ----------
export const T_IMPACT = 穿刺线.撞 / V;
export const T_SOUTH = aAtY(SOUTH_INNER) / V;
export const T_EXIT = 穿刺线.出 / V; // 矛尖从副楼西南角出来
export const T_THROW = T_IMPACT + 0.004; // 药水脱手（撞墙后 1.3 米）
// 六层护盾碎的时刻：脱手后均匀排到贯穿前 0.004 秒
export const T_SHIELDS = [0, 1, 2, 3, 4, 5].map((i) => T_THROW + 0.008 + (i * (-0.0045 - (T_THROW + 0.008))) / 5);
// 矛尖碰到巫妖：这一刻它就死了（用户 2026-10-02：死的一瞬间虚化 50%，免得挡住同一刻在它身上冒出来的战利品箱，见 一镜到底/战利品.tsx）
export const T_TOUCH = 穿刺线.身[0].触 / V;
// 倒平、化成白烟（模型/特效/生物死亡.tsx 的 倒地：胸口绕脚底的线速度 = 飞行速度）
export const T_倒 = toppleDuration(LICH.chest, V);
export const T_DEATH = T_TOUCH + T_倒 * deathToFlatRatio;
// 一镜到底的时钟在这几个时刻之间放慢（路线.ts 读）：撞墙前一点开始全速放慢，巫妖化烟以后开始恢复
export const 放慢 = { 起: T_IMPACT - 0.003, 止: T_DEATH + 0.004 };
export const 特效倍速 = 28;
// 药水炸开的粒子、巫妖死时的白烟按更快的时钟走（碎得更猛、散得更快），镜头钻过去之前就散干净了
export const 药水特效倍速 = 55;

// 墙：撞开的洞（导出碎块用的同一组盒子：npm run 取材 -- 6-1-5碎块 经 工具/一镜到底/巫妖墙洞.ts 打印）
// 洞是顺着穿刺线斜过去的一条：矛尖线两边各 `holeHalfWidth` 米（覆盖扫帚杆、右手边的人、跟在后面的镜头和左手前的鼓风机），z 64～68。
// 墙是东西走向的，按方块行排盒子（本地 y 每 1 格一行）：每行取和斜带有交的几格。
// 四截，碎块分组（工具/游戏取材/碎块分组.py）按截分：北墙（进塔）、房间南墙、副楼里面的隧道（只藏起来，不出碎块）、副楼出口（西南角）
const holeHalfWidth = 1.4;
const holeSections: number[][] = [
  [10, 11], // 0 北墙（y 10.5～11.5，连墙里面挂画那一行）
  [-3, -2], // 1 房间南墙（y -3.5～-2.5，连墙里面挂画那一行）
  [-8, -7, -6, -5, -4], // 2 副楼里面的隧道
  [-12, -11, -10, -9], // 3 副楼出口：从西面（x 4）、南面（y -12.5）出来
];
const holeRowBox = (yc: number): number[] => {
  const xc = tipLocal(aAtY(yc))[0];
  const halfSpan = holeHalfWidth / Math.abs(前向[1]) + (0.5 * Math.abs(前向[0])) / Math.abs(前向[1]);
  const i0 = Math.floor(xc - halfSpan); // 和 [xc − w, xc + w] 有交的格 i0 … i1（格 i 是 x i～i+1）
  const i1 = Math.ceil(xc + halfSpan) - 1;
  return [i0 + 0.1, yc - 0.45, 64, i1 + 0.9, yc + 0.45, 67.9].map((v) => Math.round(v * 100) / 100);
};
export const HOLE_BOXES = holeSections.flatMap((row) => row.map(holeRowBox));
// 碎块分组的边界：盒子序号 < 2 是北墙、< 4 南墙、< 9 隧道，其余出口
export const 洞截边界 = holeSections.slice(0, -1).map((_, i) => holeSections.slice(0, i + 1).reduce((n, row) => n + row.length, 0));
// 碎块：被 320 米/秒的扫帚撞出去，沿飞行方向约 0.6 倍扫帚速度，往四周散开几十米/秒；塔外看到的出塔那一下也是这个速度
const DEB = { speed: 0.6 * V, spread: 34, spin: 70, gravity: 16 };
// 矛管：矛尖连钻头虚影扫过的那一管方块当场崩成原版破坏粒子，不整块飞（用户 10-02；模型/特效/方块飞溅.tsx）；点的时刻相对各自那次撞击（北墙、南墙、副楼出口）。常量对象：哪些格子在管里只算一次
const tubeFor = (impactTime: number): 矛管 => ({
  点: Array.from({ length: 31 }, (_, k) => {
    const dist = k - 14;
    return [...tipLocal(dist), dist / V - impactTime];
  }),
  半径: SPEAR_FIT.tubeRadius,
  particleClockScale: closeupBreakClockScale.墙,
});
const northTube = tubeFor(T_IMPACT);
const southTube = tubeFor(T_SOUTH);
const exitTube = tubeFor(T_EXIT);
// 撞击中心：矛尖线在这一截墙里的那一点；碎块方向：顺着飞行方向，北墙那一下稍微往扫帚左手边偏
const wallCenter = (dist: number): V3 => {
  const tip = tipLocal(dist);
  return [tip[0], tip[1], 65.5];
};
const alongFlight = (left: number, up: number): V3 => [前向[0] + 左向[0] * left, 前向[1] + 左向[1] * left, up];
// 南墙那一截（连同副楼隧道、出口）晚到矛尖快碰到南墙上挂的画前半毫秒才从网格里藏：挂画那一行在洞里的几格是贴着墙面的薄板（1/16 厚、y −2.47），矛尖到 y −2.4 才碰得到，只比碰到墙面（`T_SOUTH`）早零点几毫秒。
// 撞北墙时一起藏、南墙几行由碎块补画的话，那幅大画被切成竖条、贴图错开、骷髅出现两次，正好是镜头在屋里绕圈那两秒的背景，所以分两步藏。
export const T_南藏 = aAtY(-2.4) / V - 0.0005;
export const debrisBursts = (t: number) => {
  const tN = t - T_IMPACT;
  const tS = t - T_SOUTH;
  const tE = t - T_EXIT;
  const southHidden = t >= T_南藏;
  return [
    { sec: tN, dir: alongFlight(0.05, 0.04), origin: wallCenter(aAtY(11)), speed: DEB.speed, spread: DEB.spread, seed: 11, gravity: DEB.gravity, stagger: 0.0004, chips: 28, spin: DEB.spin, 管: northTube },
    { sec: tS, dir: alongFlight(0, 0), origin: wallCenter(aAtY(-3)), speed: DEB.speed, spread: DEB.spread, seed: 12, gravity: DEB.gravity, stagger: 0.0004, chips: 16, spin: DEB.spin, hidden: southHidden, 管: southTube },
    { sec: -1, dir: alongFlight(0, 0), origin: wallCenter(aAtY(-6)), speed: 0, spread: 0, seed: 13, skip: true, hidden: southHidden },
    { sec: tE, dir: alongFlight(0, 0), origin: wallCenter(exitA - 0.5), speed: DEB.speed, spread: DEB.spread * 1.3, seed: 14, gravity: DEB.gravity, stagger: 0.0004, chips: 30, spin: DEB.spin, hidden: southHidden, 管: exitTube },
  ];
};
// 房间正中吊着一盏木栅栏和火把搭的大吊灯（z 65～72，挡在航线上），刷怪方块在它下面；游戏里巫妖刷出来以后刷怪方块就没了。这两样整段都不画（四壁的画、书架、玻璃地板留着）
export const ROOM_CLEAR = [2.6, -1.4, 64.05, 12.4, 8.4, 72.9];
// 场景网格里藏掉哪些盒子：固定的三种组合（`BlockMesh` 的 `hide` 一变就要重建整个网格，所以每种组合用同一个数组对象）。
// 洞先藏掉、碎块在原位补画，撞到时再飞出去：撞北墙那一刻藏北墙那一截，矛尖快进南墙时再藏其余几截（`T_南藏`）。
// 洞的盒子各自外扩一格以后的范围（碎块.json 的 `hide`，工具/游戏取材/网格碎块.py 算的）：整块从网格里拿掉，由碎块和原地的外圈方块顶替
const HIDES = (debrisRaw as unknown as { hide: number[][] }).hide;
const HIDE_BEFORE = [ROOM_CLEAR];
const HIDE_NORTH = [ROOM_CLEAR, ...HIDES.slice(0, 洞截边界[0])];
const HIDE_ALL = [ROOM_CLEAR, ...HIDES];
export const hideFor = (t: number) => (t < T_IMPACT ? HIDE_BEFORE : t < T_南藏 ? HIDE_NORTH : HIDE_ALL);

// ---------- 巫妖 ----------
const ly = (LICH_YAW * Math.PI) / 180;
const towardIncoming = (c: number[]) => (c[0] * Math.cos(ly) - c[1] * Math.sin(ly)) * incomingDir[0] + (c[0] * Math.sin(ly) + c[1] * Math.cos(ly)) * incomingDir[1];
// 巫妖自己的时钟（秒）：护盾转、手晃都按物理时间走。起点挑一个让六瓶药水砸的都是朝来向那一侧护盾的值（最后只剩一面时也正好转到来向那边）
const worstFacing = (c0: number) =>
  Math.min(
    ...T_SHIELDS.map((tt, i) => {
      const remaining = LICH.shields - i;
      const clock = c0 + tt;
      let by = -Infinity;
      for (let k = 0; k < remaining; k++) by = Math.max(by, towardIncoming(lichShieldCenter(clock, k, remaining)));
      return by;
    }),
  );
export const LICH_CLOCK0 = (() => {
  let best = 3;
  let bv = -Infinity;
  for (let candidate = 3; candidate < 3 + Math.PI / 2; candidate += 0.005) {
    const score = worstFacing(candidate);
    if (score > bv) {
      bv = score;
      best = candidate;
    }
  }
  return best;
})();
export const lichClock = (t: number) => LICH_CLOCK0 + t;
// 撞墙后不扭头盯扫帚：从撞墙到被矛碰到只有几毫秒，反应不过来（同巨人，用户 10-07）

// 六面护盾被哪瓶药水、什么时候砸碎：护盾按游戏的方式摆（剩 n 面就均分 360°），每瓶砸向那一刻最朝来向（迎着药水）的那一面
const lichYawQ = new THREE.Matrix4().makeRotationZ(ly);
const lichToLocal = (pt: number[]): V3 => {
  const vec = new THREE.Vector3(pt[0], pt[1], pt[2]).applyMatrix4(lichYawQ);
  return [vec.x + LICH_AT[0], vec.y + LICH_AT[1], vec.z + LICH_AT[2]];
};
export const SHIELD_PLAN = T_SHIELDS.map((tt, i) => {
  const remaining = LICH.shields - i;
  const clock = LICH_CLOCK0 + tt;
  let best = 0;
  let by = -Infinity;
  for (let k = 0; k < remaining; k++) {
    const score = towardIncoming(lichShieldCenter(clock, k, remaining));
    if (score > by) {
      by = score;
      best = k;
    }
  }
  const center = lichToLocal(lichShieldCenter(clock, best, remaining));
  // 护盾自己的 +Z（贴图法线）在塔里朝哪：碎片往远离药水的一边（顺着飞行方向）飞
  const zLocal = new THREE.Vector3(0, 0, 1).transformDirection(lichShieldMatrix(clock, best, remaining)).applyMatrix4(lichYawQ);
  const push = zLocal.x * incomingDir[0] + zLocal.y * incomingDir[1] > 0 ? -1 : 1;
  return { shield: best, n: remaining, tau: tt, clock, center, push };
});
export const shieldCount = (t: number) => LICH.shields - SHIELD_PLAN.filter((p) => t >= p.tau).length;
export const 砸点 = (i: number): V3 => {
  const center = SHIELD_PLAN[i].center;
  return [center[0] + incomingDir[0] * 0.35, center[1] + incomingDir[1] * 0.35, center[2]];
};

// 矛尖一碰到就死：一下子变成半透明、整只变红（原版死亡的红色覆盖，不渐变）；朝矛的方向倒下、被击退（模型/特效/生物死亡.tsx 的 `DeathTopple`，用户 10-07），`T_DEATH` 化成白烟。
// 变红是用户 10-02 要先在巫妖身上试的（其他 boss 还是闪白：不给方块生物加红色，怕成片画出血过不了审核）
export const lichState = (t: number) => {
  if (t < T_TOUCH) return { pos: LICH_AT, alive: true, hurt: 0, opacity: 1, 倒: 0, knockbackOffset: [0, 0, 0] as V3 };
  return { pos: LICH_AT, alive: t < T_DEATH, hurt: 1, opacity: bossDeathOpacity, 倒: (t - T_TOUCH) / T_倒, knockbackOffset: knockbackOffsetAt(前向, t - T_TOUCH) };
};
// 白烟的中心往扫帚左手边挪开、压低到它腰的高度：镜头绕完一圈回到扫帚正后方以后要顺着矛尖的路线钻过去，烟团在路上或和镜头一样高会糊满画面；它化烟时镜头正绕到扫帚右前方（一镜到底/镜头.ts 的 `lichOrbit`），烟也不能在那边
export const LICH_DEATH_POS: V3 = [
  LICH_AT[0] + 左向[0] * 2.3,
  LICH_AT[1] + 左向[1] * 2.3,
  LICH_AT[2] + 0.9,
];

// ---------- 鼓风机 ----------
// 李樱左手前端虚化成的鼓风机：边长 0.4 格（手臂 0.23 格粗），后半截和拳头叠在一起，看起来是手的前端变成了鼓风机（用户 10-02 嫌 1 格太大还挡住长矛）。
// 握持点：左手扬起的姿势（`leftArm` 的 armL 85、armLRoll 0、elbowL 8）下的位置，扫帚本地坐标，用 `liYingHand` 量的
export const HAND_L_FAN: V3 = [-0.352, 1.126, 0.334];
export const FAN_SIZE = 0.4;
export const FAN_AT = 0.12;
export const FAN_FRONT: V3 = [HAND_L_FAN[0], HAND_L_FAN[1] + FAN_AT + FAN_SIZE / 2, HAND_L_FAN[2]];

// ---------- 药水 ----------
export const potion = (i: number, t: number) => {
  const plan = SHIELD_PLAN[i];
  if (t < T_THROW || t >= plan.tau) return null;
  // 出手点：鼓风机出风口前方一点，六瓶稍微错开
  const spread: V3 = [(i % 2 ? -0.07 : 0.07) * (1 + (i % 3)), 0.15 * (i % 3), 0.07 * ((i * 7) % 3) - 0.07];
  const start = broomToLocal(T_THROW, [FAN_FRONT[0] + spread[0], FAN_FRONT[1] + 0.2 + spread[1], FAN_FRONT[2] + spread[2]]);
  const end = 砸点(i);
  const progress = (t - T_THROW) / (plan.tau - T_THROW);
  const eased = progress ** 1.35;
  const pos: V3 = [start[0] + (end[0] - start[0]) * eased, start[1] + (end[1] - start[1]) * eased, start[2] + (end[2] - start[2]) * eased];
  return { p: pos, spin: (t - T_THROW) * (1400 + i * 300) };
};
// 鼓风机：脱手前一点出现在左手前方，吹到最后一瓶砸中，之后淡掉。叶片按物理时间转（每秒 60 圈，放慢以后看得清一片片叶子）
export const fan = (t: number) => {
  const fadeIn = Math.min(1, Math.max(0, (t - (T_THROW - 0.004)) / 0.003));
  const fadeOut = Math.min(1, Math.max(0, (T_SHIELDS[5] + 0.006 - t) / 0.006));
  return { opacity: 0.55 * Math.min(fadeIn, fadeOut), spin: (t - T_THROW) * 2 * Math.PI * 60 };
};
export const leftArm = (t: number) => {
  const k = Math.min(1, Math.max(0, (t - (T_THROW - 0.004)) / 0.004));
  const back = Math.min(1, Math.max(0, (t - (T_SHIELDS[5] + 0.004)) / 0.008));
  const weight = k * (1 - back);
  return { armL: 34 - 40 * 0.35 + weight * (85 - (34 - 40 * 0.35)), armLRoll: 14 - weight * 14, elbowL: 28 - weight * 20 };
};

// 权杖：巫妖拿在手里，跟着它一起化成白烟，不脱手、九胡也不接（用户 10-07 去掉了九胡拿权杖）
// 一镜到底读：这一处要把哪些部件画出来、什么时候开始画（贯穿前后多少秒内）
export const 出场 = { 起: -40, 止: 30 };
export { TIP_LOCAL };
