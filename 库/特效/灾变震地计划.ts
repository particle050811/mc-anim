// 灾变震地的计划和逐帧取样（纯模块，不引 react、three、asset:）：哪些格子蹦、怎么飞、落在哪，方块粒子、坑、裂纹、圆环在第几刻什么样。出处、和游戏的差别见 灾变震地.tsx 文件头。
// 计划按 (数据, 砸点, 种子, 加强) 只算一次（mulberry32(种子) 一条随机数串，真挪 / 游戏原样 → 方块粒子的顺序取）；逐帧函数的输入是刻（砸地以后，20 刻/秒），输出是普通数据。
// 画（几何、材质、圆环贴图）在 灾变震地.tsx。
import type { V3 } from '../../engine/core/坐标.ts';
import { mulberry32 } from '../../engine/core/数学.ts';
import { face, fullFaces, newBuf, tintsOf, type DebrisData, type DebrisFace, type FaceBuffer } from './方块碎块面.ts';
import { interpPathPos, particleInitVel, particlePath, type Particle } from './粒子物理.ts';

// REINFORCED_SMASH：砸地（方块粒子、圆环）在第 3 刻，震波第 5 刻起每 2 刻往外一圈，3～10 格
const quakeStartTick = 2; // 相对砸地那一刻
const ticksPerRing = 2;
const lingerTicks = 10; // `Cm_Falling_Block_Entity` 的 duration
const ringLifeTicks = 25;

// 高斯随机数（Box-Muller，代替 `RandomSource.nextGaussian`）
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(Math.max(1e-9, r()))) * Math.cos(2 * Math.PI * r());

export type QuakeCell = { p: number[]; faces: Record<string, DebrisFace>; size?: number[] };
// 加强：起跳 = 竖直初速度倍数；圈 = 震波各圈半径（格，第 k 圈在第 起刻 + 2k 刻蹦）；
// 密度 = 0 照游戏只蹦圆上那 ceil(r × 2π) 个点，> 0 = 格心离砸点 r ± 0.5 的环带里每格按这个概率蹦；外飞 = 往外的水平初速度（格/刻，按 0.5～1 倍随机），每刻 ×0.98，碰到更高的列就不再往外；
// 真挪 = 蹦起来的就是原来那块（游戏里是原地不动、上面生成一个拷贝，落地 10 刻后消失）：原位变空成坑，落地吸到所在那格、留在那里，见 `buildDisplaced`；
// 裂纹 = 砸地那一刻起，离砸点多少格以内的地面方块盖原版挖掘裂纹（紧挨砸点 destroy_stage_9，每远一格低一级），见 `crackStage`；
// 环 = 圆环大小倍数；粒子 = 方块粒子个数倍数；粒子速 = 粒子初速度倍数；粒子大 = 粒子大小倍数；
// 留空 = 真挪时别的格蹦起来的方块不许飞进去的几段线 [x0, y0, x1, y1, 半宽]（格心离线段 半宽 以内的列；后面镜头的机位和视线：只能有坑，不能有落块挡着）
export type QuakeBoost = { takeoff: number; rings: number[]; density: number; outward: number; realMove: boolean; crackCount: number; ring: number; 粒子: number; particleSpeed: number; particleSize: number; emptyCells?: number[][] };
export const gameQuake: QuakeBoost = { takeoff: 1, rings: [3, 4, 5, 6, 7, 8, 9, 10], density: 0, outward: 0, realMove: false, crackCount: 0, ring: 1, 粒子: 1, particleSpeed: 1, particleSize: 1 };
export type HopBlock = { cell: QuakeCell; path: V3[]; vanishTick: number; startTick: number };
export type QuakeParticle = { path: V3[]; life: number; half: number; uv: [number, number, number, number]; color: [number, number, number]; startTick: number };

