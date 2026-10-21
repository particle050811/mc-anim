// 一镜到底撞穿墙、钻穿土丘和雪地的方块声：方块 → SoundType 表，墙洞、隧道逐格排出破坏声（StoryEvent，物理时刻）。
//
// 撞墙、钻隧道：
// - 机械动力怎么破坏方块（create-1.20.1-6.0.8.jar，javap 核对）：钻头装在会动的东西上走 com/simibubi/create/content/kinetics/base/`BlockBreakingMovementBehaviour.tickBreaker`
//   （`DrillMovementBehaviour` 继承它）：每推进一次，进度 += clamp((int)(破坏速度 / 硬度), 1, 10 − 进度)，同时在那一格放该方块 SoundType 的 hit 声（volume 0.25、pitch 1）；
//   进度到 10 当刻 `destroyBlock`（levelEvent 2001 → 客户端放 break 声，volume (SoundType.volume + 1) / 2 = 1、pitch SoundType.pitch × 0.8），不到 10 就隔 (int)(硬度 / 速度) 刻再推进。
//   破坏速度 = clamp(|转速| / 500, 1/128, 16)，按满的 16 算：硬度 1.6 以下的（石砖、冰、雪、树叶、泥土、梯子）一刻就到 10，一声 hit 一声 break；
//   圆石、木头、铁矿石、铁栏杆这些硬一点的游戏里要隔一刻再敲一两下。画面上矛尖 320 米/秒、几毫秒扫过一格，不停下来等，所以每一格都照「敲一下就碎」放：hit + break 同一刻。
//   钻不动的不响：`DrillMovementBehaviour.canBreak` 要有碰撞箱（草、藤蔓、一层雪不钻），`BlockBreakingKineticBlockEntity.isBreakable` 不碰硬度 −1 的（刷怪笼）。
// - 墙上的洞（撞墙方块.json：各段 碎块.json 里洞里的每一格，工具/游戏取材/撞墙方块.py 按贴图认方块）：
//   · 矛管里的格（矛尖连钻头扫过的那一管，画面上当场崩成破坏粒子）是钻头钻掉的：hit + break，在矛尖扫到它那一刻（同 模型/特效/方块飞溅.tsx 的 `closestOnTube`）；
//   · 管外的格是扫帚和人撞开的（画面上整块飞出去，游戏里没有这回事），按方块被破坏放 break，在它飞出去那一刻（撞击时刻 + `stagger` × 离撞击中心的横向距离，同 方块飞溅.tsx）；
//     巫妖副楼里那截隧道（碎块只藏不飞、看不到）按矛尖扫到的时刻；
//   · 墙上挂的画是实体不是方块：一幅一声 entity.painting.break（`Painting.dropItem`：1、1），在最先碎的那一格的时刻；
//   · 刷怪笼本身不响（游戏里刷出首领以后它就没了，钻头也钻不动）。
// - 隧道（钻头隧道.json）：九头蛇钻穿土丘、雪怪首领两头钻进钻出雪地，画面上是预先挖开的，剧情里是钻头一路钻过去：工具/一镜到底/钻头隧道.ts 沿矛尖线取新世界里原来的方块，矛尖进到的每一格 hit + break。
// - 方块的 SoundType（1.20.1 客户端 jar 的 `Blocks.<clinit>`、暮色 4.3.2508 jar 的 twilightforest/init/`TFBlocks`，见 `方块声`）。
import { type V3 } from '../../../../../engine/model/parts.tsx';
import { type StoryEvent } from '../../../../../engine/audio/慢放.ts';
import { closestOnTube, type DebrisBurst, type DebrisData } from '../../../../../world/特效/方块飞溅.tsx';
import * as chainPierceChoreo from '../../6-1-7/编排.ts';
import wallBlocks from 'asset:数据/镜头/一镜到底/撞墙方块';
import drillTunnels from 'asset:数据/镜头/一镜到底/钻头隧道';

