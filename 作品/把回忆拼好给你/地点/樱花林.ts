// 小木屋门口身后的地（第 13～15 句门这个机位的背景）：用户 10-24 问「怎么超平坦背景 合理吗？」，要起伏的地形、樱花林、树，远处照原版的雾淡出，
//   屋子就在第 1 句远处那片樱花林的边上。纯计算（不 import react、three），测试直接引。
// 两层，各是一张自己的侧剖面（像素比近景小一号 = 远一点，场/2-门口/林间门口.tsx 照近景的取景对齐、叠在近景后面）：
//   中景：屋子西边的缓坡，东边几棵原有的橡树；远景：再往后的一座山和平原的缓坡，淡进原版的雾里。
// 樱花林是她种的（告示牌「想你一次 / 种一棵樱花」）：用户 10-25 看第 13 句「怎么是同步生长？ 应该是樱花树越来越多才对 背景从什么都没有到长成一片樱花林」。
//   生长 0（第 13 句起风以前、第 12 句末横移出屋）两层坡上只有草、花和零星橡树；第 13 句跟着日历，樱花树从门口那棵树苗身后起往两边、往远处一棵棵冒出来，
//   每棵一冒出来就是长成的原版整棵（原版树苗长成树是一刻之内的事），越冒越快；生长 1（第 13 句末、第 14、15 句）两层长满，和原来开满的林子一样。
// 樱花树照原版 1.20.1 CherryTrunkPlacer、CherryFoliagePlacer 的长法（同 场/2-新世界/地形.ts，那边没导出，这里照同一套规则另写），
//   橡树照原版 oak（StraightTrunkPlacer 4～6、BlobFoliagePlacer 半径 2）；随机用定死的散列，同一组参数每次出一样的方块。
// 坐标：每层自己的格（x 东、y 往里、z 上），这一层最前一排地面顶在 z = 0；树位、起伏、种下的先后都是 Agent 暂定。
import { fbm, hash2, simplex2 } from '@engine/core/噪声.ts';
import type { 方块 } from '@engine/model/方块拼搭.tsx';

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

/** 一棵树：出 = 生长到几时冒出来（0～1，见 冒出）；原有的橡树 −1，一直在 */
export type 林木 = { x: number; y: number; 种: '樱' | '橡'; 种子: number; 出: number };
type 待排 = Omit<林木, '出'>;

// ---------- 中景：她种下的那片樱花林 ----------

/** 中景：N = 4（近景 N 8、10 的一半上下），顶面同近景（往里每排画面上升 32 成片像素）；铺 行 排、x 左～右；屋子东边（x > 林东）只有零星几棵原有的橡树 */
/** 地左：地比树往左多铺一截（树照 左 种，改 左 树位全挪）。第 12 句末横移出卧室、2-时差 接入那几帧林子往左看得更远，原来左沿露出地的断面（核查 10-24） */
export const 中景 = { N: 4, 顶面: 2, 行: 6, 左: -36, 地左: -56, 右: 32, 种子: 1310, 林东: 2 } as const;

const 中噪 = simplex2(中景.种子);

/** 中景 (x, y) 那一列地面顶的高度（整数格）：往里慢慢抬，左右按噪声起伏；最前一排是 0（接近景草地的后沿） */
export const 中景地面高 = (x: number, y: number): number =>
  Math.max(0, Math.round(0.28 * y + 1.3 * fbm(中噪, x, 0, 11, 2) * Math.min(1, y / 2.5) + 0.4 * fbm(中噪, x + 300, y, 4, 1) * Math.min(1, y / 2)));

/** 中景的树位：樱花树每 4～5 格一棵，前后两排错开；东边是原有的橡树。
 *  核查 10-24「2-时差 末尾要看得出是林子」：原来每 5 格一棵，门口那棵大树后面只露出两三根树干，加密到每 4 格 */
const 中景树位: readonly 待排[] = (() => {
  const out: 待排[] = [];
  let n = 0;
  for (let x = 中景.左 + 2; x <= 中景.右 - 2; x += 4) {
    n++;
    const 排 = n % 2 === 0 ? 2 : 4;
    const xx = x + Math.round((hash2(x, 3, 7) - 0.5) * 2);
    const 樱 = xx <= 中景.林东;
    if (!樱 && hash2(x, 5, 9) < 0.45) continue;
    out.push({ x: xx, y: 排, 种: 樱 ? '樱' : '橡', 种子: 7000 + n });
  }
  return out;
})();

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