// 每一竖列（格子左下角的整数坐标）：脚底那一层（地面顶 z 往下那一格）往下第一块方块，和这一列在地面以上有没有东西
const columnLookup = (data: DebrisData, groundZ: number) => {
  const cols = new Map<string, QuakeCell[]>();
  for (const cell of data.cells) {
    const k = `${Math.floor(cell.p[0])},${Math.floor(cell.p[1])}`;
    (cols.get(k) ?? cols.set(k, []).get(k)!).push(cell);
  }
  return (ix: number, iy: number): { cell: QuakeCell; top: number } | null => {
    const list = cols.get(`${ix},${iy}`);
    if (!list) return null;
    if (list.some((c) => c.p[2] > groundZ)) return null; // 地面以上有墙、台阶：拷贝埋在里面，不画
    const below = list.filter((c) => c.p[2] < groundZ).sort((a, b) => b.p[2] - a.p[2]);
    return below.length ? { cell: below[0], top: below[0].p[2] + 0.5 } : null;
  };
};

// 第 k 圈要蹦的点：th = 从砸点往外的方位角
const ringPoints = (center: V3, radius: number, density: number, rand: () => number) => {
  const points: { ix: number; iy: number; th: number }[] = [];
  if (density > 0) {
    for (let ix = Math.floor(center[0] - radius - 1); ix <= center[0] + radius + 1; ix++)
      for (let iy = Math.floor(center[1] - radius - 1); iy <= center[1] + radius + 1; iy++) {
        const d = Math.hypot(ix + 0.5 - center[0], iy + 0.5 - center[1]);
        if (d >= radius - 0.5 && d < radius + 0.5 && rand() < density) points.push({ ix, iy, th: Math.atan2(iy + 0.5 - center[1], ix + 0.5 - center[0]) });
      }
  } else {
    const pointCount = Math.ceil(radius * 2 * Math.PI);
    for (let i = 0; i < pointCount; i++) {
      const th = (pointCount > 1 ? i / (pointCount - 1) - 0.5 : 0) * 2 * Math.PI;
      points.push({ ix: Math.floor(center[0] + Math.cos(th) * radius), iy: Math.floor(center[1] + Math.sin(th) * radius), th });
    }
  }
  return points;
};

// 游戏原样：拷贝从地面上一格蹦起、落地 10 刻后消失
const buildHops = (data: DebrisData, center: V3, rand: () => number, boost: QuakeBoost): HopBlock[] => {
  const lookup = columnLookup(data, center[2]);
  const blocks: HopBlock[] = [];
  boost.rings.forEach((radius, k) => {
    const seen = new Set<string>();
    for (const { ix, iy, th } of ringPoints(center, radius, boost.density, rand)) {
      const key = `${ix},${iy}`;
      const vy0 = (0.2 + gauss(rand) * 0.15) * boost.takeoff;
      if (seen.has(key)) continue; // 同一圈落在同一格的几个点：游戏里是几块叠在一起，画一块
      seen.add(key);
      const start = lookup(ix, iy);
      if (!start) continue;
      let hit: { cell: QuakeCell; top: number } = start;
      // 逐刻模拟（底面高度，相对场景 z），落到脚下那一列的地面（找到的那块方块的顶）停住
      const outSpeed = boost.outward * (0.5 + 0.5 * rand());
      let [x, y, z] = [ix + 0.5, iy + 0.5, center[2] + 0.01];
      let [vx, vy] = [Math.cos(th) * outSpeed, Math.sin(th) * outSpeed];
      let vz = vy0;
      const path: V3[] = [[x, y, z]];
      let vanishTick = Infinity;
      for (let t = 1; t <= 300; t++) {
        vz -= 0.04;
        const ahead: { cell: QuakeCell; top: number } | null = vx || vy ? lookup(Math.floor(x + vx), Math.floor(y + vy)) : hit;
        if (ahead && z + vz > ahead.top) {
          x += vx;
          y += vy;
          hit = ahead;
        } else vx = vy = 0; // 往外碰到墙、台阶，或已经落下来了：不再往外
        let onGround = false;
        if (z + vz <= hit.top) {
          z = hit.top;
          vz = 0;
          vx = vy = 0;
          onGround = true;
        } else z += vz;
        vz *= 0.98;
        vx *= 0.98;
        vy *= 0.98;
        path.push([x, y, z]);
        if (onGround && t > lingerTicks) {
          vanishTick = t;
          break;
        }
      }
      blocks.push({ cell: start.cell, path, vanishTick, startTick: quakeStartTick + ticksPerRing * k });
    }
  });
  return blocks;
};

