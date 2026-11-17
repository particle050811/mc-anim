// 方块飞溅的运动（纯模块，不引 react、three）：每块碎块、小碎渣在某一时刻的位置、翻滚和淡出，矛管里崩成粒子的格子。思路和用户的要求见 方块飞溅.tsx 文件头。
// 输入是撞击参数（`DebrisBurst`，秒 = 撞开以后经过的秒数）和碎块列表，输出是普通数据；随机数按 seed 和碎块序号取，同一组输入每帧算出来一样。
// 翻滚给单位轴和角度，轴照 three 的 Vector3.normalize 的算法归一（乘 1/长度），组件拿它直接 setFromAxisAngle，和原来逐位相同。
import type { V3 } from '../../engine/core/坐标.ts';
import { mulberry32 } from '../../engine/core/数学.ts';
import { collectBreakParticles, spawnBlockBreak, type BreakParticle } from './方块破坏粒子轨迹.ts';
import { texKey, tintsOf, type DebrisData, type DebrisFace } from './方块碎块面.ts';
import type { Particle } from './粒子物理.ts';

// 一次撞击（一个盒子）的参数：sec = 撞开以后经过的秒数（< 0 墙还完整）；dir = 撞击方向；origin = 撞击中心；speed = 沿撞击方向的速度（格/秒）；spread = 往外散开的速度；
// stagger = 离撞击中心远的方块晚多少秒才碎；chips = 小碎渣的块数
// hidden：场景网格里这片已经藏掉但还没撞到（sec < 0），碎块先原样画在原位补上；skip：只藏不出碎块（看不到的隧道）
export type DebrisBurst = {
  sec: number;
  dir: V3;
  origin: V3;
  speed: number;
  spread: number;
  seed: number;
  gravity?: number;
  stagger?: number;
  chips?: number;
  spin?: number;
  hidden?: boolean;
  skip?: boolean;
  tube?: SpearTube; // 矛尖（连钻头虚影）扫过的那一管：管里的方块崩成粒子，不飞
  ground?: number; // 落地的高度（场景 z）：给了就让碎块、碎渣掉到这个高度停住；不给就一直往下掉
};
// 矛管：点 = 矛尖路线上的点 [x, y, z, 相对这次撞击的物理秒数]，半径 = 管的半径（格）；粒子倍速：粒子时钟比物理时钟快多少（慢放的近景按特效倍速）；
// 密度：每格每轴几份粒子（原版 4）。各段 编排.ts 里做成常量（同一个对象），哪些格子在管里只算一次
export type SpearTube = { points: number[][]; radius: number; particleClockScale: number; density?: number };

// 这个盒子的墙已经开了（撞过了，或先藏掉、碎块原样补在原位）
export const burstOpen = (B?: DebrisBurst) => !!B && (B.sec >= 0 || !!B.hidden);

// 从 z0 以竖直速度 vz、重力 g 往下掉，底面（离中心 half）碰到 `地面` 的时刻；碰不到（地面在上面）就是 Infinity
export const landingSec = (z0: number, vz: number, gravity: number, half: number, groundZ?: number) => {
  if (groundZ === undefined) return Infinity;
  const dropHeight = z0 - half - groundZ;
  if (dropHeight < 0 || gravity <= 0) return Infinity;
  return (vz + Math.sqrt(vz * vz + 2 * gravity * dropHeight)) / gravity;
};

