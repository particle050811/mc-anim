// 飞行路径：一条过若干航点的平滑曲线（向心 Catmull-Rom），按弧长取点；再配一条速度曲线（米/秒，按帧给关键帧），
// 积分出每一帧走到曲线上的哪里。路线形状和快慢分开调：卡点（第几帧到哪个航点附近）靠速度曲线对。
// 6-1-4、6-2-5、6-2-6 的扫帚轨迹用它；镜头另外按扫帚的位置算。
import { type Key, sample } from '../anim/anim.ts';
import type { V3 } from '../model/parts.tsx';

// 高速飞行用广角（用户 10-14 定：参考视频是游戏里竖直视野 90° 以上，约等于 10mm，四周的地面往后掠得快才有速度感）：
// 只在高速飞的时候，起飞、减速、悬停和地面照原焦距。焦距往 WIDE_LENS 推多少，机位就沿「镜头 → 骑手」推近同样的倍数，人在画面里一样大
export const WIDE_LENS = 10;

const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: number[]) => Math.hypot(a[0], a[1], a[2]);

export class Route {
  readonly points: V3[];
  private table: { s: number; p: V3 }[] = [];
  readonly length: number;
  private samplesPerSeg: number;
  constructor(points: V3[], samplesPerSeg = 60) {
    this.samplesPerSeg = samplesPerSeg;
    this.points = points;
    const padded = [points[0].map((v, i) => 2 * v - points[1][i]) as V3, ...points, points[points.length - 1].map((v, i) => 2 * v - points[points.length - 2][i]) as V3];
    let arcLen = 0;
    let prev: V3 | null = null;
    for (let i = 1; i < padded.length - 2; i++) {
      for (let k = 0; k < samplesPerSeg; k++) {
        const pt = catmull(padded[i - 1], padded[i], padded[i + 1], padded[i + 2], k / samplesPerSeg);
        if (prev) arcLen += len(sub(pt, prev));
        this.table.push({ s: arcLen, p: pt });
        prev = pt;
      }
    }
    const last = points[points.length - 1];
    arcLen += len(sub(last, prev!));
    this.table.push({ s: arcLen, p: last });
    this.length = arcLen;
  }
  waypointArcLen(i: number) {
    return i >= this.points.length - 1 ? this.length : this.table[i * this.samplesPerSeg].s;
  }
  // 弧长 s 处的点（超出两端时沿端点切线外推）
  at(arcLen: number): V3 {
    const t = this.table;
    if (arcLen <= 0 || arcLen >= this.length) {
      // 端点处的切线直接用表里相邻两点（不能调 dir()，它又会调回 at()）
      const [segStart, segEnd] = arcLen <= 0 ? [t[0], t[1]] : [t[t.length - 2], t[t.length - 1]];
      const delta = sub(segEnd.p, segStart.p);
      const deltaLen = len(delta) || 1;
      const overshoot = arcLen <= 0 ? arcLen : arcLen - this.length;
      const endPt = arcLen <= 0 ? segStart.p : segEnd.p;
      return [endPt[0] + (delta[0] / deltaLen) * overshoot, endPt[1] + (delta[1] / deltaLen) * overshoot, endPt[2] + (delta[2] / deltaLen) * overshoot];
    }
    let lo = 0;
    let hi = t.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (t[mid].s <= arcLen) lo = mid;
      else hi = mid;
    }
    const k = (arcLen - t[lo].s) / Math.max(1e-9, t[hi].s - t[lo].s);
    const lowPt = t[lo].p;
    const highPt = t[hi].p;
    return [lowPt[0] + (highPt[0] - lowPt[0]) * k, lowPt[1] + (highPt[1] - lowPt[1]) * k, lowPt[2] + (highPt[2] - lowPt[2]) * k];
  }
  // 弧长 s 处的单位切线（前后各取 2 米差分）
  dir(arcLen: number): V3 {
    const halfStep = 2;
    const behind = this.at(Math.min(Math.max(arcLen - halfStep, 0), this.length - 2 * halfStep));
    const ahead = this.at(Math.min(Math.max(arcLen + halfStep, 2 * halfStep), this.length));
    const delta = sub(ahead, behind);
    const deltaLen = len(delta) || 1;
    return [delta[0] / deltaLen, delta[1] / deltaLen, delta[2] / deltaLen];
  }
}

const catmull = (p0: V3, p1: V3, p2: V3, p3: V3, t: number): V3 => {
  // 向心参数化（alpha 0.5）：航点间距不均匀时不打结、不冲过头
  const tj = (a: V3, b: V3, ti: number) => ti + Math.sqrt(Math.max(1e-6, len(sub(b, a))));
  const t0 = 0;
  const t1 = tj(p0, p1, t0);
  const t2 = tj(p1, p2, t1);
  const t3 = tj(p2, p3, t2);
  const knotT = t1 + (t2 - t1) * t;
  const lerp = (a: V3, b: V3, ta: number, tb: number) => a.map((v, i) => ((tb - knotT) / (tb - ta)) * v + ((knotT - ta) / (tb - ta)) * b[i]) as V3;
  const A1 = lerp(p0, p1, t0, t1);
  const A2 = lerp(p1, p2, t1, t2);
  const A3 = lerp(p2, p3, t2, t3);
  const B1 = lerp(A1, A2, t0, t2);
  const B2 = lerp(A2, A3, t1, t3);
  return lerp(B1, B2, t1, t2);
};

