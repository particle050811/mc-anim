// 段.ts 的形状：纯数据（pipeline 直接 import，闭包里不许有 react、three、remotion），画面.tsx 负责画。
// 宽高是 Composition 的页面尺寸，成片 2K 靠渲染时 scale 2（旧项目 渲染级别.ts：改宽高会让体素世界换细一级，所以不改宽高）。
export type 段定义 = {
  /** 所属场键（核对段写 核对） */
  场: string;
  帧数: number;
  fps: number;
  宽: number;
  高: number;
  /** 用到的地形区段包名（assets/地形版本.json 里登记的），版本进指纹 */
  地形: readonly string[];
};

export const 定义段 = (d: 段定义): 段定义 => {
  if (!Number.isInteger(d.帧数) || d.帧数 <= 0) throw new Error(`段的帧数要是正整数：${d.帧数}`);
  return d;
};
