// 灾变震地：灾变模组（L_Ender's Cataclysm 3.31，1.20.1 Forge）里炎魔 Ignis 一锤砸地时的特效，照游戏原样搬。
// 用户 10-12 嫌 6-3-6 砸进古城的烟怪，要参考灾变炎魔那种「正方块」特效：砸地时从地面一圈圈往外蹦起来的整块方块（`Cm_Falling_Block_Entity`），不是烟也不是贴图粒子。
// 出处（jar 在 game/缓存/cataclysm/，Vineflower 反编译）：
// - `Ignis_Entity` 的 REINFORCED_SMASH（盾没碎时 vecx 3.0）：第 3 刻 `ShieldSmashparticle`（方块粒子 + 圆环），第 5 刻起每 2 刻调一次 `ShieldSmashDamage`，距离 3、4……10 格，一圈圈往外传。
// - `ShieldSmashDamage`(spreadarc 2.0, distance d)：以砸点为心、半径 d 的整圆上均匀取 ceil(d × 2π) 个点，每点脚下的方块（脚底那层往下第一块有模型的）
//   生成一个 `Cm_Falling_Block_Entity` 拷贝（原地方块不动），放在脚底层上面一格，竖直初速度 0.2 + 高斯 × 0.15 格/刻。
// - `Cm_Falling_Block_Entity.tick`：每刻先 vy −0.04，再移动（碰到方块停住），再 ×0.98；落地后活过 10 刻就消失。碰撞箱 0.98 × 0.98（生成时抬 0.01）；
//   用方块自己的模型整块画（一整格、受环境光照）。
// - `ShieldSmashparticle`：80 + random(12) 个方块粒子（`TerrainParticle`），半径 1.3 的圆上（第 i 个转 i 弧度）、离地 0.3，速度 高斯 × 0.07 再经 `Particle` 构造函数随机化（粒子面片.tsx 的 `particleInitVel`）；
//   再加一个 `RingParticle`（25 刻，白，大小 25，变大）：平躺在离地 0.3 的白色圆环，贴图 ring_0～5（按年龄换帧），半边长 = 2.5 × 年龄 / 25，
//   不透明度 0.95 × (1 − 年龄 / 25) + 0.05，满亮度。`RingParticle.tick` 年龄每刻长 2，第 13 刻就没了（0.65 秒）。
// 不画（不是画面特效）：`AreaAttack`、屏幕震动、声音（声音另有声音.tsx）。
// 和游戏不同（简化）：只在「脚底那一层上面是空的」格子上蹦（街面、坑），上面有墙、台阶的格子不画；方块粒子不处理撞墙，只按地面停住。
// `boost`（不给就是游戏原样）：多几圈、环带加密、往外飞、真挪（方块真的离开原位、落到哪格留在哪格）、裂纹、圆环和方块粒子放大，见 `QuakeBoost`。
// 时间：秒 = 砸地以后的物理秒数（20 刻/秒，原速）。坐标：数据（工具/游戏取材/网格碎块.py 从场景网格取的格子）的场景坐标，Z 朝上。
// 许可：Cataclysm 是 CC BY-NC-ND 4.0，这里只拷了圆环的 6 张贴图（`灾变圆环.贴图`，npm run 取材 -- 灾变圆环），开源时要排除或署名。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { rng, type V3 } from '../../engine/model/parts.tsx';
import { pngDir, type Png } from '../../engine/model/贴图.ts';
import { DIRS, debrisMat, face, fullFaces, newBuf, tintsOf, toGeo, atlasTex, type DebrisData, type DebrisFace } from './方块飞溅.tsx';
import { BreakParticleQuads } from './方块破坏粒子.tsx';
import { interpPathPos, particleInitVel, particlePath, type Particle } from './粒子面片.tsx';

const ticksPerSec = 20;
// REINFORCED_SMASH：砸地（方块粒子、圆环）在第 3 刻，震波第 5 刻起每 2 刻往外一圈，3～10 格
const quakeStartTick = 2; // 相对砸地那一刻
const ticksPerRing = 2;
const lingerTicks = 10; // `Cm_Falling_Block_Entity` 的 duration
const ringLifeTicks = 25;

// 高斯随机数（Box-Muller，代替 `RandomSource.nextGaussian`）
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(Math.max(1e-9, r()))) * Math.cos(2 * Math.PI * r());

