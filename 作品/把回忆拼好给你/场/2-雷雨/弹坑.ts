// 第 6 句的弹坑：门口小木屋（地点/门口小木屋.tsx，只读，这里照抄它的布局）被闪电劈过的苦力怕炸掉以后剩下的方块，和炸出来浮在坑里的掉落物。纯数据。
// 爆炸照 1.20.1 的 Explosion.explode（javap 核过的算法）：16³ 立方体表面上的每个方向一条射线，强度 威力 ×（0.7～1.3 随机），每 0.3 格减 0.225，
//   碰到方块再减（抗爆 + 0.3）× 0.3，强度还大于 0 时这一格炸掉。闪电苦力怕的威力 6（普通 3 × 2）。随机数用 Java 的线性同余（种子在 参数.ts 挑，挑的是坑的样子好看）。
// 掉落照 DESTROY_WITH_DECAY（mobExplosionDropDecay 默认开）：每格按 1/威力 的概率掉，同种东西合成一堆（Explosion.addBlockDrops），堆在第一次掉的那格。
//   游戏里炸掉的格先洗牌再掉（Util.shuffle），这里按射线找到的先后，只影响哪一格先掉、堆在哪，种子照样能挑。
// 不画焦痕、不画烟熏的暗圈：原版爆炸只是把方块拿掉（用户 10-24 删过门口那圈焦痕）。坑里浮着没炸掉的屋顶、墙柱，原版就是这样（方块不受重力）。
// 坐标同 门口小木屋：格 (i, j, k) 占 x ∈ [i − 0.5, i + 0.5]、y ∈ [j, j + 1]、z ∈ [k, k + 1]；剖面切在 y = 0。
import type { 方块 } from '@engine/model/方块拼搭.tsx';

// 同 地点/门口小木屋.tsx 的 小木屋、门口亮度（那个文件带组件和贴图，纯数据模块引不了；它改了这里跟着改，测试里对过）
export const 小木屋 = { 西墙: 0, 东墙: 7, 后墙: 2 } as const;
export const 门口亮度 = { 摆设: 0.85, 后墙: 0.75 } as const;

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

// ---------- 地面和屋子（照抄 门口小木屋 的布局，炸之前的样子） ----------
/** 爆炸会碰到的地面排（j）：剖面镜头（第 6 句）只画 j ≥ 0（同门口那个机位，剖面切在 y = 0）；第 7 句的透视镜头从南边看，前面几排也要有。
 *  威力 6 的射线在空气里最远约 10 格，j −10～11 以外的地不会被炸到，远处的地另铺（远地方块），不进爆炸（进了只会改掉落的随机数） */
export const 地面排 = { 前: -10, 后: 11 } as const;
/** 地下：草方块 k −1，泥土 k −2～−3，石头 k −4 往下（门口剖面那排一样） */
export const 地下 = { 泥土: [-3, -2], 石头底: -8 } as const;
/** 左右铺到哪（格），宽过画面 */
export const 地面横 = [-16, 16] as const;
/** 远地：透视镜头往北看到地平线、往两边看到画外，铺一层草方块和一层泥土（不进爆炸） */
export const 远地 = { 横: [-48, 56], 后: 72 } as const;

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

