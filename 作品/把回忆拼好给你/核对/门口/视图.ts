import { splitDoorFrac } from '../../场/2-门口/参数.ts';
import type { ToneName } from '../../色板.ts';

// 门口核对的视图表（纯数据，段.ts 也读）：一帧一个视图，看门口机位的构图、樱花树（树苗、长成）、箱子开合、门开关、太阳月亮的走法、分屏右边的取景，
// 和像素密度 N = 6、8、10 并排比（站位标尺那几帧：真史蒂夫、真魔法酒狐站着戴帽，头顶气泡、左下聊天栏按同一个 N 画）。
export type View = {
  名: string;
  doorOpen?: boolean;
  chestOpen?: number;
  treeProgress?: number;
  hasSign?: boolean;
  刻?: number;
  lightDarkAmp?: number;
  /** 画史蒂夫、酒狐、气泡、聊天栏和坐标刻度 */
  showRuler?: boolean;
  /** 像素密度（不给按 参数.ts 的 像素N） */
  N?: number;
  /** 标出太阳每 1000 刻的位置（整屏默认弧） */
  celestialPath?: boolean;
  /** 分屏：右半屏画门口（门在半屏 门在 处），左半屏空着。这是分屏的旧版式（N = 6、服务器在右）；现在的分屏服务器在左、N = 8，看 核对-时差分屏 */
  halfScreen?: { doorFrac: number };
  /** 左右两个半屏，门都在正中：左边关着、右边开着 */
  doorCompare?: boolean;
  /** 斜投影俯角（不给按 画风.ts 的 正交顶面）；0 = 纯侧面 */
  topDepth?: number;
  /** 3D 调子（色板.ts） */
  tone?: ToneName;
};

const treeView = (grown: boolean): View => ({ 名: grown ? '樱花树-长成' : '樱花树-树苗', treeProgress: grown ? 1 : 0, hasSign: true });
const rulerView = (N: number): View => ({ 名: `站位标尺-N${N}`, treeProgress: 0, hasSign: true, showRuler: true, N });

export const views: readonly View[] = [
  { 名: '空场景-白天' },
  ...[false, true].map(treeView),
  { 名: '箱子开', chestOpen: 1 },
  { 名: '箱子合', chestOpen: 0, treeProgress: 0, hasSign: true },
  { 名: '门开-第15句开头', doorOpen: true, treeProgress: 1, hasSign: true },
  { 名: '门-左关右开', hasSign: true, doorCompare: true },
  rulerView(6),
  { 名: '分屏右-树长成', treeProgress: 1, hasSign: true, halfScreen: { doorFrac: splitDoorFrac }, 刻: 6000 },
  { 名: '天体-上午', 刻: 4500, hasSign: true, celestialPath: true },
  { 名: '天体-下午', 刻: 9000, treeProgress: 1, hasSign: true, celestialPath: true },
  { 名: '天体-午夜-树长成-调子夜', 刻: 18000, treeProgress: 1, hasSign: true, tone: '夜' },
  rulerView(8),
  rulerView(10),
  { 名: '纯侧面-顶面0-树长成', treeProgress: 1, hasSign: true, topDepth: 0 },
];