// ---------- 真挪 ----------
// 竖列：ground = 地面那一格（不高过地面一格的最高整格；墙是墙脚那格），top = 实心的顶（场景 z，数据外、只有薄片的列当无穷高），
// open = 能蹦、能落：最高的整格就是 ground、不低于地面两格、上面没有薄片（幽匿脉、挂在墙上的东西）
type Column = { cells: QuakeCell[]; ground: QuakeCell | null; top: number; open: boolean };
const columnsOf = (data: DebrisData, groundZ: number) => {
  const byCol = new Map<string, QuakeCell[]>();
  for (const cell of data.cells) {
    const k = `${Math.floor(cell.p[0])},${Math.floor(cell.p[1])}`;
    (byCol.get(k) ?? byCol.set(k, []).get(k)!).push(cell);
  }
  const cols = new Map<string, Column>();
  for (const [k, list] of byCol) {
    const full = list.filter((c) => !c.size).sort((a, b) => b.p[2] - a.p[2]);
    const ground = full.find((c) => c.p[2] < groundZ + 1) ?? null;
    const highest = full[0];
    const open = !!highest && highest === ground && highest.p[2] > groundZ - 2 && !list.some((c) => c.size && c.p[2] > highest.p[2]);
    cols.set(k, { cells: list, ground, top: highest ? highest.p[2] + 0.5 : Infinity, open });
  }
  return cols;
};
// 一块蹦起来的方块：start 那一刻还在原位（底面 top − 1），下一刻顶出地面（底面 top + 0.01，同游戏拷贝的生成位置），之后照游戏的物理；
// path[i] = 第 start + i 刻的底面中心；落地那一刻吸到所在那格的格心（偏差摊在整段飞行里），落在那一列当时的顶上（坑底、地面、别的落块上面）。
// 翻滚：绕水平轴往外滚 turns 个 90°，落地那一刻正好转完，摆正后贴图朝向跟着变
export type Mover = { cell: QuakeCell; col: [number, number]; top: number; start: number; path: V3[]; land: number; to: V3 | null; axis: V3; turns: number; stay: boolean };
// 裂纹：这一格（地面那一格）在第几级；mover = 这格就是蹦起来的那块，蹦走以后不画
export type Crack = { cell: QuakeCell; stage: number; mover: Mover | null };
export type Displaced = { movers: Mover[]; cracks: Crack[]; events: number[]; cols: Map<string, Column> };
const crackStage = (d: number, radius: number) => (d <= radius + 0.5 ? Math.max(0, Math.min(9, Math.round(9 - (9 * (d - 1)) / Math.max(1, radius - 1)))) : -1);

