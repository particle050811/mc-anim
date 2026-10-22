// 6-1-7 连穿：幽冥高塔（暮初恶魂）和雪怪洞窟（雪怪首领）两处的几何和动作。一镜到底（镜头/一镜到底/）按这里的穿刺线排扫帚路线。
// 两次之间要飞 9 公里，一段装不下（Seedance 单段 15 秒），拆成 6-1-7a（暮初恶魂）、6-1-7b（雪怪首领）。
// 时间一律是物理时间 t（秒）：t = 0 是矛尖贯穿 boss 的那一刻。两处都是远景，按原速打、不放慢；扫帚 320 米/秒、在结构里不变。
// 坐标：按网格本地坐标排（原点 = 网格原点），到世界坐标经 `twilightLandmark`(…) 的 `到世界`（模型/场景/暮色新世界.tsx）。
// 直航（用户 10-05 要求航线走相邻地标间的直线）以后两座网格都不转（本地 = 世界，只平移），穿刺方向迁就航线、在结构里重瞄：
// 两处穿刺方向都按来向解（进穿刺线前那个弯是 0），数见 归档/参考模型库/工具/一镜到底/直航设计.ts 打印的。
// 朝向口径：度，0 = 本地 +Y（北），往左（逆时针）为正，等于 −方位；水平单位向量都是 (−sin 朝向, cos 朝向)。
import type { V3 } from '@engine/model/parts.tsx';
import { cruiseHeight, twilightLandmark } from '../../../地点/暮色新世界.tsx';
import { DARK_TOWER } from '../../../地点/幽冥高塔.tsx';
import { YETI_CAVE } from '../../../地点/雪怪洞窟.tsx';
import { UR_GHAST } from '@库/生物/暮初恶魂.tsx';
import { ALPHA_YETI } from '@库/生物/雪怪首领.tsx';
import { SPEAR_FIT } from '@库/物品/动力钻头.tsx';
import type { 矛管 } from '@库/特效/方块飞溅.tsx';
import { integrateProfile, profileLookup, pierceProfileLimits } from '@engine/flight/平顺航迹.ts';

export const speed = 320;

// ================= 暮初恶魂（6-1-7a） =================
// 幽冥高塔塔顶是露天平台：中央平台 19×19（本地 x -8.5～10.5、y 2.5～21.5，站立面 z=171），四面有桥通翼楼，矮墙 1～9 格、柱子和火最高到 z≈181，z>182 是开阔天空。
// 暮初恶魂的刷怪方块悬在平台上方 3 格 (0, 12, 174)。恶魂（模型/角色/暮初恶魂.tsx）身子 12.5 格见方，这里让它脚底在刷怪方块处，身子中心 z=186.5，触手垂进柱子堆。
// 扫帚在身子中心高度平着横穿塔顶，长矛贯穿它身子正中。
// 方向：塔不转，穿刺方位 204.95°（编排朝向 155.05°）：从九头蛇巢穴往南偏西直飞过来、顺来向横穿塔顶；穿出来左转 121° 往东去雪怪洞窟（直航设计.ts 解的）。
// 这条线前后 60 米里矛尖管子（两边 1.8、下 1.5、上 2.4）碰不到塔上的任何面（按网格原始面量过）。
export const towerFrame = twilightLandmark('幽冥高塔');
export const GHAST_FOOT: V3 = [DARK_TOWER.spawner[0], DARK_TOWER.spawner[1], DARK_TOWER.spawner[2]];
export const GHAST_AT: V3 = [GHAST_FOOT[0], GHAST_FOOT[1], GHAST_FOOT[2] + UR_GHAST.bodyCenter];
export const GHAST_HEADING = 155.05; // 本地朝向（度，0 = 北，正 = 往左）；方位 204.95°
const GX = -Math.sin((GHAST_HEADING * Math.PI) / 180);
const GY = Math.cos((GHAST_HEADING * Math.PI) / 180);
// 对正：进穿刺线以前直飞 320 米（1 秒），碰到身子以前目标在画面正中越来越大（直航设计.ts 的 对正）；穿出来再直飞 100 米才拐（同 后余）
export const ghastPierceLine = {
  名: '暮初恶魂',
  V: speed,
  朝向: towerFrame.朝向(GHAST_HEADING),
  矛尖: (a: number): V3 => towerFrame.到世界([GHAST_AT[0] + GX * a, GHAST_AT[1] + GY * a, GHAST_AT[2]]),
  前: -UR_GHAST.bodySize / 2 - speed,
  后: UR_GHAST.bodySize / 2 + 100,
  撞: -UR_GHAST.bodySize / 2,
  出: UR_GHAST.bodySize / 2,
};
export const GHAST_DEATH = { boom: 3 / 24, gone: 6 / 24 };
export const ghastShowWindow = { 起: -40, 止: 8 };

