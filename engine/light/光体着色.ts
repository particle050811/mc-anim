// 光体的着色（光体.ts 备数据、光体探针.ts 在显卡上算探针、光体组件.tsx 管）：受光的材质在算灯之前取一下探针，方块原色 × 光 × 强（软封顶）加进自发光。
// 默认关：关着时着色器源码、程序键都和没有光体时一字不差（主世界、暮色画面不变）；世界开了（`useLightVolumeOn`）才把补丁编进去，开关时让登记过的材质重编。
// 体素材质（engine/voxel/材质.ts）自己调 `patchLightVolume`，乘 vCol.a（发光面是 0，不然熔岩、火被自己的光照成粉白）；
// 别的受光材质（人物、模型、方块网格）由光体组件.tsx 每帧扫场景时套上（`wrapLightVolume`），不挑面。三渲二平涂（engine/三渲二/平涂.tsx）不走灯，读 lightVolLit 自己乘。
// 位置：片元的视空间位置经 lightVolView（光体所在组的世界矩阵⁻¹ × 镜头世界矩阵）换到光体坐标（场景坐标），沿法线挪半格取（取到面前那格空气的探针）。
// 探针存两张图（一层的 W × H × D 格平铺成 W 宽、H·D 高，第 z 片在 [zH, zH + H) 行；竖直方向这里自己插值）：
// S = 各方向来的光加起来（rgb，挡光格 0，alpha 是「这格是探针」），V.xyz = 到光源的位移按亮度加权的和，V.w = 来光方向按亮度加权的和的长度（光体探针.ts）。
// 照到面上 = S × ((1 − g)/2 + g × max(0, n·L̂))，g = V.w / 亮度(S)，L̂ 从表面这一点指向「平均光源位置」（取样点 + V.xyz / 亮度(S)）：
// 单个光源（g = 1）就是朗伯 cos，四面八方都有光（g → 0）时各朝向一半。朝向从表面算（不从半格外的探针算）：火旁边的地面按斜照变暗，光斑才是圆的。
// 插值时先按 alpha 归一，挡光格不把墙面拉暗。各层沿法线挪的距离不同，混之前位移都换成相对表面这一点的。
// 三层（光体.ts 的 cascades，粗到细）：在细一层里、离它的水平边超过 lightVolK.z 米就全用细的，往边上渐变到粗一层，最粗一层渐变到 0。
import * as THREE from 'three';
import { useWriter, newWriteSlot } from '../core/写入者.ts';

export const LIGHT_LAYERS = 3;
// 下标 0 最细
export const lightVolumeUniforms = {
  lightVolS0: { value: null as THREE.Texture | null },
  lightVolS1: { value: null as THREE.Texture | null },
  lightVolS2: { value: null as THREE.Texture | null },
  lightVolV0: { value: null as THREE.Texture | null },
  lightVolV1: { value: null as THREE.Texture | null },
  lightVolV2: { value: null as THREE.Texture | null },
  lightVolView: { value: new THREE.Matrix4() },
  lightVolMin: { value: Array.from({ length: LIGHT_LAYERS }, () => new THREE.Vector3()) },
  lightVolSize: { value: Array.from({ length: LIGHT_LAYERS }, () => new THREE.Vector3(1, 1, 1)) },
  lightVolDims: { value: Array.from({ length: LIGHT_LAYERS }, () => new THREE.Vector3(1, 1, 1)) },
  // x 强（0 = 还没建好，不取），y 软封顶，z 渐变米数
  lightVolK: { value: new THREE.Vector3() },
  // 试看方案（光体.ts 的 LightScheme）：x 方案（0 现状、1 原版、2 圆洪水、3 圆影），y 曲线（0 原版、1 BSL、2 Complementary、3 Photon）
  lightVolMode: { value: new THREE.Vector4() },
};

