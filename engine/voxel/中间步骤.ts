// 屏幕AO（屏幕AO.tsx）第 2 遍和第 3 遍之间插进来的步骤（Photon 的云：lib/大气/云.ts 的 `PhotonClouds`）。单放一个文件：云.ts 和 屏幕AO.tsx 互相要用，放在任一边都成环。
// 按画布（renderer）登记，挂了 <屏幕AO /> 的画布每帧按 `order` 调一遍；没登记时什么都不做。
// `afterWater` 返回真的，挪到第 3 遍里水面（材质 userData.水面）之后、别的半透明之前画：半透明的云叠在水上（不然云边不到一半不透明的地方被水盖掉）
// 步骤拿到第 1 遍的深度（天空是 1.0）、画布实际像素和雾，画到 `target`（画布）上，画完把渲染目标设回 `target`。
import type * as THREE from 'three';

export type MidPassContext = {
  gl: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  depth: THREE.DepthTexture;
  width: number;
  height: number;
  target: THREE.WebGLRenderTarget | null;
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
