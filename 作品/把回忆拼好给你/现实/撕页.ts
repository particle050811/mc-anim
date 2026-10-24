// 撕页倒计时和笔筒的进度（纯函数，段.ts 也能读）。翻页值是连续的：整数 k = 停在 页们[k]，k + p（0<p<1）= 正从 页们[k] 撕到 页们[k+1]。
// 一次撕掉的不止一张（100 → 62 是 38 天）：最多飞走 3 张，错开起飞，飞走的纸上印着中间的天数，底下露出来的那张跟着变，最后停在 页们[k+1]。
// 三稿第 13 句：100→62→31→7→1 依次落在五拍上，笔筒里的空笔芯每翻一页满一截。
import { clamp01 } from '@engine/anim/anim.ts';

export const 默认页们: readonly number[] = [100, 62, 31, 7, 1];

/** 一次最多飞走几张、相邻两张起飞错开多少（占一次撕页的比例）。Agent 暂定：三张读得出「一下撕了好多天」，再多就糊成一团 */
export const 每次最多飞 = 3;
export const 起飞错开 = 0.18;

export type 飞纸 = { 数: number; t: number };
export type 撕页态 = {
  /** 本子最上面那张（没在飞的）印的天数，也是剩下的页数（算厚度用） */
  顶: number;
  /** 正在飞走的纸，先起飞的在前；t 是这张自己的进度 0～1 */
  飞: 飞纸[];
};

const 夹 = (翻页: number, 页们: readonly number[]) => Math.min(页们.length - 1, Math.max(0, 翻页));

export const 算撕页态 = (翻页: number, 页们: readonly number[] = 默认页们): 撕页态 => {
  if (页们.length === 0) throw new Error('撕页本至少要有一页');
  const v = 夹(翻页, 页们);
  const k = Math.floor(v);
  const p = v - k;
  if (p === 0 || k >= 页们.length - 1) return { 顶: 页们[k]!, 飞: [] };
  const 从 = 页们[k]!;
  const 到 = 页们[k + 1]!;
  const m = Math.max(1, Math.min(每次最多飞, 从 - 到));
  const 错开 = m > 1 ? 起飞错开 : 0;
  const 时长 = 1 - (m - 1) * 错开; // 最后一张正好在 p = 1 飞完
  const 印 = (j: number) => 从 - Math.round((j * (从 - 到)) / m);
  const 飞: 飞纸[] = [];
  let 起飞了 = 0;
  for (let j = 0; j < m; j++) {
    const t = (p - j * 错开) / 时长;
    if (t <= 0) break;
    起飞了 = j + 1;
    if (t < 1) 飞.push({ 数: 印(j), t });
  }
  return { 顶: 起飞了 < m ? 印(起飞了) : 到, 飞 };
};

/** 第 f 帧的翻页值：落帧们[k] 是 页们[k] 完全露出来的那一帧，从 页们[k−1] 撕过来用 撕帧数 帧，正好撕完在落帧上（页们[0] 不撕，一开始就在） */
export const 翻页值 = (f: number, 落帧们: readonly number[], 撕帧数: number): number => {
  if (!(撕帧数 > 0)) throw new Error(`撕帧数要大于 0：${撕帧数}`);
  let v = 0;
  for (let k = 1; k < 落帧们.length; k++) {
    if (落帧们[k]! - 撕帧数 < 落帧们[k - 1]!) throw new Error(`第 ${k} 页的撕页窗口和上一页的落帧重叠了：落帧 ${落帧们[k - 1]}、${落帧们[k]}，撕 ${撕帧数} 帧`);
    v += clamp01((f - 落帧们[k]! + 撕帧数) / 撕帧数);
  }
  return v;
};

/** 笔筒里满了是多少根、第一页时已经有几根（高三上学期攒下的）、每翻一页加几根。Agent 暂定：
 *  笔芯是 16×16 的物品像素（照原版木棍），30 宽的玻璃筒里放十几根还一根根分得清，再多就糊成一团白。
 *  停在整数页上根数是整数，笔筒里就没有悬在半空的那根；撕页的过程中一根一根落进去 */
export const 笔芯满根 = 16;
export const 笔芯起根 = 3;
export const 每页笔芯 = 3;

/** 笔筒满度 0～1（= 根数 / 笔芯满根）：跟着翻页一截一截涨，翻到最后一页快满 */
export const 笔筒满度 = (翻页: number, 页数: number = 默认页们.length): number =>
  Math.min(1, (笔芯起根 + 每页笔芯 * Math.min(Math.max(0, 翻页), Math.max(0, 页数 - 1))) / 笔芯满根);

/** 撕页本的尺寸（贴图像素，撕页本.tsx 按它搭）。宽 64：「100天」大字放得下；装订 6 高、8 深；纸叠 2～7 深（剩 1 页到剩满第一页），翻角 = 手捏着时右下角翻起多大。Agent 暂定 */
export const 撕页本尺寸 = { 宽: 64, 高: 52, 装订高: 6, 装订深: 8, 纸最薄: 2, 纸最厚: 7, 翻角: 8 } as const;

/** 剩 顶 页时纸叠多厚（整贴图像素），满 = 第一页的天数。纸叠贴着装订的后边，越撕越薄，正面往里退 */
export const 纸厚 = (顶: number, 满: number = 默认页们[0]!) => {
  const S = 撕页本尺寸;
  return Math.round(S.纸最薄 + (S.纸最厚 - S.纸最薄) * Math.min(1, Math.max(0, 顶 / Math.max(1, 满))));
};

/** 最上面那页的右下角（手捏的地方）：相对撕页本原点（装订正面的左下前角）的贴图像素 [x, y, z]，y 是纸面所在的深 */
export const 撕页本角 = (顶: number, 满: number = 默认页们[0]!) => [撕页本尺寸.宽, 撕页本尺寸.装订深 - 纸厚(顶, 满), 0] as const;

/** 一页上字怎么排（贴图像素，原点是页面左上角，页面 = 撕页本尺寸 宽 × (高 − 装订高)）：小字「距高考还有」一行（游戏像素字，汉字 8 高、步进 9），
 *  下面大数字放大 3 倍（原版位图数字 5×7、步进 6），「天」跟在数字右边、底对齐。数字和「天」作为一组水平居中 */
export const 页版式 = (数: number) => {
  const 宽 = 撕页本尺寸.宽;
  const 倍 = 3;
  const 数宽 = (String(数).length * 6 - 1) * 倍;
  const x = Math.floor((宽 - (数宽 + 2 + 8)) / 2);
  const y = 17;
  return { 小字y: 4, 大字倍: 倍, 数: { x, y, 宽: 数宽, 高: 7 * 倍 }, 天: { x: x + 数宽 + 2, y: y + 7 * 倍 - 8, 宽: 8, 高: 8 } };
};

