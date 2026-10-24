// 第 6、7 句的弹坑：门口小木屋（地点/门口小木屋.tsx，只读，这里照抄它的布局、补上南墙）西南角被苦力怕炸掉以后剩下的方块，和炸出来浮在坑里的掉落物。纯数据。
// 用户 10-24「应该是炸掉房子一角 爆掉箱子 不然炸空地有什么好伤心的」：炸的是门边那个角，箱子炸没了，后墙炸开的口子就是第 8 句补过的那块（i 1～2、k 0～2）。
// 爆炸照 1.20.1 的 Explosion.explode（javap 核过的算法）：16³ 立方体表面上的每个方向一条射线，强度 威力 ×（0.7～1.3 随机），每 0.3 格减 0.225，
//   碰到方块再减（抗爆 + 0.3）× 0.3，强度还大于 0 时这一格炸掉。普通苦力怕威力 3。随机数用 Java 的线性同余（种子挑的是缺口的样子，条件见 坑爆炸）。
// 掉落照 DESTROY_WITH_DECAY（mobExplosionDropDecay 默认开）：每格按 1/威力 的概率掉，同种东西合成一堆（Explosion.addBlockDrops），堆在第一次掉的那格。
//   游戏里炸掉的格先洗牌再掉（Util.shuffle），这里按射线找到的先后，只影响哪一格先掉、堆在哪，种子照样能挑。
// 不画焦痕、不画烟熏的暗圈：原版爆炸只是把方块拿掉（用户 10-24 删过门口那圈焦痕）。没炸掉的方块浮着照原样留（原版方块不受重力）。
// 坐标同 门口小木屋：格 (i, j, k) 占 x ∈ [i − 0.5, i + 0.5]、y ∈ [j, j + 1]、z ∈ [k, k + 1]。
import type { 方块 } from '@engine/model/方块拼搭.tsx';

// 同 地点/门口小木屋.tsx 的 小木屋（那个文件带组件和贴图，测试引不了；它改了这里跟着改，测试里对过）
export const 小木屋 = { 西墙: 0, 东墙: 7, 后墙: 2 } as const;

