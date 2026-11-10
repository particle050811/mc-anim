// 真下界：从存档导入的真实下界地形（区段包 下界-无结构-1110，世界声明 sourcing/worlds/下界-无结构-1110.toml），封面和正片的背景用
// （用户 11-10 定：不编假地形，直接导入真实的；视距起码 32 区块；「这个地狱怎么这么黑……背景你要看清」）。
// 放在 ThreeCanvas 里、场景组（rotation [−π/2, 0, 0]，Z 朝上）下面：<真下界 镜头={机位.pos} 光={下界提亮} />。它管地形、灯、雾、底色，机位和 <ScreenAo /> 外面自己放。
//
// 坐标：场景 X = 游戏 x − ox，场景 Y = oz − 游戏 z，场景 Z = 游戏 y（下界 oy = 0）；用 真下界场景(x, y, z) 换（真下界位置.ts，纯数据，段.ts 也能引）。
//
// 光：下界没有天光，引擎也没有逐格传播的方块光，这里只画「方块光 0 级」的底光，再让熔岩自己发亮：
// - 底光照原版光照图（LightTexture.updateLightTexture）在下界、方块光 0、天光 0、亮度滑块 50% 时算出的颜色，每个朝向再乘下界的面明暗
//   （constantAmbientLight：上下 0.9、南北 0.8、东西 0.6）。原版在 sRGB 数值上乘，这里按 2.2 次幂折到线性光里：一盏环境光（东西面的亮度）加四盏平行光补出上下、南北面。
// - 熔岩按贴图原色 × 熔岩亮 发光（方块光 15 的光照图是全白）。熔岩照亮周围 15 格的那一圈没有画：岸边、熔岩瀑布旁的岩壁比游戏里暗。
// - 雾是线性雾。原版下界（isFoggyAt 恒真）雾从 视距 × 0.05 起、到 min(视距, 192) × 0.5 = 96 格全满，雾色是群系的 fog_color（下界荒地 #330808）。
//
// 熔岩的材质：体素世界把液体都归进「水」那一类材质（波纹、菲涅尔、反射天色）。下界的包里液体只有熔岩，这里把这个世界的水类网格换成一份改过的材质
// （不反射天、粗糙度照方块、不透明、自发光），只换本世界键下的网格，别的世界和 engine 的水材质不动。
import { useFrame, useThree } from '@react-three/fiber';
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { LevelParams } from '@engine/core/渲染级别.ts';
import { useSelfLight } from '@engine/light/光照配比.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { VoxelWorld } from '@engine/voxel/世界.tsx';
import { useImportedTerrain, type LandmarkCutout } from '@engine/voxel/导入地形.ts';
import { voxelMaterial } from '@engine/voxel/材质.ts';
import { 真下界包, 真下界原点 } from './真下界位置.ts';

export { 真下界包, 真下界原点, 真下界场景, 真下界选点, 真下界场地 } from './真下界位置.ts';

export type 下界光 = {
  /** 光照图在方块光 0 级的颜色（sRGB 数值上的倍数，原版 [0.393, 0.323, 0.267]）；乘面明暗后折到线性 */
  底光: readonly [number, number, number];
  /** 熔岩自发光 = 贴图原色 × 这个数 */
  熔岩亮: number;
  /** 线性雾：色（#rrggbb，也是底色）、从几格起、到几格全满 */
  雾: { 色: string; 近: number; 远: number };
  /** 地形最远画到多远（格）；不给 = 雾.远 */
  画远?: number;
};

/** 照原版：亮度滑块 50%、视距 32 区块时的下界荒地 */
export const 下界原版: 下界光 = { 底光: [0.393, 0.323, 0.267], 熔岩亮: 1, 雾: { 色: '#330808', 近: 25.6, 远: 96 } };
/** 整体提亮、雾放远（用户 11-10 嫌黑、要看清背景）：底光提到原版方块光约 12 级的亮度，雾推到 32 区块外才满，雾色提亮 */
export const 下界提亮: 下界光 = { 底光: [0.86, 0.74, 0.64], 熔岩亮: 1.1, 雾: { 色: '#5a1a12', 近: 96, 远: 640 } };

// 面明暗（下界 constantAmbientLight）：东西 0.6、南北 0.8、上下 0.9
const 面明暗 = { 东西: 0.6, 南北: 0.8, 上下: 0.9 };
const 线性 = (v: number) => v ** 2.2;
const 无挖: LandmarkCutout[] = [];

