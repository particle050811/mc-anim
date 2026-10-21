// 树叶透光（用户 10-13 要光影方面不严重影响性能的先做）：逆光看树冠时，叶子背光的那一面透出一点主光的暖色（光影包里 subsurface / foliage translucency 的克制版）。
// 导出网格（lib/方块网格.tsx 的镂空层）和体素世界（lib/体素/材质.ts 的镂空、实心树叶）共用这一段，两条方块管线的树叶一个样。
// 做法：给这几种材质换一个 `RE_Direct`（three 每盏直射光调一次），在原来的漫反射、高光之外，光从这一面背后照过来时加一项透光 = 主光颜色（投影后的和没投影的按 7:3 混，见着色器）× 叶子颜色 × 强度 × 背光程度 × (0.3 + 0.7 × 迎着太阳看的程度⁴)，
// 迎着太阳看时最亮（树冠边上一圈暖亮），侧着看只剩三成。天光、环境光不透（它们本来就从四面来）。
// 强度 0.25：叶子背面最多亮到正面受光的四分之一上下（要克制）；0.35 在 6-1-2 逆光帧会让整面树墙一片黄绿。
// 判叶：GLSL 布尔表达式。镂空层里还有玻璃、铁栏杆这类不染色的，叶子按群系染成绿色（顶点色饱和），所以按顶点色认
import type * as THREE from 'three';
import { 渲染输入 } from '../core/渲染设置.ts';

// 比改前改后：--props='{"树叶透光":false}' 关掉
const translucencyOff = (渲染输入() as { 树叶透光?: boolean }).树叶透光 === false;

export const translucencyStrength = 0.25;

const leafLightGlsl = /* glsl */ `
bool leafIs;
void RE_Direct_Leaf( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
  RE_Direct_Physical( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
  if ( !leafIs ) return;
  float back = saturate( - dot( geometryNormal, directLight.direction ) );
  float toward = saturate( dot( - geometryViewDir, directLight.direction ) );
  toward *= toward;
  // 透过来的光：传进来的主光已经乘过投影，而叶子背光那面在树冠自己的影子里（阴影图里存的正是它），几乎总是 0。
  // 光影包按阴影图里的厚度衰减；这里简单些：没投影的主光颜色和投影后的按 3:7 混（树冠里层也透一点，外层透得多）
  vec3 lit = directLight.color;
  #if NUM_SUN_LIGHTS > 0
    if ( distance( directLight.direction, sunLights[ 0 ].direction ) < 1e-4 ) lit = mix( directLight.color, sunLights[ 0 ].color, 0.3 );
  #endif
  reflectedLight.directDiffuse += lit * material.diffuseColor * ( ${translucencyStrength.toFixed(3)} * back * ( 0.3 + 0.7 * toward * toward ) );
}
#undef RE_Direct
#define RE_Direct RE_Direct_Leaf
`;

// 判叶：片元里的布尔表达式（在 lights_fragment_begin 之前求值）
export const patchLeafShader = (shader: THREE.WebGLProgramParametersWithUniforms, isLeafExpr: string) => {
  if (translucencyOff) return;
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>\n${leafLightGlsl}`)
    .replace('#include <lights_fragment_begin>', `leafIs = ${isLeafExpr};\n#include <lights_fragment_begin>`);
};

// 顶点色（rgb）饱和就算染过色的叶子：最大、最小通道之差超过最大通道的 15%
export const tintedLeafExpr = (c: string) => `((max(${c}.r, max(${c}.g, ${c}.b)) - min(${c}.r, min(${c}.g, ${c}.b))) > 0.15 * max(${c}.r, max(${c}.g, ${c}.b)))`;