/** 这一刻在不在：生长 到了它的 出（原有的橡树一直在） */
export const 在了 = (t: 林木, 生长: number) => 生长 >= t.出;

const 中景缓存 = new Map<string, 方块[]>();
/** 中景的全部方块（群系 plains），生长 = 第 13 句的生长进度（0～1；第 14、15 句给 1）。按哪几棵在缓存 */
export const 中景方块 = (生长: number): 方块[] => {
  const 在们 = 中景树们.map((t) => 在了(t, 生长));
  const 键 = 在们.map(Number).join('');
  let out = 中景缓存.get(键);
  if (out) return out;
  const 组 = 新方块组();
  const 树格 = new Set<string>();
  中景树们.forEach((t, n) => {
    if (!在们[n]) return;
    const h = 中景地面高(t.x, t.y);
    树格.add(`${t.x},${t.y}`);
    const 根: 位 = [t.x, t.y, h];
    const bs = 挪(t.种 === '橡' ? 取橡(t.种子) : 取樱(t.种子), 根);
    // 钻进地里的枝叶不放（原版树只长在空气里）
    for (const b of bs) if (b.位[2] >= 中景地面高(b.位[0], b.位[1]) && b.位[1] >= 0 && b.位[1] < 中景.行 + 4) 组.放(b);
    if (t.种 === '樱')
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

/** 远景的树位：山上一片樱花树（每 4～5 格），平原上零星橡树 */
const 远景树位: readonly 待排[] = (() => {
  const out: 待排[] = [];
  for (let y = 4; y < 远景.行; y += 3)
    for (let x = 远景.左 + 2; x <= 远景.右 - 2; x += 4) {
      const xx = x + Math.round((hash2(x, y, 51) - 0.5) * 3);
      const 种子 = 9000 + x * 37 + y;
      if (在山上(xx, y)) {
        if (hash2(x, y, 53) < 0.85) out.push({ x: xx, y, 种: '樱', 种子 });
      } else if (hash2(x, y, 57) < 0.12) out.push({ x: xx, y, 种: '橡', 种子 });
    }
  return out;
})();

// ---------- 第 13 句樱花树一棵棵冒出来的先后 ----------

/** 用户 10-25「应该是樱花树越来越多才对」：樱花树一棵一棵冒出来，出 = 冒出来那一刻的 生长（场/2-门口/分屏参数.ts：生长 = 日历吹走的页数 ÷ 页数）。
 *  先远后近：远景（N 2，一棵在左屏上约 4 格宽，手机上四十来像素）先在山坡上一棵棵冒，看得出数目在变多；中景的树（N 4，一棵占左屏小半）冒一棵就盖住一大片坡，
 *  放在后头、越冒越快地把近处的坡也盖满（试过远近混着冒：中景两三棵一出来坡就整片是粉的，后面再冒的远景都在它背后看不见）。
 *  每层里先冒的是门口那棵树苗（第 13 句左屏近景 N 近N 时 x 树苗x）正后方那棵，往后每次挑离已经冒出来的都最远的那棵（树冠在画面上的位置），
 *  树冠先一棵棵散开在坡上、分得出一棵棵，再往空当里补满（试过按离树苗远近排：挨着的几棵树冠一冒就粘成一团粉）。
 *  左屏看得见的（树干在 看得见 里）匀开在吹走的页上：远景头一棵跟着头一页，单独站一会儿（她这时蹲下），其余匀开在 远景页；中景匀开在 中景页；
 *  页是越吹越快的，树也就越冒越快。树干在左屏外的都在最后一页（和门口那棵同一帧，分屏参数.ts 的 门口长成帧）。Agent 暂定 */
export const 冒出 = { 近N: 8, 树苗x: -5, 看得见: [-9.5, 0.5], 页数: 99, 远景页: [7, 49], 中景页: [52, 92] } as const;

const 排好 = (() => {
  const 出 = new Map<待排, number>();
  /** 一层：N、顶面、地面高 用来算树冠在画面上的位置（这一层的格）；页们(r, K) = 第 r 个冒出来的在第几页 */
  const 排一层 = (ts: readonly 待排[], N: number, 顶面: number, 地面高: (x: number, y: number) => number, 页们: (r: number, K: number) => number) => {
    const 樱们 = ts.filter((t) => t.种 === '樱');
    const 见们 = 樱们.filter((t) => {
      const nx = (t.x * N) / 冒出.近N;
      return nx >= 冒出.看得见[0] && nx <= 冒出.看得见[1];
    });
    // 树冠中心在画面上：x，高 = 地面 + 往里每排上升 顶面/N + 原版樱花树冠中心离地约 6 格
    const 位 = (t: 待排) => [t.x, 地面高(t.x, t.y) + (t.y * 顶面) / N + 6] as const;
    const 苗x = (冒出.树苗x * 冒出.近N) / N;
    const 剩 = [...见们];
    const 已: 待排[] = [];
    const 离 = (a: 待排, b: 待排) => Math.hypot(位(a)[0] - 位(b)[0], 位(a)[1] - 位(b)[1]);
    while (剩.length) {
      const 挑 = 已.length
        ? 剩.reduce((最, t) => (Math.min(...已.map((u) => 离(t, u))) > Math.min(...已.map((u) => 离(最, u))) ? t : 最))
        : 剩.reduce((最, t) => (Math.abs(t.x - 苗x) < Math.abs(最.x - 苗x) ? t : 最));
      已.push(挑);
      剩.splice(剩.indexOf(挑), 1);
    }
    已.forEach((t, r) => 出.set(t, 页们(r, 已.length) / 冒出.页数));
    for (const t of 樱们) if (!出.has(t)) 出.set(t, 1);
  };
  /** 第 r 个（共 K 个）匀开在 [a, b] 页上 */
  const 匀 = ([a, b]: readonly [number, number], r: number, K: number) => Math.round(a + ((b - a) * r) / Math.max(1, K - 1));
  排一层(远景树位, 远景.N, 远景.顶面, 远景地面高, (r, K) => (r === 0 ? 1 : 匀(冒出.远景页, r - 1, K - 1)));
  排一层(中景树位, 中景.N, 中景.顶面, 中景地面高, (r, K) => 匀(冒出.中景页, r, K));
  const 定 = (ts: readonly 待排[]): 林木[] => ts.map((t) => ({ ...t, 出: 出.get(t) ?? -1 }));
  return { 中: 定(中景树位), 远: 定(远景树位) };
})();

/** 中景的树（出 见 冒出） */
export const 中景树们: readonly 林木[] = 排好.中;
/** 远景的树（出 见 冒出） */
export const 远景树们: readonly 林木[] = 排好.远;

const 远景缓存 = new Map<string, 方块[]>();
/** 远景的全部方块（山上的草、树叶按樱花林群系染色），生长 同 中景方块。按哪几棵在缓存 */
export const 远景方块 = (生长: number): 方块[] => {
  const 在们 = 远景树们.map((t) => 在了(t, 生长));
  const 键 = 在们.map(Number).join('');
  let out = 远景缓存.get(键);
  if (out) return out;
  const 组 = 新方块组();
  const 在的 = 远景树们.filter((_, n) => 在们[n]);
  const 树格 = new Set(在的.map((t) => `${t.x},${t.y}`));
  for (const t of 在的) {
    const 根: 位 = [t.x, t.y, 远景地面高(t.x, t.y)];
    const bs = t.种 === '橡' ? 挪(取橡(t.种子), 根) : 挪(取樱(t.种子), 根);
    for (const b of bs) if (b.位[2] >= 远景地面高(b.位[0], b.位[1])) 组.放({ ...b, 群系: t.种 === '樱' ? 'minecraft:cherry_grove' : undefined });
  }
  铺地(远景.地左, 远景.右, 远景.行, 远景地面高, 组, 树格, (x, y) => (在山上(x, y) ? 'minecraft:cherry_grove' : undefined), 0);
  远景缓存.set(键, (out = 组.全()));
  return out;
};