// ---------- Java 的随机数（java.util.Random） ----------
const 乘 = 0x5deece66dn, 加 = 0xbn, 掩 = (1n << 48n) - 1n;
export class Java随机 {
  private s: bigint;
  constructor(种子: number | bigint) {
    this.s = (BigInt.asIntN(64, BigInt(种子)) ^ 乘) & 掩;
  }
  private next(位: number) {
    this.s = (this.s * 乘 + 加) & 掩;
    return Number(BigInt.asIntN(32, this.s >> BigInt(48 - 位)));
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
export const 南墙 = -1;
/** 平地（屋子四周、爆炸碰得到的这一块，地面顶 z 0）：i、j 的范围。外面的地形在 地形.ts，接缝处那边从 0 起坡 */
export const 平地 = { 西: -16, 东: 16, 南: -12, 北: 12 } as const;
/** 地下：草方块 k −1，泥土 k −2～−3，石头到 k −8（同门口剖面那排） */
export const 地下 = { 泥土: [-3, -2], 石头底: -8 } as const;

const 花草: readonly [string, number][] = [
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
const 两格高 = new Set(['minecraft:tall_grass', 'minecraft:large_fern', 'minecraft:lilac']);

/** 炸之前：门口小木屋（补了南墙）和四周的平地。门、箱子在游戏里是方块（箱子是方块实体），这里都当方块放进去参与爆炸（这一场两样都炸没了，见 坑爆炸；方块拼搭 画不了箱子，种子换了要另画） */
export const 炸前方块 = (): 方块[] => {
  const out: 方块[] = [];
  const 放 = (状态: string, i: number, j: number, k: number) => out.push({ 状态, 位: [i, j, k] });
  const { 西墙: W, 东墙: E, 后墙: N } = 小木屋;
  const S = 南墙;
  for (let i: number = 平地.西; i <= 平地.东; i++)
    for (let j: number = 平地.南; j <= 平地.北; j++) {
      const 屋下 = i >= W && i <= E && j >= S && j <= N;
      if (!屋下) 放('minecraft:grass_block', i, j, -1);
      else 放(i === W || i === E || j === N || j === S ? 'minecraft:cobblestone' : 'minecraft:oak_planks', i, j, -1);
      for (let k = 地下.泥土[0]; k <= 地下.泥土[1]; k++) 放('minecraft:dirt', i, j, k);
      for (let k = 地下.石头底; k < 地下.泥土[0]; k++) 放('minecraft:stone', i, j, k);
    }
  for (let k = 0; k < 3; k++) {
    // 西墙：j 0 是门（门口剖面那格），j 1 木板；东墙两格木板；四个墙角原木
    放('minecraft:oak_planks', W, 1, k);
    for (let j = 0; j <= 1; j++) 放('minecraft:oak_planks', E, j, k);
    for (const [i, j] of [[W, S], [E, S], [W, N], [E, N]] as const) 放('minecraft:oak_log[axis=y]', i, j, k);
    // 后墙（炸之前还没补过，整面旧木板）、南墙，各开一扇窗（南墙的窗和后墙的对着）
    for (let i = W + 1; i < E; i++) {
      放(i === 窗位[0] && k === 窗位[1] ? 'minecraft:glass' : 'minecraft:oak_planks', i, N, k);
      放(i === 窗位[0] && k === 窗位[1] ? 'minecraft:glass' : 'minecraft:oak_planks', i, S, k);
    }
  }
  放('minecraft:oak_planks', W, 0, 2);
  // 屋顶：每层两头台阶、中间木板，最上一排下半砖（同 门口小木屋），南北各排一样，往南多铺一排盖住南墙
  for (let j = S; j <= N; j++) {
    const 层 = (k: number, 西: number, 东: number) => {
      放('minecraft:spruce_stairs[facing=east,half=bottom,shape=straight]', 西, j, k);
      for (let i = 西 + 1; i < 东; i++) 放('minecraft:spruce_planks', i, j, k);
      放('minecraft:spruce_stairs[facing=west,half=bottom,shape=straight]', 东, j, k);
    };
    层(3, W - 1, E + 1);
    层(4, W, E);
    层(5, W + 1, E - 1);
    for (let i = W + 2; i <= E - 2; i++) 放('minecraft:spruce_slab[type=bottom]', i, j, 6);
  }
  放('minecraft:crafting_table', 4, 1, 0);
  放('minecraft:furnace[facing=south,lit=false]', 5, 1, 0);
  放('minecraft:barrel[facing=up,open=false]', 6, 1, 0);
  放('minecraft:wall_torch[facing=south]', 3, 1, 1);
  放('minecraft:wall_torch[facing=south]', 6, 1, 2);
  放('minecraft:chest[facing=south]', ...箱子格);
  放('minecraft:oak_door[facing=east,half=lower,hinge=left,open=true]', W, 0, 0);
  放('minecraft:oak_door[facing=east,half=upper,hinge=left,open=true]', W, 0, 1);
  for (const [状态, i] of 花草) {
    if (两格高.has(状态)) {
      放(`${状态}[half=lower]`, i, 1, 0);
      放(`${状态}[half=upper]`, i, 1, 1);
    } else 放(状态, i, 1, 0);
  }
  return out;
};
/** 窗：后墙、南墙 (5, ·, 1) */
const 窗位 = [5, 1] as const;
/** 箱子那格（同 门口小木屋 的 门口.箱子：屋里紧挨着门） */
export const 箱子格 = [1, 1, 0] as const;

// ---------- 抗爆、掉落（1.20.1 方块属性和战利品表） ----------
const 名 = (状态: string) => 状态.replace(/\[.*$/, '');
/** Block.getExplosionResistance（原版注册时的 strength 第二个数） */
export const 抗爆: Record<string, number> = {
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
const 抗爆值 = (状态: string) => 抗爆[名(状态)] ?? 0; // 火把、花草 0

/** 掉什么（战利品表，不带工具）：草方块掉泥土、石头掉圆石、玻璃不掉；门只有下半掉；花草掉的种子、门口没有的东西不管（返回 null） */
const 掉落物品 = (状态: string): string | null => {
  const n = 名(状态);
  if (n === 'minecraft:grass_block') return 'minecraft:dirt';
  if (n === 'minecraft:stone') return 'minecraft:cobblestone';
  if (n === 'minecraft:wall_torch') return 'minecraft:torch';
  if (n === 'minecraft:oak_door') return 状态.includes('half=lower') ? 'minecraft:oak_door' : null;
  if (n === 'minecraft:glass' || 两格高.has(n) || ['minecraft:grass', 'minecraft:fern', 'minecraft:poppy', 'minecraft:dandelion'].includes(n)) return null;
  return n;
};

export type 爆炸 = { 心: readonly [number, number, number]; 威力: number; 种子: number };
/** 一堆掉落物：格 = 掉出来的那格；偏 = 落地后离那一列中心多远 [x, y]（Block.popResource 出生点 ±0.25 格）；浮动偏 = ItemEntity.bobOffs（上下浮、转圈的相位） */
export type 掉落 = { 物品: string; 个数: number; 格: readonly [number, number, number]; 偏: readonly [number, number]; 浮动偏: number };
export type 炸后 = { 留下: 方块[]; 炸掉: Set<string>; 掉落们: 掉落[] };

const 键 = (i: number, j: number, k: number) => `${i},${j},${k}`;
/** 世界坐标（场景）→ 格：BlockPos.containing */
const 格于 = (x: number, y: number, z: number) => [Math.floor(x + 0.5), Math.floor(y), Math.floor(z)] as const;

/** 炸：照 Explosion.explode 射线、照 finalizeExplosion 掉落。随机数的取用顺序同游戏（射线 16³ 表面依次各取一次，掉落每格一次） */
export const 炸 = (方块们: readonly 方块[], { 心, 威力, 种子 }: 爆炸): 炸后 => {
  const 表 = new Map(方块们.map((b) => [键(...b.位), b]));
  const r = new Java随机(种子);
  const 炸掉 = new Set<string>();
  const 顺序: string[] = [];
  for (let a = 0; a < 16; a++)
    for (let b = 0; b < 16; b++)
      for (let c = 0; c < 16; c++) {
        if (!(a === 0 || a === 15 || b === 0 || b === 15 || c === 0 || c === 15)) continue;
        let d0 = (a / 15) * 2 - 1, d1 = (b / 15) * 2 - 1, d2 = (c / 15) * 2 - 1;
        const d3 = Math.hypot(d0, d1, d2);
        d0 /= d3; d1 /= d3; d2 /= d3;
        let f = 威力 * (0.7 + r.nextFloat() * 0.6);
        let [x, y, z] = 心;
        for (; f > 0; f -= 0.22500001) {
          const g = 格于(x, y, z);
          const k = 键(...g);
          const 有 = 表.get(k);
          if (有) f -= (抗爆值(有.状态) + 0.3) * 0.3; // 已经算进要炸的格也照样挡（方块到 finalizeExplosion 才一起拿掉）
          if (f > 0 && 有 && !炸掉.has(k)) {
            炸掉.add(k);
            顺序.push(k);
          }
          x += d0 * 0.3; y += d1 * 0.3; z += d2 * 0.3;
        }
      }
  // 没了下面那格就掉下来的东西（花草、火把靠的墙、门的另一半）跟着没：原版是方块更新时掉落成物品，这里只拿掉、不另算掉落
  const 掉落们: 掉落[] = [];
  const 合 = new Map<string, 掉落>();
  for (const k of 顺序) {
    const b = 表.get(k)!;
    const 物 = 掉落物品(b.状态);
    if (!物 || r.nextFloat() > 1 / 威力) continue;
    const 已有 = 合.get(物);
    if (已有) 已有.个数++;
    else {
      const d: 掉落 = { 物品: 物, 个数: 1, 格: b.位, 偏: [r.nextFloat() * 0.5 - 0.25, r.nextFloat() * 0.5 - 0.25], 浮动偏: r.nextFloat() * Math.PI * 2 };
      合.set(物, d);
      掉落们.push(d);
    }
  }
  const 悬空 = (b: 方块) => {
    const n = 名(b.状态);
    const [i, j, k] = b.位;
    if (n === 'minecraft:wall_torch') return 炸掉.has(键(i, j + 1, k)); // 贴着北边那格墙
    if (n === 'minecraft:oak_door') return b.状态.includes('half=upper') ? 炸掉.has(键(i, j, k - 1)) || 炸掉.has(键(i, j, k - 2)) : 炸掉.has(键(i, j, k - 1)) || 炸掉.has(键(i, j, k + 1));
    if (n.startsWith('minecraft:') && (两格高.has(n) || ['minecraft:grass', 'minecraft:fern', 'minecraft:poppy', 'minecraft:dandelion'].includes(n)))
      return 炸掉.has(键(i, j, k - 1)) || (b.状态.includes('half=upper') && 炸掉.has(键(i, j, k - 2)));
    return false;
  };
  const 留下 = 方块们.filter((b) => !炸掉.has(键(...b.位)) && !悬空(b));
  return { 留下, 炸掉, 掉落们 };
};

/** 某一列（i, j）从 z 往下第一个实心方块的顶面高（掉落物落到哪） */
export const 落地高 = (留下: readonly 方块[], i: number, j: number, 从z: number) => {
  let 顶 = -Infinity;
  for (const b of 留下) {
    const [bi, bj, bk] = b.位;
    if (bi !== i || bj !== j || bk + 1 > 从z) continue;
    if (抗爆值(b.状态) === 0) continue; // 花草、火把不托东西
    顶 = Math.max(顶, bk + 1);
  }
  return 顶;
};

/** 某一列的地表高（从屋檐下往下找第一个实心方块顶面）；雨落到哪用 */
export const 地表高 = (留下: readonly 方块[], i: number, j: number, 从z = 2.5) => 落地高(留下, i, j, 从z);

// ---------- 这一场用的坑 ----------
/** 爆炸：普通苦力怕（威力 3）溜进开着的门，在门里那格（箱子南边）炸。种子挑的样子：箱子炸没、掉出箱子本身；
 *  南墙西半截（i 0～3）连西南角那根原木炸穿，门炸没；后墙炸开的两格（2,2,0）、（1,2,2）都在第 8 句补过的那块（i 1～2、k 0～2）里；
 *  屋里东边的工作台、熔炉、木桶、东墙都留着；外面看屋顶完好（天花板那层炸了几格，从南边看不见）；地板炸开一层，掉落物浮在这个浅坑里。
 *  门不掉（种子挑的）。Agent 暂定 */
export const 坑爆炸: 爆炸 = { 心: [0.7, 0.5, 0], 威力: 3, 种子: 91 };

let 坑缓存: 炸后 | undefined;
/** 炸完的屋子和地（掉落物照原版算） */
export const 坑 = (): 炸后 => (坑缓存 ??= 炸(炸前方块(), 坑爆炸));

// ---------- 掉落物落在哪、被谁捡走 ----------
/** 掉落物实体的位置（脚底那点，格）：生成在那一格中心偏一点（Block.popResource 的 ±0.25），落到下面第一个实心方块顶上 */
export const 掉落位 = (留下: readonly 方块[], d: 掉落): [number, number, number] => {
  const [i, j, k] = d.格;
  return [i + d.偏[0], j + 0.5 + d.偏[1], 落地高(留下, i, j, k + 1)];
};

/** 玩家捡得到这堆吗：原版 Player.aiStep 把碰撞箱（站着 0.6 × 1.8）横向扩 1 格、上下扩 0.5 格，碰到的掉落物（0.25 见方）都捡走。
 *  脚 = 玩家脚底中心。你坐在坑边，坑里浮着的东西得离你够远，不然照原版早被你捡走了（测试里对过） */
export const 玩家捡得到 = (位: readonly [number, number, number], 脚: readonly [number, number, number]) => {
  const 高 = 1.8;
  const 半 = 0.125;
  return (
    Math.abs(位[0] - 脚[0]) < 0.3 + 1 + 半 &&
    Math.abs(位[1] - 脚[1]) < 0.3 + 1 + 半 &&
    位[2] + 0.25 > 脚[2] - 0.5 &&
    位[2] < 脚[2] + 高 + 0.5
  );
};

// ---------- 箱子里的东西 ----------
/** 箱子里放着的东西（演绎，Agent 暂定）：第 9 句门口种下的樱花树苗就从这只箱子里来，还有一块蛋糕、一把虞美人。
 *  原版箱子被炸掉时里面的东西全掉出来（ChestBlock.onRemove → Containers.dropContents），不受 1/威力 的衰减；树苗、花、蛋糕的物品是平面图（item/generated），掉在地上半格大，比方块物品大一倍 */
export const 箱里: readonly { 物品: string; 个数: number }[] = [
  { 物品: 'minecraft:cherry_sapling', 个数: 3 },
  { 物品: 'minecraft:cake', 个数: 1 },
  { 物品: 'minecraft:poppy', 个数: 5 },
];
/** 箱子里的东西洒出来用的随机数种子（种子挑的是三样都落在坑底、彼此和炸出来的几堆都隔开半格以上、偏缺口这边看得见，Agent 暂定） */
export const 箱里种子 = 1450;

/** 一个掉落物实体最后停在哪（场景坐标，脚底那点）：照 Containers.dropItemStack 生成（箱子那格里随机一点、带一点往上往外的初速），
 *  再照 ItemEntity.tick 走：每刻先 −0.04、移动，在地上横向乘 0.6 × 0.98、空中乘 0.98，竖直乘 0.98，落地竖直速度归零。
 *  碰撞只看物品中心那一列：落到那一列最高的实心顶面上，横着撞进实心格就停下那个方向（原版按 0.25 见方的碰撞箱算，这里差不到一格的几分之一） */
const 洒出 = (留下: readonly 方块[], 格: readonly [number, number, number], r: Java随机): [number, number, number] => {
  const 实心 = new Set(留下.filter((b) => 抗爆值(b.状态) > 0).map((b) => 键(...b.位)));
  const 占 = (x: number, y: number, z: number) => 实心.has(键(...格于(x, y, z)));
  // Containers.dropItemStack：floor + nextDouble × 0.75 + 0.125（物品宽 0.25），竖直不加 0.125；MC 的 x、y、z 依次对场景的 x、z、y
  let x = 格[0] - 0.5 + r.nextDouble() * 0.75 + 0.125;
  let z = 格[2] + r.nextDouble() * 0.75;
  let y = 格[1] + r.nextDouble() * 0.75 + 0.125;
  r.nextInt(21); // stack.split(nextInt(21) + 10)：这几堆都不到 10 个，不分堆
  let vx = r.triangle(0, 0.11485000171139836), vz = r.triangle(0.2, 0.11485000171139836), vy = r.triangle(0, 0.11485000171139836);
  for (let t = 0; t < 200; t++) {
    vz -= 0.04;
    if (!占(x + vx, y, z)) x += vx;
    else vx = 0;
    if (!占(x, y + vy, z)) y += vy;
    else vy = 0;
    let 地上 = false;
    if (!占(x, y, z + vz)) z += vz;
    else {
      // 竖直撞上方块：往下就落在那格顶上，速度归零（Block.updateEntityAfterFallOn），往上就顶住
      if (vz < 0) {
        z = Math.floor(z + vz) + 1;
        地上 = true;
      }
      vz = 0;
    }
    const f = 地上 ? 0.6 * 0.98 : 0.98;
    vx *= f;
    vy *= f;
    vz *= 0.98;
  }
  return [x, y, z];
};

/** 箱子里的东西洒在坑里停住的样子（位 = 实体脚底那点；浮动偏 = ItemEntity.bobOffs） */
export const 箱里掉落们 = (留下: readonly 方块[], 种子 = 箱里种子) => {
  const r = new Java随机(种子);
  return 箱里.map(({ 物品, 个数 }) => {
    const 位 = 洒出(留下, 箱子格, r);
    return { 物品, 个数, 位, 浮动偏: r.nextFloat() * Math.PI * 2 };
  });
};