const buildDisplaced = (data: DebrisData, center: V3, rand: () => number, boost: QuakeBoost): Displaced => {
  const cols = columnsOf(data, center[2]);
  const key = (ix: number, iy: number) => `${ix},${iy}`;
  const height = new Map<string, number>();
  for (const [k, c] of cols) if (c.open) height.set(k, c.top);
  const heightAt = (ix: number, iy: number) => height.get(key(ix, iy)) ?? Infinity; // 进不去的列（墙、薄片、数据外）
  const segDist = (px: number, py: number, [x0, y0, x1, y1]: number[]) => {
    const [dx, dy] = [x1 - x0, y1 - y0];
    const u = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(px - x0 - u * dx, py - y0 - u * dy);
  };
  const reserved = (ix: number, iy: number) => (boost.emptyCells ?? []).some((l) => segDist(ix + 0.5, iy + 0.5, l) <= l[4]);
  const movers: Mover[] = [];
  const launch: { m: Mover; vz: number; vx: number; vy: number }[] = [];
  boost.rings.forEach((radius, k) => {
    for (const { ix, iy, th } of ringPoints(center, radius, boost.density, rand)) {
      const vz = (0.2 + gauss(rand) * 0.15) * boost.takeoff;
      const out = boost.outward * (0.5 + 0.5 * rand());
      const dir = th + (rand() - 0.5) * 1.2; // 往外的方向左右偏 ±35°：窄巷里正对着墙的也能斜着落到旁边的格
      const turnRand = rand();
      const col = cols.get(key(ix, iy));
      if (!col?.open || !col.ground || movers.some((m) => m.col[0] === ix && m.col[1] === iy)) continue;
      const m: Mover = {
        cell: col.ground, col: [ix, iy], top: col.top, start: quakeStartTick + ticksPerRing * k, path: [], land: Infinity, to: null,
        // 翻滚轴取离往外方向最近的格轴（转 90° 的整数倍才摆得正）
        axis: Math.abs(Math.cos(dir)) > Math.abs(Math.sin(dir)) ? [0, Math.sign(Math.cos(dir)), 0] : [-Math.sign(Math.sin(dir)), 0, 0], turns: turnRand, stay: false,
      };
      movers.push(m);
      launch.push({ m, vz, vx: Math.cos(dir) * out, vy: Math.sin(dir) * out });
    }
  });
  const live = launch.map((l) => ({ ...l, x: l.m.col[0] + 0.5, y: l.m.col[1] + 0.5, z: l.m.top + 0.01, done: false }));
  for (let t = 0; t <= 300; t++) {
    for (const s of live) {
      const m = s.m;
      if (s.done || t < m.start) continue;
      if (t === m.start) {
        // 蹦的那一刻别的方块已经落在上面：不蹦了，留在原位
        if (height.get(key(...m.col)) !== m.top) {
          m.stay = true;
          s.done = true;
          continue;
        }
        height.set(key(...m.col), m.top - 1);
        m.path.push([s.x, s.y, m.top - 1]);
        continue;
      }
      if (t === m.start + 1) {
        m.path.push([s.x, s.y, s.z]);
        continue;
      }
      s.vz -= 0.04;
      if (s.vx || s.vy) {
        const [ax, ay] = [Math.floor(s.x + s.vx), Math.floor(s.y + s.vy)];
        const home = ax === m.col[0] && ay === m.col[1];
        if (heightAt(ax, ay) < s.z + s.vz && (home || !reserved(ax, ay))) {
          s.x += s.vx;
          s.y += s.vy;
        } else s.vx = s.vy = 0;
      }
      const [cx, cy] = [Math.floor(s.x), Math.floor(s.y)];
      const floorZ = heightAt(cx, cy);
      if (s.z + s.vz <= floorZ) {
        height.set(key(cx, cy), floorZ + 1);
        m.path.push([s.x, s.y, floorZ]);
        m.land = t;
        m.to = [cx + 0.5, cy + 0.5, floorZ];
        s.done = true;
        continue;
      }
      s.z += s.vz;
      s.vz *= 0.98;
      s.vx *= 0.98;
      s.vy *= 0.98;
      m.path.push([s.x, s.y, s.z]);
    }
  }
  for (const m of movers) {
    if (!m.to) continue;
    // 吸到格心：水平偏差从顶出地面那一刻起按时间摊开
    const last = m.path[m.path.length - 1];
    const [dx, dy] = [m.to[0] - last[0], m.to[1] - last[1]];
    const n = m.path.length - 1;
    m.path = m.path.map((p, i) => (i === 0 ? p : [p[0] + (dx * (i - 1)) / Math.max(1, n - 1), p[1] + (dy * (i - 1)) / Math.max(1, n - 1), p[2]]));
    // 翻滚圈数：飞得越久滚得越多，约 8 刻一个 90°，随机多滚或少滚一个；只顶出地面一点的不滚（转到 45° 时棱角往下多出 0.21 格，会扎进地里）
    const apex = Math.max(...m.path.map((p) => p[2])) - m.top;
    m.turns = apex < 0.4 ? 0 : Math.max(apex < 1 ? 0 : 1, Math.min(apex < 1 ? 1 : 3, Math.round((m.land - m.start - 1) / 8 + (m.turns - 0.5))));
  }
  const cracks: Crack[] = [];
  if (boost.crackCount > 0) {
    for (const [k, c] of cols) {
      // 只盖地面那格朝上的面（墙脚那格上面压着墙，没有朝上的面；侧面不盖：台阶、薄墙在数据里也记成整格，盖整格会在空中多出一片裂纹）
      if (!c.ground?.faces['+z'] || c.cells.some((o) => !o.size && o.p[2] > c.ground!.p[2])) continue;
      const [ix, iy] = k.split(',').map(Number);
      const stage = crackStage(Math.hypot(ix + 0.5 - center[0], iy + 0.5 - center[1]), boost.crackCount);
      if (stage < 0) continue;
      cracks.push({ cell: c.ground, stage, mover: movers.find((m) => m.cell === c.ground && !m.stay) ?? null });
    }
  }
  // 状态变化的刻（蹦起、落地）：坑和裂纹按「到这一刻为止发生了几件」缓存几何
  const events = movers.filter((m) => !m.stay).flatMap((m) => [m.start, ...(Number.isFinite(m.land) ? [m.land] : [])]).sort((a, b) => a - b);
  return { movers, cracks, events, cols };
};