// 一格（中心、尺寸）离矛尖路线最近的那一点：距离、矛尖到那一点的时刻（相对撞击）、位置和路线方向。路线按 0.1 格细分
export const closestOnTube = (center: number[], size: number[], tube: SpearTube) => {
  let best = Infinity;
  let bt = 0;
  let bq: number[] = center;
  let bdir: number[] = [0, 1, 0];
  const dist = (point: number[]) => {
    const gaps = [0, 1, 2].map((k) => Math.max(0, Math.abs(point[k] - center[k]) - size[k] / 2));
    return Math.hypot(gaps[0], gaps[1], gaps[2]);
  };
  for (let i = 0; i + 1 < tube.points.length; i++) {
    const segStart = tube.points[i];
    const segEnd = tube.points[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(segEnd[0] - segStart[0], segEnd[1] - segStart[1], segEnd[2] - segStart[2]) / 0.1));
    for (let k = 0; k <= steps; k++) {
      const frac = k / steps;
      const point = [segStart[0] + (segEnd[0] - segStart[0]) * frac, segStart[1] + (segEnd[1] - segStart[1]) * frac, segStart[2] + (segEnd[2] - segStart[2]) * frac, segStart[3] + (segEnd[3] - segStart[3]) * frac];
      const distance = dist(point);
      if (distance < best) {
        best = distance;
        bt = point[3];
        bq = point;
        const segLen = Math.hypot(segEnd[0] - segStart[0], segEnd[1] - segStart[1], segEnd[2] - segStart[2]) || 1;
        bdir = [(segEnd[0] - segStart[0]) / segLen, (segEnd[1] - segStart[1]) / segLen, (segEnd[2] - segStart[2]) / segLen];
      }
    }
  }
  return { d: best, t: bt, q: bq, dir: bdir };
};
// 高速旋转的钻头把扫到的方块往外甩：粒子在原版速度上再加一份离开矛轴的速度（0.15～0.35 格/刻）
const drillFling = (q: number[], dir: number[]) => (p0: V3, rand: () => number): V3 => {
  const rel = [p0[0] - q[0], p0[1] - q[1], p0[2] - q[2]];
  const axial = rel[0] * dir[0] + rel[1] * dir[1] + rel[2] * dir[2];
  let radial = [rel[0] - dir[0] * axial, rel[1] - dir[1] * axial, rel[2] - dir[2] * axial];
  let radialLen = Math.hypot(radial[0], radial[1], radial[2]);
  if (radialLen < 1e-3) {
    radial = [rand() - 0.5, rand() - 0.5, rand() - 0.5];
    radialLen = Math.hypot(radial[0], radial[1], radial[2]) || 1;
  }
  const scale = (0.15 + 0.2 * rand()) / radialLen;
  return [radial[0] * scale, radial[1] * scale, radial[2] * scale];
};

// 一块会飞的碎块（数据里不是外圈 `ring` 的格子）和补齐、染过色的六面；序号 = 在这张表里的位置，随机数和矛管表都按它取
export type DebrisPiece = { cell: DebrisData['cells'][number]; faces: Record<string, DebrisFace> };
// 一个盒子的矛管里崩成粒子的碎块：碎块序号 → 矛尖扫到它的时刻（相对撞击，物理秒）和崩出来的粒子
export type TubeCells = Map<number, { t: number; ps: BreakParticle[] }>;
const tubeCache = new WeakMap<DebrisData, WeakMap<SpearTube, TubeCells>>();
// 每个盒子的矛管表（没有矛管、只藏不出的盒子是 null）。按数据和矛管对象缓存，同一个 管 只算一次
export const spearTubeCells = (data: DebrisData, pieces: DebrisPiece[], bursts: DebrisBurst[]): (TubeCells | null)[] =>
  bursts.map((burst, bi) => {
    if (!burst.tube || burst.skip) return null;
    let byTube = tubeCache.get(data);
    if (!byTube) tubeCache.set(data, (byTube = new WeakMap()));
    let tubeCells = byTube.get(burst.tube);
    if (!tubeCells) {
      tubeCells = new Map();
      const tint = tintsOf(data);
      pieces.forEach((pc, i) => {
        if (pc.cell.box !== bi) return;
        const size = pc.cell.size ?? [1, 1, 1];
        const offset = pc.cell.off ?? [0, 0, 0];
        const center = [pc.cell.p[0] + offset[0], pc.cell.p[1] + offset[1], pc.cell.p[2] + offset[2]];
        const nearest = closestOnTube(center, size, burst.tube!);
        if (nearest.d > burst.tube!.radius) return;
        // 粒子贴图取这一格的侧面；颜色原版 0.6，再乘这张贴图的染色（树叶、草）
        const sideFace = pc.faces['+x'];
        const t = tint.get(texKey(sideFace)) ?? [255, 255, 255];
        const col = t.map((v) => (0.6 * Math.min(255, v)) / 255) as [number, number, number];
        tubeCells!.set(i, { t: nearest.t, ps: spawnBlockBreak(center as V3, size as V3, [sideFace[0], sideFace[1], sideFace[2], sideFace[3]], col, burst.seed * 97 + i, burst.tube!.density ?? 4, drillFling(nearest.q, nearest.dir)) });
      });
      byTube.set(burst.tube, tubeCells);
    }
    return tubeCells;
  });

