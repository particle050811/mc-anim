// 多圈轮盘的参数类型、学派分色、默认圆心和外半径：纯数，不带聚晶图标、背景贴图、react。
// 编排摆盘、定缩放要外半径就从这里引，不用把 多圈轮盘.tsx（一 import 就是上百张聚晶图标）拖进闭包；多圈轮盘.tsx 原样转出。
import type { SpellSchool } from '../法术/法术表.ts';
import { ringRadius, defaultRingShape, type OpenClose } from './分圈.ts';
import { arrangeWheel, type ArrangeOptions } from './轮盘法术.ts';

/** 学派分色用的颜色：自己配的（原创），只在 学派分色 打开时用 */
export const schoolColor: Record<SpellSchool, string> = {
  魔法: '#c8c8d8',
  死灵: '#38c9b0',
  下界: '#ff5a2a',
  灾厄: '#7d8fa3',
  霜冻: '#8fdcff',
  占卜: '#b08a52',
  烈风: '#cfe8d0',
  风暴: '#ffe14d',
  深渊: '#2a6fd6',
  荒野: '#5fbf3a',
  虚空: '#9a3fd6',
};

/** 圆心默认画的聚晶：启示录的炼狱聚晶（goety_revelation:revelation_focus），用户 11-09 定 */
export const defaultCenter = 'goety_revelation:revelation_focus';

export type MultiRingParams = ArrangeOptions & {
  /** 打开后第几刻（可带小数，1 刻 = 1/20 秒） */
  刻: number;
  /** 高亮的格（聚晶键，如 goety:fireball_focus；齐放时给一串），画成原版的悬停色；那一圈弹完才亮 */
  selectedId?: string | readonly string[];
  /** 圆心画哪个聚晶的图标（聚晶键）；不给 = 默认圆心（炼狱聚晶），null = 不画。最里一圈弹完才画，同原版 */
  centerIcon?: string | null;
  /** 圆心图标放大几倍，默认 1（原版 16 GUI 像素）。封面草稿里放大当「头顶的第二个光环」试过，正片不用 */
  centerScale?: number;
  /** 背景贴图：原大 = 和原版一圈时一样大（默认）；随外圈 = 按最外圈和原版外半径的比例放大；无 = 不画 */
  backdropMode?: '原大' | '随外圈' | '无';
  /** 带子按学派上色（原创，默认关） */
  colorBySchool?: boolean;
  /** 学派分色时带子颜色的不透明度，默认 0.4 */
  schoolAlpha?: number;
  /** 「全部」档里不进齐放的图标亮度，默认 0.35 */
  dimLevel?: number;
  /** 图标怎么出来：弹完（默认，同原版 isReady() 了一下全出来）；盘心移出（原创，第 2 幕张盘，用户 11-11）：一开盘全缩成一小团叠在圆心，
   *  边往外走边放大，那一圈弹完正好落到格上（分圈.ts 的 移出态），圆心图标也从小长到原大。收盘（收刻）不管它 */
  exitIcon?: '弹完' | '盘心移出';
  /** 弹开节奏和转速，没给的项用 默认开合 */
  openClose?: Partial<OpenClose>;
  /** 收盘：开始收后第几刻（原创，第 5 幕；分圈.ts 的 收圈态）。不给 = 不收 */
  closeTick?: number;
  /** 一闪（原创，第 4 幕出手时那一格的法术离手）：聚晶键 → 0～1，带子往暖白提、图标提亮；那一圈弹完才闪 */
  flash?: Readonly<Record<string, number>>;
};

/** 最外圈张开后的外半径（GUI 像素）：摆位置、定缩放用 */
export const wheelOuterRadius = (options: ArrangeOptions = {}) => ringRadius(arrangeWheel(options).cellsPerRing.length - 1, options.ringShape ?? defaultRingShape).outerRadius;