const 熔岩光 = { value: 1 };
let 熔岩材质: THREE.Material | null = null;
const 取熔岩材质 = (水: THREE.Material) => {
  if (熔岩材质) return 熔岩材质;
  const m = 水.clone() as THREE.MeshStandardMaterial;
  m.roughness = 0.95;
  m.transparent = false;
  m.depthWrite = true;
  m.onBeforeCompile = (sh, r) => {
    水.onBeforeCompile(sh, r);
    sh.uniforms.lavaGlow = 熔岩光;
    const 前 = sh.fragmentShader;
    sh.fragmentShader =
      'uniform float lavaGlow;\n' +
      前.replace('totalEmissiveRadiance = diffuseColor.rgb * selfLight;', 'totalEmissiveRadiance = diffuseColor.rgb * lavaGlow;').replace('pow(1.0 - cosT, 5.0), waterReflMax)', 'pow(1.0 - cosT, 5.0), 0.0)');
    // engine 的水材质改了写法这里就对不上：宁可报错，不要悄悄画成反射天色的水
    if (!sh.fragmentShader.includes('diffuseColor.rgb * lavaGlow') || sh.fragmentShader.includes('waterReflMax)')) throw new Error('真下界：熔岩材质接不上 engine/voxel/材质.ts、水面.ts 的着色器（那边改了写法）');
  };
  m.customProgramCacheKey = () => '体素-熔岩';
  熔岩材质 = m;
  return m;
};

export const 真下界: React.FC<{ 镜头: readonly number[]; 光: 下界光 }> = ({ 镜头, 光 }) => {
  const t = useImportedTerrain(真下界包, 无挖);
  const scene = useThree((s) => s.scene);
  const 组 = useRef<THREE.Group>(null);
  useSelfLight(0);
  熔岩光.value = 光.熔岩亮;
  // 雾、底色挂在场景上（<fog attach> 在场景组里挂不到 scene）
  const 雾 = scene.fog instanceof THREE.Fog ? scene.fog : (scene.fog = new THREE.Fog(光.雾.色, 光.雾.近, 光.雾.远));
  雾.color.set(光.雾.色);
  雾.near = 光.雾.近;
  雾.far = 光.雾.远;
  if (!(scene.background instanceof THREE.Color)) scene.background = new THREE.Color();
  (scene.background as THREE.Color).set(光.雾.色);
  useEffect(
    () => () => {
      scene.fog = null;
      scene.background = null;
    },
    [scene],
  );
  // 这个世界的水类网格（全是熔岩）换材质：体素世界每次渲染把这一帧要画的网格挂进组里，画之前换
  useFrame(() => {
    const 水 = voxelMaterial('水');
    const 岩 = 取熔岩材质(水);
    组.current?.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (Array.isArray(mesh.material) && mesh.material[0] === 水) mesh.material = [岩];
    });
  });
  if (t && t.原点.some((v, i) => v !== 真下界原点[i])) throw new Error(`区段包 ${真下界包} 的原点是 ${t.原点}，地点/真下界.tsx 按 ${真下界原点} 算的`);
  const 色 = (面: number) => new THREE.Color(线性(光.底光[0] * 面), 线性(光.底光[1] * 面), 线性(光.底光[2] * 面));
  const 底 = 色(面明暗.东西);
  const 补 = (面: number) => 色(面).sub(底);
  return (
    <group ref={组}>
      {/* 环境光的辐照度过朗伯项要除 π，乘回来：强度 π 时面的亮度 = 颜色 × 贴图 */}
      <ambientLight color={底} intensity={Math.PI} />
      <directionalLight color={补(面明暗.上下)} position={[0, 0, 1]} intensity={Math.PI} />
      <directionalLight color={补(面明暗.上下)} position={[0, 0, -1]} intensity={Math.PI} />
      <directionalLight color={补(面明暗.南北)} position={[0, 1, 0]} intensity={Math.PI} />
      <directionalLight color={补(面明暗.南北)} position={[0, -1, 0]} intensity={Math.PI} />
      {/* 高度不用 t.高度：engine/voxel/导入地形.ts 的维度下界表里没有下界（给出 NaN），这里直接写 y 0～128 */}
      {t && <VoxelWorld 键={t.键} 来源={t.来源} 中心={镜头 as number[]} 像素={LevelParams.视频.像素} 远={光.画远 ?? 光.雾.远} 高度={[0 - 真下界原点[1], 128 - 真下界原点[1]]} />}
    </group>
  );
};