const HEAD = /* glsl */ `
#define LIGHT_VOLUME
uniform sampler2D lightVolS0;
uniform sampler2D lightVolS1;
uniform sampler2D lightVolS2;
uniform sampler2D lightVolV0;
uniform sampler2D lightVolV1;
uniform sampler2D lightVolV2;
uniform mat4 lightVolView;
uniform vec3 lightVolMin[${LIGHT_LAYERS}];
uniform vec3 lightVolSize[${LIGHT_LAYERS}];
uniform vec3 lightVolDims[${LIGHT_LAYERS}];
uniform vec3 lightVolK;
uniform vec4 lightVolMode;
// 光照级 0～1 → 亮度（满级归一到 1）：各光影包的方块光曲线，出处见 光体.ts 的 LightScheme
float lightVolCurve( float x ) {
  x = clamp( x, 0.0, 1.0 );
  if ( lightVolMode.y < 0.5 ) return x / ( 4.0 - 3.0 * x );
  if ( lightVolMode.y < 1.5 ) { float b = 1.6 * pow( x, 10.0 ) + 0.6 * x; return b * b / 4.84; }
  if ( lightVolMode.y < 2.5 ) return pow( 3.5 * pow( x, 8.0 ) + 2.1 * x, 2.25 ) / pow( 5.6, 2.25 );
  return ( pow( x, 8.0 ) + 0.18 * x * x + 0.16 * x * ( 2.0 - x ) + min( 2.7 * pow( x, 12.0 ), 0.9 ) ) / 2.24;
}
// 点 p 在第 k 层里的贴图坐标；w 是离水平边的远近（0 在边上及外面，渐变米数以内往 1 走）
vec3 lightVolUvw( vec3 p, int k, out float w ) {
  vec3 uvw = ( p - lightVolMin[k] ) / lightVolSize[k];
  vec2 edge = min( uvw.xy, 1.0 - uvw.xy ) * lightVolSize[k].xy;
  w = smoothstep( 0.0, lightVolK.z, min( edge.x, edge.y ) );
  return uvw;
}
// 平铺的 3D 图取一点：xy 交给硬件双线性，z 取上下两片自己插
vec4 lightVolFetch( sampler2D t, vec3 uvw, vec3 dims ) {
  float zf = clamp( uvw.z * dims.z - 0.5, 0.0, dims.z - 1.0 );
  float z0 = floor( zf );
  float z1 = min( z0 + 1.0, dims.z - 1.0 );
  float x = clamp( uvw.x, 0.5 / dims.x, 1.0 - 0.5 / dims.x );
  float y = clamp( uvw.y * dims.y, 0.5, dims.y - 0.5 );
  float rows = dims.y * dims.z;
  return mix( texture( t, vec2( x, ( z0 * dims.y + y ) / rows ) ), texture( t, vec2( x, ( z1 * dims.y + y ) / rows ) ), zf - z0 );
}
// 一层的光（S）和来光（V：xyz 相对表面的加权位移，w 方向和的长度），按探针归一；off 是取样点离表面的位移
void lightVolLayer( sampler2D ts, sampler2D tv, vec3 uvw, vec3 dims, vec3 off, out vec3 s, out vec4 v ) {
  vec4 a = lightVolFetch( ts, uvw, dims );
  vec4 b = lightVolFetch( tv, uvw, dims );
  float inv = a.a > 1e-3 ? 1.0 / a.a : 0.0;
  s = a.rgb * inv;
  v = b * inv;
  v.xyz += dot( s, vec3( 0.2126, 0.7152, 0.0722 ) ) * off;
}`;

// gate：GLSL 表达式，乘在光上（体素材质 vCol.a）
const body = (gate: string) => /* glsl */ `
vec3 lightVolLit = vec3( 0.0 );
if ( lightVolK.x > 0.0 ) {
  vec3 lvP = ( lightVolView * vec4( - vViewPosition, 1.0 ) ).xyz;
  vec3 lvN = normalize( mat3( lightVolView ) * normal );
  float w2, w1, w0;
  vec3 u2 = lightVolUvw( lvP + lvN * 2.0, 2, w2 );
  if ( w2 > 0.0 ) {
    vec3 lvS, s;
    vec4 lvV, v;
    lightVolLayer( lightVolS2, lightVolV2, u2, lightVolDims[2], lvN * 2.0, lvS, lvV );
    lvS *= w2;
    lvV *= w2;
    vec3 u1 = lightVolUvw( lvP + lvN * 1.0, 1, w1 );
    if ( w1 > 0.0 ) {
      lightVolLayer( lightVolS1, lightVolV1, u1, lightVolDims[1], lvN * 1.0, s, v );
      lvS = mix( lvS, s, w1 );
      lvV = mix( lvV, v, w1 );
      vec3 u0 = lightVolUvw( lvP + lvN * 0.5, 0, w0 );
      if ( w0 > 0.0 ) {
        lightVolLayer( lightVolS0, lightVolV0, u0, lightVolDims[0], lvN * 0.5, s, v );
        lvS = mix( lvS, s, w0 );
        lvV = mix( lvV, v, w0 );
      }
    }
    float sl = dot( lvS, vec3( 0.2126, 0.7152, 0.0722 ) );
    float g = sl > 1e-6 ? min( 1.0, lvV.w / sl ) : 0.0;
    float vl = length( lvV.xyz );
    float nd = vl > 1e-6 ? max( 0.0, dot( lvN, lvV.xyz / vl ) ) : 0.0;
    if ( lightVolMode.x < 0.5 ) {
      vec3 x = lvS * ( ( 1.0 - g ) * 0.5 + g * nd ) * lightVolK.x;
      lightVolLit = x / ( 1.0 + x / lightVolK.y ) * ( ${gate} );
    } else {
      // 试看方案：S 是 来光色（亮度 1）× 级；原版、圆洪水不看朝向，圆影按 0.6 + 0.4 cos
      float lv = max( sl, 1e-6 );
      float face = lightVolMode.x > 2.5 ? 0.6 + 0.4 * nd : 1.0;
      lightVolLit = lvS / lv * lightVolCurve( sl ) * face * lightVolK.x * ( ${gate} );
    }
    totalEmissiveRadiance += diffuseColor.rgb * lightVolLit;
  }
}
#include <lights_fragment_begin>`;

