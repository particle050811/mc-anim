// 6-3-2 思索：段内秒 → 下坠全局秒 T、思索场景时间 t、整层不透明度。整层盖满（不透明度 1）时底下的世界画面不画（思索.tsx 的 PonderSegment，地形视图照它挂不挂地形）
import { segTable } from '../6-3-下坠/时间线.ts';
import * as choreo from './编排.ts';
import { uiOpen } from './台词.ts';
import { ponderLayerOpacity } from './转场.ts';

export const ponderLayerAt = (sec: number) => {
  const T = segTable['6-3-2'].start + sec;
  const t = sec - uiOpen; // 开界面以前是负的
  // 开界面时淡入盖住扫帚，6-3-3 开头淡掉露出真的俯冲
  const layerOpacity = T > 0 ? ponderLayerOpacity(T) : t < choreo.cues.close[0] ? choreo.uiOpacityAt(t) : 1;
  return { T, t, layerOpacity };
};
