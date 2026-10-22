// 理想航线（场景坐标，米）：水平航点（直线 + 圆弧）、地形跟随和抹圆后的高度、收势那段 Hermite，合成 `ROUTE`。
import type { V3 } from '@engine/model/parts.tsx';
import { Route } from '@engine/flight/飞行路径.ts';
import { terrainFollow } from '@engine/flight/地形跟随.ts';
import { routeGameXz, gameXzToScene, borderTownPos } from '../../../主世界116.ts';
import { featureTop, featureSurface } from './地面.ts';

// ---------- 航线（场景坐标，米） ----------
export const cruiseSpeed = 1000; // 米/秒
export const clearance = 80; // 离地物顶面多少米巡航（见 地面.ts；用户 10-14 比过 30、50 米后不变，速度感改由广角给）
export const minClearance = 25; // 离近处最高的顶至少多少米
const baseSite = gameXzToScene(routeGameXz.base);
export const turnPoint = gameXzToScene(routeGameXz.turnPoint);
export const townCenter = borderTownPos; // 城中心的地面顶面
const unit2 = (from: number[], to: number[]): [number, number] => {
  const delta = [to[0] - from[0], to[1] - from[1]];
  const len = Math.hypot(delta[0], delta[1]);
  return [delta[0] / len, delta[1] / len];
};
const along = (p: number[], d: number[], s: number): [number, number] => [p[0] + d[0] * s, p[1] + d[1] * s];
// 悬停点：城中心往北 120 米（城的北半边，北墙在城中心以北 200 米）上空，离地 1300 米（用户 10-05 选的折中：云层也压低一点，仍然穿云，城比 2090 米时大一倍左右）。
// 停在城中心偏北，镜头在扫帚后上方往下看时扫帚在画面上半、整座城在画面下半（第 3 场从这一帧接着拍）。
export const hoverHeight = townCenter[2] + 1300;
export const hoverXY: [number, number] = [townCenter[0], townCenter[1] + 120];
export const leg1Dir = unit2(baseSite, turnPoint); // 第一段的方向（西北偏西）
export const leg2Dir = unit2(turnPoint, hoverXY); // 第二段的方向（西南偏西），急刹前一直朝它
const brakeDist = 380; // 急刹点在悬停点前多少米（冲劲化成高度的那一段）
export const brakeXY = along(hoverXY, leg2Dir, -brakeDist);
const tangentLen = 2500; // 圆弧从转弯点前后多远起弧
// 首帧到穿云：三个航点的高度写死（首帧镜头靠它们定）
const W0: V3 = [...baseSite, 2500]; // 首帧：基地上空 2500 米，云海上方
const W1: V3 = [...along(baseSite, leg1Dir, 1520), 2450]; // 34.1 前后开始俯冲
// 俯冲到这里拉起，高 900 米。W1 → W2 的俯冲角约 52°；W0、W1 不动，三点在同一个竖直面里
export const W2: V3 = [...along(baseSite, leg1Dir, 2720), 900];
// 穿云以后的水平航点：W2 → 第一段直线 → 拐角圆弧 → 第二段直线 → 急刹点，每 250 米左右一个点；地形跟随按 50 米一个点取高度
const spacing = 250;
const straightPts = (from: number[], to: number[]): [number, number][] => {
  const count = Math.max(1, Math.round(Math.hypot(to[0] - from[0], to[1] - from[1]) / spacing));
  return Array.from({ length: count }, (_, i) => [from[0] + ((to[0] - from[0]) * i) / count, from[1] + ((to[1] - from[1]) * i) / count]);
};
const arcPts = (): [number, number][] => {
  const startAngle = Math.atan2(leg1Dir[1], leg1Dir[0]);
  let turnAngle = Math.atan2(leg2Dir[1], leg2Dir[0]) - startAngle;
  turnAngle -= 2 * Math.PI * Math.round(turnAngle / (2 * Math.PI));
  const radius = tangentLen / Math.tan(Math.abs(turnAngle) / 2);
  const arcStart = along(turnPoint, leg1Dir, -tangentLen);
  const side = Math.sign(turnAngle); // 往左转（逆时针）时圆心在左手边
  const center = [arcStart[0] - leg1Dir[1] * radius * side, arcStart[1] + leg1Dir[0] * radius * side];
  const count = Math.max(2, Math.round((radius * Math.abs(turnAngle)) / spacing));
  return Array.from({ length: count }, (_, i) => {
    const t = startAngle - (side * Math.PI) / 2 + (turnAngle * i) / count;
    return [center[0] + radius * Math.cos(t), center[1] + radius * Math.sin(t)];
  });
};
export const flatWaypoints: [number, number][] = [...straightPts(W2, along(turnPoint, leg1Dir, -tangentLen)), ...arcPts(), ...straightPts(along(turnPoint, leg2Dir, tangentLen), brakeXY), brakeXY];
export const brakeHeight = hoverHeight - 200; // 急刹点的高度（冲劲化成高度，悬停在它上面 200 米）
const diveSlope = 0.6; // 穿云以后往下俯冲的坡度（高 / 水平，约 31°）：低空巡航要早点降下来
// 进城前往急刹高度爬升的坡度（约 27°）：城东石山离城约 2 公里，从城前约 3 公里起顺着山坡爬、翻过山顶接着爬，城在翻山时从山后露出来。
const approachSlope = 0.5;
export const flatRoute = new Route(flatWaypoints.map(([x, y]) => [x, y, 0] as V3));
export const flatLen = flatRoute.length;
// 俯冲线、进城爬升线：长 是水平航线的总长（真实飞行偏移后的水平航线长一点点，爬升线照样从急刹点往回量）
const floorFor = (totalLen: number) => (s: number) => Math.max(W2[2] - diveSlope * s, brakeHeight - approachSlope * (totalLen - s));
// 高度：地形跟随（lib/地形跟随.ts）先按 `要求高度` = max(地物面 + `净空`, 地物顶 + `最小净空`) 排出一串斜坡（山前提前爬、过山慢慢降），
// 俯冲线、进城爬升线（下限）不交给它，等包络、平滑都做完再取大：下限混进包络的话，俯冲、爬升的坡度就不能比包络的降坡、爬坡陡。
// 再抹圆，四步：
// 1. 整体高斯（σ `smoothHalfWidth`）：去掉斜坡和斜坡交界的折角；
// 2. 和要求高度（含下限）取大；
// 3. 上凸的折角（山顶、坡顶）：只给「由地形定高度」的点（不是俯冲线、爬升线上的点）挂一条开口向下的抛物线 z − `roundCurvature` × 距离²，取上包络，山顶变成曲率有上限的圆弧，只会抬高；
// 4. 小高斯（σ `finishHalfWidth`）：抹掉抛物线和斜坡交界、谷底的折角。这一步会把尖顶削低几米，离近处最高的顶最少的地方比 `最小净空` 少一点（诊断查）。
// 顺序不能换：先挂抛物线、再高斯、最后兜底「不低于要求高度 − 余量」的话，兜底在台地这种尖峰上会压出折角（一帧俯仰跳 4°）。两头按线性外推补边，W2、急刹点的高度不变
const roundCurvature = 0.0002; // 1/米：坡度每帧（约 42 米）最多变 0.017，约 1°
const smoothHalfWidth = 400; // 米
const finishHalfWidth = 150; // 米
const gaussian = (z: number[], halfWidth: number, ds: number) => {
  const count = z.length;
  const sigma = halfWidth / ds;
  const kernelRadius = Math.ceil(sigma * 2.5);
  const weights = Array.from({ length: 2 * kernelRadius + 1 }, (_, k) => Math.exp(-((k - kernelRadius) ** 2) / (2 * sigma * sigma)));
  const wsum = weights.reduce((a, b) => a + b, 0);
  const at = (j: number) => (j < 0 ? 2 * z[0] - z[-j] : j >= count ? 2 * z[count - 1] - z[2 * (count - 1) - j] : z[j]);
  return z.map((_, i) => {
    let sum = 0;
    for (let k = -kernelRadius; k <= kernelRadius; k++) sum += at(i + k) * weights[k + kernelRadius];
    return sum / wsum;
  });
};
export const roundOff = (followed: ReturnType<typeof terrainFollow>, floorAt = floorFor(followed.length)) => {
  const count = followed.points.length;
  const ds = followed.horizArcLen[1];
  const arcLens = followed.horizArcLen;
  const need = followed.points.map((_, i) => Math.max(followed.groundTops[i] + clearance, floorAt(arcLens[i])));
  const z1 = followed.points.map((p, i) => Math.max(p[2], floorAt(arcLens[i])));
  const zg = gaussian(z1, smoothHalfWidth, ds).map((v, i) => Math.max(v, need[i]));
  const terrainDriven = followed.points.map((_, i) => followed.groundTops[i] + clearance >= floorAt(arcLens[i]) - 1);
  const z2 = zg.map((value, i) => {
    let maxZ = value;
    for (let j = 0; j < count; j++) if (terrainDriven[j]) maxZ = Math.max(maxZ, zg[j] - roundCurvature * (arcLens[i] - arcLens[j]) ** 2);
    return maxZ;
  });
  const z = gaussian(z2, finishHalfWidth, ds);
  z[0] = z1[0];
  z[count - 1] = z1[count - 1];
  return { ...followed, points: followed.points.map((p, i) => [p[0], p[1], z[i]] as V3), 高度: (s: number) => z[Math.min(count - 1, Math.max(0, Math.round(s / ds)))] };
};
// 交给 地形跟随 的「地面」= 要求高度 − 净空：地物面，和近处最高的顶 − (净空 − 最小净空) 取大。
// 左右不再取宽（侧宽 0）：地物面本身就是方圆 250 米的中位，地物顶是 48 米见方里最高的
export const followGround = (x: number, y: number) => Math.max(featureSurface(x, y), featureTop(x, y) - (clearance - minClearance));
export const fullRoute = roundOff(terrainFollow(flatWaypoints, followGround, undefined, { clearance: clearance, climbSlope: 0.35, descentSlope: 0.28, sideWidth: 0, stepLength: 50 }));
// 收势（用户 10-12 去掉急刹）：从急刹点（爬升线的头，坡 0.5）到悬停点这 380 米、200 米高是一段三次 Hermite：起点的坡接爬升线的 0.5，到悬停点坡为 0（改平），水平一直顺着 `leg2Dir`。
// 中间最陡约 0.7（35°），那时已经减到三百米每秒以下。每 40 米取一个航点，Catmull-Rom 贴着它走
const HOVER: V3 = [...hoverXY, hoverHeight];
const settlePts: V3[] = (() => {
  const len = brakeDist;
  const rise = hoverHeight - brakeHeight;
  const m0 = approachSlope;
  // h(x) = m0·x + b·x² + c·x³，h(L) = H，h'(L) = 0
  const cubicCoef = (m0 * len - 2 * rise) / len ** 3;
  const quadCoef = (rise - m0 * len - cubicCoef * len ** 3) / len ** 2;
  const count = Math.round(len / 40);
  return Array.from({ length: count - 1 }, (_, i) => {
    const x = (len * (i + 1)) / count;
    return [...along(brakeXY, leg2Dir, x), brakeHeight + m0 * x + quadCoef * x * x + cubicCoef * x ** 3] as V3;
  });
})();
const PTS: V3[] = [W0, W1, ...fullRoute.points, ...settlePts, HOVER];
export const ROUTE = new Route(PTS);
const brakeIndex = PTS.length - 2 - settlePts.length;
export const brakeS = ROUTE.waypointArcLen(brakeIndex);