// 小碎渣：从哪块碎块（序号）上取贴图、边长（0.2～0.45 格）。每盒按 seed 抽 chips 块，矛管里崩掉的格子不当来源
export type ChipPlan = { from: number; size: number };
export const planChips = (pieces: DebrisPiece[], bursts: DebrisBurst[], tubes: (TubeCells | null)[]): ChipPlan[] => {
  const out: ChipPlan[] = [];
  bursts.forEach((burst, bi) => {
    const rand = mulberry32(burst.seed * 31 + 7);
    const mine = pieces.filter((p, i) => p.cell.box === bi && !tubes[bi]?.has(i));
    if (!mine.length) return;
    for (let k = 0; k < (burst.chips ?? 0); k++) {
      const src = mine[Math.floor(rand() * mine.length)];
      const size = 0.2 + rand() * 0.25;
      out.push({ from: pieces.indexOf(src), size });
    }
  });
  return out;
};

// 离镜头太近的飞散碎块淡出（一镜到底近景：镜头和扫帚一样快，会追上往前飞的碎块、从碎块云中穿过，整屏一块灰石砖）。
// 镜头：镜头在这份数据本地坐标里的位置；碎块（外接球）离镜头 `近` 米内不画，`近`～`远` 之间按距离淡出。只管已飞起来的碎块和小碎渣，
// 还在原位的是墙，镜头离墙多远由编排和孔道管，淡掉会在墙上开窟窿。矛管里崩出的破坏粒子离镜头 1 米内不画（零点一几米的方片贴镜头前就是半个画面）。
export type NearHide = { cameraPos: number[]; near: number; far: number };
// 一镜到底近景用的距离（米，碎块外接球的面到镜头）：0.6 米以内不画，0.6～1.6 米淡出
export const debrisNearHide = { near: 0.6, far: 1.6 };
// 外接球（中心、半径）的可见度：0 不画、1 照常画，中间 smoothstep 淡出；不给 nearHide 恒为 1
export const nearHideAlpha = (nearHide: NearHide | undefined, pos: number[], radius: number) => {
  if (!nearHide) return 1;
  const camPos = nearHide.cameraPos;
  const dist = Math.hypot(pos[0] - camPos[0], pos[1] - camPos[1], pos[2] - camPos[2]) - radius;
  const frac = Math.min(1, Math.max(0, (dist - nearHide.near) / (nearHide.far - nearHide.near)));
  return frac * frac * (3 - 2 * frac);
};

// three 的 Vector3.normalize：除以长度（长度为 0 时除 1），除法写成乘倒数
const unitAxis = (x: number, y: number, z: number): V3 => {
  const inv = 1 / (Math.sqrt(x * x + y * y + z * z) || 1);
  return [x * inv, y * inv, z * inv];
};