const buildParticles = (data: DebrisData, center: V3, rand: () => number, boost: QuakeBoost): QuakeParticle[] => {
  const lookup = columnLookup(data, center[2]);
  // 方块粒子：脚下那块方块的贴图（取顶面），颜色照 `TerrainParticle` 的 0.6 × 所在位置的光照：光照按地面顶面的染色（同蹦起来的方块，`tintsOf`），
  // 画的时候和方块碎块一样受场景灯光（BreakParticleQuads 的 `lit`），亮度跟着周围地面走
  const tint = tintsOf(data);
  const particles: QuakeParticle[] = [];
  const particleCount = Math.round((80 + Math.floor(rand() * 12)) * boost.粒子);
  for (let i = 0; i < particleCount; i++) {
    // 游戏：extraX = 1.3 sin(π + 角)、extraZ = 1.3 cos(角)，游戏 z 是场景 −y
    const px = center[0] + 1.3 * Math.sin(Math.PI + i);
    const py = center[1] - 1.3 * Math.cos(i);
    const hit = lookup(Math.floor(px), Math.floor(py));
    const [mx, my, mz] = [gauss(rand) * 0.07, gauss(rand) * 0.07, gauss(rand) * 0.07];
    if (!hit) continue;
    const faceUv = hit.cell.faces['+z'] ?? Object.values(hit.cell.faces)[0];
    const light = (tint.get(faceUv.slice(0, 4).join(',')) ?? [faceUv[4], faceUv[5], faceUv[6]]).map((v) => Math.min(1, v / 255));
    const [gx, gy, gz] = particleInitVel(rand, mx, my, mz).map((v) => v * boost.particleSpeed);
    const life = Math.floor(4 / (rand() * 0.9 + 0.1));
    const half = ((0.1 * (rand() * 0.5 + 0.5) * 2) / 2) * boost.particleSize;
    const uo = rand() * 3;
    const vo = rand() * 3;
    const du = (faceUv[2] - faceUv[0]) / 4;
    const dv = (faceUv[3] - faceUv[1]) / 4;
    particles.push({
      path: particlePath([px, py, center[2] + 0.3], [gx, -gz, gy], life + 1, { gravity: 1, friction: 0.98, ground: hit.top }),
      life,
      half,
      uv: [faceUv[0] + du * (uo + 1), faceUv[1] + dv * vo, faceUv[0] + du * uo, faceUv[1] + dv * (vo + 1)],
      color: [0.6 * light[0], 0.6 * light[1], 0.6 * light[2]],
      startTick: 0,
    });
  }
  return particles;
};

