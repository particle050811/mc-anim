// 门口小木屋后面的远景（用户 10-24：「而且怎么超平坦背景 合理吗？」）：屋子地面（j 0～3，门口小木屋.tsx）往里接着铺 前～后 排草地，
// 门左边往西是起伏着升高的坡，坡脚一棵橡树；越往里压得越暗（画的时候分三层上色，同原版远处的雾）。数都是 Agent 暂定（用户没看过）。
// 侧剖面带俯角是斜投影，没有地平线：远处不缩小，往里每排只往上错 顶面 个贴图像素，所以只铺几排，再往后是天；
// 铺多了草地顶面盖住半屏天，花草排排叠成一堵草墙（第一轮静帧，牌子后面一片深绿方块）。
// 门左边（x 西平～东平）是第 9～11 句告示牌、烟花的背后：地压平、不长花草不种树，牌子特写后面是干净的夜空，烟花炸在空的天上。
// 樱花林不铺在这里：屋后被屋顶挡住，天上那几镜要留给烟花（第二轮静帧，屋后樱花树冠在烟花旁边占了四分之一屏，删了）。
// 纯计算：定死的噪声和散列，同一组参数每次铺出一样的方块。输出是格编号：画的时候和屋子一样传 原点 = 格原点（门口小木屋.tsx），格 i 的中心才落在 x = i。
import type { 方块 } from '@engine/model/方块拼搭.tsx';
import { fbm, hash2, simplex2, smoothstep } from '@engine/core/噪声.ts';

const 门口远景参数 = {
  种子: 20250830,
  /** 铺的范围（格），比各镜看到的宽一点；j 从屋子地面后面一排起 */
  西: -24,
  东: 10,
  前: 4,
  后: 12,
  /** 门左边压平的那段（含两头） */
  西平: -7,
  东平: 0,
  /** 坡：离压平段越远越高，最高 坡高；往里每排再抬 深抬；坡上的起伏（格）和尺度 */
  坡高: 4,
  坡宽: 9,
  深抬: 0.12,
  起伏: 1.2,
  起伏尺度: 7,
  /** 坡上：花、短草各占多少（剩下的空着） */
  花率: 0.04,
  草率: 0.12,
  /** 橡树：[x, y, 树干高]。在定格那一镜和天上几镜的左边框着画面；放在中间一层压暗一点，不和烟花抢（第三轮静帧放最近一排，左边一根黑柱子太重）；
   *  树冠躲开左上的月亮（门口之夜参数.ts 的 夜天弧：月亮在 x −7.5，树冠最东到 x −7.5，上两层到 −8.5） */
  橡树们: [[-10, 7, 4]] as const,
  /** 分层：j 到哪一排（含）算这一层，近、中、远 */
  层界: [6, 9, 12] as const,
};

const P = 门口远景参数;
const 噪 = simplex2(P.种子);

/** 这一列离压平段多远（格，段里是 0） */
const 离平 = (i: number) => (i < P.西平 ? P.西平 - i : i > P.东平 ? i - P.东平 : 0);

/** (i, j) 那一列地面顶的高度（整数格，屋子地面是 0） */
const 远景地面高 = (i: number, j: number): number => {
  const d = 离平(i);
  if (d === 0) return 0;
  const 渐 = smoothstep(0, 3, d);
  return Math.max(0, Math.round(P.坡高 * smoothstep(0, P.坡宽, d) + 渐 * (P.起伏 * fbm(噪, i, j, P.起伏尺度, 2) + P.深抬 * (j - P.前))));
};

/** 原版 1.20.1 的橡树（TreeFeatures.OAK：下两层叶子 5×5、上两层 3×3，角上随机缺，最顶层角上全缺；同 场/2-新世界/地形.ts） */
const 橡树 = (i: number, j: number, 高: number, z0: number, 放: (b: 方块) => void) => {
  const 顶 = z0 + 高;
  for (let k = z0; k < 顶; k++) 放({ 状态: 'minecraft:oak_log[axis=y]', 位: [i, j, k] });
  for (let dz = -3; dz <= 0; dz++) {
    const r = dz >= -1 ? 1 : 2;
    for (let dx = -r; dx <= r; dx++)
      for (let dy = -r; dy <= r; dy++) {
        if (dx === 0 && dy === 0 && dz < 0) continue;
        const 角 = Math.abs(dx) === r && Math.abs(dy) === r;
        if (角 && (dz === 0 || hash2(i + dx, j + dy, 40 + dz) < 0.5)) continue;
        放({ 状态: 'minecraft:oak_leaves', 位: [i + dx, j + dy, 顶 + dz] });
      }
  }
};

const 郁金香们 = ['minecraft:orange_tulip', 'minecraft:red_tulip', 'minecraft:pink_tulip', 'minecraft:white_tulip'] as const;
const 花们 = ['minecraft:dandelion', 'minecraft:poppy', 'minecraft:azure_bluet', 'minecraft:oxeye_daisy', 'minecraft:cornflower', ...郁金香们] as const;

export type 远景层 = { 名: '近' | '中' | '远'; 方块们: 方块[] };

/** 第几层（0 近、1 中、2 远） */
const 层号 = (j: number) => {
  const n = P.层界.findIndex((界) => j <= 界);
  return n < 0 ? P.层界.length - 1 : n;
};

/** 铺出来的全部方块，按层分好 */
export const 门口远景层们 = (): 远景层[] => {
  const 层们: 远景层[] = [
    { 名: '近', 方块们: [] },
    { 名: '中', 方块们: [] },
    { 名: '远', 方块们: [] },
  ];
  const 占 = new Set<string>();
  // 树只长在地面以上，树冠可以往里伸出铺的范围两排；地面、花草只在铺的范围里
  const 放到 = (n: number, 树 = false) => (b: 方块) => {
    const [i, j, k] = b.位;
    const 键 = `${i},${j},${k}`;
    if (占.has(键)) return;
    if (j < P.前 || j > P.后 + (树 ? 2 : 0) || i < P.西 || i > P.东) return;
    if (树 && j <= P.后 && k < 远景地面高(i, j)) return;
    占.add(键);
    层们[n]!.方块们.push(b);
  };
  const 有树 = new Set<string>();
  for (const [i, j, 高] of P.橡树们) {
    有树.add(`${i},${j}`);
    橡树(i, j, 高, 远景地面高(i, j), 放到(层号(j), true));
  }
  for (let j = P.前; j <= P.后; j++)
    for (let i = P.西; i <= P.东; i++) {
      const 放 = 放到(层号(j));
      const h = 远景地面高(i, j);
      // 侧面露出来的要填：往下填到前一排和左右两格里最低的那格顶
      let 底 = h;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, -1]] as const) 底 = Math.min(底, j + dj < P.前 ? 0 : 远景地面高(i + di, j + dj));
      放({ 状态: 有树.has(`${i},${j}`) ? 'minecraft:dirt' : 'minecraft:grass_block', 位: [i, j, h - 1] });
      for (let k = h - 2; k >= 底 - 1; k--) 放({ 状态: h - 1 - k > 3 ? 'minecraft:stone' : 'minecraft:dirt', 位: [i, j, k] });
      if (有树.has(`${i},${j}`) || 离平(i) === 0) continue;
      const u = hash2(i, j, 11);
      if (u < P.花率) 放({ 状态: 花们[Math.floor(hash2(i, j, 14) * 花们.length)]!, 位: [i, j, h] });
      else if (u < P.花率 + P.草率) 放({ 状态: 'minecraft:grass', 位: [i, j, h] });
    }
  return 层们;
};