// 一块碎块这一帧的样子：still = 还在原位（墙没碎到这里，或矛管还没扫到）；否则在飞，带翻滚（单位轴、角度）和淡出（alpha < 1 时用半透明材质，≤ 0 的不出现在表里）
export type PiecePose = { index: number; still: true; pos: number[] } | { index: number; still: false; pos: V3; axis: V3; angle: number; alpha: number };
export type ChipPose = { index: number; pos: V3; axis: V3; angle: number; alpha: number };
// 一帧：碎块（按序号）、小碎渣（按 planChips 的顺序）、矛管崩出来还活着的破坏粒子（给了 nearHide 时去掉贴镜头的）
export const debrisFrame = (pieces: DebrisPiece[], chips: ChipPlan[], bursts: DebrisBurst[], tubes: (TubeCells | null)[], nearHide?: NearHide) => {
  const piecePoses: PiecePose[] = [];
  const chipPoses: ChipPose[] = [];
  const particles: Particle[] = [];
  pieces.forEach((pc, i) => {
    const burst = bursts[pc.cell.box];
    if (!burst || burst.skip || !burstOpen(burst)) return;
    const tc = tubes[pc.cell.box]?.get(i);
    if (tc) {
      const sec = burst.sec - tc.t;
      if (sec < 0) {
        const offset = pc.cell.off ?? [0, 0, 0];
        piecePoses.push({ index: i, still: true, pos: [pc.cell.p[0] + offset[0], pc.cell.p[1] + offset[1], pc.cell.p[2] + offset[2]] });
      } else collectBreakParticles(tc.ps, sec * burst.tube!.particleClockScale, particles);
      return;
    }
    const rand = mulberry32(burst.seed * 1000 + i * 17 + 3);
    const offset = pc.cell.off ?? [0, 0, 0];
    const p0 = [pc.cell.p[0] + offset[0], pc.cell.p[1] + offset[1], pc.cell.p[2] + offset[2]];
    const rel = [p0[0] - burst.origin[0], p0[1] - burst.origin[1], p0[2] - burst.origin[2]];
    const along = rel[0] * burst.dir[0] + rel[1] * burst.dir[1] + rel[2] * burst.dir[2];
    const side = [rel[0] - burst.dir[0] * along, rel[1] - burst.dir[1] * along, rel[2] - burst.dir[2] * along];
    const sl = Math.hypot(...side) || 1;
    const t = burst.sec - (burst.stagger ?? 0) * sl;
    if (t < 0) {
      piecePoses.push({ index: i, still: true, pos: p0 });
      return;
    }
    const sp = burst.speed * (0.45 + 0.65 * rand());
    const out = burst.spread * (0.4 + 0.9 * rand());
    const vel = [0, 1, 2].map((k) => burst.dir[k] * sp + (side[k] / sl) * out + (rand() - 0.5) * burst.spread * 0.5);
    vel[2] += burst.spread * 0.3 * rand();
    const gravity = burst.gravity ?? 16;
    const tt = Math.min(t, landingSec(p0[2], vel[2], gravity, 0.5, burst.ground));
    const pos: V3 = [p0[0] + vel[0] * tt, p0[1] + vel[1] * tt, p0[2] + vel[2] * tt - 0.5 * gravity * tt * tt];
    const axis = unitAxis(rand() - 0.5, rand() - 0.5, rand() - 0.5);
    const spinRate = (burst.spin ?? 6) * (0.5 + rand());
    const alpha = nearHideAlpha(nearHide, pos, (Math.max(...(pc.cell.size ?? [1, 1, 1])) / 2) * Math.sqrt(3));
    if (alpha <= 0) return;
    piecePoses.push({ index: i, still: false, pos, axis, angle: spinRate * tt, alpha });
  });
  chips.forEach((ch, k) => {
    const pc = pieces[ch.from];
    const burst = bursts[pc.cell.box];
    if (!burst || burst.skip || burst.sec < 0) return;
    const rand = mulberry32(burst.seed * 7000 + k * 13 + 1);
    const t = burst.sec;
    const sp = burst.speed * (0.6 + 0.8 * rand());
    const vel = [0, 1, 2].map((kk) => burst.dir[kk] * sp + (rand() - 0.5) * burst.spread * 2.2);
    vel[2] += burst.spread * 0.5 * rand();
    const gravity = burst.gravity ?? 16;
    const p0 = [pc.cell.p[0] + (rand() - 0.5) * 0.8, pc.cell.p[1] + (rand() - 0.5) * 0.8, pc.cell.p[2] + (rand() - 0.5) * 0.8];
    const tt = Math.min(t, landingSec(p0[2], vel[2], gravity, ch.size / 2, burst.ground));
    const pos: V3 = [p0[0] + vel[0] * tt, p0[1] + vel[1] * tt, p0[2] + vel[2] * tt - 0.5 * gravity * tt * tt];
    const axis = unitAxis(rand() - 0.5, rand() - 0.5, rand() - 0.5);
    const angle = (burst.spin ?? 6) * 1.6 * (0.5 + rand()) * tt;
    const alpha = nearHideAlpha(nearHide, pos, (ch.size / 2) * Math.sqrt(3));
    if (alpha <= 0) return;
    chipPoses.push({ index: k, pos, axis, angle, alpha });
  });
  const visibleParticles = nearHide ? particles.filter((q) => nearHideAlpha(nearHide, q.p, q.half * 1.5 + 0.4) > 0) : particles;
  return { pieces: piecePoses, chips: chipPoses, particles: visibleParticles };
};