// 方块 → SoundType 的 break、hit 和 SoundType.pitch；钻不动 = 钻头不碰它（没有碰撞箱），无声 = 整格不响
type SoundKind = { 破: string; hit: string; 音高: number; undrillable?: boolean; silent?: boolean };
const stoneSound: SoundKind = { 破: 'block.stone.break', hit: 'block.stone.hit', 音高: 1 };
const woodSound: SoundKind = { 破: 'block.wood.break', hit: 'block.wood.hit', 音高: 1 };
const grassSound: SoundKind = { 破: 'block.grass.break', hit: 'block.grass.hit', 音高: 1 };
const snowSound: SoundKind = { 破: 'block.snow.break', hit: 'block.snow.hit', 音高: 1 };
// 撞墙方块.json 的名字带来源（mc: 原版贴图、tf: 暮色贴图），钻头隧道.json 的是新世界列段的短名（不带命名空间）
const blockSounds: Record<string, SoundKind> = {
  // 原版 Blocks.<clinit> 没调 sound 的默认 SoundType.STONE：石砖三种、圆石、平滑石台阶、石头、铁矿石
  'mc:stone_bricks': stoneSound,
  'mc:mossy_stone_bricks': stoneSound,
  'mc:cracked_stone_bricks': stoneSound,
  'mc:cobblestone': stoneSound, // 云中小屋的巨石块：TFBlocks 的 giant_cobblestone（GiantBlock）照抄 Blocks.COBBLESTONE
  'mc:smooth_stone_slab_side': stoneSound,
  stone: stoneSound,
  iron_ore: stoneSound,
  'tf:aurora_block': stoneSound, // 极光块：TFBlocks 里 AuroraBrickBlock 没设 sound，默认 STONE
  'mc:ladder': { 破: 'block.ladder.break', hit: 'block.ladder.hit', 音高: 1 }, // LADDER
  'mc:birch_planks': woodSound,
  'mc:bookshelf': woodSound,
  spruce_log: woodSound, // Blocks.log(…) 设的 WOOD
  root: woodSound, // 暮色的根：TFBlocks 里 sound(WOOD)
  'mc:iron_bars': { 破: 'block.metal.break', hit: 'block.metal.hit', 音高: 1.5 }, // METAL：pitch 1.5，break 音高 1.2
  'mc:spruce_leaves': grassSound, // Blocks.leaves(SoundType.GRASS)
  spruce_leaves: grassSound,
  grass_block: grassSound,
  grass: { ...grassSound, undrillable: true }, // 草丛、藤蔓、一层的雪：没有碰撞箱，钻头不碰
  vine: { 破: 'block.vine.break', hit: 'block.vine.hit', 音高: 1, undrillable: true },
  snow: { ...snowSound, undrillable: true },
  twilight_oak_leaves: { 破: 'block.azalea_leaves.break', hit: 'block.azalea_leaves.hit', 音高: 1 }, // 暮色橡树叶：TFBlocks 里 sound(AZALEA_LEAVES)
  dirt: { 破: 'block.gravel.break', hit: 'block.gravel.hit', 音高: 1 }, // 泥土的 SoundType 是 GRAVEL
  'mc:packed_ice': { 破: 'block.glass.break', hit: 'block.glass.hit', 音高: 1 }, // 冰都是 GLASS
  packed_ice: { 破: 'block.glass.break', hit: 'block.glass.hit', 音高: 1 },
  snow_block: snowSound,
  // 雪怪首领头顶的刷怪笼（BossSpawnerBlock，没设 sound、硬度 −1）：游戏里刷出首领以后它就没了，钻头也钻不动，不响
  'tf:boss_spawner': { ...stoneSound, silent: true },
};
const soundKindOf = (blockName: string) => {
  const k = blockSounds[blockName];
  if (!k) throw new Error(`一镜到底/声音.tsx：不知道「${blockName}」的 SoundType，在 方块声 里补上（撞墙方块.json / 钻头隧道.json 新出现的方块）`);
  return k;
};
// 钻头钻掉一格：hit（0.25、1）+ break（1、SoundType.pitch × 0.8）；撞开（不是钻头碰的）只有 break
const drillBreak = (kind: SoundKind, T: number, pos: V3, name: string, r: () => number): StoryEvent[] => [
  { 名: `${name}·钻头敲`, 事件: kind.hit, T, 位置: pos, 音量: 0.25, 音高: 1, 选: r() },
  { 名: name, 事件: kind.破, T, 位置: pos, 音量: 1, 音高: kind.音高 * 0.8, 选: r() },
];
const knockOut = (kind: SoundKind, T: number, pos: V3, name: string, r: () => number): StoryEvent => ({ 名: name, 事件: kind.破, T, 位置: pos, 音量: 1, 音高: kind.音高 * 0.8, 选: r() });

