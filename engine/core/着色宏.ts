import type { ShaderMaterial } from 'three';

// GLSL 的 #ifdef 看键是否存在，不看宏的值是否为真。空字符串和 0 都是已定义的宏。
// 只在状态变化时重选着色器程序，重复设置同一状态不应触发 needsUpdate。
export const 切换着色宏 = (材质: Pick<ShaderMaterial, 'defines' | 'needsUpdate'>, 宏: string, 开启: boolean) => {
  if (Object.hasOwn(材质.defines, 宏) === 开启) return;
  if (开启) 材质.defines[宏] = '';
  else delete 材质.defines[宏];
  材质.needsUpdate = true;
};
