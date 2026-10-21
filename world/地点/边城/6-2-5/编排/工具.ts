// 6-2-5 编排共用的插值、向量小工具。
export const ss = (x: number) => { const clamped = Math.min(1, Math.max(0, x)); return clamped * clamped * (3 - 2 * clamped); };
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const lerp3 = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
export const norm = (vec: number[]) => {
  const len = Math.hypot(...vec) || 1;
  return vec.map((v) => v / len);
};
