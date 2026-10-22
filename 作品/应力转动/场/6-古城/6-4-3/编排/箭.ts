// 6-4-3 箭：位置（几何.ts）和沿路的暴击粒子。
import { rng, type V3 } from '@engine/model/parts.tsx';
import { interpPathPos, particleInitVel, particlePath, type Particle } from '@库/特效/粒子面片.tsx';
import * as geom from '../几何.ts';
import { add, storySecAt } from './公用.ts';
export const arrowAt = (g: number) => geom.箭(storySecAt(g));
// 暴击粒子（原版 CritParticle）：满弓射出的和被拔刀剑挡开的箭都是暴击箭（AbstractArrow.tick 每刻沿上一刻路线放 4 个，
// 速度 (−dx, −dy + 0.2, −dz)）。这里沿路每 0.3 米放一个以便看清；粒子本身照游戏：
// 速度 ×0.1 加 0.4 × 给的速度、摩擦 0.7、重力 0.5、寿命 6/(random×0.8+0.6) 刻、大小 ×0.75、颜色灰白 0.6～0.9、每刻绿 ×0.96 蓝 ×0.9，出生时已 tick 过一次
const critSpacing = 0.3;
// 粒子往回飘的总距离 ≈ 0.4 × 箭速（格/刻）÷ (1 − 摩擦 0.7)：1000 米/秒的箭照抄会往回飘六十多米，挑飞那段一直拖到接触点下面。
// 用户 10-18 要拖尾从接触点开始：箭速封顶到往回飘不超过离起点（弓、接触点）的距离，即 箭速 ≤ 20 × 0.75 × 距离 米/秒
const backCap = (dist: number) => 15 * dist;
type CritSource = { t: number; p: V3; v: V3; r: number };
const critSources: CritSource[] = (() => {
  const out: CritSource[] = [];
  for (let dist = critSpacing; dist < geom.弹开程; dist += critSpacing) {
    const t = geom.放箭 + geom.来箭到(dist);
    const u = Math.min(geom.箭速(dist), backCap(dist));
    out.push({ t, p: add(geom.搭箭点, geom.来向, dist), v: [geom.来向[0] * u, geom.来向[1] * u, geom.来向[2] * u], r: out.length });
  }
  for (let dist = critSpacing; dist < geom.洞顶程; dist += critSpacing) {
    const t = geom.弹开 + dist / geom.箭速上限;
    const u = Math.min(geom.箭速上限, backCap(dist));
    out.push({ t, p: add(geom.弹开点, geom.挑飞方向, dist), v: [geom.挑飞方向[0] * u, geom.挑飞方向[1] * u, geom.挑飞方向[2] * u], r: out.length });
  }
  return out;
})();
const critTrackCache = new Map<number, { path: V3[]; life: number; half: number; f: number }>();
export const critParticles = (globalFrame: number): Particle[] => {
  const t = storySecAt(globalFrame);
  const out: Particle[] = [];
  for (const src of critSources) {
    if (t < src.t) continue;
    let cached = critTrackCache.get(src.r);
    if (!cached) {
      const rand = rng(src.r * 7919 + 3);
      const life = Math.max(1, Math.floor(6 / (rand() * 0.8 + 0.6)));
      // 给的速度（格/刻，游戏 y 朝上）：场景 → 游戏 (x, z, −y)
      const vt = [-src.v[0] / 20, -src.v[2] / 20 + 0.2, src.v[1] / 20];
      const [rx, ry, rz] = particleInitVel(rand, 0, 0, 0);
      const gv = [rx * 0.1 + vt[0] * 0.4, ry * 0.1 + vt[1] * 0.4, rz * 0.1 + vt[2] * 0.4];
      const half = 0.1 * (rand() * 0.5 + 0.5) * 2 * 0.75;
      cached = { path: particlePath(src.p, [gv[0], -gv[2], gv[1]], life + 2, { gravity: 0.5, friction: 0.7 }), life, half, f: rand() * 0.3 + 0.6 };
      critTrackCache.set(src.r, cached);
    }
    const age = (t - src.t) * 20 + 1;
    if (age >= cached.life) continue;
    const k = Math.min(1, (age / cached.life) * 32);
    out.push({ p: interpPathPos(cached.path, age), half: cached.half * k, uv: [0, 0, 1, 1], color: [cached.f, cached.f * 0.96 ** age, cached.f * 0.9 ** age] });
  }
  return out;
};
