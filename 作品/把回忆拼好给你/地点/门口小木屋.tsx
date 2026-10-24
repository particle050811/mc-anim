// 史蒂夫的小木屋门口（三稿「地点」一段，第 8、9、10、13、14、15 句同一个机位）：侧剖面，门在正中，左边门外，右边屋里。
// 第 6 句炸成坑、第 8 句原地盖回来：后墙补过的那片是新木板，同一种橡木板提亮一截（比旧墙浅、饱和不降）。不画焦痕：游戏里没有，做出来是一圈随机的暗像素，
//   用户 10-24 看了问「这个奇怪的阴影是什么」，主会话 10-24 定删掉。补墙原来用白桦木板，后墙那档压暗以后成了去饱和的灰橄榄（#736742），
//   读成一层灰膜（五家看图评审），主会话 10-24 美术定稿改成提亮的橡木板、规整的一块。
// 坐标照场景约定（Z 朝上：x 东、y 北、z 上，单位格）：门那一格的中心 x = 0，地面 z = 0；剖面切在 y = 0，朝镜头的南墙和它前面的都去掉。
// 格 (i, j, k) 占 x ∈ [i − 0.5, i + 0.5]、y ∈ [j, j + 1]、z ∈ [k, k + 1]（方块拼搭 都传 原点 = 格原点）。人走的那排是 j = 0（站在 y = 0.5），
//   箱子、树、告示牌、花草在 j = 1（人身后），后墙 j = 2。屋外 j = 0 不放东西：花草的正面片在格中心，放在人那排会和人穿插。
// 门是剖面演绎：游戏里门是墙里 3 像素厚的一片，侧着看只剩一条，关着反倒像个洞。这里关着画成正对镜头的门板堵住门洞；
//   开着门板绕门外那条边甩出去，正对镜头立在门洞左边那格，门洞空出来。游戏里门是一下开合的，不做中间的转动（斜着转贴图像素会被压窄）。
// 画法：放进三渲二画布（平涂，不吃灯；场/2-门口/门口.tsx 的 门口画布）。布局、亮度档都是 Agent 暂定的；机位、天在 场/2-门口/参数.ts。
import type React from 'react';
import { 方块拼搭, type 方块 } from '@engine/model/方块拼搭.tsx';
import type { V3 } from '@engine/model/parts.tsx';
import { Chest, VANILLA_CHEST_TEX } from '@库/物品/箱子.tsx';
import type { 地图边长 } from '../特效/地图画.ts';
import { 告示牌, 告示牌尺寸 } from './告示牌.tsx';
import { 照片墙, type 照片墙格 } from './照片墙.tsx';
import { 樱花树方块, 樱花树阶段 } from './樱花树.ts';

/** 方块拼搭 的原点：让格 i 的中心落在 x = i（樱花树方块 的输出也按这个画） */
export const 格原点: V3 = [-0.5, 0, 0];

/** 屋子（格的编号）：西墙 i = 0（开门）、东墙 i = 7，屋里 i 1～6、j 0～1，后墙 j = 2；墙高 3 格（k 0～2）。
 *  云杉屋顶实心剖面：k 3 屋檐伸到 i −1、8，往上每层两边各收一格，屋脊一排下半砖（顶 z = 6.5）。
 *  屋顶压低，长成的樱花树（顶 9）才明显高过屋子；屋子 8 格宽，N = 6 时右半屏（13.3 格）里屋子占六成，屋外还留一截草地 */
export const 小木屋 = { 西墙: 0, 东墙: 7, 后墙: 2, 墙高: 3, 屋顶顶: 6.5, 檐: { 西: -1.5, 东: 8.5, 底: 3, 顶: 4 } } as const;

/** 亮度档（sRGB 数值乘）：剖面上的和屋外的照原样，屋里后一排的摆设暗一档，后墙、屋顶后两排、两边墙往里那几格再暗一档（侧视里分得出前后）；
 *  后墙补过的新木板比后墙亮 25%（主会话 10-24 美术定稿）。
 *  门洞后面那两格（西墙往里一格）原来单独压到最暗的 0.55，想让开着的门洞像个往里通的口子，结果读成门洞里一块一格宽两格高的怪阴影
 *  （用户 10-24 问「这个奇怪的阴影是什么」），美术定稿钉回和两边墙同一档 */
export const 门口亮度 = { 前: 1, 摆设: 0.85, 后墙: 0.75, 补墙: 0.75 * 1.25 } as const;