/** 炸之前：门口小木屋的方块（不含门、箱子：门是两格的 oak_door，箱子是方块实体，这里也当方块放进去参与爆炸） */
export const 炸前方块 = (): 方块[] => {
  const out: 方块[] = [];
  const 放 = (状态: string, i: number, j: number, k: number, 亮?: number) => out.push({ 状态, 位: [i, j, k], 亮 });
  const { 西墙: W, 东墙: E, 后墙: N } = 小木屋;
  for (let i: number = 地面横[0]; i <= 地面横[1]; i++) {
    for (let j: number = 地面排.前; j <= 地面排.后; j++) {
      const 屋下 = i >= W && i <= E && j >= 0 && j <= N;
      if (!屋下) 放('minecraft:grass_block', i, j, -1);
      else 放(i === W || i === E || j === N ? 'minecraft:cobblestone' : 'minecraft:oak_planks', i, j, -1);
      for (let k = 地下.泥土[0]; k <= 地下.泥土[1]; k++) 放('minecraft:dirt', i, j, k);
      for (let k = 地下.石头底; k < 地下.泥土[0]; k++) 放('minecraft:stone', i, j, k);
    }
  }
  放('minecraft:oak_planks', W, 0, 2);
  for (let k = 0; k < 3; k++) {
    放('minecraft:oak_planks', W, 1, k, 门口亮度.后墙);
    放('minecraft:oak_log[axis=y]', W, N, k, 门口亮度.后墙);
    放('minecraft:oak_planks', E, 0, k);
    放('minecraft:oak_planks', E, 1, k, 门口亮度.后墙);
    放('minecraft:oak_log[axis=y]', E, N, k, 门口亮度.后墙);
  }
  // 后墙（炸之前还没补过，整面旧木板；窗）
  for (let i = W + 1; i < E; i++) for (let k = 0; k < 3; k++) 放(i === 5 && k === 1 ? 'minecraft:glass' : 'minecraft:oak_planks', i, N, k, 门口亮度.后墙);
  for (let j = 0; j <= N; j++) {
    const 亮 = j === 0 ? undefined : 门口亮度.后墙;
    const 层 = (k: number, 西: number, 东: number) => {
      放('minecraft:spruce_stairs[facing=east,half=bottom,shape=straight]', 西, j, k, 亮);
      for (let i = 西 + 1; i < 东; i++) 放('minecraft:spruce_planks', i, j, k, 亮);
      放('minecraft:spruce_stairs[facing=west,half=bottom,shape=straight]', 东, j, k, 亮);
    };
    层(3, W - 1, E + 1);
    层(4, W, E);
    层(5, W + 1, E - 1);
    for (let i = W + 2; i <= E - 2; i++) 放('minecraft:spruce_slab[type=bottom]', i, j, 6, 亮);
  }
  放('minecraft:crafting_table', 4, 1, 0, 门口亮度.摆设);
  放('minecraft:furnace[facing=south,lit=false]', 5, 1, 0, 门口亮度.摆设);
  放('minecraft:barrel[facing=up,open=false]', 6, 1, 0, 门口亮度.摆设);
  放('minecraft:wall_torch[facing=south]', 3, 1, 1);
  放('minecraft:wall_torch[facing=south]', 6, 1, 2);
  放('minecraft:chest', 1, 1, 0);
  放('minecraft:oak_door[facing=south,half=lower,hinge=left,open=false]', 0, 0, 0);
  放('minecraft:oak_door[facing=south,half=upper,hinge=left,open=false]', 0, 0, 1);
  for (const [状态, i] of 花草) {
    if (两格高.has(状态)) {
      放(`${状态}[half=lower]`, i, 1, 0);
      放(`${状态}[half=upper]`, i, 1, 1);
    } else 放(状态, i, 1, 0);
  }
  return out;
};

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

/** 剖面那排（j = 0）每一列的地表高（最高的实心方块顶面，没炸到的列是 0）；给站位、雨落到哪用 */
export const 地表高 = (留下: readonly 方块[], i: number, j = 0, 从z = 2) => 落地高(留下, i, j, 从z);

// ---------- 这一场用的坑 ----------
/** 爆炸：苦力怕在屋里正中（工作台前面那格）炸，威力 6（闪电苦力怕）；种子 690 挑的是剖面那排（j = 0）的样子：
 *  西边门那格的圆石墙脚留着（她坐的坑沿，顶 z 0），往东一格是泥土台阶（顶 z −1，你蹲的地方），再往东 i 2～5 炸到 z −3，东边 i 6 只剩地板。
 *  东墙角（i 7 后两排）哪个种子都留着三格高的一截，剖面镜头把它挤出画面；i 6 往上也留东西的种子（如 54）那截就戳进歌词那条了。
 *  门掉成了物品、落在她坐的那格上，被蹲在旁边的你捡走（女仆界面里你的快捷栏有一扇橡木门）。Agent 暂定 */
