// 第 4 句的海：一整片原版水面，从镜头脚下一直铺到视距，远处那一圈分档淡进雾色（天色.ts 的 地平色），再往外是天（天.tsx 画在三维画布后面）。
// 照原版：贴图 water_still（贴图/场景/边城/水面，原版 1.20.1 jar 里的那张，16×512 竖排 32 帧，每 2 刻换一帧、不插值），乘海洋群系水色；
// 贴图自带透明度 180/255，原版是半透明画在海底上，这里把海底当成一个暗色直接混进去、整片不透明：不透明才写深度，
// 船身在水下的那截被挡住（半透明不写深度，船底会透出来）。
// 不做反光、菲涅尔、波浪起伏（五家评审 10-24 说 CG 反光不像 MC）。船舱那一块挖掉（原版 water_patch 只写深度、挡掉船里的水，同一个意思）。
// 颜色在 sRGB 数值上乘（同 平涂.tsx），色调自己乘：平涂把 MeshBasicMaterial 当不受光的、不乘色调。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { V3 } from '@engine/model/parts.tsx';
import { png } from '@engine/model/贴图.ts';
import { 船数 } from '@库/物品/船原版.ts';
import { 水色, 海底色, 视距, 雾档数 } from './参数.ts';
import { 地平色表 } from './天色.ts';
import stillUri from 'asset:贴图/场景/边城/水面';

/** 原版 water_still.png.mcmeta：frametime 2 */
const 每帧刻 = 2;

let 帧们: THREE.DataTexture[] | null = null;
const 水帧们 = () => {
  if (帧们) return 帧们;
  const strip = png(stillUri);
  const n = strip.w;
  帧们 = Array.from({ length: strip.h / n }, (_, k) => {
    const tex = new THREE.DataTexture(strip.px.slice(k * n * n * 4, (k + 1) * n * n * 4), n, n, THREE.RGBAFormat);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.flipY = false;
    tex.needsUpdate = true;
    return tex;
  });
  return 帧们;
};

const 雾表 = () => {
  const tex = new THREE.DataTexture(地平色表(), 181, 1, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace; // 字节原样是 sRGB 数值
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
};

const sRGB数 = (hex: string) => new THREE.Color().setStyle(hex, THREE.LinearSRGBColorSpace);

// 平涂派生的材质也跑同一个 onBeforeCompile，统一量是这一份对象，改一次全跟着变
const 统一量 = {
  seaTex: { value: null as THREE.Texture | null },
  seaFog: { value: null as THREE.Texture | null },
  seaWater: { value: sRGB数(水色) },
  seaDeep: { value: sRGB数(海底色) },
  seaTint: { value: new THREE.Color(1, 1, 1) },
  seaBoat: { value: new THREE.Vector4(0, 0, 1, 0) },
  seaHole: { value: new THREE.Vector2(船数.船舱.横, 船数.船舱.纵) },
  seaFar: { value: 视距 },
  seaBands: { value: 雾档数 },
};

// three 的世界 Y 朝上（场景 Z 朝上的 group 转过来）：场景 x = W.x、y = −W.z
const 片元头 = /* glsl */ `
uniform sampler2D seaTex;
uniform sampler2D seaFog;
uniform vec3 seaWater;
uniform vec3 seaDeep;
uniform vec3 seaTint;
uniform vec4 seaBoat;
uniform vec2 seaHole;
uniform float seaFar;
uniform float seaBands;
varying vec3 vSeaW;
`;
const 挖 = /* glsl */ `
vec2 seaP = vec2( vSeaW.x, - vSeaW.z );
vec2 seaD = seaP - vec2( cameraPosition.x, - cameraPosition.z );
float seaDist = length( seaD );
if ( seaDist > seaFar ) discard;
vec2 seaB = seaP - seaBoat.xy;
vec2 seaL = vec2( seaBoat.z * seaB.x + seaBoat.w * seaB.y, - seaBoat.w * seaB.x + seaBoat.z * seaB.y );
if ( abs( seaL.x ) < seaHole.x && abs( seaL.y ) < seaHole.y ) discard;
`;
// 雾：原版 FogRenderer 从 视距 − clamp(视距/10, 4, 64) 起淡，到视距全是雾色；这里分 seaBands 档，最后一档之外是天。雾色按方位差查表（太阳在正西，−x）
const 着色 = /* glsl */ `
vec4 seaT = texture2D( seaTex, vec2( seaP.x, - seaP.y ) );
vec3 seaC = mix( seaDeep, sRGBTransferOETF( vec4( seaT.rgb, 1.0 ) ).rgb * seaWater, seaT.a ) * seaTint;
float seaStart = seaFar - clamp( seaFar / 10.0, 4.0, 64.0 );
float seaF = ceil( clamp( ( seaDist - seaStart ) / ( seaFar - seaStart ), 0.0, 1.0 ) * seaBands ) / ( seaBands + 1.0 );
float seaDiff = abs( mod( atan( seaD.y, - seaD.x ) + 3.14159265, 6.28318531 ) - 3.14159265 ) * 57.2957795;
vec3 seaFogC = texture2D( seaFog, vec2( ( floor( seaDiff + 0.5 ) + 0.5 ) / 181.0, 0.5 ) ).rgb;
outgoingLight = sRGBTransferEOTF( vec4( mix( seaC, seaFogC, seaF ), 1.0 ) ).rgb;
diffuseColor.a = 1.0;
`;

let 材质: THREE.MeshBasicMaterial | null = null;
const 海材质 = () => {
  if (材质) return 材质;
  const m = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, 统一量);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSeaW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvSeaW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${片元头}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${挖}`)
      .replace('#include <opaque_fragment>', `${着色}\n#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => '把回忆拼好给你-日落海面';
  统一量.seaFog.value = 雾表();
  材质 = m;
  return m;
};

export type 海面属性 = {
  /** 镜头的眼（场景坐标）：水面以它为中心铺 */
  眼: V3;
  /** 船实体的位置和朝向（度）：船舱那块挖掉 */
  船: { loc: V3; yaw: number };
  /** 游戏时间（秒）：贴图动画按它换帧 */
  秒: number;
  /** 色调（sRGB），乘在水上 */
  色调: string;
};

/** 放在三渲二画布里（场景坐标），水面在 z = 0 */
export const 海面: React.FC<海面属性> = ({ 眼, 船, 秒, 色调 }) => {
  const geo = useMemo(() => new THREE.PlaneGeometry((视距 + 4) * 2, (视距 + 4) * 2), []);
  const m = 海材质();
  const 帧 = 水帧们();
  统一量.seaTex.value = 帧[Math.floor((秒 * 20) / 每帧刻) % 帧.length]!;
  统一量.seaTint.value.setStyle(色调, THREE.LinearSRGBColorSpace);
  const a = (船.yaw * Math.PI) / 180;
  统一量.seaBoat.value.set(船.loc[0], 船.loc[1], Math.cos(a), Math.sin(a));
  return <mesh geometry={geo} material={m} position={[眼[0], 眼[1], 0]} />;
};
