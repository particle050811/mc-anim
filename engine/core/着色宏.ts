import type { ShaderMaterial } from 'three';

// GLSL 的 #ifdef 看键是否存在，不看宏的值是否为真。空字符串和 0 都是已定义的宏。
// 只在状态变化时重选着色器程序，重复设置同一状态不应触发 needsUpdate。
export const toggleShaderMacro = (material: Pick<ShaderMaterial, 'defines' | 'needsUpdate'>, macro: string, enable: boolean) => {
  if (Object.hasOwn(material.defines, macro) === enable) return;
  if (enable) material.defines[macro] = '';
  else delete material.defines[macro];
  material.needsUpdate = true;
};