export type QuakePlan = { hops: HopBlock[]; displaced: Displaced | null; particles: QuakeParticle[] };
const planCache = new WeakMap<DebrisData, Map<string, QuakePlan>>();
export const planQuake = (data: DebrisData, center: V3, seed: number, boost: QuakeBoost): QuakePlan => {
  const byData = planCache.get(data) ?? planCache.set(data, new Map()).get(data)!;
  const k = JSON.stringify([center, seed, boost]);
  let plan = byData.get(k);
  if (!plan) {
    const rand = mulberry32(seed);
    const displaced = boost.realMove ? buildDisplaced(data, center, rand, boost) : null;
    const hops = boost.realMove ? [] : buildHops(data, center, rand, boost);
    plan = { hops, displaced, particles: buildParticles(data, center, rand, boost) };
    byData.set(k, plan);
  }
  return plan;
};
// 真挪时场景网格里要藏掉的格子（BlockMesh 的 hideBlocks，和组件同一套坐标）：蹦的每一块都由组件画（蹦之前在原位、落地后在新位置）
export const quakeHideBlocks = (data: DebrisData, center: V3, boost: QuakeBoost, seed = 8631): number[][] =>
  (planQuake(data, center, seed, boost).displaced?.movers ?? []).map(({ cell: { p } }) => [p[0] - 0.45, p[1] - 0.45, p[2] - 0.45, p[0] + 0.45, p[1] + 0.45, p[2] + 0.45]);

// 真挪：到第 T 刻为止的坑（坑底 + 四周还实心的那几面墙）。坑底贴图用这一列下面那格（没导出就用蹦走的那块），墙用邻格同一层那格；
// 颜色压暗（坑底 0.45、坑壁 0.6，照游戏一格深的坑里环境光遮蔽的暗度），不然从上往下看和平地分不出来
export const holeFaces = (d: Displaced, data: DebrisData, T: number): FaceBuffer => {
  const tint = tintsOf(data);
  const dim = (f: DebrisFace, k: number) => [...f.slice(0, 4), ...f.slice(4, 7).map((v) => v * k)];
  const buf = newBuf();
  const key = (ix: number, iy: number) => `${ix},${iy}`;
  const delta = new Map<string, number>();
  const bump = (k: string, v: number) => delta.set(k, (delta.get(k) ?? 0) + v);
  for (const m of d.movers) {
    if (m.stay) continue;
    if (m.start <= T) bump(key(...m.col), -1);
    if (m.to && m.land <= T) bump(key(Math.floor(m.to[0]), Math.floor(m.to[1])), 1);
  }
  const heightAt = (ix: number, iy: number) => (d.cols.get(key(ix, iy))?.top ?? Infinity) + (delta.get(key(ix, iy)) ?? 0);
  const sides: [string, number, number][] = [['-x', 1, 0], ['+x', -1, 0], ['-y', 0, 1], ['+y', 0, -1]];
  for (const m of d.movers) {
    if (m.stay || m.start > T) continue;
    const [ix, iy] = m.col;
    if (heightAt(ix, iy) >= m.top) continue; // 又落进来一块，填平了
    const col = d.cols.get(key(ix, iy))!;
    const sameLevel = (c: QuakeCell, z: number) => !c.size && Math.abs(c.p[2] - z) < 0.01;
    const below = col.cells.find((c) => sameLevel(c, m.cell.p[2] - 1)) ?? m.cell;
    face(buf, [ix + 0.5, iy + 0.5, m.top - 1.5], 0.5, '+z', dim(fullFaces(below.faces, tint)['+z'], 0.45), true);
    for (const [dir, dx, dy] of sides) {
      if (heightAt(ix + dx, iy + dy) < m.top) continue; // 那边这一层也是空的（坑、更低的地面）
      const side = d.cols.get(key(ix + dx, iy + dy));
      const src = side?.cells.find((c) => sameLevel(c, m.cell.p[2])) ?? side?.ground ?? m.cell;
      face(buf, [ix + dx + 0.5, iy + dy + 0.5, m.top - 0.5], 0.5, dir, dim(fullFaces(src.faces, tint)[dir], 0.6), true);
    }
  }
  return buf;
};

