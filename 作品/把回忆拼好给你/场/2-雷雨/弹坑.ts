// 第 6、7 句的弹坑：门口小木屋（地点/门口小木屋.tsx，只读，这里照抄它的布局、补上南墙）西南角被苦力怕炸掉以后剩下的方块，和炸出来浮在坑里的掉落物。纯数据。
// 用户 10-24「应该是炸掉房子一角 爆掉箱子 不然炸空地有什么好伤心的」：炸的是门边那个角，箱子炸没了，后墙炸开的口子就是第 8 句补过的那块（i 1～2、k 0～2）。
// 爆炸照 1.20.1 的 Explosion.explode（javap 核过的算法）：16³ 立方体表面上的每个方向一条射线，强度 威力 ×（0.7～1.3 随机），每 0.3 格减 0.225，
//   碰到方块再减（抗爆 + 0.3）× 0.3，强度还大于 0 时这一格炸掉。普通苦力怕威力 3。随机数用 Java 的线性同余（种子挑的是缺口的样子，条件见 坑爆炸）。
// 掉落照 DESTROY_WITH_DECAY（mobExplosionDropDecay 默认开）：每格按 1/威力 的概率掉，同种东西合成一堆（Explosion.addBlockDrops），堆在第一次掉的那格。
//   游戏里炸掉的格先洗牌再掉（Util.shuffle），这里按射线找到的先后，只影响哪一格先掉、堆在哪，种子照样能挑。
// 不画焦痕、不画烟熏的暗圈：原版爆炸只是把方块拿掉（用户 10-24 删过门口那圈焦痕）。没炸掉的方块浮着照原样留（原版方块不受重力）。
// 坐标同 门口小木屋：格 (i, j, k) 占 x ∈ [i − 0.5, i + 0.5]、y ∈ [j, j + 1]、z ∈ [k, k + 1]。
import type { PlacedBlock } from '@engine/model/方块拼搭.tsx';

// 同 地点/门口小木屋.tsx 的 小木屋（那个文件带组件和贴图，测试引不了；它改了这里跟着改，测试里对过）
export const cabin = { westWall: 0, eastWall: 7, backWall: 2 } as const;

// ---------- Java 的随机数（java.util.Random） ----------
const multiplier = 0x5deece66dn, increment = 0xbn, mask = (1n << 48n) - 1n;
export class JavaRandom {
  private s: bigint;
  constructor(seed: number | bigint) {
    this.s = (BigInt.asIntN(64, BigInt(seed)) ^ multiplier) & mask;
  }
  private next(bits: number) {
    this.s = (this.s * multiplier + increment) & mask;
    return Number(BigInt.asIntN(32, this.s >> BigInt(48 - bits)));
  }
  nextFloat() {
    return this.next(24) / (1 << 24);
  }
  nextDouble() {
    return (this.next(26) * 2 ** 27 + this.next(27)) * 2 ** -53;
  }
  /** RandomSource.triangle：a + b ×（两次 nextDouble 之差） */
  triangle(a: number, b: number) {
    return a + b * (this.nextDouble() - this.nextDouble());
  }
  nextInt(n: number) {
    // 只用到 2 的幂以外的小 n，照 Random.nextInt(bound) 的拒绝采样
    if ((n & -n) === n) return Number((BigInt(n) * BigInt(this.next(31))) >> 31n);
    let bits: number, val: number;
    do {
      bits = this.next(31);
      val = bits % n;
    } while (bits - val + (n - 1) < 0 || bits - val + (n - 1) > 0x7fffffff);
    return val;
  }
}

// ---------- 地面和屋子（照抄 门口小木屋 的布局，补上南墙；炸之前的样子） ----------
/** 屋子：同 地点/门口小木屋.tsx 的 小木屋（西墙 i 0、东墙 i 7、后墙 j 2），补一面南墙 j −1：第 8 句门口那个剖面切在 y = 0，朝镜头的南墙在剖面外面不画，
 *  第 6、7 句从南边透视看过来要有这面墙，房子才是房子（南墙、屋顶往南多一排都在剖面外，第 8 句看不见，两边对得上） */
