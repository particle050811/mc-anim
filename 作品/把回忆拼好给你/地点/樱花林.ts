// 小木屋门口身后的地（第 13～15 句门这个机位的背景）：用户 10-24 问「怎么超平坦背景 合理吗？」，要起伏的地形、樱花林、树，远处照原版的雾淡出，
//   屋子就在第 1 句远处那片樱花林的边上。纯计算（不 import react、three），测试直接引。
// 两层，各是一张自己的侧剖面（像素比近景小一号 = 远一点，场/2-门口/林间门口.tsx 照近景的取景对齐、叠在近景后面）：
//   中景：屋子西边她种下的那片樱花林（告示牌「想你一次 / 种一棵樱花」），第 13 句跟着日历从离门口那棵树苗近的往远处一棵棵种下、一截截长；东边几棵原有的橡树；
//   远景：第 1 句远远看到的那座樱花林山（樱花林群系）和平原的缓坡，淡进原版的雾里。
// 樱花树照原版 1.20.1 CherryTrunkPlacer、CherryFoliagePlacer 的长法（同 场/2-新世界/地形.ts，那边没导出，这里照同一套规则另写），
//   橡树照原版 oak（StraightTrunkPlacer 4～6、BlobFoliagePlacer 半径 2）；随机用定死的散列，同一组参数每次出一样的方块。
// 坐标：每层自己的格（x 东、y 往里、z 上），这一层最前一排地面顶在 z = 0；树位、起伏、种下的先后都是 Agent 暂定。
import { fbm, hash2, simplex2 } from '@engine/core/噪声.ts';
import type { 方块 } from '@engine/model/方块拼搭.tsx';
import { 樱花树方块, 樱花树阶段, 樱花树阶段数 } from './樱花树.ts';

type 位 = [number, number, number];