/** 摆设、站位的坐标（格，场景坐标；站位是脚底的 x，人都站在 y = 站排y） */
export const 门口 = {
  地面: 0,
  站排y: 0.5,
  /** 门洞 x −0.5～0.5、z 0～2；门板厚 3/16，贴在 j = 0 那排的后边（y 13/16～1）。开着的门板在 x −1.5～−0.5、同样的 y */
  门: { x: 0, 门洞: { x0: -0.5, x1: 0.5, z0: 0, z1: 2 }, 开着的门板: { x0: -1.5, x1: -0.5 }, 板y: [13 / 16, 1] as const },
  /** 箱子底面中心，锁扣朝南（朝镜头）：屋里、紧挨着门的右边 */
  箱子: [1, 1.5, 0] as V3,
  /** 树苗那一格的底面中心：门外离墙空 4 格（i −1～−4），头顶没有屋檐 */
  树苗: [-5, 1.5, 0] as V3,
  /** 告示牌底面中心（立着、字朝南），在门和树之间 */
  告示牌: [-3, 1.5, 0] as V3,
  站位: {
    门口: 0,
    门外一步: -1,
    牌门之间: -2,
    牌树之间: -4,
    树外: -7,
    箱子右: 2,
    屋里: 4,
    /** 第 8 句苦力怕从这一带的高草后面出来 */
    草丛: -10,
  },
};

const 树根: [number, number, number] = [门口.树苗[0], 1, 0];

// ---------- 方块 ----------
/** 屋外花草（j = 1）：左边一丛高草（苦力怕从这里出来），右边几朵花 */
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

/** 后墙补过的格：炸开的口子偏左（离门近），补成规整的一块 i 1～2、k 0～2（原来右上多出的 (3, 2) 去掉、左下 (1, 0) 补齐；那格在箱子后面） */
const 补墙 = { i: [1, 2], k: [0, 2] } as const;
const 窗位 = [5, 1] as const;

/** 屋子的方块；照片墙 = 开着照片墙（后墙那支 (3, 1, 1) 的火把挪走，照片墙.tsx 的合照格在那儿） */
const 屋方块 = (照片墙 = false): 方块[] => {
  const out: 方块[] = [];
  const 放 = (状态: string, i: number, j: number, k: number, 亮?: number) => out.push({ 状态, 位: [i, j, k], 亮 });
  const { 西墙: W, 东墙: E, 后墙: N } = 小木屋;
  // 地面：草方块铺 4 排（比屋子深一排；斜投影里往里每排画面上升 顶面 ÷ N 格，铺多了草地顶面会盖住半屏天），屋下墙脚圆石、中间橡木地板；
  // 最前一排往下两层泥土、再往下石头
  for (let i = -16; i <= 16; i++) {
    for (let j = 0; j <= 3; j++) {
      const 屋下 = i >= W && i <= E && j <= N;
      if (!屋下) 放('minecraft:grass_block', i, j, -1);
      else 放(i === W || i === E || j === N ? 'minecraft:cobblestone' : 'minecraft:oak_planks', i, j, -1);
    }
    for (let k = -3; k <= -2; k++) 放('minecraft:dirt', i, 0, k);
    for (let k = -5; k <= -4; k++) 放('minecraft:stone', i, 0, k);
  }
  // 西墙：剖面那格是门（另画），门上一格木板；门洞后那格、后墙角
  放('minecraft:oak_planks', W, 0, 2);
  for (let k = 0; k < 3; k++) {
    放('minecraft:oak_planks', W, 1, k, 门口亮度.后墙);
    放('minecraft:oak_log[axis=y]', W, N, k, 门口亮度.后墙);
    放('minecraft:oak_planks', E, 0, k);
    放('minecraft:oak_planks', E, 1, k, 门口亮度.后墙);
    放('minecraft:oak_log[axis=y]', E, N, k, 门口亮度.后墙);
  }
  // 后墙：补过的新木板、窗
  for (let i = W + 1; i < E; i++)
    for (let k = 0; k < 3; k++) {
      const 补 = i >= 补墙.i[0] && i <= 补墙.i[1] && k >= 补墙.k[0] && k <= 补墙.k[1];
      const 窗 = i === 窗位[0] && k === 窗位[1];
      放(窗 ? 'minecraft:glass' : 'minecraft:oak_planks', i, N, k, 补 ? 门口亮度.补墙 : 门口亮度.后墙);
    }
  // 屋顶：每层两头台阶、中间木板，最上一排下半砖；前排（剖面）照原样，后两排被前排挡住
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
  // 屋里的摆设（后一排）：箱子另画在 i = 1，i = 2 空着给人站；工作台、熔炉、木桶，后墙上两支火把
  放('minecraft:crafting_table', 4, 1, 0, 门口亮度.摆设);
  放('minecraft:furnace[facing=south,lit=false]', 5, 1, 0, 门口亮度.摆设);
  放('minecraft:barrel[facing=up,open=false]', 6, 1, 0, 门口亮度.摆设);
  if (!照片墙) 放('minecraft:wall_torch[facing=south]', 3, 1, 1);
  放('minecraft:wall_torch[facing=south]', 6, 1, 2);
  for (const [状态, i] of 花草) {
    if (两格高.has(状态)) {
      放(`${状态}[half=lower]`, i, 1, 0);
      放(`${状态}[half=upper]`, i, 1, 1);
    } else 放(状态, i, 1, 0);
  }
  return out;
};