// 开着没有：编着色器时看（程序键跟着变，开关时重编登记过的材质）
let on = false;
export const lightVolumeOn = () => on;
/** 程序键后缀：关着是空串（键和没有光体时一样） */
export const lightVolumeKey = () => (on ? '|光体' : '');

const MARK = '#define LIGHT_VOLUME';
/** onBeforeCompile 里调（只在开着时）：挂共用 uniform、片元里加光。已经加过的不重加（平涂、防暗这类派生材质会先跑原材质的 onBeforeCompile） */
export const patchLightVolume = (sh: THREE.WebGLProgramParametersWithUniforms, gate = '1.0') => {
  if (sh.fragmentShader.includes(MARK)) return;
  Object.assign(sh.uniforms, lightVolumeUniforms);
  const before = sh.fragmentShader;
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${HEAD}`).replace('#include <lights_fragment_begin>', body(gate));
  if (sh.fragmentShader === before || !sh.fragmentShader.includes('lightVolView *')) throw new Error('光体：材质的着色器里没有 common、lights_fragment_begin，接不上');
};

// 登记过的材质（开关时要重编）：体素材质自己登记，别的由 wrapLightVolume 登记
const registered = new Set<THREE.Material>();
export const registerLightVolumeMaterial = (m: THREE.Material) => {
  registered.add(m);
};

const wrapped = new WeakSet<THREE.Material>();
/** 受光的 three 自带材质套上光体：onBeforeCompile 先跑原来的再加光，程序键加后缀；关着时和原来一模一样。返回这次是不是新套的 */
export const wrapLightVolume = (m: THREE.Material): boolean => {
  if (wrapped.has(m) || registered.has(m)) return false;
  const lit = (m as THREE.MeshStandardMaterial).isMeshStandardMaterial || (m as THREE.MeshLambertMaterial).isMeshLambertMaterial || (m as THREE.MeshPhongMaterial).isMeshPhongMaterial || (m as THREE.MeshToonMaterial).isMeshToonMaterial;
  if (!lit || m.userData.noLightVolume) return false;
  wrapped.add(m);
  const before = m.onBeforeCompile;
  const keyOf = m.customProgramCacheKey;
  // three 默认的程序键是 onBeforeCompile 的源码：套了以后源码变了，要先按原来的取
  const baseKey = keyOf === THREE.Material.prototype.customProgramCacheKey ? () => before.toString() : () => keyOf.call(m);
  m.onBeforeCompile = (sh, r) => {
    before.call(m, sh, r);
    if (on) patchLightVolume(sh);
  };
  m.customProgramCacheKey = () => baseKey() + lightVolumeKey();
  registered.add(m);
  if (on) m.needsUpdate = true;
  return true;
};

const setOn = (v: boolean) => {
  if (on === v) return;
  on = v;
  for (const m of registered) m.needsUpdate = true;
};
const slot = newWriteSlot();
const turnOff = () => {
  setOn(false);
  lightVolumeUniforms.lightVolK.value.x = 0;
};
/** 光体组件里调：这一帧开不开光体（卸下时关） */
export const useLightVolumeOn = (v: boolean) => {
  useWriter(slot, turnOff);
  setOn(v);
  if (!v) lightVolumeUniforms.lightVolK.value.x = 0;
};
