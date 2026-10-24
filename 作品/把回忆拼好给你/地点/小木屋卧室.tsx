// 小木屋的卧室（三稿第 12 句：你下线后的第一夜，她守着你的空床）：侧剖面，左边是开着门的卧室门，你那张红床和她那张女仆床并排靠着后墙。
// 用料、墙高、屋顶照 地点/门口小木屋.tsx（橡木板墙、橡木原木墙角、橡木地板、墙脚圆石、云杉屋顶，墙高 3 格）；门口那几个镜头只看得到前屋（工作台、熔炉、木桶），
//   卧室是从前屋往里开门进来的另一间，在门口机位里看不见，这里单独搭（演绎：屋子大小只照门口那间的墙高、层数）。
// 坐标、布局（墙、门、床、窗在哪）在 小木屋卧室布局.ts；剖面切在 y = 0，朝镜头的南墙和它前面的都去掉。
// 门是剖面演绎，同 门口小木屋：开着的门板绕门洞外沿甩出去，正对镜头立在门洞左边那格（门外的过道里），门洞空出来。
// 门外（过道、门板、门洞里看得见的那截墙）单独一组：夜里比卧室暗一档（门外没有窗），天亮（门外亮）前屋的光透过来，这一组照原色画、不乘调子，
//   门洞读成一个亮着的空门口（核查 10-24：原来门洞和墙一个颜色，「门口没有人」读不出来）。
// 南墙（剖掉的那面）上有一扇两格宽的窗，看不见它，只看得见它照进来的光（场/2-卧室/光斑.ts）；后墙右上角一格窗，看得见外面的天色。
// 东墙外（第 12 句末镜头横移出屋才看得见）只铺最前一排草地，往里接 场/2-门口/林间门口.tsx 的林间背景（同门口身后那片地）。
import type React from 'react';
import { 方块拼搭, type 方块 } from '@engine/model/方块拼搭.tsx';
import { 床 } from '../物品/床.tsx';
import { 女仆床 } from '../物品/女仆床.tsx';
import { 卧室, 卧室墙, 格原点 } from './小木屋卧室布局.ts';
import { 门口亮度 } from './门口小木屋.tsx';

export { 卧室, 卧室墙, 格原点 };

/** 亮度档：照 门口小木屋 的 门口亮度（剖面上的 1、后墙和两边墙往里 0.75）；门外夜里压到 0.3（没有窗，黑着，门洞读成一个黑的门口；0.5 时和后墙一样亮，读成墙上一块），天亮照原色 */
export const 卧室亮度 = { 前: 门口亮度.前, 后墙: 门口亮度.后墙, 门外夜: 0.3, 门外晓: 1 } as const;

/** 门外那一组占的盒子（场景坐标 [x0, y0, z0, x1, y1, z1]）：过道（x < −0.5）和门洞里那截西墙。天亮时给平涂当发光区（不乘调子） */
export const 门外区: readonly (readonly number[])[] = [
  [-8, 0, -1, 卧室.门.门洞.x0, 卧室墙.后墙 + 1, 卧室墙.墙高],
  [卧室.门.门洞.x0, 1, 0, 卧室.门.门洞.x1, 2, 卧室.门.门洞.z1],
];
/** 东墙外沿（x）：屋外从这里起 */
export const 东墙外沿 = 卧室墙.东墙 + 0.5;
/** 东墙外（草地、泥土、石头、屋檐那一级台阶）：天亮时同门外一样给平涂当发光区，读成屋外的太阳地 */
export const 屋外区: readonly number[] = [东墙外沿 + 0.001, 0, -15, 13, 卧室墙.后墙 + 1, 6];

const { 西墙: W, 东墙: E, 后墙: N } = 卧室墙;
/** 门外那一组的格：过道里地板到墙顶（k −1～2），和门洞里看得见的那截西墙（门洞北边一格） */
const 门外格 = (i: number, j: number, k: number) => (i < W && k >= -1 && k < 卧室墙.墙高) || (i === W && j === 1 && k < 2);