type Cell = { p: number[]; faces: Record<string, DebrisFace>; size?: number[] };
// 加强：起跳 = 竖直初速度倍数；圈 = 震波各圈半径（格，第 k 圈在第 起刻 + 2k 刻蹦）；
// 密度 = 0 照游戏只蹦圆上那 ceil(r × 2π) 个点，> 0 = 格心离砸点 r ± 0.5 的环带里每格按这个概率蹦；外飞 = 往外的水平初速度（格/刻，按 0.5～1 倍随机），每刻 ×0.98，碰到更高的列就不再往外；
// 真挪 = 蹦起来的就是原来那块（游戏里是原地不动、上面生成一个拷贝，落地 10 刻后消失）：原位变空成坑，落地吸到所在那格、留在那里，见 `buildDisplaced`；
// 裂纹 = 砸地那一刻起，离砸点多少格以内的地面方块盖原版挖掘裂纹（紧挨砸点 destroy_stage_9，每远一格低一级），见 `crackStage`；
// 环 = 圆环大小倍数；粒子 = 方块粒子个数倍数；粒子速 = 粒子初速度倍数；粒子大 = 粒子大小倍数；
// 留空 = 真挪时别的格蹦起来的方块不许飞进去的几段线 [x0, y0, x1, y1, 半宽]（格心离线段 半宽 以内的列；后面镜头的机位和视线：只能有坑，不能有落块挡着）
export type QuakeBoost = { 起跳: number; 圈: number[]; 密度: number; 外飞: number; 真挪: boolean; 裂纹: number; 环: number; 粒子: number; 粒子速: number; 粒子大: number; 留空?: number[][] };
const gameQuake: QuakeBoost = { 起跳: 1, 圈: [3, 4, 5, 6, 7, 8, 9, 10], 密度: 0, 外飞: 0, 真挪: false, 裂纹: 0, 环: 1, 粒子: 1, 粒子速: 1, 粒子大: 1 };
type HopBlock = { cell: Cell; path: V3[]; vanishTick: number; startTick: number };
type QuakeParticle = { path: V3[]; life: number; half: number; uv: [number, number, number, number]; color: [number, number, number]; startTick: number };