// ================= 雪怪首领（6-1-7b） =================
// 雪怪洞窟是 65×65 米、顶面平的大土丘（顶面 z≈32，洞顶内表面 z≈24，长满挂雪云杉），洞在里面：十字形大厅，中央 49×49（本地 x、y 各 ±24.5），
// 四条 19 格宽的臂伸向东南西北，尽头是出口（北口 y≈+37、南口 y≈-36）。地面浮冰站立面 z=5；冰锥从洞顶挂下，多数到 z 19～23，有些低到 13～16。雪怪首领站在大厅正中（刷怪方块 (0, 0, 7) 下面）。
// 方向：洞窟不转，穿刺方位 83.8°（编排朝向 −83.8°）：从幽冥高塔出来左转往东直飞、顺来向扎进土丘，穿出来一路往东直穿极光宫殿（用户 10-05 红线）。
// 穿过的方块（核心里的网格：洞口的冰、冰锥）都藏掉、变成碎块（工具/游戏取材/网格碎块.py，盒子沿路线排成一根管子，npm run 取材 -- 6-1-7碎块）。
export const caveFrame = twilightLandmark('雪怪洞窟');
export const YETI_AT: V3 = [YETI_CAVE.spawner[0], YETI_CAVE.spawner[1], 5];
const YETI_CHEST = YETI_AT[2] + ALPHA_YETI.chest;
export const YETI_HEADING = -83.8; // 本地朝向（度，0 = 北，正 = 往左）；方位 83.8°，由西往东略偏北
const HX = -Math.sin((YETI_HEADING * Math.PI) / 180);
const HY = Math.cos((YETI_HEADING * Math.PI) / 180);
// 矛尖高度（洞窟本地 z）随 a（沿朝向的水平距离，贯穿 = 0）：按 lib/平顺航迹.ts 的竖直剖面排。
// 洞（沿 83.8° 剖开，工具/一镜到底/out/体素/雪怪洞窟.npz）东西两条臂尽头都是敞开的洞口：西口是从大厅地面（z 5）斜升到外面地面（z 14～15）的坡，坡口上面到洞顶（z 24）是空的；
// 东口是 4 格高台阶（顶 z 9），外面地面 z 8～9。所以不撞洞顶，从西口斜着钻进来、贯穿、从东口出去（用户 10-08 定：19 米高的洞入射角最多约 18°）。
// 按穿刺线上限（`pierceLimits`：俯仰 2°/帧、半径 382 米）进洞 −18°、出洞 +12°，大厅里的网格一格都不碰；但拉平要一百多米，大厅只有 ±35 米长、地面离雪怪胸口（z 8.4）只有 3.4 米，
// 进洞前、出洞后都在地面以下：网格只画核心（±31.5），外面是新世界的积雪森林（地面 z 14 上下），西边 a −95～−38、东边 a 32～110 的管子钻在雪地和土里，
// 在 暮色新世界.tsx 雪怪洞窟那一行补挖成两条隧道（工具/一镜到底/隧道.ts 雪怪首领 打印）。洞里的结构不动。
// 出洞后按同样上限抬到 `climbAngle`，直线爬向极光宫殿（宫殿顶层比这里高 176 米，只隔 0.7 公里）。
// 起点就在巡航高度上，冲刺前不拉起（用户 10-03「平着冲进去」）：先平飞 `alignDist` 米（1 秒），再压机头
const alignDist = speed * 1.0;
const profileLimits = pierceProfileLimits(speed);
const deg = Math.PI / 180;
const entryAngle = -18 * deg; // 扎下去的直线（进洞前）
const caveExitAngle = 12 * deg; // 洞里那一弯转到的俯仰（出洞以后），之后再抬到 爬角
const pierceAngle = -2 * deg; // 贯穿雪怪胸口时的俯仰：还在往下，大厅里那段弧的底在雪怪身后，西口坡顶、东口台阶都碰不到
const climbAngle = 20 * deg;
const tailLen = 20;
const cruiseZAt = (dist: number) => {
  const worldPt = caveFrame.到世界([YETI_AT[0] + HX * dist, YETI_AT[1] + HY * dist, 0]);
  return cruiseHeight(worldPt[0], worldPt[1]) - caveFrame.原点[2];
};
// 从压机头那一点（a 0、高 高）往前积，保持 直 米；找俯仰过 贯穿角 的那一点（洞里那段弧上），把它挪到 (0, 胸口)
const solveProfile = (height: number) => {
  const integrate = (straightLen: number) =>
    integrateProfile({ a: 0, z: height, γ: 0 }, [{ toAngle: entryAngle }, { 直: straightLen }, { toAngle: caveExitAngle }, { toAngle: climbAngle }], profileLimits, 1);
  const piercePoint = (ps: ReturnType<typeof integrate>) => {
    let i = ps.findIndex((q, k) => k > 0 && q.γ > pierceAngle && ps[k - 1].γ <= pierceAngle && q.γ > entryAngle + 1e-6);
    if (i < 0) i = ps.length - 1;
    return ps[i];
  };
  // 保持越长，过 贯穿角 那一点越低：二分到正好在胸口高度
  let lo = 0;
  let hi = 2000;
  for (let k = 0; k < 50; k++) {
    const mid = (lo + hi) / 2;
    if (piercePoint(integrate(mid)).z > YETI_CHEST) lo = mid;
    else hi = mid;
  }
  const ps = integrate(lo);
  const y = piercePoint(ps);
  const last = ps[ps.length - 1];
  const tail = integrateProfile(last, [{ 直: tailLen + 40 }], profileLimits, 1);
  const samples = [...ps, ...tail.slice(1)].map((q) => ({ ...q, a: q.a - y.a, s: q.s - y.s }));
  return { samples: samples, climbEndA: last.a - y.a, diveStart: { a: -y.a, s: -y.s } };
};
const yetiProfile = (() => {
  let solved = solveProfile(cruiseZAt(-500));
  solved = solveProfile(cruiseZAt(solved.diveStart.a - alignDist));
  return solved;
})();
const tipProfile = profileLookup(yetiProfile.samples);
export const yetiTipLocal = (a: number): V3 => [YETI_AT[0] + HX * a, YETI_AT[1] + HY * a, tipProfile.z(a)];
// 进洞前、出洞后钻过的两条隧道（a，米；暮色新世界.tsx 雪怪洞窟那一行的 补挖）：西边 进地 钻进雪地、进洞 从西口的坡里钻进大厅，
// 东边 出洞 撞进东口外的地里、出地 从雪地里钻出来。工具/一镜到底/雪怪碰.ts 量的（管子两边 1.8、下 1.5、上 2.4，不算树），剖面改了要重量、隧道要重打
export const yetiTunnels = { enterGround: -61, enterCave: -36, exitCave: 34, exitGround: 92.5 };
export const yetiProfileInfo = { diveStartA: yetiProfile.diveStart.a, climbEndA: yetiProfile.climbEndA };
export const yetiPierceLine = {
  名: '雪怪首领',
  V: speed,
  朝向: caveFrame.朝向(YETI_HEADING),
  矛尖: (a: number): V3 => caveFrame.到世界(yetiTipLocal(a)),
  // 起点：压机头之前 对正 米，这一秒在巡航高度上平飞、目标在画面正中越来越大，再压机头扎下去
  前: yetiProfile.diveStart.a - alignDist,
  后: yetiProfile.climbEndA + tailLen,
  撞: yetiTunnels.enterGround,
  出: yetiTunnels.exitGround,
};
export const YETI_T_DIVE = yetiProfile.diveStart.s / speed;
export const YETI_DEATH = { boom: 4 / 24, gone: 6 / 24 };
export const yetiShowWindow = { 起: -40, 止: 8 };
// 矛管（用户 10-02 追加）：矛尖连钻头虚影扫过的那一管方块当场崩成原版破坏粒子，不整块飞（模型/特效/方块飞溅.tsx）。
// 点每 0.5 米一个，时刻按矛尖路线弧长 / 速度算（贯穿 = 0），再减去这次撞击的时刻。远景原速：粒子按原版时钟最长活 2 秒；每格每轴只取 2 份（8 个，原版 64 个）。常量对象：哪些格子在管里只算一次
// 弧长表的范围（a，米）：两条隧道都在里面；碎块管子只取核心（网格只画 ±31.5）
const arcStartA = -70;
const arcEndA = 100;
const tubeStartA = -36;
const tubeEndA = 36;
const arcLen = (() => {
  const as = Array.from({ length: (arcEndA - arcStartA) * 2 + 1 }, (_, k) => arcStartA + k * 0.5);
  const cumLen = [0];
  for (let k = 1; k < as.length; k++) {
    const prev = yetiTipLocal(as[k - 1]);
    const next = yetiTipLocal(as[k]);
    cumLen.push(cumLen[k - 1] + Math.hypot(next[0] - prev[0], next[1] - prev[1], next[2] - prev[2]));
  }
  const s0 = cumLen[as.indexOf(0)];
  return { as, s: cumLen.map((v) => v - s0) };
})();
// 矛尖走到 a 处的时刻（物理秒，贯穿 = 0）：扫帚沿路线按弧长匀速走。撞击、藏网格、隧道口的土都按它排
export const yetiTimeAt = (dist: number) => {
  const k = Math.max(0, Math.min(arcLen.as.length - 2, Math.floor((dist - arcStartA) * 2)));
  const frac = (dist - arcLen.as[k]) * 2;
  return (arcLen.s[k] + (arcLen.s[k + 1] - arcLen.s[k]) * frac) / speed;
};
const tubeFor = (impactA: number): 矛管 => ({
  点: arcLen.as.flatMap((a, k) => (a >= tubeStartA && a <= tubeEndA ? [[...yetiTipLocal(a), arcLen.s[k] / speed - yetiTimeAt(impactA)]] : [])),
  半径: SPEAR_FIT.tubeRadius,
  particleClockScale: 1,
  密度: 2,
});
// 三次撞击（碎块.json 的三组，组界见 取材清单 的「6-1-7碎块」：盒子序号 16、56，即 a −20、+20）：撞时刻 a、飞散的起点 心（矛尖在 a 处的位置）。
// 新线从两头的洞口进出、不碰洞顶：西口坡顶那几格和挂得低的冰锥、雪怪头顶的刷怪笼、东口台阶那几格（核心里的网格，管子盒子取到的）
export const yetiImpacts = [
  { a: yetiTunnels.enterCave, 心: yetiTunnels.enterCave + 2 },
  { a: -1, 心: 0 },
  { a: yetiTunnels.exitCave, 心: yetiTunnels.exitCave + 1 },
];
export const yetiTubes = yetiImpacts.map((h) => tubeFor(h.a));
// 管子：矛尖路线两边各 1.8 米、下 1.5 米、上 2.4 米（扫帚、两个人、跟在后面的镜头都在里面），每 1 米一个轴对齐的盒子（洞窟本地坐标）。
// 工具/游戏取材/网格碎块.py 按这些盒子取碎块（npm run 取材 -- 6-1-7碎块 用的是 工具/一镜到底/雪怪管子.ts 打印出来的同一组盒子）
export const yetiTube = (): number[][] => {
  const out: number[][] = [];
  for (let dist = tubeStartA; dist <= tubeEndA; dist += 1) {
    const cur = yetiTipLocal(dist);
    const next = yetiTipLocal(dist + 1);
    const halfWidth = 1.8;
    out.push([
      Math.min(cur[0], next[0]) - halfWidth, Math.min(cur[1], next[1]) - halfWidth, Math.min(cur[2], next[2]) - 1.5,
      Math.max(cur[0], next[0]) + halfWidth, Math.max(cur[1], next[1]) + halfWidth, Math.max(cur[2], next[2]) + 2.4,
    ].map((v) => Math.round(v * 100) / 100));
  }
  return out;
};
