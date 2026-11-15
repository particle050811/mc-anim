// 6-2-5 编排共用的插值、向量小工具。
import { smoothstep01, lerp, lerpV } from '@engine/core/数学.ts';

export const norm = (vec: number[]) => {
  const len = Math.hypot(...vec) || 1;
  return vec.map((v) => v / len);
};