// 每一竖列（格子左下角的整数坐标）：脚底那一层（地面顶 z 往下那一格）往下第一块方块，和这一列在地面以上有没有东西
const columnLookup = (data: DebrisData, groundZ: number) => {
  const cols = new Map<string, Cell[]>();
  for (const cell of data.cells) {
    const k = `${Math.floor(cell.p[0])},${Math.floor(cell.p[1])}`;
    (cols.get(k) ?? cols.set(k, []).get(k)!).push(cell);
  }
  return (ix: number, iy: number): { cell: Cell; top: number } | null => {
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
  boost.圈.forEach((radius, k) => {
    const seen = new Set<string>();
    for (const { ix, iy, th } of ringPoints(center, radius, boost.密度, rand)) {
      const key = `${ix},${iy}`;
      const vy0 = (0.2 + gauss(rand) * 0.15) * boost.起跳;
      if (seen.has(key)) continue; // 同一圈落在同一格的几个点：游戏里是几块叠在一起，画一块
      seen.add(key);
      const start = lookup(ix, iy);
      if (!start) continue;
      let hit: { cell: Cell; top: number } = start;
      // 逐刻模拟（底面高度，相对场景 z），落到脚下那一列的地面（找到的那块方块的顶）停住
      const outSpeed = boost.外飞 * (0.5 + 0.5 * rand());
      let [x, y, z] = [ix + 0.5, iy + 0.5, center[2] + 0.01];
      let [vx, vy] = [Math.cos(th) * outSpeed, Math.sin(th) * outSpeed];
      let vz = vy0;
      const path: V3[] = [[x, y, z]];
      let vanishTick = Infinity;
      for (let t = 1; t <= 300; t++) {
        vz -= 0.04;
        const ahead: { cell: Cell; top: number } | null = vx || vy ? lookup(Math.floor(x + vx), Math.floor(y + vy)) : hit;
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
type Column = { cells: Cell[]; ground: Cell | null; top: number; open: boolean };
const columnsOf = (data: DebrisData, groundZ: number) => {
  const byCol = new Map<string, Cell[]>();
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
type Mover = { cell: Cell; col: [number, number]; top: number; start: number; path: V3[]; land: number; to: V3 | null; axis: V3; turns: number; stay: boolean };
// 裂纹：这一格（地面那一格）在第几级；mover = 这格就是蹦起来的那块，蹦走以后不画
type Crack = { cell: Cell; stage: number; mover: Mover | null };
type Displaced = { movers: Mover[]; cracks: Crack[]; events: number[]; cols: Map<string, Column> };
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
  const reserved = (ix: number, iy: number) => (boost.留空 ?? []).some((l) => segDist(ix + 0.5, iy + 0.5, l) <= l[4]);
  const movers: Mover[] = [];
  const launch: { m: Mover; vz: number; vx: number; vy: number }[] = [];
  boost.圈.forEach((radius, k) => {
    for (const { ix, iy, th } of ringPoints(center, radius, boost.密度, rand)) {
      const vz = (0.2 + gauss(rand) * 0.15) * boost.起跳;
      const out = boost.外飞 * (0.5 + 0.5 * rand());
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
  if (boost.裂纹 > 0) {
    for (const [k, c] of cols) {
      // 只盖地面那格朝上的面（墙脚那格上面压着墙，没有朝上的面；侧面不盖：台阶、薄墙在数据里也记成整格，盖整格会在空中多出一片裂纹）
      if (!c.ground?.faces['+z'] || c.cells.some((o) => !o.size && o.p[2] > c.ground!.p[2])) continue;
      const [ix, iy] = k.split(',').map(Number);
      const stage = crackStage(Math.hypot(ix + 0.5 - center[0], iy + 0.5 - center[1]), boost.裂纹);
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
    const [gx, gy, gz] = particleInitVel(rand, mx, my, mz).map((v) => v * boost.粒子速);
    const life = Math.floor(4 / (rand() * 0.9 + 0.1));
    const half = ((0.1 * (rand() * 0.5 + 0.5) * 2) / 2) * boost.粒子大;
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

type QuakePlan = { hops: HopBlock[]; displaced: Displaced | null; particles: QuakeParticle[] };
const planCache = new WeakMap<DebrisData, Map<string, QuakePlan>>();
const planQuake = (data: DebrisData, center: V3, seed: number, boost: QuakeBoost): QuakePlan => {
  const byData = planCache.get(data) ?? planCache.set(data, new Map()).get(data)!;
  const k = JSON.stringify([center, seed, boost]);
  let plan = byData.get(k);
  if (!plan) {
    const rand = rng(seed);
    const displaced = boost.真挪 ? buildDisplaced(data, center, rand, boost) : null;
    const hops = boost.真挪 ? [] : buildHops(data, center, rand, boost);
    plan = { hops, displaced, particles: buildParticles(data, center, rand, boost) };
    byData.set(k, plan);
  }
  return plan;
};
// 真挪时场景网格里要藏掉的格子（BlockMesh 的 hideBlocks，和组件同一套坐标）：蹦的每一块都由组件画（蹦之前在原位、落地后在新位置）
export const quakeHideBlocks = (data: DebrisData, center: V3, boost: QuakeBoost, seed = 8631): number[][] =>
  (planQuake(data, center, seed, boost).displaced?.movers ?? []).map(({ cell: { p } }) => [p[0] - 0.45, p[1] - 0.45, p[2] - 0.45, p[0] + 0.45, p[1] + 0.45, p[2] + 0.45]);

const ringFrames = Object.entries(pngDir(import.meta.webpackContext('./灾变圆环.贴图', { regExp: /\.png$/ })))
  .sort((a, b) => Number(a[0].replace(/\D/g, '')) - Number(b[0].replace(/\D/g, '')))
  .map(([, png]) => png);
const ringTexCache = new Map<Png, THREE.DataTexture>();
const pixelTexture = (png: Png) => {
  let t = ringTexCache.get(png);
  if (!t) {
    t = new THREE.DataTexture(png.px, png.w, png.h, THREE.RGBAFormat);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.flipY = false;
    t.needsUpdate = true;
    ringTexCache.set(png, t);
  }
  return t;
};
const ringGeometry = new THREE.PlaneGeometry(2, 2);
// 每帧贴图 × 不透明度（按 1/100 取整）一份材质，渲染时不每帧新建
const ringMatCache = new Map<string, THREE.MeshBasicMaterial>();
const ringMaterial = (frame: Png, opacity: number) => {
  const roundedOpacity = Math.round(opacity * 100) / 100;
  const key = `${ringFrames.indexOf(frame)}|${roundedOpacity}`;
  let mat = ringMatCache.get(key);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({ color: '#ffffff', map: pixelTexture(frame), opacity: roundedOpacity, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true });
    ringMatCache.set(key, mat);
  }
  return mat;
};

// 裂纹：原版 crumbling 的混合（DST_COLOR, SRC_COLOR）= 2 × 裂纹 × 底色，透明处丢掉；一张平铺在方块顶面上方一点的面
// （画面开了对数深度，polygonOffset 不起作用）
const crackMatCache = new Map<Png, THREE.MeshBasicMaterial>();
const crackMaterial = (png: Png) => {
  let mat = crackMatCache.get(png);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({
      map: pixelTexture(png), alphaTest: 0.1, transparent: true, depthWrite: false, fog: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.SrcColorFactor,
    });
    crackMatCache.set(png, mat);
  }
  return mat;
};
const crackPlane = new THREE.PlaneGeometry(1, 1);

// 真挪：到第 T 刻为止的坑（坑底 + 四周还实心的那几面墙）。坑底贴图用这一列下面那格（没导出就用蹦走的那块），墙用邻格同一层那格；
// 颜色压暗（坑底 0.45、坑壁 0.6，照游戏一格深的坑里环境光遮蔽的暗度），不然从上往下看和平地分不出来
const holeGeometry = (d: Displaced, data: DebrisData, T: number) => {
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
    const sameLevel = (c: Cell, z: number) => !c.size && Math.abs(c.p[2] - z) < 0.01;
    const below = col.cells.find((c) => sameLevel(c, m.cell.p[2] - 1)) ?? m.cell;
    face(buf, [ix + 0.5, iy + 0.5, m.top - 1.5], 0.5, '+z', dim(fullFaces(below.faces, tint)['+z'], 0.45), true);
    for (const [dir, dx, dy] of sides) {
      if (heightAt(ix + dx, iy + dy) < m.top) continue; // 那边这一层也是空的（坑、更低的地面）
      const side = d.cols.get(key(ix + dx, iy + dy));
      const src = side?.cells.find((c) => sameLevel(c, m.cell.p[2])) ?? side?.ground ?? m.cell;
      face(buf, [ix + dx + 0.5, iy + dy + 0.5, m.top - 0.5], 0.5, dir, dim(fullFaces(src.faces, tint)[dir], 0.6), true);
    }
  }
  return toGeo(buf);
};

// 真挪：一块方块在第 T 刻的底面中心和翻滚角（蹦之前、不蹦的在原位）
const moverPose = (m: Mover, T: number): { base: number[]; angle: number } => {
  if (m.stay || T < m.start || !m.path.length) return { base: [m.col[0] + 0.5, m.col[1] + 0.5, m.top - 1], angle: 0 };
  const i = T - m.start;
  const k = Math.floor(i);
  const a = m.path[Math.min(k, m.path.length - 1)];
  const b = m.path[Math.min(k + 1, m.path.length - 1)];
  const span = m.land - m.start - 1;
  return { base: [0, 1, 2].map((j) => a[j] + (b[j] - a[j]) * (i - k)), angle: span > 0 ? (m.turns * Math.PI * Math.min(1, Math.max(0, (i - 1) / span))) / 2 : 0 };
};

// `data`：网格碎块.py 取的地面那几层格子（不要外圈 `ring`）；`atlas`：同一个场景网格的图集；`中心`：砸点（场景坐标，z = 地面的顶面）；
// `秒`：砸地以后的物理秒数（< 0：游戏原样不画；真挪时蹦的方块画在原位，场景网格里这几格要用 `quakeHideBlocks` 藏掉）；`boost`：见 `QuakeBoost`，不给照游戏；
// `cracks`：destroy_stage_0～9 十张贴图（`boost.裂纹` > 0 时要给）
export const CataclysmQuake: React.FC<{ data: DebrisData; atlas: Png; center: V3; sec: number; seed?: number; boost?: QuakeBoost; cracks?: Png[] }> = ({
  data, atlas, center, sec, seed = 8631, boost = gameQuake, cracks,
}) => {
  const plan = planQuake(data, center, seed, boost);
  const displaced = plan.displaced;
  const tex = atlasTex(atlas);
  const mat = debrisMat(tex);
  const geometries = useMemo(() => {
    const tint = tintsOf(data);
    const cache = new Map<Cell, THREE.BufferGeometry>();
    for (const cell of [...plan.hops.map((b) => b.cell), ...(displaced?.movers.map((m) => m.cell) ?? [])]) {
      if (cache.has(cell)) continue;
      const ff = fullFaces(cell.faces, tint);
      const buf = newBuf();
      for (const dir of Object.keys(DIRS)) face(buf, [0, 0, 0], 0.5, dir, ff[dir], true);
      cache.set(cell, toGeo(buf));
    }
    return cache;
  }, [plan, data]); // eslint-disable-line react-hooks/exhaustive-deps
  // 坑的几何按「到这一刻为止发生了几件事」缓存
  const holeCache = useMemo(() => new Map<number, THREE.BufferGeometry>(), [plan]);
  const crackMeshes = useMemo(() => {
    if (!displaced?.cracks.length || !cracks) return [];
    return cracks.map((png, stage) => {
      const mesh = new THREE.InstancedMesh(crackPlane, crackMaterial(png), Math.max(1, displaced.cracks.filter((c) => c.stage === stage).length));
      mesh.frustumCulled = false;
      mesh.renderOrder = 1;
      return mesh;
    });
  }, [displaced, cracks]);
  const ticks = sec * ticksPerSec;
  const nodes: React.ReactNode[] = [];
  if (displaced) {
    displaced.movers.forEach((m, i) => {
      const { base, angle } = moverPose(m, ticks);
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...m.axis), angle);
      nodes.push(<mesh key={i} geometry={geometries.get(m.cell)} material={mat} position={[base[0], base[1], base[2] + 0.5]} quaternion={q} />);
    });
    if (sec >= 0) {
      const done = displaced.events.filter((e) => e <= ticks).length;
      let hole = holeCache.get(done);
      if (!hole) holeCache.set(done, (hole = holeGeometry(displaced, data, ticks)));
      nodes.push(<mesh key="坑" geometry={hole} material={mat} />);
    }
    const dummy = new THREE.Object3D();
    for (const [stage, mesh] of crackMeshes.entries()) {
      let count = 0;
      if (sec >= 0)
        for (const c of displaced.cracks) {
          if (c.stage !== stage || (c.mover && ticks >= c.mover.start)) continue;
          dummy.position.set(c.cell.p[0], c.cell.p[1], c.cell.p[2] + 0.503);
          dummy.updateMatrix();
          mesh.setMatrixAt(count++, dummy.matrix);
        }
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      nodes.push(<primitive key={`裂纹${stage}`} object={mesh} />);
    }
  }
  if (sec < 0) return nodes.length ? <group>{nodes}</group> : null;
  plan.hops.forEach((block, i) => {
    const t = ticks - block.startTick;
    // 生成后下一刻才动；画的位置在上一刻和这一刻之间插值（同 粒子面片.tsx 的 `插值位置`）；消失的那一刻起不画
    if (t < 0 || t >= block.vanishTick) return;
    const k = Math.floor(t);
    const frac = t - k;
    const prev = block.path[Math.max(0, Math.min(block.path.length - 1, k - 1))];
    const cur = block.path[Math.max(0, Math.min(block.path.length - 1, k))];
    const at = [0, 1, 2].map((j) => prev[j] + (cur[j] - prev[j]) * frac);
    nodes.push(<mesh key={i} geometry={geometries.get(block.cell)} material={mat} position={[at[0], at[1], at[2] + 0.5]} />);
  });
  const ps: Particle[] = [];
  for (const particle of plan.particles) {
    if (ticks >= particle.life + 1) continue;
    ps.push({ p: interpPathPos(particle.path, ticks), half: particle.half, uv: particle.uv, color: particle.color });
  }
  // 圆环：第 k 刻年龄 2k，画的时候按 (年龄 + partialTicks) / 25 算大小、不透明度
  const k = Math.floor(ticks);
  const ring = k < 13 ? (() => {
    const age = 2 * k;
    const lifeFrac = (age + (ticks - k)) / ringLifeTicks;
    const frame = ringFrames[Math.min(ringFrames.length - 1, Math.floor((age * (ringFrames.length - 1)) / ringLifeTicks))];
    return { half: 2.5 * boost.环 * lifeFrac, m: ringMaterial(frame, 0.95 * (1 - lifeFrac) + 0.05) };
  })() : null;
  return (
    <group>
      {nodes}
      {ps.length > 0 && <BreakParticleQuads tex={tex} items={ps} lit />}
      {ring && ring.half > 0 && <mesh geometry={ringGeometry} material={ring.m} position={[center[0], center[1], center[2] + 0.3]} scale={[ring.half, ring.half, 1]} />}
    </group>
  );
};