const 屋 = 屋方块();
const 照片墙屋 = 屋方块(true);
const 屋格 = new Set(屋.map((x) => x.位.join(',')));

// 门板：门那格的模型用 facing=south（门板贴在格的北边、正面朝南，合页在右边）。合页定在门洞外沿 x = −0.5：
//   关着左右翻过来放在门洞（合页到左边），开着原样放在左边一格（合页在右边，贴着墙）
const 门方块: 方块[] = [
  { 状态: 'minecraft:oak_door[facing=south,half=lower,hinge=left,open=false]', 位: [0, 0, 0] },
  { 状态: 'minecraft:oak_door[facing=south,half=upper,hinge=left,open=false]', 位: [0, 0, 1] },
];

const 树方块缓存 = new Map<number, 方块[]>();
const 树方块 = (阶段: number) => {
  let b = 树方块缓存.get(阶段);
  if (!b) {
    b = 樱花树方块(阶段, 树根);
    const 撞 = b.find((x) => 屋格.has(x.位.join(',')) || x.位.join(',') === `${门口.告示牌[0]},1,0`);
    if (撞) throw new Error(`樱花树第 ${阶段} 阶段的 ${撞.状态} 撞上了屋子、花草或告示牌的格 ${撞.位.join(',')}`);
    树方块缓存.set(阶段, b);
  }
  return b;
};

// ---------- 组件 ----------
export type 门口小木屋属性 = {
  /** 门开着没有（默认关） */
  门开?: boolean;
  /** 箱子 openness 0～1（库/物品/箱子.tsx 的 chestState、chestOpenness 算），盖子角度照原版换算 */
  箱子开度?: number;
  /** 樱花树进度 0～1（樱花树阶段：0 树苗、每 1/5 长一截、1 开满花）；不给 = 还没种 */
  树进度?: number;
  /** 插没插告示牌 */
  告示牌?: boolean;
  /** 告示牌上的字：放在字面中心、Z 朝上的 group 里（x 右、z 上，单位格，见 告示牌尺寸） */
  告示牌字?: React.ReactNode;
  群系?: string;
  /** 照片墙（照片方案 10-24，地点/照片墙.tsx）：给了就撤掉箱子、挪走后墙那支火把，画这些荧光框；不给 = 箱子照旧 */
  照片墙?: readonly 照片墙格[];
  /** 照片墙一格几个地图像素：镜头 N 是 4 的倍数给 64，N = 10 给 32（默认，特效/地图画.ts） */
  照片墙边长?: 地图边长;
};

/** Z 朝上的场景内容（不带灯、机位）；放进三渲二画布（它自己套好 rotation [−π/2, 0, 0] 的 group 和平涂） */
export const 门口小木屋: React.FC<门口小木屋属性> = ({ 门开 = false, 箱子开度 = 0, 树进度, 告示牌: 插牌 = false, 告示牌字, 群系 = 'minecraft:plains', 照片墙: 墙, 照片墙边长 }) => {
  const 阶段 = 树进度 === undefined ? null : 樱花树阶段(树进度);
  const 树 = 阶段 === null ? null : 树方块(阶段);
  return (
    <group>
      <方块拼搭 方块们={墙 ? 照片墙屋 : 屋} 原点={格原点} 群系={群系} 正面花草 />
      <group position={[门开 ? 门口.门.开着的门板.x0 + 0.5 : 0, 0, 0]} scale={[门开 ? 1 : -1, 1, 1]}>
        <方块拼搭 方块们={门方块} 原点={格原点} />
      </group>
      {墙 ? <照片墙 格们={墙} 边长={照片墙边长} /> : <Chest 贴图={VANILLA_CHEST_TEX} 开度={箱子开度} p={门口.箱子} 朝向="south" />}
      {树 && <方块拼搭 方块们={树} 原点={格原点} 群系={群系} 正面花草 />}
      {插牌 && <告示牌 位={门口.告示牌}>{告示牌字}</告示牌>}
    </group>
  );
};

export { 告示牌尺寸 };
