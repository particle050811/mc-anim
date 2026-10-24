// 2-收集快乐 的照片：第几帧手里是哪一张、在哪、多大、在升还是举还是落。纯模块（编排.ts 和测试都引），时刻取 分镜.ts 的正片事件，分寸取 第8句参数.ts。
import { clamp01 } from '@engine/anim/anim.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { 段内正片事件帧 } from '../../分镜.ts';
import * as 参 from '../../场/2-门口/第8句参数.ts';
import type { 照片源 } from '../../特效/照片图.ts';
import { 第8句照片们 } from '../../特效/照片画.ts';

const 事 = 段内正片事件帧('2-收集快乐');
const 插 = (a: number, b: number, t: number) => a + (b - a) * t;
const 插3 = (a: readonly number[], b: readonly number[], t: number): V3 => [插(a[0]!, b[0]!, t), 插(a[1]!, b[1]!, t), 插(a[2]!, b[2]!, t)];
const 缓入 = (t: number) => t * t;
const 缓出 = (t: number) => 1 - (1 - t) ** 2;

/** 收进箱子的四张（三稿顺序）。现在是 照片画.ts 的占位像素画；第 3、4、5、7 句做出来以后，换成那几句渲出来的真帧
 *  （藏起界面、不带歌词，16:9，缩成 64 的倍数宽登记成资产：{ 名, 图: png(import 'asset:…') }，见 特效/照片图.ts） */
export const 第8句照片: readonly 照片源[] = 第8句照片们;
const 拍们 = [事.收照片一, 事.收照片二, 事.收照片三, 事.收照片四];
/** 第 i 张开始往下落（还是满尺寸）的那一帧、不见了的那一帧 */
const 开落 = (i: number) => 拍们[i]! - 参.照片落拍前帧;
const 不见 = (i: number) => 开落(i) + 参.照片落帧;
/** 第 i 张在她手里出现的那一帧：上一张不见的那一帧；第一张开场就举着 */
const 出现 = (i: number) => (i === 0 ? -Infinity : 不见(i - 1));
/** 四张都放完、她右手空了的那一帧 */
export const 放完 = 不见(拍们.length - 1);

/** 阶段里的进度 t：升、落 从 0 到 1，举 恒为 1 */
export type 照片态 = { 源: 照片源; 底: V3; 缩放: number; 阶段: '升' | '举' | '落'; t: number };
export const 照片态 = (f: number): 照片态 | null => {
  for (let i = 0; i < 拍们.length; i++) {
    if (f < 出现(i) || f >= 不见(i)) continue;
    const 源 = 第8句照片[i]!;
    if (f >= 开落(i)) {
      // 往里（y）先走、往下（z）后走：照片先退到箱子口后面，再往下沉进去，被箱子前面的板挡住
      const t = (f - 开落(i)) / 参.照片落帧;
      const y = 插(参.照片举位[1], 参.照片落位[1], 缓出(t));
      const z = 插(参.照片举位[2], 参.照片落位[2], 缓入(t));
      return { 源, 底: [插(参.照片举位[0], 参.照片落位[0], t), y, z], 缩放: 插(参.照片举缩放, 参.照片落缩放, t), 阶段: '落', t };
    }
    const t = clamp01((f - 出现(i)) / 参.照片举帧);
    if (t < 1) return { 源, 底: 插3(参.照片出位, 参.照片举位, 缓出(t)), 缩放: 插(参.照片出缩放, 参.照片举缩放, 缓出(t)), 阶段: '升', t };
    return { 源, 底: [...参.照片举位] as V3, 缩放: 参.照片举缩放, 阶段: '举', t: 1 };
  }
  return null;
};
