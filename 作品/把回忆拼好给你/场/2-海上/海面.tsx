// 第 4 句的海：一整片原版水面，从镜头脚下一直铺到视距，远处那一圈分档淡进雾色（天色.ts 的 地平色），再往外是天（天.tsx 画在三维画布后面）。
// 照原版：贴图 water_still（贴图/场景/边城/水面，原版 1.20.1 jar 里的那张，16×512 竖排 32 帧，每 2 刻换一帧、不插值），乘海洋群系水色；
// 贴图自带透明度 180/255，原版是半透明画在海底上，这里把海底当成一个颜色直接混进去、整片不透明：不透明才写深度，
// 船身在水下的那截被挡住（半透明不写深度，船底会透出来）。
// 水上再盖一张按屏幕块算的图（光路.ts：远处分档往地平色靠、太阳底下的光路），着色器按片元在屏幕上的位置取，船和人照样挡住它。
// 不做反光、菲涅尔、波浪起伏（五家评审 10-24 说 CG 反光不像 MC）。船舱那一块挖掉（原版 water_patch 只写深度、挡掉船里的水，同一个意思）。
// 颜色在 sRGB 数值上乘（同 平涂.tsx），色调自己乘：平涂把 MeshBasicMaterial 当不受光的、不乘色调。光路、远档的颜色不乘色调（同天和太阳）。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { V3 } from '@engine/model/parts.tsx';
import { png } from '@engine/model/贴图.ts';
import { filmScale } from '@engine/三渲二/像素.ts';
import { boatParams } from '@库/物品/船原版.ts';
import { waterColor, seaBlockSize, seabedColor, viewDistance, fogTierCount } from './参数.ts';
import type { Perspective } from './编排.ts';
import { seaPattern } from './光路.ts';
import { horizonColorTable } from './天色.ts';
import stillUri from 'asset:贴图/场景/边城/水面';

/** 原版 water_still.png.mcmeta：frametime 2 */
const ticksPerFrame = 2;