export const southWall = -1;
/** 平地（屋子四周、爆炸碰得到的这一块，地面顶 z 0）：i、j 的范围。外面的地形在 地形.ts，接缝处那边从 0 起坡 */
export const flatArea = { west: -16, east: 16, south: -12, north: 12 } as const;
/** 地下：草方块 k −1，泥土 k −2～−3，石头到 k −8（同门口剖面那排） */
export const underground = { 泥土: [-3, -2], stoneBottom: -8 } as const;

const plants: readonly [string, number][] = [
  ['minecraft:grass', -8],
  ['minecraft:tall_grass', -9],
  ['minecraft:tall_grass', -10],
  ['minecraft:fern', -11],
  ['minecraft:tall_grass', -12],
  ['minecraft:grass', -13],
  ['minecraft:large_fern', -14],
  ['minecraft:grass', 9],
  ['minecraft:poppy', 10],
  ['minecraft:grass', 11],
  ['minecraft:dandelion', 12],
  ['minecraft:lilac', 13],
  ['minecraft:grass', 14],
];
const tallPlants = new Set(['minecraft:tall_grass', 'minecraft:large_fern', 'minecraft:lilac']);

/** 炸之前：门口小木屋（补了南墙）和四周的平地。门、箱子在游戏里是方块（箱子是方块实体），这里都当方块放进去参与爆炸（这一场两样都炸没了，见 坑爆炸；方块拼搭 画不了箱子，种子换了要另画） */
export const preBlastBlocks = (): PlacedBlock[] => {
  const out: PlacedBlock[] = [];
  const placeBlock = (blockState: string, i: number, j: number, k: number) => out.push({ state: blockState, 位: [i, j, k] });
  const { westWall: W, eastWall: E, backWall: N } = cabin;
  const S = southWall;
  for (let i: number = flatArea.west; i <= flatArea.east; i++)
    for (let j: number = flatArea.south; j <= flatArea.north; j++) {
      const underHouse = i >= W && i <= E && j >= S && j <= N;
      if (!underHouse) placeBlock('minecraft:grass_block', i, j, -1);
      else placeBlock(i === W || i === E || j === N || j === S ? 'minecraft:cobblestone' : 'minecraft:oak_planks', i, j, -1);
      for (let k = underground.泥土[0]; k <= underground.泥土[1]; k++) placeBlock('minecraft:dirt', i, j, k);
      for (let k = underground.stoneBottom; k < underground.泥土[0]; k++) placeBlock('minecraft:stone', i, j, k);
    }
  for (let k = 0; k < 3; k++) {
    // 西墙：j 0 是门（门口剖面那格），j 1 木板；东墙两格木板；四个墙角原木
    placeBlock('minecraft:oak_planks', W, 1, k);
    for (let j = 0; j <= 1; j++) placeBlock('minecraft:oak_planks', E, j, k);
    for (const [i, j] of [[W, S], [E, S], [W, N], [E, N]] as const) placeBlock('minecraft:oak_log[axis=y]', i, j, k);
    // 后墙（炸之前还没补过，整面旧木板）、南墙，各开一扇窗（南墙的窗和后墙的对着）
    for (let i = W + 1; i < E; i++) {
      placeBlock(i === windowCell[0] && k === windowCell[1] ? 'minecraft:glass' : 'minecraft:oak_planks', i, N, k);
      placeBlock(i === windowCell[0] && k === windowCell[1] ? 'minecraft:glass' : 'minecraft:oak_planks', i, S, k);
    }
  }
  placeBlock('minecraft:oak_planks', W, 0, 2);
  // 屋顶：每层两头台阶、中间木板，最上一排下半砖（同 门口小木屋），南北各排一样，往南多铺一排盖住南墙
  for (let j = S; j <= N; j++) {
    const blockLayer = (k: number, west: number, east: number) => {
      placeBlock('minecraft:spruce_stairs[facing=east,half=bottom,shape=straight]', west, j, k);
      for (let i = west + 1; i < east; i++) placeBlock('minecraft:spruce_planks', i, j, k);
      placeBlock('minecraft:spruce_stairs[facing=west,half=bottom,shape=straight]', east, j, k);
    };
    blockLayer(3, W - 1, E + 1);
    blockLayer(4, W, E);
    blockLayer(5, W + 1, E - 1);
    for (let i = W + 2; i <= E - 2; i++) placeBlock('minecraft:spruce_slab[type=bottom]', i, j, 6);
  }
  placeBlock('minecraft:crafting_table', 4, 1, 0);
  placeBlock('minecraft:furnace[facing=south,lit=false]', 5, 1, 0);
  placeBlock('minecraft:barrel[facing=up,open=false]', 6, 1, 0);
  placeBlock('minecraft:wall_torch[facing=south]', 3, 1, 1);
  placeBlock('minecraft:wall_torch[facing=south]', 6, 1, 2);
  placeBlock('minecraft:chest[facing=south]', ...chestCell);
  placeBlock('minecraft:oak_door[facing=east,half=lower,hinge=left,open=true]', W, 0, 0);
  placeBlock('minecraft:oak_door[facing=east,half=upper,hinge=left,open=true]', W, 0, 1);
  for (const [blockState, i] of plants) {
    if (tallPlants.has(blockState)) {
      placeBlock(`${blockState}[half=lower]`, i, 1, 0);
      placeBlock(`${blockState}[half=upper]`, i, 1, 1);
    } else placeBlock(blockState, i, 1, 0);
  }
  return out;
};
/** 窗：后墙、南墙 (5, ·, 1) */
const windowCell = [5, 1] as const;
/** 箱子那格（同 门口小木屋 的 门口.箱子：屋里紧挨着门） */
export const chestCell = [1, 1, 0] as const;

