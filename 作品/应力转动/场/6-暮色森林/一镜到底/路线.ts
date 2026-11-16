// 一镜到底：6-1-4 飞越暮色到 6-1-9 降落在终焉城堡，整条路线放在一条全局时间轴上（用户 2026-10-02）。
// 飞越暮色 → 巫妖怪塔 → 九头蛇巢穴 → 幽冥高塔（暮初恶魂）→ 雪怪洞窟（雪怪首领）→ 极光宫殿（冰雪女王）→ 云中小屋（巨人）→ 降落在终焉城堡主楼顶上。
// 镜头一直跟着扫帚，不切镜头。各段（6-1-4+5、6-1-6、6-1-7a、6-1-7b、6-1-8、6-1-8b、6-1-9）只是这条时间轴上的一个窗口（段表.ts）。
//
// 约束（用户定，括号内是日期）：
// - 每次穿出来马上放平、回到巡航高度，不往上拉（10-02）；子弹时间只缩画面时钟，物理速度不变（10-02，见「三层时间」）。
// - 大走向是相邻地标之间的直线，穿刺方向迁就航线，起飞就朝第一程（10-05）。
// - 转弯 = 视角匀速转，每秒 60°；进巫妖怪塔的弯提前拐完（10-07）。每程一个巡航高度，树不让（10-07）。
// - 真实飞行只留慢的航向漂移，不要湍流（10-06）；穿出来就加速，出口弯边转边加速（10-08）。
//
// 做法：每一程在时间上生成（lib/平顺航迹.ts）：航向、俯仰按梯形角速度转，速度按 jerk 受限 S 曲线（穿出来 1 秒左右 320 → 1000，进下一处前 1 秒左右减回 320），位置积分，牛顿法解出口弯和整程时长。
// 放不下（程太短加不起速、爬不到、弯解不出）就报错并指出是哪一程，该改的是 路线/输入表.ts。
// 穿刺线（各段 编排.ts 的 `穿刺线`）本身是输入：前端对正直飞、后端穿出直飞。九头蛇、雪怪首领的俯冲剖面（6-1-6、6-1-7 的 编排.ts）也用同一套构件。
//
// ====== 三层时间 ======
// - 画面时间 g（秒）：g = 0 是 6-1-3 的末帧（= 6-1-4+5 的首帧）；段内秒 = g − 段起秒。
// - 物理时间 T（秒）：扫帚、碎块、粒子、药水全按它走。平时 dT/dg = 1；只在巫妖、冰雪女王、巨人三处（近景，演 boss 的死亡过程）
//   时钟缩放（子弹时间）：画面时钟变慢，物理速度不变。九头蛇、暮初恶魂、雪怪首领是远景，原速。
// - 路程 s（米）：扫帚（杆中心）沿规划航线走过的弧长。真实飞行的偏移不改路程。
// 实现拆在 路线/ 下，按依赖顺序：输入表 → 航线（求解、拼接、按路程查）→ 时钟 → 真实航迹 → 扫帚；粗高度独立。这里转出并放各 boss 的局部时间、镜头要的时刻。
import * as lichChoreo from '../6-1-5/编排.ts';
import * as snowQueenChoreo from '../6-1-8/编排.ts';
import * as giantChoreo from '../6-1-8b/编排.ts';
import { ORDER, type BossName } from './路线/输入表.ts';
import { headingRate, markDist, T_ARRIVE, routeDist, pierceTimes } from './路线/航线.ts';
import { physicalTime, secAt, clockRate } from './路线/时钟.ts';

export { V_CRUISE, limits, legTurnRate, takeoffBearing, pierceTable, ORDER } from './路线/输入表.ts';
export type { Pierce, BossName } from './路线/输入表.ts';
export { effectiveTop, cameraGround } from './路线/粗高度.ts';
export { legTable, turnTable, routeLength, plannedPos, speedAt, headingRate, markDist, viewTurnSpeedAt, timeAtDist, T_ARRIVE, routeDist, pierceTimes } from './路线/航线.ts';
export type { Turn } from './路线/航线.ts';
export { slowMoTable, totalLength, physicalTime, secAt, secAtDist, clockRate, pierceSecs, slowMoTimes } from './路线/时钟.ts';
export { trackAnchors, disturbance, offset, positionAt, tangentAt, steerBank } from './路线/真实航迹.ts';
export type { AnchorSeg } from './路线/真实航迹.ts';
export { broom, landingDuration } from './路线/扫帚.ts';
export type { BroomState } from './路线/扫帚.ts';

// ---------- 各 boss 的局部时间 ----------
export const localTime = (bossName: BossName, g: number) => physicalTime(g) - pierceTimes[bossName];

// ---------- 镜头要的时刻 ----------
// 远景停住多久（秒）：看 boss 炸开（暮初恶魂、雪怪首领 0.25 秒化成白烟；用户 10-08 嫌杀死九头蛇后等太久才跟进）
export const farHold: Partial<Record<BossName, number>> = { 九头蛇: 0.25, 暮初恶魂: 0.25, 雪怪首领: 0.25 };
// 近景撞墙的物理时刻（相对贯穿）
export const impactTime: Partial<Record<BossName, number>> = { 巫妖: lichChoreo.T_IMPACT, 冰雪女王: snowQueenChoreo.T_SOUTH, 巨人: giantChoreo.T_SOUTH };
export const G_LAND = secAt(T_ARRIVE);
// 扫帚这一刻每秒（画面时间）转几度（规划航线，段表挑切点用：切在扫帚直飞的帧上）
export const rotSpeed = (g: number) => Math.abs(headingRate(routeDist(physicalTime(g)))) * clockRate(g);
// 穿刺线上（前～后）的路程区间
export const pierceRanges = ORDER.map((n) => [markDist(`${n}.前`), markDist(`${n}.后`)] as [number, number]);