/** 方块们（不含门板、床）。门外 = true 只要门外那一组，false 只要其余的 */
const 屋方块 = (门外: boolean, 亮门外: number): 方块[] => {
  const out: 方块[] = [];
  const 放 = (状态: string, i: number, j: number, k: number, 亮?: number) => {
    if (门外格(i, j, k) !== 门外) return;
    out.push({ 状态, 位: [i, j, k], 亮: 门外 ? 亮门外 : 亮 });
  };
  // 地面：屋下墙脚圆石、中间橡木地板，过道也是橡木地板；屋外草方块只铺最前一排（往里是林间背景的中景，藏在这排后沿底下）。
  // 最前一排往下两层泥土，再往下石头（剖面）
  for (let i = -6; i <= 12; i++) {
    for (let j = 0; j <= N; j++) {
      const 屋下 = i <= E && j <= N;
      const 墙下 = i === W || i === E || j === N;
      if (!屋下) {
        if (j === 0) 放('minecraft:grass_block', i, j, -1);
      } else 放(墙下 ? 'minecraft:cobblestone' : 'minecraft:oak_planks', i, j, -1);
    }
    for (let k = -3; k <= -2; k++) 放('minecraft:dirt', i, 0, k);
    for (let k = -14; k <= -4; k++) 放('minecraft:stone', i, 0, k);
  }
  // 西墙：剖面那格是门（另画），门上一格木板；门洞后面接着往里的墙、后墙角原木
  放('minecraft:oak_planks', W, 0, 2);
  for (let k = 0; k < 3; k++) {
    for (let j = 1; j < N; j++) 放('minecraft:oak_planks', W, j, k, 卧室亮度.后墙);
    放('minecraft:oak_log[axis=y]', W, N, k, 卧室亮度.后墙);
    放('minecraft:oak_planks', E, 0, k);
    for (let j = 1; j < N; j++) 放('minecraft:oak_planks', E, j, k, 卧室亮度.后墙);
    放('minecraft:oak_log[axis=y]', E, N, k, 卧室亮度.后墙);
  }
  // 后墙：橡木板，右上角一格窗
  for (let i = W + 1; i < E; i++)
    for (let k = 0; k < 3; k++) 放(i === 卧室.后窗[0] && k === 卧室.后窗[1] ? 'minecraft:glass' : 'minecraft:oak_planks', i, N, k, 卧室亮度.后墙);
  // 过道（门外）：后墙一面橡木板
  for (let i = -6; i < W; i++) for (let k = 0; k < 3; k++) 放('minecraft:oak_planks', i, N, k);
  // 屋顶：k 3 一层云杉木板盖满（剖面上就是天花板那一层），东头檐口一级台阶；再往上收一格，镜头里只露出 k 3
  for (let j = 0; j <= N; j++) {
    const 亮 = j === 0 ? undefined : 卧室亮度.后墙;
    for (let i = -6; i <= E; i++) 放('minecraft:spruce_planks', i, j, 3, 亮);
    放('minecraft:spruce_stairs[facing=west,half=bottom,shape=straight]', E + 1, j, 3, 亮);
    for (let i = -6; i <= E - 1; i++) 放('minecraft:spruce_planks', i, j, 4, 亮);
    放('minecraft:spruce_stairs[facing=west,half=bottom,shape=straight]', E, j, 4, 亮);
  }
  return out;
};

const 屋 = 屋方块(false, 1);
const 门外夜 = 屋方块(true, 卧室亮度.门外夜);
const 门外晓 = 屋方块(true, 卧室亮度.门外晓);

// 门板：同 门口小木屋（facing=south，开着原样放在门洞左边一格，合页贴着墙）
const 门板 = (亮: number): 方块[] => [
  { 状态: 'minecraft:oak_door[facing=south,half=lower,hinge=left,open=false]', 位: [0, 0, 0], 亮 },
  { 状态: 'minecraft:oak_door[facing=south,half=upper,hinge=left,open=false]', 位: [0, 0, 1], 亮 },
];
const 门板夜 = 门板(卧室亮度.门外夜);
const 门板晓 = 门板(卧室亮度.门外晓);

/** Z 朝上的场景内容（不带灯、机位）；放进三渲二画布。门外亮 = 天亮了、前屋的光透过来（画布要同时把 门外区 给平涂当发光区） */
export const 小木屋卧室: React.FC<{ 门外亮?: boolean }> = ({ 门外亮 = false }) => (
  <group>
    <方块拼搭 方块们={屋} 原点={格原点} />
    <方块拼搭 方块们={门外亮 ? 门外晓 : 门外夜} 原点={格原点} />
    <group position={[卧室.门.开着的门板.x0 + 0.5, 0, 0]}>
      <方块拼搭 方块们={门外亮 ? 门板晓 : 门板夜} 原点={格原点} />
    </group>
    <床 位={卧室.你的床.位} 朝={卧室.你的床.朝} />
    <女仆床 位={卧室.女仆床.位} 朝={卧室.女仆床.朝} />
  </group>
);
