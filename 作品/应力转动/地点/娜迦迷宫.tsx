// 娜迦迷宫（参考 正篇/06-古城寻卷/1-暮色森林/2-斩娜迦/迷宫俯视图.png、迷宫墙外.png）：40×40 的石砖围墙，墙柱、压顶石、
// 两排窗洞、苔藓；石板地砖；灌木树篱；泥土花坛；带火盆的水池；独立石柱。单位：格，迷宫中心在原点，地面 z=0。
// 布局用 MazeLayout 传入，默认是 6-1 章娜迦迷宫的布局；换一座迷宫只需要换布局。
import React, { useMemo } from 'react';
import { Box, Cyl, type Inst, Instanced, rng, pick, type V3 } from '@engine/model/parts.tsx';

export const MAZE = {
  wall: '#8c806a',
  wallDark: '#6e624f',
  wallLight: '#9d8e76',
  cap: '#b09a84',
  floor: ['#a8937c', '#9d8873', '#b9a38c', '#948069'],
  grout: '#5e544a',
  window: '#2a2520',
  moss: ['#6f7d34', '#5d6c2a', '#7f8c3c'],
  hedge: ['#3a4a1f', '#46592a', '#2c3a18', '#4f6430'],
  dirt: '#6a3c22',
  water: '#3e5670',
  iron: '#3a3430',
  fire: '#ffb040',
  fireCore: '#fff0a0',
};
const palette = MAZE;

type Rect = [cx: number, cy: number, sx: number, sy: number];
export type MazeLayout = {
  size: number; // 围墙边长
  wallH: number;
  hedgeH: number;
  hedges: Rect[];
  pools: Rect[]; // 中央带火盆的水池
  planters: Rect[];
  pillars: [number, number][];
};

// 6-1 章：入口通道 x∈[-4,4] 从南墙直通中央空地，娜迦横躺在中央，李樱沿 x≈0.5 冲刺，通道和空地保持空旷
export const NAGA_MAZE: MazeLayout = {
  size: 40,
  wallH: 5,
  hedgeH: 2.2,
  hedges: [
    [-4.5, -12, 1, 14], [4.5, -12, 1, 14],
    [-12, -5, 14, 1], [12, -5, 14, 1],
    [-9, -14, 1, 8], [9, -14, 1, 8],
    [-15, 5, 1, 12], [15, 5, 1, 12],
    [-9, 14, 8, 1], [9, 14, 8, 1],
    [-5, 17, 1, 5], [6, 16, 1, 6],
  ],
  pools: [[-14.5, -14, 6, 6], [14.5, -14, 6, 6], [0.5, 17, 6, 4]],
  planters: [[-14.5, -8, 7, 2], [14.5, -8, 7, 2], [-17.5, 15, 3, 6], [17.5, 15, 3, 6]],
  pillars: [[-7, -8], [7, -8], [-17.5, 3], [17.5, 3]],
};

const cells = ([cx, cy, sx, sy]: Rect) => {
  const out: [number, number][] = [];
  for (let x = cx - sx / 2 + 0.5; x < cx + sx / 2; x++) for (let y = cy - sy / 2 + 0.5; y < cy + sy / 2; y++) out.push([x, y]);
  return out;
};