/** 定死的随机数（mulberry32），一棵树一个种子 */
const 随机 = (种子: number) => {
  let a = 种子 >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
/** [lo, hi] 里的整数 */
const 整 = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

type 向 = readonly [number, number];
/** 水平四向（北、东、南、西；y 往里 = 北） */
const 四向: readonly 向[] = [[0, 1], [1, 0], [0, -1], [-1, 0]];
/** 横着的原木：东西向是原版 axis=x，南北向是 axis=z */
const 横木 = (d: 向) => `minecraft:cherry_log[axis=${d[0] !== 0 ? 'x' : 'z'}]`;
const 竖木 = 'minecraft:cherry_log[axis=y]';
const 樱叶 = 'minecraft:cherry_leaves';

/** 一组方块，同一格只放第一次（原版树先放树干、枝，叶子不顶掉木头） */
const 新方块组 = () => {
  const 占 = new Map<string, 方块>();
  const 放 = (b: 方块) => {
    const k = b.位.join(',');
    if (!占.has(k)) 占.set(k, b);
  };
  return { 放, 有: (x: number, y: number, z: number) => 占.has(`${x},${y},${z}`), 全: () => [...占.values()] };
};

/**
 * 一棵长成的原版樱花树（TreeFeatures.CHERRY），相对树根那格 [0, 0, 0]（地面上第一格）：
 * 树干 CherryTrunkPlacer(7, 1, 0, 枝数 1/2/3 等概率, 枝横长 2～4, 枝起离顶 −4～−3, 枝末离顶 −1～0)：主干长到最高的枝起处，
 *   一根枝往一个水平方向先横出一两格，再斜着走（每步按还差的竖直比例随机往上或往前）到枝末，枝末上面一格挂一团叶子；两枝时另一根朝反方向，三枝时主干顶上也挂一团。
 * 叶子 CherryFoliagePlacer(半径 4, 高 5, 底层边上缺 0.25, 角上缺 0.25, 垂叶 1/6, 垂叶再长 1/3)：往上两层半径 1、2，中间、往下一层半径 3（边角随机缺），
 *   往下两层半径 2；下面两层的外圈底下随机垂一两格叶子。
 */
export const 原版樱花树 = (种子: number): 方块[] => {
  const 组 = 新方块组();
  const 放 = (状态: string, x: number, y: number, z: number) => 组.放({ 状态, 位: [x, y, z] });
  const r = 随机(种子 * 2654435761 + 97);
  const 高 = 7 + 整(r, 0, 1);
  const 枝起 = Math.max(0, 高 - 1 + 整(r, -4, -3));
  let 枝起2 = Math.max(0, 高 - 1 + 整(r, -4, -4));
  if (枝起2 >= 枝起) 枝起2++;
  const 枝数 = 整(r, 1, 3);
  const 干高 = 枝数 === 3 ? 高 : 枝数 === 2 ? Math.max(枝起, 枝起2) + 1 : 枝起 + 1;
  for (let k = 0; k < 干高; k++) 放(竖木, 0, 0, k);
  const 枝 = (d: 向, 起: number, 没到顶: boolean): 位 => {
    const m: 位 = [0, 0, 起];
    const 末 = 高 - 1 + 整(r, -1, 0);
    const 先横 = 没到顶 || 末 < 起;
    const 长 = 整(r, 2, 4) + (先横 ? 1 : 0);
    const 终: 位 = [d[0] * 长, d[1] * 长, 末];
    for (let l = 0; l < (先横 ? 2 : 1); l++) {
      m[0] += d[0];
      m[1] += d[1];
      放(横木(d), ...m);
    }
    const 竖向 = 终[2] > m[2] ? 1 : -1;
    for (;;) {
      const 差 = Math.abs(终[0] - m[0]) + Math.abs(终[1] - m[1]) + Math.abs(终[2] - m[2]);
      if (差 === 0) return [终[0], 终[1], 终[2] + 1];
      const 竖 = r() < Math.abs(终[2] - m[2]) / 差;
      if (竖) m[2] += 竖向;
      else {
        m[0] += d[0];
        m[1] += d[1];
      }
      放(竖 ? 竖木 : 横木(d), ...m);
    }
  };
  const 叶点: 位[] = [];
  if (枝数 === 3) 叶点.push([0, 0, 干高]);
  const d = 四向[整(r, 0, 3)]!;
  叶点.push(枝(d, 枝起, 枝起 < 干高 - 1));
  if (枝数 >= 2) 叶点.push(枝([-d[0], -d[1]], 枝起2, 枝起2 < 干高 - 1));
  for (const p of 叶点) {
    const 叶 = new Set<string>();
    const 放叶 = (x: number, y: number, z: number) => {
      叶.add(`${x},${y},${z}`);
      放(樱叶, x, y, z);
    };
    const 跳 = (ax: number, ly: number, ay: number, 圈: number) => {
      if (ly === -1 && (ax === 圈 || ay === 圈) && r() < 0.25) return true;
      const 角 = ax === 圈 && ay === 圈;
      if (圈 > 2) return 角 || (ax + ay > 圈 * 2 - 2 && r() < 0.25);
      return 角 && r() < 0.25;
    };
    const 一层 = (圈: number, ly: number) => {
      for (let dx = -圈; dx <= 圈; dx++) for (let dy = -圈; dy <= 圈; dy++) if (!跳(Math.abs(dx), ly, Math.abs(dy), 圈)) 放叶(p[0] + dx, p[1] + dy, p[2] + ly);
    };
    const 垂 = (x: number, y: number, z: number, 几率: number) => {
      if (Math.abs(x - p[0]) + Math.abs(y - p[1]) + Math.abs(z - (p[2] - 1)) >= 7) return false;
      if (r() > 几率) return false;
      放叶(x, y, z);
      return true;
    };
    const 带垂一层 = (圈: number, ly: number) => {
      一层(圈, ly);
      四向.forEach((dd, k) => {
        const d1 = 四向[(k + 1) % 4]!;
        let x = p[0] + d1[0] * 圈 - dd[0] * 圈;
        let y = p[1] + d1[1] * 圈 - dd[1] * 圈;
        const z = p[2] + ly - 1;
        for (let n = -圈; n < 圈; n++, x += dd[0], y += dd[1]) if (叶.has(`${x},${y},${z + 1}`) && 垂(x, y, z, 1 / 6)) 垂(x, y, z - 1, 1 / 3);
      });
    };
    一层(1, 2);
    一层(2, 1);
    一层(3, 0);
    带垂一层(3, -1);
    带垂一层(2, -2);
  }
  return 组.全();
};

/** 一棵原版橡树（TreeFeatures.OAK：树干 4～6、BlobFoliagePlacer 半径 2 高 3），相对树根那格 */
export const 原版橡树 = (种子: number): 方块[] => {
  const 组 = 新方块组();
  const r = 随机(种子 * 40503 + 11);
  const 高 = 4 + 整(r, 0, 2);
  for (let k = 0; k < 高; k++) 组.放({ 状态: 'minecraft:oak_log[axis=y]', 位: [0, 0, k] });
  for (let dz = -3; dz <= 0; dz++) {
    const 圈 = dz >= -1 ? 1 : 2;
    for (let dx = -圈; dx <= 圈; dx++)
      for (let dy = -圈; dy <= 圈; dy++) {
        const 角 = Math.abs(dx) === 圈 && Math.abs(dy) === 圈;
        if (角 && (dz === 0 || r() < 0.5)) continue;
        组.放({ 状态: 'minecraft:oak_leaves', 位: [dx, dy, 高 + dz] });
      }
  }
  return 组.全();
};

/** 把相对树根的方块挪到 根 */
const 挪 = (bs: readonly 方块[], 根: 位): 方块[] => bs.map((b) => ({ ...b, 位: [b.位[0] + 根[0], b.位[1] + 根[1], b.位[2] + 根[2]] as 位 }));

const 樱缓存 = new Map<number, 方块[]>();
const 橡缓存 = new Map<number, 方块[]>();
const 取樱 = (种子: number) => {
  let b = 樱缓存.get(种子);
  if (!b) 樱缓存.set(种子, (b = 原版樱花树(种子)));
  return b;
};
const 取橡 = (种子: number) => {
  let b = 橡缓存.get(种子);
  if (!b) 橡缓存.set(种子, (b = 原版橡树(种子)));
  return b;
};

/** 一棵樱花树长到 进度（0～1）的样子：同门口那棵（地点/樱花树.ts）一截截长，0 树苗、1～4 小树，长满换成原版的整棵（每棵样子按种子） */
export const 长着的樱花树 = (进度: number, 种子: number, 根: 位): 方块[] => {
  const 阶段 = 樱花树阶段(进度);
  return 阶段 >= 樱花树阶段数 ? 挪(取樱(种子), 根) : 樱花树方块(阶段, 根);
};

export type 林木 = { x: number; y: number; 种: '樱' | '橡'; 种子: number; 迟: number };

// ---------- 中景：她种下的那片樱花林 ----------

/** 中景：N = 4（近景 N 8、10 的一半上下），顶面同近景（往里每排画面上升 32 成片像素）；铺 行 排、x 左～右。
 *  起长x：门口那棵树苗在中景里大约的位置（近景 x −5 按 林间门口.tsx 的对齐换算，N 8 时 −10、N 10 时 −12.5），林子从这里往两边种开；
 *  种开：离它多远的树晚多少（生长进度里的份额）；屋子东边（x > 林东）只有零星几棵原有的橡树 */
/** 地左：地比树往左多铺一截（树照 左 种，改 左 树位全挪）。第 12 句末横移出卧室、2-时差 接入那几帧林子往左看得更远，原来左沿露出地的断面（核查 10-24） */
export const 中景 = { N: 4, 顶面: 2, 行: 6, 左: -36, 地左: -56, 右: 32, 种子: 1310, 起长x: -11, 种开: 0.6, 种开距: 24, 林东: 2 } as const;

const 中噪 = simplex2(中景.种子);

/** 中景 (x, y) 那一列地面顶的高度（整数格）：往里慢慢抬，左右按噪声起伏；最前一排是 0（接近景草地的后沿） */
export const 中景地面高 = (x: number, y: number): number =>
  Math.max(0, Math.round(0.28 * y + 1.3 * fbm(中噪, x, 0, 11, 2) * Math.min(1, y / 2.5) + 0.4 * fbm(中噪, x + 300, y, 4, 1) * Math.min(1, y / 2)));

/** 中景的树：樱花树每 5～6 格一棵，前后两排错开；迟 = 种下的先后（生长进度里过了多少才种下这棵），离起长x 越远越晚。东边是原有的橡树（迟 −1，一直在） */
export const 中景树们: readonly 林木[] = (() => {
  const out: 林木[] = [];
  let n = 0;
  for (let x = 中景.左 + 2; x <= 中景.右 - 2; x += 5) {
    n++;
    const 排 = n % 2 === 0 ? 2 : 4;
    const xx = x + Math.round((hash2(x, 3, 7) - 0.5) * 2);
    const 樱 = xx <= 中景.林东;
    if (!樱 && hash2(x, 5, 9) < 0.45) continue;
    const 远 = Math.min(1, Math.abs(xx - 中景.起长x) / 中景.种开距);
    out.push({ x: xx, y: 排, 种: 樱 ? '樱' : '橡', 种子: 7000 + n, 迟: 樱 ? 中景.种开 * 远 * (0.85 + 0.15 * hash2(n, 1, 3)) : -1 });
  }
  return out;
})();

/** 一棵中景樱花树在 生长（第 13 句的生长进度 0～1）时长到几成；还没种下给 null */
export const 林木进度 = (t: 林木, 生长: number): number | null => {
  if (t.种 === '橡') return 1;
  if (生长 < t.迟) return null;
  return Math.min(1, (生长 - t.迟) / (1 - t.迟));
};

/** 地面：草方块，前面露出来的侧面往下填到前一排的顶；树底下换泥土。长满的樱花树脚下铺一圈粉红花簇，空地上零星短草、花 */
const 铺地 = (左: number, 右: number, 行: number, 高: (x: number, y: number) => number, 组: ReturnType<typeof 新方块组>, 树格: Set<string>, 群系?: (x: number, y: number) => string | undefined, 草率 = 0.22) => {
  for (let y = 0; y < 行; y++)
    for (let x = 左; x <= 右; x++) {
      const h = 高(x, y);
      const 底 = y === 0 ? -3 : Math.min(h, 高(x, y - 1)) - 1;
      const g = 群系?.(x, y);
      const 树下 = 树格.has(`${x},${y}`);
      组.放({ 状态: 树下 ? 'minecraft:dirt' : 'minecraft:grass_block[snowy=false]', 位: [x, y, h - 1], 群系: g });
      for (let k = h - 2; k >= 底; k--) 组.放({ 状态: 'minecraft:dirt', 位: [x, y, k] });
      if (树下 || 组.有(x, y, h)) continue;
      const s = hash2(x, y, 31);
      if (s < 草率) 组.放({ 状态: 'minecraft:grass', 位: [x, y, h], 群系: g });
      else if (s < 草率 + 0.03) 组.放({ 状态: hash2(x, y, 37) < 0.5 ? 'minecraft:dandelion' : 'minecraft:poppy', 位: [x, y, h] });
    }
};

const 中景缓存 = new Map<string, 方块[]>();
/** 中景的全部方块（群系 plains），生长 = 第 13 句的生长进度（0～1；第 14、15 句给 1）。按每棵树的阶段缓存 */
export const 中景方块 = (生长: number): 方块[] => {
  const 阶段们 = 中景树们.map((t) => {
    const p = 林木进度(t, 生长);
    return p === null ? -1 : 樱花树阶段(p);
  });
  const 键 = 阶段们.join(',');
  let out = 中景缓存.get(键);
  if (out) return out;
  const 组 = 新方块组();
  const 树格 = new Set<string>();
  中景树们.forEach((t, n) => {
    const 阶段 = 阶段们[n]!;
    if (阶段 < 0) return;
    const h = 中景地面高(t.x, t.y);
    if (阶段 >= 1) 树格.add(`${t.x},${t.y}`);
    const 根: 位 = [t.x, t.y, h];
    const bs = t.种 === '橡' ? 挪(取橡(t.种子), 根) : 长着的樱花树(阶段 / 樱花树阶段数, t.种子, 根);
    // 钻进地里的枝叶不放（原版树只长在空气里）
    for (const b of bs) if (b.位[2] >= 中景地面高(b.位[0], b.位[1]) && b.位[1] >= 0 && b.位[1] < 中景.行 + 4) 组.放(b);
    if (t.种 === '樱' && 阶段 >= 樱花树阶段数)
      for (let dx = -2; dx <= 2; dx++)
        for (let dy = -1; dy <= 1; dy++) {
          const x = t.x + dx, y = t.y + dy;
          if ((dx || dy) && y >= 0 && y < 中景.行 && hash2(x, y, 41) < 0.6 && !组.有(x, y, 中景地面高(x, y)))
            组.放({ 状态: `minecraft:pink_petals[facing=${['north', 'east', 'south', 'west'][(x + y + 8) % 4]},flower_amount=${(Math.abs(x * 3 + y) % 3) + 2}]`, 位: [x, y, 中景地面高(x, y)] });
        }
  });
  铺地(中景.地左, 中景.右, 中景.行, 中景地面高, 组, 树格);
  中景缓存.set(键, (out = 组.全()));
  return out;
};

// ---------- 远景：第 1 句那座樱花林山和平原 ----------

/** 远景：N = 2，纯侧面（顶面 0：远处的地往里不再上抬，只看得出山的轮廓）；铺 行 排。
 *  山：樱花林那座山在 山心x（屋子西边，同第 1 句「屋子在樱花林边上」），山高、山半径（格）；别处是平原的缓坡，屋子东边（东坡x）一道矮坡 */
/** 地左：同 中景 的 地左 */
export const 远景 = { N: 2, 顶面: 0, 行: 14, 左: -60, 地左: -100, 右: 60, 种子: 20230607, 山心x: -30, 山心y: 9, 山高: 11, 山半径: 26, 顶半径: 8, 东坡x: 30 } as const;

const 远噪 = simplex2(远景.种子);
const 在山上 = (x: number, y: number) => Math.hypot(x - 远景.山心x, (y - 远景.山心y) * 2) < 远景.山半径 * 0.75;

/** 远景 (x, y) 那一列地面顶的高度（整数格）：平原两三格的缓坡，西边一座樱花林的山 */
export const 远景地面高 = (x: number, y: number): number => {
  const 平原 = 3 + 2.6 * fbm(远噪, x, y, 15, 2) + 0.2 * y + 4 * Math.max(0, 1 - Math.abs(x - 远景.东坡x) / 18);
  const 距 = Math.hypot(x - 远景.山心x, (y - 远景.山心y) * 2);
  const 坡 = Math.max(0, Math.min(1, (远景.山半径 - 距) / (远景.山半径 - 远景.顶半径)));
  const 山 = 远景.山高 * 坡 * 坡 * (3 - 2 * 坡) * (1 + 0.15 * fbm(远噪, x + 200, y, 9, 2));
  return Math.max(1, Math.round(平原 + 山));
};

/** 远景的树：山上一片樱花树（每 4～5 格），平原上零星橡树 */
export const 远景树们: readonly 林木[] = (() => {
  const out: 林木[] = [];
  for (let y = 4; y < 远景.行; y += 3)
    for (let x = 远景.左 + 2; x <= 远景.右 - 2; x += 4) {
      const xx = x + Math.round((hash2(x, y, 51) - 0.5) * 3);
      const 种子 = 9000 + x * 37 + y;
      if (在山上(xx, y)) {
        if (hash2(x, y, 53) < 0.85) out.push({ x: xx, y, 种: '樱', 种子, 迟: -1 });
      } else if (hash2(x, y, 57) < 0.12) out.push({ x: xx, y, 种: '橡', 种子, 迟: -1 });
    }
  return out;
})();

let 远景缓存: 方块[] | null = null;
/** 远景的全部方块（山上的草、树叶按樱花林群系染色） */
export const 远景方块 = (): 方块[] => {
  if (远景缓存) return 远景缓存;
  const 组 = 新方块组();
  const 树格 = new Set(远景树们.map((t) => `${t.x},${t.y}`));
  for (const t of 远景树们) {
    const 根: 位 = [t.x, t.y, 远景地面高(t.x, t.y)];
    const bs = t.种 === '橡' ? 挪(取橡(t.种子), 根) : 挪(取樱(t.种子), 根);
    for (const b of bs) if (b.位[2] >= 远景地面高(b.位[0], b.位[1])) 组.放({ ...b, 群系: t.种 === '樱' ? 'minecraft:cherry_grove' : undefined });
  }
  铺地(远景.地左, 远景.右, 远景.行, 远景地面高, 组, 树格, (x, y) => (在山上(x, y) ? 'minecraft:cherry_grove' : undefined), 0);
  return (远景缓存 = 组.全());
};