let frameTextures: THREE.DataTexture[] | null = null;
const waterFrames = () => {
  if (frameTextures) return frameTextures;
  const strip = png(stillUri);
  const n = strip.w;
  frameTextures = Array.from({ length: strip.h / n }, (_, k) => {
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
  return frameTextures;
};

const fogTable = () => {
  const tex = new THREE.DataTexture(horizonColorTable(), 181, 1, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace; // 字节原样是 sRGB 数值
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
};

const srgbColor = (hex: string) => new THREE.Color().setStyle(hex, THREE.LinearSRGBColorSpace);

// 平涂派生的材质也跑同一个 onBeforeCompile，统一量是这一份对象，改一次全跟着变
const uniforms = {
  seaTex: { value: null as THREE.Texture | null },
  seaFog: { value: null as THREE.Texture | null },
  seaWater: { value: srgbColor(waterColor) },
  seaDeep: { value: srgbColor(seabedColor) },
  seaTint: { value: new THREE.Color(1, 1, 1) },
  seaBoat: { value: new THREE.Vector4(0, 0, 1, 0) },
  seaHole: { value: new THREE.Vector2(boatParams.cabinHole.xFrac, boatParams.cabinHole.vertical) },
  seaFar: { value: viewDistance },
  seaBands: { value: fogTierCount },
  seaPat: { value: null as THREE.Texture | null },
};

// three 的世界 Y 朝上（场景 Z 朝上的 group 转过来）：场景 x = W.x、y = −W.z
const fragmentHead = /* glsl */ `
uniform sampler2D seaTex;
uniform sampler2D seaFog;
uniform vec3 seaWater;
uniform vec3 seaDeep;
uniform vec3 seaTint;
uniform vec4 seaBoat;
uniform vec2 seaHole;
uniform float seaFar;
uniform float seaBands;
uniform sampler2D seaPat;
varying vec3 vSeaW;
varying vec4 vSeaClip;
`;
const holeShader = /* glsl */ `
vec2 seaP = vec2( vSeaW.x, - vSeaW.z );
vec2 seaD = seaP - vec2( cameraPosition.x, - cameraPosition.z );
float seaDist = length( seaD );
if ( seaDist > seaFar ) discard;
vec2 seaB = seaP - seaBoat.xy;
vec2 seaL = vec2( seaBoat.z * seaB.x + seaBoat.w * seaB.y, - seaBoat.w * seaB.x + seaBoat.z * seaB.y );
if ( abs( seaL.x ) < seaHole.x && abs( seaL.y ) < seaHole.y ) discard;
`;
// 雾：原版 FogRenderer 从 视距 − clamp(视距/10, 4, 64) 起淡，到视距全是雾色；这里分 seaBands 档，最后一档之外是天。雾色按方位差查表（太阳在正西，−x）
const shadeChunk = /* glsl */ `
vec4 seaT = texture2D( seaTex, vec2( seaP.x, - seaP.y ) );
vec3 seaC = mix( seaDeep, sRGBTransferOETF( vec4( seaT.rgb, 1.0 ) ).rgb * seaWater, seaT.a ) * seaTint;
float seaStart = seaFar - clamp( seaFar / 10.0, 4.0, 64.0 );
float seaF = ceil( clamp( ( seaDist - seaStart ) / ( seaFar - seaStart ), 0.0, 1.0 ) * seaBands ) / ( seaBands + 1.0 );
float seaDiff = abs( mod( atan( seaD.y, - seaD.x ) + 3.14159265, 6.28318531 ) - 3.14159265 ) * 57.2957795;
vec3 seaFogC = texture2D( seaFog, vec2( ( floor( seaDiff + 0.5 ) + 0.5 ) / 181.0, 0.5 ) ).rgb;
vec2 seaUV = vSeaClip.xy / vSeaClip.w * 0.5 + 0.5;
vec4 seaPatC = texture2D( seaPat, vec2( seaUV.x, 1.0 - seaUV.y ) );
seaC = mix( seaC, seaPatC.rgb, seaPatC.a );
outgoingLight = sRGBTransferEOTF( vec4( mix( seaC, seaFogC, seaF ), 1.0 ) ).rgb;
diffuseColor.a = 1.0;
`;

let cachedMaterial: THREE.MeshBasicMaterial | null = null;
const seaMaterial = () => {
  if (cachedMaterial) return cachedMaterial;
  const m = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSeaW;\nvarying vec4 vSeaClip;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvSeaW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\nvSeaClip = gl_Position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${fragmentHead}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${holeShader}`)
      .replace('#include <opaque_fragment>', `${shadeChunk}\n#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => '把回忆拼好给你-日落海面';
  uniforms.seaFog.value = fogTable();
  cachedMaterial = m;
  return m;
};

/** 光路、远档那张图：按块数建一次，每帧换字节 */
let seaTexImg: THREE.DataTexture | null = null;
const patternTexture = (bytes: Uint8Array, cols: number, rows: number) => {
  if (!seaTexImg || seaTexImg.image.width !== cols || seaTexImg.image.height !== rows) {
    seaTexImg = new THREE.DataTexture(new Uint8Array(cols * rows * 4), cols, rows, THREE.RGBAFormat);
    seaTexImg.colorSpace = THREE.NoColorSpace; // 字节原样是 sRGB 数值
    seaTexImg.magFilter = seaTexImg.minFilter = THREE.NearestFilter;
    seaTexImg.generateMipmaps = false;
    seaTexImg.flipY = false;
  }
  (seaTexImg.image.data as Uint8Array).set(bytes);
  seaTexImg.needsUpdate = true;
  return seaTexImg;
};

export type SeaSurfaceProps = {
  /** 海上的镜头（和画布同一个）：水面以眼为中心铺，光路、远档按它算 */
  机: Perspective;
  /** 页面尺寸（和画布同一个） */
  宽: number;
  高: number;
  /** 船实体的位置和朝向（度）：船舱那块挖掉 */
  船: { loc: V3; yaw: number };
  /** 游戏刻：贴图动画、光路闪的节奏 */
  刻: number;
  /** 色调（sRGB），乘在水上 */
  tint: string;
};

/** 放在三渲二画布里（场景坐标），水面在 z = 0 */
export const SeaSurface: React.FC<SeaSurfaceProps> = ({ 机: rig, 宽: width, 高: height, 船: boat, 刻: tick, tint }) => {
  const geo = useMemo(() => new THREE.PlaneGeometry((viewDistance + 4) * 2, (viewDistance + 4) * 2), []);
  const m = seaMaterial();
  const seaFrames = waterFrames();
  uniforms.seaTex.value = seaFrames[Math.floor(tick / ticksPerFrame) % seaFrames.length]!;
  uniforms.seaTint.value.setStyle(tint, THREE.LinearSRGBColorSpace);
  const a = (boat.yaw * Math.PI) / 180;
  uniforms.seaBoat.value.set(boat.loc[0], boat.loc[1], Math.cos(a), Math.sin(a));
  const pattern = seaPattern(rig, tick, width, height, seaBlockSize / filmScale);
  uniforms.seaPat.value = patternTexture(pattern.字节, pattern.列, pattern.行);
  return <mesh geometry={geo} material={m} position={[rig.眼[0], rig.眼[1], 0]} />;
};