// 围墙：墙体、压顶石、墙柱各自是大块；凸出的石砖、窗洞、苔藓用实例化小块
const Walls: React.FC<{ L: MazeLayout }> = ({ L: layout }) => {
  const halfSize = layout.size / 2;
  const wallHeight = layout.wallH;
  const items = useMemo(() => {
    const rand = rng(11);
    const out: Inst[] = [];
    const sides = [
      { along: 'x', at: -halfSize, inward: 1 }, { along: 'x', at: halfSize, inward: -1 },
      { along: 'y', at: -halfSize, inward: 1 }, { along: 'y', at: halfSize, inward: -1 },
    ] as const;
    for (const sd of sides) {
      const put = (alongPos: number, face: number, z: number, size: V3, color: string) => {
        const off = sd.at + face * (0.5 + size[1] / 2);
        out.push(sd.along === 'x' ? { p: [alongPos, off, z], s: size, c: color } : { p: [off, alongPos, z], s: [size[1], size[0], size[2]], c: color });
      };
      for (const face of [-1, 1]) {
        // 凸出的石砖：错缝排列、深浅不一
        for (let row = 0; row < 9; row++) {
          const z = 0.3 + row * 0.52;
          for (let alongPos = -halfSize + (row % 2) * 0.6; alongPos < halfSize; alongPos += 1.2 + rand() * 0.8) {
            if (rand() < 0.45) put(alongPos, face, z, [0.9 + rand() * 0.8, 0.05, 0.44], pick(rand, [palette.wall, palette.wallDark, palette.wallLight]));
          }
        }
        // 窗洞：内侧两排，外侧一排
        const rows = face === sd.inward ? [1.7, 3.3] : [3.3];
        for (const z of rows) {
          for (let alongPos = -halfSize + 2; alongPos <= halfSize - 2; alongPos += 2) {
            if (Math.abs(((alongPos + halfSize) % 8) - 0) < 0.5) continue; // 墙柱位置不开窗
            put(alongPos, face, z, [0.62, 0.06, 0.62], palette.window);
          }
        }
      }
      // 压顶石上的苔藓
      for (let alongPos = -halfSize; alongPos < halfSize; alongPos += 0.8 + rand() * 2.5) {
        if (rand() < 0.5) {
          const size: V3 = [0.8 + rand() * 1.6, 1.25, 0.08];
          out.push(sd.along === 'x' ? { p: [alongPos, sd.at, wallHeight + 0.4], s: size, c: pick(rand, palette.moss) } : { p: [sd.at, alongPos, wallHeight + 0.4], s: [1.25, size[0], 0.08], c: pick(rand, palette.moss) });
        }
      }
    }
    return out;
  }, [layout]);
  const posts: [number, number][] = [];
  for (let alongPos = -halfSize; alongPos <= halfSize; alongPos += 8) for (const side of [-halfSize, halfSize]) posts.push([alongPos, side], [side, alongPos]);
  return (
    <>
      {[[0, -halfSize, layout.size + 1, 1], [0, halfSize, layout.size + 1, 1], [-halfSize, 0, 1, layout.size + 1], [halfSize, 0, 1, layout.size + 1]].map(([x, y, sx, sy], i) => (
        <React.Fragment key={i}>
          <Box p={[x, y, 0]} bottom s={[sx, sy, wallHeight]} c={palette.wall} />
          <Box p={[x, y, wallHeight]} bottom s={[sx + (sx > 1 ? 0 : 0.3), sy + (sy > 1 ? 0 : 0.3), 0.35]} c={palette.cap} />
        </React.Fragment>
      ))}
      {posts.map(([x, y], i) => (
        <React.Fragment key={i}>
          <Box p={[x, y, 0]} bottom s={[1.7, 1.7, wallHeight + 0.9]} c={palette.wallLight} bevel={0.05} />
          <Box p={[x, y, wallHeight + 0.9]} bottom s={[2.1, 2.1, 0.35]} c={palette.cap} bevel={0.04} />
          <Box p={[x, y, wallHeight + 1.25]} bottom s={[0.8, 0.8, 0.55]} c={palette.cap} />
        </React.Fragment>
      ))}
      <Instanced items={items} />
    </>
  );
};

// 石板地砖：每格一块略有高差和色差的石板，缝隙露出深色灰浆
const Floor: React.FC<{ L: MazeLayout }> = ({ L: layout }) => {
  const items = useMemo(() => {
    const rand = rng(7);
    const out: Inst[] = [];
    const halfSize = layout.size / 2 - 0.5;
    for (let x = -halfSize + 0.5; x < halfSize; x++)
      for (let y = -halfSize + 0.5; y < halfSize; y++) {
        const t = 0.07 + rand() * 0.03;
        out.push({ p: [x, y, t / 2 - 0.03], s: [0.95, 0.95, t], c: rand() < 0.06 ? pick(rand, palette.moss) : pick(rand, palette.floor) });
      }
    return out;
  }, [layout]);
  return (
    <>
      <Box p={[0, 0, -0.05]} s={[layout.size, layout.size, 0.1]} c={palette.grout} />
      <Instanced items={items} />
    </>
  );
};

// 灌木树篱：每格两层叶块，顶上随机加半块和侧面凸起，轮廓参差
const Hedges: React.FC<{ L: MazeLayout }> = ({ L: layout }) => {
  const items = useMemo(() => {
    const rand = rng(23);
    const out: Inst[] = [];
    for (const rect of layout.hedges)
      for (const [x, y] of cells(rect)) {
        const j = () => (rand() - 0.5) * 0.12;
        out.push({ p: [x + j(), y + j(), 0.5], s: [1.06, 1.06, 1.0], c: pick(rand, palette.hedge) });
        out.push({ p: [x + j(), y + j(), 1.45], s: [1.02 + j(), 1.02 + j(), 0.95], c: pick(rand, palette.hedge) });
        if (rand() < 0.7) {
          const t = 0.25 + rand() * 0.6;
          out.push({ p: [x + j() * 2, y + j() * 2, 1.9 + t / 2], s: [0.55 + rand() * 0.4, 0.55 + rand() * 0.4, t], c: pick(rand, palette.hedge) });
        }
        if (rand() < 0.4) {
          const angle = rand() * Math.PI * 2;
          out.push({ p: [x + Math.cos(angle) * 0.55, y + Math.sin(angle) * 0.55, 0.4 + rand() * 1.4], s: [0.45, 0.45, 0.45], c: pick(rand, palette.hedge), rz: angle });
        }
      }
    return out;
  }, [layout]);
  return <Instanced items={items} />;
};