// 真挪：一块方块在第 T 刻的底面中心和翻滚角（蹦之前、不蹦的在原位）
export const moverPose = (m: Mover, T: number): { base: number[]; angle: number } => {
  if (m.stay || T < m.start || !m.path.length) return { base: [m.col[0] + 0.5, m.col[1] + 0.5, m.top - 1], angle: 0 };
  const i = T - m.start;
  const k = Math.floor(i);
  const a = m.path[Math.min(k, m.path.length - 1)];
  const b = m.path[Math.min(k + 1, m.path.length - 1)];
  const span = m.land - m.start - 1;
  return { base: [0, 1, 2].map((j) => a[j] + (b[j] - a[j]) * (i - k)), angle: span > 0 ? (m.turns * Math.PI * Math.min(1, Math.max(0, (i - 1) / span))) / 2 : 0 };
};

// ---------- 逐帧 ----------
// 游戏原样：第 ticks 刻还看得见的蹦块（生成后下一刻才动，消失那一刻起不画），底面中心在上一刻和这一刻之间插值（同 粒子面片.tsx 的 `插值位置`）；index = 在 plan.hops 里的序号
export const hopBlocksAt = (plan: QuakePlan, ticks: number): { index: number; cell: QuakeCell; base: number[] }[] => {
  const out: { index: number; cell: QuakeCell; base: number[] }[] = [];
  plan.hops.forEach((block, i) => {
    const t = ticks - block.startTick;
    if (t < 0 || t >= block.vanishTick) return;
    const k = Math.floor(t);
    const frac = t - k;
    const prev = block.path[Math.max(0, Math.min(block.path.length - 1, k - 1))];
    const cur = block.path[Math.max(0, Math.min(block.path.length - 1, k))];
    out.push({ index: i, cell: block.cell, base: [0, 1, 2].map((j) => prev[j] + (cur[j] - prev[j]) * frac) });
  });
  return out;
};

// 第 ticks 刻还活着的方块粒子（看得到 life + 1 刻）
export const quakeParticlesAt = (plan: QuakePlan, ticks: number): Particle[] => {
  const ps: Particle[] = [];
  for (const particle of plan.particles) {
    if (ticks >= particle.life + 1) continue;
    ps.push({ p: interpPathPos(particle.path, ticks), half: particle.half, uv: particle.uv, color: particle.color });
  }
  return ps;
};

// 圆环：第 k 刻年龄 2k，画的时候按 (年龄 + partialTicks) / 25 算大小、不透明度；贴图按年龄换帧（frameCount 张）。第 13 刻起没了，返回 null
export const ringAt = (ticks: number, ringScale: number, frameCount: number): { half: number; frame: number; opacity: number } | null => {
  const k = Math.floor(ticks);
  if (k >= 13) return null;
  const age = 2 * k;
  const lifeFrac = (age + (ticks - k)) / ringLifeTicks;
  return { half: 2.5 * ringScale * lifeFrac, frame: Math.min(frameCount - 1, Math.floor((age * (frameCount - 1)) / ringLifeTicks)), opacity: 0.95 * (1 - lifeFrac) + 0.05 };
};

// 真挪：到第 ticks 刻为止发生过几件事（蹦起、落地），坑的几何按这个数缓存
export const eventsDoneAt = (d: Displaced, ticks: number) => d.events.filter((e) => e <= ticks).length;

// 真挪：第 ticks 刻还盖着第 stage 级裂纹的格子（那格蹦走了就不盖），给方块中心
export const cracksAt = (d: Displaced, ticks: number, stage: number): number[][] => {
  const out: number[][] = [];
  for (const c of d.cracks) {
    if (c.stage !== stage || (c.mover && ticks >= c.mover.start)) continue;
    out.push(c.cell.p);
  }
  return out;
};
