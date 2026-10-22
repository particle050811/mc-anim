// 真实飞行：九胡驾驶扫帚沿理想航线飞的横向大弯（lib/真实飞行.ts），偏移后的水平航线重做地形跟随，得到扫帚的基线和扰动。
import type { V3 } from '@engine/model/parts.tsx';
import { Route } from '@engine/flight/飞行路径.ts';
import { realFlight, type Anchor } from '@engine/flight/真实飞行.ts';
import { terrainFollow } from '@engine/flight/地形跟随.ts';
import { norm } from './工具.ts';
import { featureTop } from './地面.ts';
import { clearance, minClearance, flatWaypoints, flatRoute, flatLen, roundOff, followGround, fullRoute, ROUTE } from './航线.ts';
import { odometer, cloudPierceG, brakeG, endG } from './时间线.ts';

// ---------- 真实飞行 ----------
// 用户 10-05：航线太直，要模拟真实飞行；10-06 看了推近后的巡航、穿云：湍流波动影响飞行流畅，去掉。
// 航线.ts 的航线（直线 + 圆弧 + 地形跟随）是理想路线，lib/真实飞行.ts 模拟九胡驾驶扫帚沿它飞，只留「弯曲」：航向慢慢偏开几度再修回来，几秒一个来回、横向偏几十米，本身是平滑的。「抖动」那几样都关掉（下面的 `参数`）：
// - 机体颠簸（2～3 赫兹的俯仰、横滚、朝向和升沉）幅度给 0：镜头推近到离人 6.6 米后，人在画面里一抖一抖；
// - 阵风的气动导纳给 0：Dryden 湍流对航迹只有厘米级，留着只是毛刺；
// - 竖直漂移给 0：几米的上下起伏在 0.2 赫兹上下，是最容易晕的频段。竖直只剩离近处最高顶的软下限（见「第二遍」），它沿里程取前后一公里的最大再抹平，只在贴着 `最小净空` 的地方把扫帚缓缓托高两三米。
// 接法照 真实飞行.ts 文件头「主世界」那一段：
// - 帧和里程的对应关系不变：扰动按 时间线.ts 的 `odometer`、`ROUTE` 算一次，扫帚位置 = `ROUTE.at(S)` + 右法线·横，高度另算，不拿偏移后的几何重建 `ROUTE`。
// - 锚点：首帧到穿云（接 6-2-4 末帧、W2 要穿到）、悬停到末帧（接 6-3-1）扰动精确为 0；穿云后 3 秒渐渐放开，减速前 4 秒渐渐收回，减速的 46 帧在收回的渐变里（速度低于 500 米/秒的地方都要锚住，否则同样的横速就是好几倍的航向）。
// - 种子 11：试了六个种子，大弯只来自侧向漂移，11 的弯最看得出又不晕。
const SEED = 11;
const anchors: Anchor[] = [{ 帧: 0, 止帧: cloudPierceG, 后: 72 }, { 帧: brakeG, 止帧: endG, 前: 96 }];
const noShake = { 幅度: 0 };
const smoothParams = { 竖直: { 漂移: 0 }, 阵风: { 导纳: 0 }, 颠簸: { 俯仰: noShake, 横滚: noShake, 朝向: noShake, 升沉: noShake } };
const basePerturb = realFlight({ 种子: SEED, 起帧: 0, 止帧: endG, distAt: (t) => odometer(t * 24), 锚点: anchors, 参数: smoothParams });
// 水平弧长（地形跟随用的那条 z = 0 的水平航线）和 ROUTE 里程互换：整条航线 的第 i 个点就是 ROUTE 的第 i + 2 个航点（前面是 W0、W1）
const flatTable = fullRoute.horizArcLen;
const routeTable = flatTable.map((_, i) => ROUTE.waypointArcLen(i + 2));
const polyline = (xs: number[], ys: number[]) => (x: number) => {
  if (x <= xs[0]) return ys[0] + (x - xs[0]);
  const count = xs.length;
  if (x >= xs[count - 1]) return ys[count - 1] + (x - xs[count - 1]);
  let lo = 0, hi = count - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid;
    else hi = mid;
  }
  return ys[lo] + ((ys[hi] - ys[lo]) * (x - xs[lo])) / (xs[hi] - xs[lo]);
};
const flatToRouteS = polyline(flatTable, routeTable);
const routeToFlatS = polyline(routeTable, flatTable);
// 均匀格点上的 Catmull-Rom（高度表是 50 米一格，线性插值的话坡度每两帧折一下，俯仰一跳一跳）
const smoothInterp = (z: number[], ds: number) => (dist: number) => {
  const count = z.length;
  const x = Math.min(Math.max(dist / ds, 0), count - 1);
  const i = Math.min(Math.floor(x), count - 2);
  const t = x - i;
  // 两头按线性外推补点：俯冲线、进城爬升线这种直线段插出来还是直线
  const p1 = z[i], p2 = z[i + 1];
  const p0 = i > 0 ? z[i - 1] : 2 * p1 - p2;
  const p3 = i + 2 < count ? z[i + 2] : 2 * p2 - p1;
  return p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
};
export const rightNormal = (dir: number[]) => {
  const len = Math.hypot(dir[0], dir[1]) || 1;
  return [dir[1] / len, -dir[0] / len]; // 朝向往右转 90°
};
// 地形跟随在偏移后的水平航线上重做：「离地物顶面 80 米」「离近处最高的顶至少 25 米」量的是扫帚真正飞过的那条线。
// 水平航点逐个按它在 ROUTE 上的里程取横向偏移，偏过去以后照原样 地形跟随 + 抹圆，得到新的高度表；
// 新旧两条水平航线的弧长按航点一一对上（偏移让弧长差千分之几），高度差 Δh 叠到 ROUTE 的高度上
const offsetWaypoints = flatWaypoints.map(([x, y], j) => {
  const arcLen = flatRoute.waypointArcLen(j);
  const normal = rightNormal(flatRoute.dir(arcLen));
  const lateral = basePerturb.按里程(flatToRouteS(arcLen)).横;
  return [x + normal[0] * lateral, y + normal[1] * lateral] as [number, number];
});
const offsetLine = new Route(offsetWaypoints.map(([x, y]) => [x, y, 0] as V3));
const oldToNewArc = polyline(flatWaypoints.map((_, j) => flatRoute.waypointArcLen(j)), offsetWaypoints.map((_, j) => offsetLine.waypointArcLen(j)));
export const offsetRoute = roundOff(terrainFollow(offsetWaypoints, followGround, undefined, { clearance: clearance, climbSlope: 0.35, descentSlope: 0.28, sideWidth: 0, stepLength: 50 }));
const newHeight = smoothInterp(offsetRoute.points.map((p) => p[2]), offsetRoute.horizArcLen[1]);
const oldHeight = smoothInterp(fullRoute.points.map((p) => p[2]), flatTable[1]);
// 高度差只在穿云那一帧以后、急刹点以前有：两头的高度由俯冲线、爬升线定，偏移在锚点里也是 0，`Δh` 本来就只有万分之几米；锚点里直接给 0，首尾的扫帚位置才和接入前逐字段一样（穿云前后那几帧的俯仰另有 `拉起俯仰`，起飞、俯冲的镜头另有 `camera`、`俯冲绕上`）
const cloudPierceS = odometer(cloudPierceG);
const Δh = (dist: number) => {
  const flatS = routeToFlatS(dist);
  return dist <= cloudPierceS || flatS >= flatLen ? 0 : newHeight(oldToNewArc(flatS)) - oldHeight(flatS);
};
// 不含扰动的基线（水平是 ROUTE，高度叠 Δh）：位置和切线
export const baseline = (dist: number): V3 => {
  const pos = ROUTE.at(dist);
  return [pos[0], pos[1], pos[2] + Δh(dist)];
};
export const baselineDir = (dist: number) => {
  if (dist <= cloudPierceS) return ROUTE.dir(dist); // 穿云那一帧的切线往前差分 2 米会碰到 Δh，差千分之一度，锚点里照原样
  const behind = baseline(Math.min(Math.max(dist - 2, 0), ROUTE.length - 4));
  const ahead = baseline(Math.min(Math.max(dist + 2, 4), ROUTE.length));
  return norm([ahead[0] - behind[0], ahead[1] - behind[1], ahead[2] - behind[2]]);
};
// 第二遍带竖直下限：往下最多偏到离近处最高的顶 最小净空 米（按偏移后的水平位置查地物顶）
export const perturb = basePerturb.withVertFloor((dist) => {
  const pos = baseline(dist);
  const normal = rightNormal(ROUTE.dir(Math.min(Math.max(dist, 0), ROUTE.length - 3)));
  const lateral = basePerturb.按里程(dist).横;
  return minClearance - (pos[2] - featureTop(pos[0] + normal[0] * lateral, pos[1] + normal[1] * lateral));
});
