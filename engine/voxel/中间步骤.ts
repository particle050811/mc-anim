// 屏幕AO（屏幕AO.tsx）第 2 遍和第 3 遍之间插进来的步骤（Photon 的云：lib/大气/云.ts 的 `PhotonClouds`）。单放一个文件：云.ts 和 屏幕AO.tsx 互相要用，放在任一边都成环。
// 按画布（renderer）登记，挂了 <屏幕AO /> 的画布每帧按 `order` 调一遍；没登记时什么都不做。
// `afterWater` 返回真的，挪到第 3 遍里水面（材质 userData.水面）之后、别的半透明之前画：半透明的云叠在水上（不然云边不到一半不透明的地方被水盖掉）
// 步骤拿到第 1 遍的深度（对数深度，天空是 1.0；第 1 遍用光栅深度时是换算出来的单通道浮点图，取 .r 一样）、画布实际像素和雾，画到 `target` 上，画完把渲染目标设回 `target`。
// `target` 一般是画布；三遍都在离屏图里画时（屏幕AO.tsx 文件头「三遍离屏」）是那张多重采样的离屏图，这时给 `reversed`：
// `target` 的深度缓冲是反向深度（深度 = a ÷ 纵深 − b，大的近），要写深度的步骤照这个写、照这个比（逐采样点）。读的 `depth` 不变，还是对数深度。
// 画布上在屏幕 AO 之后还要拿场景深度比的（库/物品/拔刀剑泛光.tsx）用 `needSceneDepth` 登记：三遍离屏时画布的深度默认不写。
import type * as THREE from 'three';

export type MidPassContext = {
  gl: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  depth: THREE.Texture;
  width: number;
  height: number;
  target: THREE.WebGLRenderTarget | null;
  reversed?: { a: number; b: number };
  // 第 2 遍的雾参数（和材质里的雾同一个公式）：类型 0 没有、1 线性、2 指数平方；参数 = 近、远、浓度；色是画面数值；高度 = lib/高度雾.ts 的 起点、半衰、浓度
  fog: { type: number; params: THREE.Vector3; color: THREE.Color; height: { x: number; y: number; z: number } };
};
export type MidPass = { order: number; draw: (ctx: MidPassContext) => void; afterWater?: () => boolean };
const registry = new WeakMap<THREE.WebGLRenderer, Set<MidPass>>();
export const registerMidPass = (gl: THREE.WebGLRenderer, pass: MidPass) => {
  let set = registry.get(gl);
  if (!set) registry.set(gl, (set = new Set()));
  set.add(pass);
  return () => {
    set.delete(pass);
  };
};
export const midPassesOf = (gl: THREE.WebGLRenderer): Iterable<MidPass> => registry.get(gl) ?? [];

const sceneDepthUsers = new WeakMap<THREE.WebGLRenderer, number>();
/** 登记「这块画布在屏幕 AO 之后要用目标里的场景深度」，返回注销函数 */
export const needSceneDepth = (gl: THREE.WebGLRenderer) => {
  sceneDepthUsers.set(gl, (sceneDepthUsers.get(gl) ?? 0) + 1);
  return () => {
    sceneDepthUsers.set(gl, (sceneDepthUsers.get(gl) ?? 1) - 1);
  };
};
export const sceneDepthNeeded = (gl: THREE.WebGLRenderer) => (sceneDepthUsers.get(gl) ?? 0) > 0;
