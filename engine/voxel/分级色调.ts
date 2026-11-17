// 试看 `分级色调`：查体素地形各级色调差用（用户 11-17：「为什么这个色调能够差这么多？左右两侧颜色都不一样了」），没设时画面、着色器源码都不变。
// REMOTION_ANIM_TRIAL='{"分级色调": {...}}'（engine/core/试看.ts），用法和量法见 docs/地形调试.md：
//   定级：定级框 里的区段一律用这一级（不看画面大小），框外照门槛，几何只多这一小块；量各级在同一块地的平均色。
//     定级框 [[[x, z], [x, z]], …] 每个框两个对角（游戏坐标，写 场景: true 按场景坐标）；不给就用各个 区域（调试.tsx）的外接框，两样都没有不定级。
//     用户 11-17 定：不再整帧强制最细一级（「不然要做到什么时候」）
//   真几何：配 --tele 用，挑区段、定级别按望远后的视锥和像素算（默认照原整帧），高倍时那片地落在细级上，配 --truth 就是「该是什么颜色」
//   阴影 false：地形不投影；AO '关'：屏幕 AO 不压地形，'满'：不按距离减弱（关掉 farAo）；并色 false：台阶并色全关
// 落点：定级、真几何在 调试.tsx 包的那层 pickSections 里，阴影经它交给体素世界，AO、并色在 材质.ts。
import { trialParams } from '../core/试看.ts';
import { sectionBounds, sectionKey, type SectionId } from './区段.ts';

type XZ = [number, number];
export type GradeTrial = { '定级'?: number; '定级框'?: XZ[][]; '场景'?: boolean; '真几何'?: boolean; '阴影'?: boolean; AO?: '关' | '满'; '并色'?: boolean };
export const gradeTrial = (): GradeTrial => trialParams<GradeTrial>('分级色调') ?? {};

/** 场景水平范围 x0, y0, x1, y1 */
export type LevelBox = readonly [number, number, number, number];

/**
 * 定级：挑好的名单里，碰到任一个框的区段换成第 level 级，框外不动。在名单上改，不进 pickSections 的细分判断。
 * 比 level 粗的往下拆，拆出来不碰框的子块留在拆到的那一级；比 level 细的并回它在第 level 级的祖先，祖先整块换（连它里面不碰框的部分）。
 * 拆出来的子块不再过视野、最远距离的剔除：框边上多画一点，量平均色只取区域里的像素，不受影响。
 */
export const forceLevel = (list: SectionId[], level: number, boxes: readonly LevelBox[]): SectionId[] => {
  const hits = (q: SectionId) => {
    const [x0, y0, sizeM] = sectionBounds(q);
    return boxes.some((b) => x0 < b[2] && x0 + sizeM > b[0] && y0 < b[3] && y0 + sizeM > b[1]);
  };
  const out: SectionId[] = [];
  const merged = new Set<string>();
  const split = (q: SectionId) => {
    if (q.L <= level || !hits(q)) {
      out.push(q);
      return;
    }
    for (let subJ = 0; subJ < 2; subJ++) for (let subI = 0; subI < 2; subI++) split({ L: q.L - 1, i: q.i * 2 + subI, j: q.j * 2 + subJ });
  };
  for (const q of list) {
    if (q.L >= level) {
      split(q);
      continue;
    }
    const span = 2 ** (level - q.L);
    const ancestor = { L: level, i: Math.floor(q.i / span), j: Math.floor(q.j / span) };
    if (!hits(ancestor)) {
      out.push(q);
      continue;
    }
    const k = sectionKey(ancestor);
    if (merged.has(k)) continue;
    merged.add(k);
    out.push(ancestor);
  }
  return out;
};