export const 坑爆炸: 爆炸 = { 心: [3, 1.5, 0], 威力: 6, 种子: 690 };

/** 屋顶（k ≥ 3）炸剩的残块拿掉（演绎）：原版方块不受重力，种子挑来挑去，剖面那排上头总还浮着一截屋顶，正好替两人挡雨，帽子当伞就没意思了。
 *  记作演绎（第 6 句 decisions）：冲击波把整片屋顶掀了。墙、屋里的东西照原版留着 */
export const 拿掉屋顶残块 = (b: 方块) => b.位[2] >= 3;

let 坑缓存: 炸后 | undefined;
/** 炸完的坑（含拿掉的屋顶残块；掉落物照原版算） */
export const 坑 = (): 炸后 => {
  if (!坑缓存) {
    const r = 炸(炸前方块(), 坑爆炸);
    坑缓存 = { ...r, 留下: r.留下.filter((b) => !拿掉屋顶残块(b)) };
  }
  return 坑缓存;
};

/** 远地：爆炸碰不到的地（地面排、地面横 外面），一层草方块、一层泥土；透视镜头才要 */
export const 远地方块 = (): 方块[] => {
  const out: 方块[] = [];
  for (let i = 远地.横[0]; i <= 远地.横[1]; i++)
    for (let j = 地面排.前; j <= 远地.后; j++) {
      if (i >= 地面横[0] && i <= 地面横[1] && j <= 地面排.后) continue;
      out.push({ 状态: 'minecraft:grass_block', 位: [i, j, -1] }, { 状态: 'minecraft:dirt', 位: [i, j, -2] });
    }
  return out;
};

/** 剖面镜头只画 j ≥ 0 */
export const 剖面里 = (b: 方块) => b.位[1] >= 0;

/** 坑壁：剖面镜头从坑口看进去的方块（j ≥ 1，南、上、东、西有一面挨着炸掉的格）。剖面那排（j = 0）是切口，不算 */
export const 坑壁 = (炸掉: ReadonlySet<string>, b: 方块) => {
  const [i, j, k] = b.位;
  if (j < 1) return false;
  return 炸掉.has(键(i, j - 1, k)) || 炸掉.has(键(i, j, k + 1)) || 炸掉.has(键(i + 1, j, k)) || 炸掉.has(键(i - 1, j, k));
};

// ---------- 掉落物落在哪、被谁捡走 ----------
/** 掉落物实体的位置（脚底那点，格）：生成在那一格中心偏一点（Block.popResource 的 ±0.25），落到下面第一个实心方块顶上 */
export const 掉落位 = (留下: readonly 方块[], d: 掉落): [number, number, number] => {
  const [i, j, k] = d.格;
  return [i + d.偏[0], j + 0.5 + d.偏[1], 落地高(留下, i, j, k + 1)];
};

/** 玩家捡得到这堆吗：原版 Player.aiStep 把碰撞箱（潜行 0.6 × 1.5，站着 0.6 × 1.8）横向扩 1 格、上下扩 0.5 格，碰到的掉落物（0.25 见方）都捡走。
 *  脚 = 玩家脚底中心。这一场你蹲在台阶上，落在她坐的那格上的门照原版早被你捡走了，不画 */
export const 玩家捡得到 = (位: readonly [number, number, number], 脚: readonly [number, number, number], 潜行 = true) => {
  const 高 = 潜行 ? 1.5 : 1.8;
  const 半 = 0.125;
  return (
    Math.abs(位[0] - 脚[0]) < 0.3 + 1 + 半 &&
    Math.abs(位[1] - 脚[1]) < 0.3 + 1 + 半 &&
    位[2] + 0.25 > 脚[2] - 0.5 &&
    位[2] < 脚[2] + 高 + 0.5
  );
};
