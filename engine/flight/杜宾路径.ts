// 杜宾路径：两个位姿（位置 + 朝向）之间、转弯半径不小于 R 的最短平面路径（Dubins 1957），由「圆弧—直线—圆弧」或「三段圆弧」组成。
// 一镜到底（镜头/一镜到底/路线.ts）拿它连两处穿刺线：上一处穿出来的位姿 → 下一处穿刺线前面的位姿，转弯匀、不绕冤枉路。
// 位姿：[x, y, 方位]（场景坐标，方位：度，0 = 北、顺时针为正）。公式照 Shkel & Lumelsky 2001 的六种路径（LSL、RSR、LSR、RSL、RLR、LRL）取最短的。
export type DubinsPose = [number, number, number];
type DubinsMove = 'L' | 'S' | 'R';
export type DubinsPath = { moves: [DubinsMove, DubinsMove, DubinsMove]; lengths: [number, number, number]; totalLen: number; turnDeg: number };

const mod2Pi = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
const headingToMathRad = (headingDeg: number) => ((90 - headingDeg) * Math.PI) / 180;

export const solveDubins = (start: DubinsPose, end: DubinsPose, turnRadius: number): DubinsPath => {
  const t0 = headingToMathRad(start[2]);
  const t1 = headingToMathRad(end[2]);
  const dx = (end[0] - start[0]) / turnRadius;
  const dy = (end[1] - start[1]) / turnRadius;
  const normDist = Math.hypot(dx, dy);
  const th = Math.atan2(dy, dx);
  const alpha = mod2Pi(t0 - th);
  const beta = mod2Pi(t1 - th);
  const sa = Math.sin(alpha), sb = Math.sin(beta), ca = Math.cos(alpha), cb = Math.cos(beta), cab = Math.cos(alpha - beta);
  const candidates: { moves: [DubinsMove, DubinsMove, DubinsMove]; t: number; p: number; q: number }[] = [];
  let radicand = 2 + normDist * normDist - 2 * cab + 2 * normDist * (sa - sb);
  if (radicand >= 0) {
    const tmp = Math.atan2(cb - ca, normDist + sa - sb);
    candidates.push({ moves: ['L', 'S', 'L'], t: mod2Pi(-alpha + tmp), p: Math.sqrt(radicand), q: mod2Pi(beta - tmp) });
  }
  radicand = 2 + normDist * normDist - 2 * cab + 2 * normDist * (sb - sa);
  if (radicand >= 0) {
    const tmp = Math.atan2(ca - cb, normDist - sa + sb);
    candidates.push({ moves: ['R', 'S', 'R'], t: mod2Pi(alpha - tmp), p: Math.sqrt(radicand), q: mod2Pi(-beta + tmp) });
  }
  radicand = -2 + normDist * normDist + 2 * cab + 2 * normDist * (sa + sb);
  if (radicand >= 0) {
    const midArc = Math.sqrt(radicand);
    const tmp = Math.atan2(-ca - cb, normDist + sa + sb) - Math.atan2(-2, midArc);
    candidates.push({ moves: ['L', 'S', 'R'], t: mod2Pi(-alpha + tmp), p: midArc, q: mod2Pi(-beta + tmp) });
  }
  radicand = -2 + normDist * normDist + 2 * cab - 2 * normDist * (sa + sb);
  if (radicand >= 0) {
    const midArc = Math.sqrt(radicand);
    const tmp = Math.atan2(ca + cb, normDist - sa - sb) - Math.atan2(2, midArc);
    candidates.push({ moves: ['R', 'S', 'L'], t: mod2Pi(alpha - tmp), p: midArc, q: mod2Pi(beta - tmp) });
  }
  radicand = (6 - normDist * normDist + 2 * cab + 2 * normDist * (sa - sb)) / 8;
  if (Math.abs(radicand) <= 1) {
    const midArc = mod2Pi(2 * Math.PI - Math.acos(radicand));
    const t = mod2Pi(alpha - Math.atan2(ca - cb, normDist - sa + sb) + midArc / 2);
    candidates.push({ moves: ['R', 'L', 'R'], t, p: midArc, q: mod2Pi(alpha - beta - t + midArc) });
  }
  radicand = (6 - normDist * normDist + 2 * cab + 2 * normDist * (sb - sa)) / 8;
  if (Math.abs(radicand) <= 1) {
    const midArc = mod2Pi(2 * Math.PI - Math.acos(radicand));
    const t = mod2Pi(-alpha - Math.atan2(ca - cb, normDist + sa - sb) + midArc / 2);
    candidates.push({ moves: ['L', 'R', 'L'], t, p: midArc, q: mod2Pi(beta - alpha - t + midArc) });
  }
  if (!candidates.length) throw new Error('杜宾路径：没有可行的路径');
  const best = candidates.reduce((x, y) => (x.t + x.p + x.q <= y.t + y.p + y.q ? x : y));
  const segLens: [number, number, number] = [best.t * turnRadius, best.p * turnRadius, best.q * turnRadius];
  const arcRad = (k: number) => (best.moves[k] === 'S' ? 0 : [best.t, best.p, best.q][k]);
  return { moves: best.moves, lengths: segLens, totalLen: segLens[0] + segLens[1] + segLens[2], turnDeg: ((arcRad(0) + arcRad(1) + arcRad(2)) * 180) / Math.PI };
};

// 沿路径走 l 米以后的位姿
export const dubinsPoseAt = (start: DubinsPose, path: DubinsPath, turnRadius: number, dist: number): DubinsPose => {
  let x = start[0], y = start[1], th = headingToMathRad(start[2]);
  let left = Math.max(0, Math.min(dist, path.totalLen));
  for (let k = 0; k < 3 && left > 0; k++) {
    const len = Math.min(left, path.lengths[k]);
    const move = path.moves[k];
    if (move === 'S') {
      x += len * Math.cos(th);
      y += len * Math.sin(th);
    } else if (move === 'L') {
      const cx = x - turnRadius * Math.sin(th), cy = y + turnRadius * Math.cos(th);
      th += len / turnRadius;
      x = cx + turnRadius * Math.sin(th);
      y = cy - turnRadius * Math.cos(th);
    } else {
      const cx = x + turnRadius * Math.sin(th), cy = y - turnRadius * Math.cos(th);
      th -= len / turnRadius;
      x = cx - turnRadius * Math.sin(th);
      y = cy + turnRadius * Math.cos(th);
    }
    left -= len;
  }
  return [x, y, 90 - (th * 180) / Math.PI];
};