// 火盆火焰：两层发光锥体，按时间 t（秒）闪动
export const Flame: React.FC<{ t: number; seed?: number }> = ({ t, seed = 0 }) => {
  const k = 1 + 0.14 * Math.sin(t * 17 + seed) + 0.08 * Math.sin(t * 29 + seed * 2);
  return (
    <group scale={[1, 1, k]}>
      <Cyl p={[0, 0, 0.45]} rt={0} rb={0.42} h={0.9} n={5} r={[0, 0, t * 2 + seed]} c={palette.fire} emissive={1.6} shadow={false} />
      <Cyl p={[0, 0, 0.3]} rt={0} rb={0.24} h={0.6} n={5} r={[0, 0, -t * 3]} c={palette.fireCore} emissive={2.2} shadow={false} />
      <pointLight position={[0, 0, 0.8]} color={palette.fire} intensity={6} distance={9} decay={2} />
    </group>
  );
};

const Pool: React.FC<{ rect: Rect; t: number; seed: number }> = ({ rect: [cx, cy, sx, sy], t, seed }) => (
  <group position={[cx, cy, 0]}>
    {[[0, -sy / 2, sx, 0.45], [0, sy / 2, sx, 0.45], [-sx / 2, 0, 0.45, sy], [sx / 2, 0, 0.45, sy]].map(([x, y, width, depth], i) => (
      <Box key={i} p={[x, y, 0]} bottom s={[width, depth, 0.55]} c={palette.cap} bevel={0.04} />
    ))}
    <Box p={[0, 0, 0.12]} s={[sx - 0.4, sy - 0.4, 0.3]} c={palette.water} rough={0.15} metal={0.2} />
    <Box p={[0, 0, 0]} bottom s={[1.3, 1.3, 1.5]} c={palette.wallLight} bevel={0.05} />
    <Box p={[0, 0, 1.5]} bottom s={[1.6, 1.6, 0.25]} c={palette.cap} />
    <Box p={[0, 0, 1.75]} bottom s={[1.1, 1.1, 0.35]} c={palette.iron} metal={0.4} rough={0.6} />
    <group position={[0, 0, 2.05]}>
      <Flame t={t} seed={seed} />
    </group>
  </group>
);

const Planter: React.FC<{ rect: Rect; seed: number }> = ({ rect: [cx, cy, sx, sy], seed }) => {
  const plants = useMemo(() => {
    const rand = rng(seed);
    return cells([0, 0, sx - 0.6, sy - 0.6]).filter(() => rand() < 0.35).map(([x, y]) => ({ p: [x, y, 0.55] as V3, s: 0.3 + rand() * 0.3, c: pick(rand, palette.hedge) }));
  }, [sx, sy, seed]);
  return (
    <group position={[cx, cy, 0]}>
      {[[0, -sy / 2, sx, 0.3], [0, sy / 2, sx, 0.3], [-sx / 2, 0, 0.3, sy], [sx / 2, 0, 0.3, sy]].map(([x, y, width, depth], i) => (
        <Box key={i} p={[x, y, 0]} bottom s={[width, depth, 0.5]} c={palette.cap} />
      ))}
      <Box p={[0, 0, 0]} bottom s={[sx - 0.3, sy - 0.3, 0.4]} c={palette.dirt} />
      {plants.map((pl, i) => (
        <Box key={i} p={pl.p} s={[pl.s, pl.s, pl.s]} c={pl.c} />
      ))}
    </group>
  );
};

const StonePillar: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <group position={[x, y, 0]}>
    <Box bottom s={[1.3, 1.3, 0.4]} c={palette.cap} />
    <Box p={[0, 0, 0.4]} bottom s={[1, 1, 2.6]} c={palette.wallLight} bevel={0.05} />
    <Box p={[0, 0, 3.0]} bottom s={[1.35, 1.35, 0.35]} c={palette.cap} />
    <Box p={[0, 0, 3.35]} bottom s={[0.55, 0.55, 0.45]} c={palette.cap} />
  </group>
);

// t：时间（秒），驱动火焰闪动
export const NagaMaze: React.FC<{ layout?: MazeLayout; t: number }> = ({ layout = NAGA_MAZE, t }) => (
  <group>
    <Floor L={layout} />
    <Walls L={layout} />
    <Hedges L={layout} />
    {layout.pools.map((p, i) => (
      <Pool key={i} rect={p} t={t} seed={i * 1.7} />
    ))}
    {layout.planters.map((p, i) => (
      <Planter key={i} rect={p} seed={100 + i} />
    ))}
    {layout.pillars.map(([x, y], i) => (
      <StonePillar key={i} x={x} y={y} />
    ))}
  </group>
);