// 撞墙、钻隧道的声音另外记下来：排到画面以后要按帧并声（见 限幅.ts 的 `mergeSounds`），别的声音不动
export const wallSounds = new WeakSet<StoryEvent>();
const markWall = (es: StoryEvent[]) => {
  es.forEach((e) => wallSounds.add(e));
  return es;
};
type WallCell = [number, number, number, number, string]; // 盒子序号、x、y、z（碎块.json 的场景坐标）、方块名
// 一处墙洞的每一格：bursts 是这一处画碎块用的那一组（各段 编排.ts 的 debrisBursts(0)：sec = −撞击时刻），T0 = 这一处的贯穿时刻；
// 借管：只藏不飞（skip）的盒子借哪一组的矛管定时刻；不收：撞墙方块.py 没收的盒子（只藏不碎的剖面）
export const wallBreak = (
  site: keyof typeof wallBlocks,
  data: DebrisData,
  bursts: DebrisBurst[],
  toWorld: (point: number[]) => V3,
  T0: number,
  rand: () => number,
  borrowTube: Record<number, number> = {},
  skipBoxes: number[] = [],
): StoryEvent[] => {
  const wallCells = wallBlocks[site].格 as unknown as WallCell[];
  const cells = data.cells.filter((c) => !c.ring && !skipBoxes.includes(c.box));
  if (cells.length !== wallCells.length || cells.some((c, i) => c.box !== wallCells[i][0] || c.p.some((v, k) => v !== wallCells[i][1 + k])))
    throw new Error(`一镜到底/撞墙方块.json 的「${site}」和 ${wallBlocks[site].碎块} 对不上：碎块重导过，重跑 工具/游戏取材/撞墙方块.py`);
  const out: StoryEvent[] = [];
  const paintings = new Map<string, { T: number; positions: V3[] }>();
  cells.forEach((cell, i) => {
    const blockName = wallCells[i][4];
    const offset = cell.off ?? [0, 0, 0];
    const scenePos = [cell.p[0] + offset[0], cell.p[1] + offset[1], cell.p[2] + offset[2]];
    const worldPos = toWorld(scenePos);
    const B0 = bursts[cell.box];
    const burst = B0.skip ? bursts[borrowTube[cell.box]] : B0;
    const hitT = -burst.sec;
    const tubeHit = burst.管 ? closestOnTube(scenePos, cell.size ?? [1, 1, 1], burst.管) : undefined;
    const inTube = !!tubeHit && tubeHit.d <= burst.管!.半径;
    let cellT: number;
    if (inTube || B0.skip) cellT = hitT + tubeHit!.t;
    else {
      const rel = [scenePos[0] - burst.origin[0], scenePos[1] - burst.origin[1], scenePos[2] - burst.origin[2]];
      const along = rel[0] * burst.dir[0] + rel[1] * burst.dir[1] + rel[2] * burst.dir[2];
      const sl = Math.hypot(rel[0] - burst.dir[0] * along, rel[1] - burst.dir[1] * along, rel[2] - burst.dir[2] * along) || 1;
      cellT = hitT + (burst.stagger ?? 0) * sl;
    }
    if (blockName.startsWith('画:')) {
      const k = `${cell.box}${blockName}`;
      const painting = paintings.get(k) ?? { T: Infinity, positions: [] };
      painting.T = Math.min(painting.T, cellT);
      painting.positions.push(worldPos);
      paintings.set(k, painting);
      return;
    }
    const kind = soundKindOf(blockName);
    if (kind.silent) return;
    const soundName = `${site}${cell.box}号洞${blockName}`;
    if (inTube && !kind.undrillable) out.push(...drillBreak(kind, T0 + cellT, worldPos, soundName, rand));
    else if (!inTube) out.push(knockOut(kind, T0 + cellT, worldPos, soundName, rand));
  });
  for (const [k, painting] of paintings) {
    const count = painting.positions.length;
    const center = [0, 1, 2].map((j) => painting.positions.reduce((s, q) => s + q[j], 0) / count) as V3;
    out.push({ 名: `${site}${k}`, 事件: 'entity.painting.break', T: T0 + painting.T, 位置: center, 音量: 1, 音高: 1, 选: rand() });
  }
  return markWall(out);
};
// 一条隧道：钻头隧道.json 的 [a, 方块名]，时刻(a) 是矛尖进这一格的物理时刻（贯穿 = 0），点(a) 是矛尖位置（世界坐标）
export const drillTunnel = (cells: [number, string][], timeAt: (along: number) => number, tipAt: (along: number) => V3, T0: number, name: string, r: () => number): StoryEvent[] =>
  markWall(
    cells.flatMap(([along, blockName]) => {
      const kind = soundKindOf(blockName);
      return kind.undrillable || kind.silent ? [] : drillBreak(kind, T0 + timeAt(along), tipAt(along), `${name}${blockName}@${along}`, r);
    }),
  );
export const tunnels = drillTunnels as unknown as Record<'九头蛇' | '雪怪进' | '雪怪出', [number, string][]>;
// 雪怪首领的三组碎块（西口、头顶的刷怪笼、东口）：同 6-1-7/戏.tsx 里 雪怪首领戏 的 bursts（那里按画面时刻现算，没导出），这里照抄撞击时刻、方向、中心、stagger 和矛管
export const yetiBursts = (): DebrisBurst[] => {
  const dir = (along: number): V3 => {
    const tipBefore = chainPierceChoreo.yetiTipLocal(along - 1);
    const tipAfter = chainPierceChoreo.yetiTipLocal(along + 1);
    const length = Math.hypot(tipAfter[0] - tipBefore[0], tipAfter[1] - tipBefore[1], tipAfter[2] - tipBefore[2]);
    return [(tipAfter[0] - tipBefore[0]) / length, (tipAfter[1] - tipBefore[1]) / length, (tipAfter[2] - tipBefore[2]) / length];
  };
  return chainPierceChoreo.yetiImpacts.map((h, i) => ({ sec: -chainPierceChoreo.yetiTimeAt(h.a), dir: dir(h.a), origin: chainPierceChoreo.yetiTipLocal(h.心), speed: 0.5 * chainPierceChoreo.speed, spread: 30, seed: 101 + i, stagger: 0.0004, 管: chainPierceChoreo.yetiTubes[i] }));
};