// 速度曲线（[帧, 米/秒]）积分成每帧走过的弧长：返回 s(f)，f 可以是小数。fps 默认 24
export const odometer = (speedKeys: Key[], frameCount: number, fps = 24) => {
  const substeps = 4;
  const acc = new Float64Array(frameCount * substeps + 1);
  for (let i = 1; i <= frameCount * substeps; i++) {
    const frame = (i - 0.5) / substeps;
    acc[i] = acc[i - 1] + sample(speedKeys, frame) / fps / substeps;
  }
  return (frame: number) => {
    const x = Math.min(Math.max(frame * substeps, 0), frameCount * substeps);
    const i = Math.min(Math.floor(x), frameCount * substeps - 1);
    return acc[i] + (acc[i + 1] - acc[i]) * (x - i);
  };
};

// 方向 → 扫帚的朝向、俯仰（度；朝向 0 = +Y、正 = 往左转，俯仰正 = 抬头，和 骑扫帚.tsx 一致）
export const headingPitch = (d: number[]) => ({
  yaw: (Math.atan2(-d[0], d[1]) * 180) / Math.PI,
  pitch: (Math.atan2(d[2], Math.hypot(d[0], d[1])) * 180) / Math.PI,
});

// 角度插值时绕近路（-180～180 的跳变接上）
export const unwrapAngle = (a: number, ref: number) => a + 360 * Math.round((ref - a) / 360);

// 转弯内倾：扫帚转弯时往里压一点（度，正 = 往右压，和 骑扫帚.tsx 的 横滚 同号；往左转 = 负）。用户 10-01 嫌翻滚画面头晕，所以：
//   不按协调转弯 atan(v·ω/g) 算坡度（16 倍世界速度下一点转向就压到七八十度），只按转得多快给温和坡度，tanh 软限幅到 `maxBankDeg` 18°，
//   各镜头再用 `triangleSmooth` 抹平；整圈横滚全去掉，飞行镜头的 roll 一律不填，地平线保持水平。
export const maxBankDeg = 18;
export const bankAngle = (yawRate: number) => -maxBankDeg * Math.tanh(yawRate / 40); // 角速度：朝向变化率，度/秒，正 = 往左转

// 三角窗平滑：在 f 前后 半宽 帧内对 g 加权平均（越近权重越大），给坡度这类量去抖
export const triangleSmooth = (fn: (frame: number) => number, frame: number, halfWidth = 8) => {
  let weightedSum = 0;
  let weightSum = 0;
  for (let k = -halfWidth; k <= halfWidth; k++) {
    const weight = halfWidth + 1 - Math.abs(k);
    weightedSum += fn(frame + k) * weight;
    weightSum += weight;
  }
  return weightedSum / weightSum;
};

// 锚点里程：给几个 [帧, 弧长]（比如"第 183 帧到第 4 个航点"），中间用单调三次插值（Fritsch–Carlson），速度连续、不会倒退。
// 卡点靠它对：哪一拍到哪个航点直接写死，速度由路程和时间算出来
export const anchoredOdometer = (anchors: [number, number][]) => {
  const count = anchors.length;
  const slopes = anchors.slice(0, -1).map(([frame, dist], i) => (anchors[i + 1][1] - dist) / (anchors[i + 1][0] - frame));
  const tangents = anchors.map((_, i) => (i === 0 ? slopes[0] : i === count - 1 ? slopes[count - 2] : slopes[i - 1] * slopes[i] <= 0 ? 0 : (slopes[i - 1] + slopes[i]) / 2));
  for (let i = 0; i < count - 1; i++) {
    if (slopes[i] === 0) { tangents[i] = tangents[i + 1] = 0; continue; }
    const alpha = tangents[i] / slopes[i];
    const beta = tangents[i + 1] / slopes[i];
    const normSq = alpha * alpha + beta * beta;
    if (normSq > 9) { const t = 3 / Math.sqrt(normSq); tangents[i] = t * alpha * slopes[i]; tangents[i + 1] = t * beta * slopes[i]; }
  }
  return (frame: number) => {
    if (frame <= anchors[0][0]) return anchors[0][1] + tangents[0] * (frame - anchors[0][0]);
    if (frame >= anchors[count - 1][0]) return anchors[count - 1][1] + tangents[count - 1] * (frame - anchors[count - 1][0]);
    let i = 0;
    while (frame > anchors[i + 1][0]) i++;
    const span = anchors[i + 1][0] - anchors[i][0];
    const t = (frame - anchors[i][0]) / span;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * anchors[i][1] + (t3 - 2 * t2 + t) * span * tangents[i] + (-2 * t3 + 3 * t2) * anchors[i + 1][1] + (t3 - t2) * span * tangents[i + 1];
  };
};