// ---------- 抗爆、掉落（1.20.1 方块属性和战利品表） ----------
const baseName = (blockState: string) => blockState.replace(/\[.*$/, '');
/** Block.getExplosionResistance（原版注册时的 strength 第二个数） */
export const blastResist: Record<string, number> = {
  'minecraft:grass_block': 0.6,
  'minecraft:dirt': 0.5,
  'minecraft:stone': 6,
  'minecraft:cobblestone': 6,
  'minecraft:oak_planks': 3,
  'minecraft:spruce_planks': 3,
  'minecraft:spruce_stairs': 3,
  'minecraft:spruce_slab': 3,
  'minecraft:oak_log': 2,
  'minecraft:glass': 0.3,
  'minecraft:crafting_table': 2.5,
  'minecraft:barrel': 2.5,
  'minecraft:chest': 2.5,
  'minecraft:furnace': 3.5,
  'minecraft:oak_door': 3,
};
const blastResistance = (blockState: string) => blastResist[baseName(blockState)] ?? 0; // 火把、花草 0

/** 掉什么（战利品表，不带工具）：草方块掉泥土、石头掉圆石、玻璃不掉；门只有下半掉；花草掉的种子、门口没有的东西不管（返回 null） */
const dropItemOf = (blockState: string): string | null => {
  const n = baseName(blockState);
  if (n === 'minecraft:grass_block') return 'minecraft:dirt';
  if (n === 'minecraft:stone') return 'minecraft:cobblestone';
  if (n === 'minecraft:wall_torch') return 'minecraft:torch';
  if (n === 'minecraft:oak_door') return blockState.includes('half=lower') ? 'minecraft:oak_door' : null;
  if (n === 'minecraft:glass' || tallPlants.has(n) || ['minecraft:grass', 'minecraft:fern', 'minecraft:poppy', 'minecraft:dandelion'].includes(n)) return null;
  return n;
};

export type Explosion = { 心: readonly [number, number, number]; power: number; seed: number };
/** 一堆掉落物：格 = 掉出来的那格；偏 = 落地后离那一列中心多远 [x, y]（Block.popResource 出生点 ±0.25 格）；浮动偏 = ItemEntity.bobOffs（上下浮、转圈的相位） */
export type Drop = { item: string; itemCount: number; cell: readonly [number, number, number]; offset: readonly [number, number]; floatOffset: number };
export type BlastResult = { remainingBlocks: PlacedBlock[]; destroyed: Set<string>; drops: Drop[] };

const posKey = (i: number, j: number, k: number) => `${i},${j},${k}`;
/** 世界坐标（场景）→ 格：BlockPos.containing */
const cellAt = (x: number, y: number, z: number) => [Math.floor(x + 0.5), Math.floor(y), Math.floor(z)] as const;

/** 炸：照 Explosion.explode 射线、照 finalizeExplosion 掉落。随机数的取用顺序同游戏（射线 16³ 表面依次各取一次，掉落每格一次） */
export const explode = (blocks: readonly PlacedBlock[], { 心: center, power, seed: seed }: Explosion): BlastResult => {
  const blockMap = new Map(blocks.map((b) => [posKey(...b.位), b]));
  const r = new JavaRandom(seed);
  const destroyed = new Set<string>();
  const order: string[] = [];
  for (let a = 0; a < 16; a++)
    for (let b = 0; b < 16; b++)
      for (let c = 0; c < 16; c++) {
        if (!(a === 0 || a === 15 || b === 0 || b === 15 || c === 0 || c === 15)) continue;
        let d0 = (a / 15) * 2 - 1, d1 = (b / 15) * 2 - 1, d2 = (c / 15) * 2 - 1;
        const d3 = Math.hypot(d0, d1, d2);
        d0 /= d3; d1 /= d3; d2 /= d3;
        let f = power * (0.7 + r.nextFloat() * 0.6);
        let [x, y, z] = center;
        for (; f > 0; f -= 0.22500001) {
          const g = cellAt(x, y, z);
          const k = posKey(...g);
          const cell = blockMap.get(k);
          if (cell) f -= (blastResistance(cell.state) + 0.3) * 0.3; // 已经算进要炸的格也照样挡（方块到 finalizeExplosion 才一起拿掉）
          if (f > 0 && cell && !destroyed.has(k)) {
            destroyed.add(k);
            order.push(k);
          }
          x += d0 * 0.3; y += d1 * 0.3; z += d2 * 0.3;
        }
      }
  // 没了下面那格就掉下来的东西（花草、火把靠的墙、门的另一半）跟着没：原版是方块更新时掉落成物品，这里只拿掉、不另算掉落
  const drops: Drop[] = [];
  const mergedDrops = new Map<string, Drop>();
  for (const k of order) {
    const b = blockMap.get(k)!;
    const drop = dropItemOf(b.state);
    if (!drop || r.nextFloat() > 1 / power) continue;
    const existing = mergedDrops.get(drop);
    if (existing) existing.itemCount++;
    else {
      const d: Drop = { item: drop, itemCount: 1, cell: b.位, offset: [r.nextFloat() * 0.5 - 0.25, r.nextFloat() * 0.5 - 0.25], floatOffset: r.nextFloat() * Math.PI * 2 };
      mergedDrops.set(drop, d);
      drops.push(d);
    }
  }
  const unsupported = (b: PlacedBlock) => {
    const n = baseName(b.state);
    const [i, j, k] = b.位;
    if (n === 'minecraft:wall_torch') return destroyed.has(posKey(i, j + 1, k)); // 贴着北边那格墙
    if (n === 'minecraft:oak_door') return b.state.includes('half=upper') ? destroyed.has(posKey(i, j, k - 1)) || destroyed.has(posKey(i, j, k - 2)) : destroyed.has(posKey(i, j, k - 1)) || destroyed.has(posKey(i, j, k + 1));
    if (n.startsWith('minecraft:') && (tallPlants.has(n) || ['minecraft:grass', 'minecraft:fern', 'minecraft:poppy', 'minecraft:dandelion'].includes(n)))
      return destroyed.has(posKey(i, j, k - 1)) || (b.state.includes('half=upper') && destroyed.has(posKey(i, j, k - 2)));
    return false;
  };
  const remainingBlocks = blocks.filter((b) => !destroyed.has(posKey(...b.位)) && !unsupported(b));
  return { remainingBlocks, destroyed, drops };
};

/** 某一列（i, j）从 z 往下第一个实心方块的顶面高（掉落物落到哪） */
export const landHeight = (remainingBlocks: readonly PlacedBlock[], i: number, j: number, fromZ: number) => {
  let maxTop = -Infinity;
  for (const b of remainingBlocks) {
    const [bi, bj, bk] = b.位;
    if (bi !== i || bj !== j || bk + 1 > fromZ) continue;
    if (blastResistance(b.state) === 0) continue; // 花草、火把不托东西
    maxTop = Math.max(maxTop, bk + 1);
  }
  return maxTop;
};
// ---------- 这一场用的坑 ----------
/** 爆炸：普通苦力怕（威力 3）溜进开着的门，在门里那格（箱子南边）炸。种子挑的样子：箱子炸没、掉出箱子本身；
 *  南墙西半截（i 0～3）连西南角那根原木炸穿，门炸没；后墙炸开的两格（2,2,0）、（1,2,2）都在第 8 句补过的那块（i 1～2、k 0～2）里；
 *  屋里东边的工作台、熔炉、木桶、东墙都留着；外面看屋顶完好（天花板那层炸了几格，从南边看不见）；地板炸开一层，掉落物浮在这个浅坑里。
 *  门不掉（种子挑的）。Agent 暂定 */
export const pitExplosion: Explosion = { 心: [0.7, 0.5, 0], power: 3, seed: 91 };

let pitCache: BlastResult | undefined;
/** 炸完的屋子和地（掉落物照原版算） */
export const crater = (): BlastResult => (pitCache ??= explode(preBlastBlocks(), pitExplosion));

// ---------- 掉落物落在哪、被谁捡走 ----------
/** 掉落物实体的位置（脚底那点，格）：生成在那一格中心偏一点（Block.popResource 的 ±0.25），落到下面第一个实心方块顶上 */
export const dropPos = (remainingBlocks: readonly PlacedBlock[], d: Drop): [number, number, number] => {
  const [i, j, k] = d.cell;
  return [i + d.offset[0], j + 0.5 + d.offset[1], landHeight(remainingBlocks, i, j, k + 1)];
};

/** 玩家捡得到这堆吗：原版 Player.aiStep 把碰撞箱（站着 0.6 × 1.8）横向扩 1 格、上下扩 0.5 格，碰到的掉落物（0.25 见方）都捡走。
 *  脚 = 玩家脚底中心。你坐在坑边，坑里浮着的东西得离你够远，不然照原版早被你捡走了（测试里对过） */
export const playerCanPickUp = (pos: readonly [number, number, number], feet: readonly [number, number, number]) => {
  const playerHeight = 1.8;
  const halfSize = 0.125;
  return (
    Math.abs(pos[0] - feet[0]) < 0.3 + 1 + halfSize &&
    Math.abs(pos[1] - feet[1]) < 0.3 + 1 + halfSize &&
    pos[2] + 0.25 > feet[2] - 0.5 &&
    pos[2] < feet[2] + playerHeight + 0.5
  );
};

// ---------- 箱子里的东西 ----------
/** 箱子里放着的东西（演绎，Agent 暂定）：第 9 句门口种下的樱花树苗就从这只箱子里来，还有一块蛋糕、一把虞美人。
 *  原版箱子被炸掉时里面的东西全掉出来（ChestBlock.onRemove → Containers.dropContents），不受 1/威力 的衰减；树苗、花、蛋糕的物品是平面图（item/generated），掉在地上半格大，比方块物品大一倍 */
export const chestContents: readonly { item: string; itemCount: number }[] = [
  { item: 'minecraft:cherry_sapling', itemCount: 3 },
  { item: 'minecraft:cake', itemCount: 1 },
  { item: 'minecraft:poppy', itemCount: 5 },
];
/** 箱子里的东西洒出来用的随机数种子（种子挑的是三样都落在坑底、彼此和炸出来的几堆都隔开半格以上、偏缺口这边看得见，Agent 暂定） */
export const chestSeed = 1450;

/** 一个掉落物实体最后停在哪（场景坐标，脚底那点）：照 Containers.dropItemStack 生成（箱子那格里随机一点、带一点往上往外的初速），
 *  再照 ItemEntity.tick 走：每刻先 −0.04、移动，在地上横向乘 0.6 × 0.98、空中乘 0.98，竖直乘 0.98，落地竖直速度归零。
 *  碰撞只看物品中心那一列：落到那一列最高的实心顶面上，横着撞进实心格就停下那个方向（原版按 0.25 见方的碰撞箱算，这里差不到一格的几分之一） */
const spillOut = (remainingBlocks: readonly PlacedBlock[], cellPos: readonly [number, number, number], r: JavaRandom): [number, number, number] => {
  const solidKeys = new Set(remainingBlocks.filter((b) => blastResistance(b.state) > 0).map((b) => posKey(...b.位)));
  const isSolid = (x: number, y: number, z: number) => solidKeys.has(posKey(...cellAt(x, y, z)));
  // Containers.dropItemStack：floor + nextDouble × 0.75 + 0.125（物品宽 0.25），竖直不加 0.125；MC 的 x、y、z 依次对场景的 x、z、y
  let x = cellPos[0] - 0.5 + r.nextDouble() * 0.75 + 0.125;
  let z = cellPos[2] + r.nextDouble() * 0.75;
  let y = cellPos[1] + r.nextDouble() * 0.75 + 0.125;
  r.nextInt(21); // stack.split(nextInt(21) + 10)：这几堆都不到 10 个，不分堆
  let vx = r.triangle(0, 0.11485000171139836), vz = r.triangle(0.2, 0.11485000171139836), vy = r.triangle(0, 0.11485000171139836);
  for (let t = 0; t < 200; t++) {
    vz -= 0.04;
    if (!isSolid(x + vx, y, z)) x += vx;
    else vx = 0;
    if (!isSolid(x, y + vy, z)) y += vy;
    else vy = 0;
    let onGround = false;
    if (!isSolid(x, y, z + vz)) z += vz;
    else {
      // 竖直撞上方块：往下就落在那格顶上，速度归零（Block.updateEntityAfterFallOn），往上就顶住
      if (vz < 0) {
        z = Math.floor(z + vz) + 1;
        onGround = true;
      }
      vz = 0;
    }
    const f = onGround ? 0.6 * 0.98 : 0.98;
    vx *= f;
    vy *= f;
    vz *= 0.98;
  }
  return [x, y, z];
};

/** 箱子里的东西洒在坑里停住的样子（位 = 实体脚底那点；浮动偏 = ItemEntity.bobOffs） */
export const chestDrops = (remainingBlocks: readonly PlacedBlock[], seed = chestSeed) => {
  const r = new JavaRandom(seed);
  return chestContents.map(({ item, itemCount }) => {
    const pos = spillOut(remainingBlocks, chestCell, r);
    return { item, itemCount, 位: pos, floatOffset: r.nextFloat() * Math.PI * 2 };
  });
};
