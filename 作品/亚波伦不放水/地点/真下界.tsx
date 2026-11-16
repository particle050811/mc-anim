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
import { VoxelWorld } from '@engine/voxel/世界.tsx';
import { useImportedTerrain, type LandmarkCutout } from '@engine/voxel/导入地形.ts';
import { isVoxelWater } from '@engine/voxel/材质.ts';
import { realNetherPack, realNetherOrigin } from './真下界位置.ts';

export { realNetherPack, realNetherOrigin } from './真下界位置.ts';

export type NetherLight = {
  /** 光照图在方块光 0 级的颜色（sRGB 数值上的倍数，原版 [0.393, 0.323, 0.267]）；乘面明暗后折到线性 */
  baseLight: readonly [number, number, number];
  /** 熔岩自发光 = 贴图原色 × 这个数 */
  lavaBright: number;
  /** 线性雾：色（#rrggbb，也是底色）、从几格起、到几格全满 */
  fog: { 色: string; near: number; far: number };
  /** 地形最远画到多远（格）；不给 = 雾.远 */
  renderFar?: number;
};

/** 照原版：亮度滑块 50%、视距 32 区块时的下界荒地 */
export const netherVanilla: NetherLight = { baseLight: [0.393, 0.323, 0.267], lavaBright: 1, fog: { 色: '#330808', near: 25.6, far: 96 } };
/** 整体提亮、雾放远（用户 11-10 嫌黑、要看清背景）：底光提到原版方块光约 12 级的亮度，雾推到 32 区块外才满，雾色提亮 */
export const netherBrighter: NetherLight = { baseLight: [0.86, 0.74, 0.64], lavaBright: 1.1, fog: { 色: '#5a1a12', near: 96, far: 640 } };

// 面明暗（下界 constantAmbientLight）：东西 0.6、南北 0.8、上下 0.9
const faceShade = { eastWest: 0.6, northSouth: 0.8, upDown: 0.9 };
const toLinear = (v: number) => v ** 2.2;
const noCuts: LandmarkCutout[] = [];

const lavaGlow = { value: 1 };
// 一份体素水的材质一份熔岩：不裁的一份，跨过雾尽头的区段的远裁水（engine/voxel/区段.ts `farDropMask`）每种丢法各一份，丢法跟着水的材质走
const lavaMaterials = new Map<THREE.Material, THREE.Material>();
const getLavaMaterial = (waterMaterial: THREE.Material) => {
  const cached = lavaMaterials.get(waterMaterial);
  if (cached) return cached;
  const farClip = waterMaterial.userData.voxelWaterClip === true;
  const m = waterMaterial.clone() as THREE.MeshStandardMaterial;
  delete m.userData.voxelWaterClip;
  m.userData.voxelWaterSwap = true;
  m.roughness = 0.95;
  m.transparent = false;
  m.depthWrite = true;
  m.onBeforeCompile = (sh, r) => {
    waterMaterial.onBeforeCompile(sh, r);
    sh.uniforms.lavaGlow = lavaGlow;
    const fragmentSource = sh.fragmentShader;
    sh.fragmentShader =
      'uniform float lavaGlow;\n' +
      fragmentSource.replace('totalEmissiveRadiance = diffuseColor.rgb * selfLight;', 'totalEmissiveRadiance = diffuseColor.rgb * lavaGlow;').replace('pow(1.0 - cosT, 5.0), waterReflMax)', 'pow(1.0 - cosT, 5.0), 0.0)');
    // engine 的水材质改了写法这里就对不上：宁可报错，不要悄悄画成反射天色的水
    if (!sh.fragmentShader.includes('diffuseColor.rgb * lavaGlow') || sh.fragmentShader.includes('waterReflMax)')) throw new Error('真下界：熔岩材质接不上 engine/voxel/材质.ts、水面.ts 的着色器（那边改了写法）');
  };
  m.customProgramCacheKey = () => `体素-熔岩${farClip ? '-远裁' : ''}`;
  lavaMaterials.set(waterMaterial, m);
  return m;
};

/** 挖：场地上自己摆了方块的地方，把导入地形的那几格挖掉，不然两层共面互相闪（要模块顶层的同一个数组）；键后缀 让挖法不同的不共用网格缓存 */
export type NetherCut = { box: LandmarkCutout[]; keySuffix: string };
export const RealNether: React.FC<{ cameraPos: readonly number[]; 光: NetherLight; carve?: NetherCut }> = ({ cameraPos, 光: netherLight, carve }) => {
  const t = useImportedTerrain(realNetherPack, carve?.box ?? noCuts);
  const scene = useThree((s) => s.scene);
  const groupRef = useRef<THREE.Group>(null);
  useSelfLight(0);
  lavaGlow.value = netherLight.lavaBright;
  // 雾、底色挂在场景上（<fog attach> 在场景组里挂不到 scene）
  const fog = scene.fog instanceof THREE.Fog ? scene.fog : (scene.fog = new THREE.Fog(netherLight.fog.色, netherLight.fog.near, netherLight.fog.far));
  fog.color.set(netherLight.fog.色);
  fog.near = netherLight.fog.near;
  fog.far = netherLight.fog.far;
  if (!(scene.background instanceof THREE.Color)) scene.background = new THREE.Color();
  (scene.background as THREE.Color).set(netherLight.fog.色);
  useEffect(
    () => () => {
      scene.fog = null;
      scene.background = null;
    },
    [scene],
  );
  // 这个世界的水类网格（全是熔岩）换材质：体素世界每次渲染把这一帧要画的网格挂进组里、换上这一帧该用的水（远裁的也算），画之前照它换成熔岩。
  // 远裁的水要换成同样远裁的熔岩：雾按纵深算，画面两边远过雾尽头的地方雾没满，不裁就比 32 × 32 格的区段多画出一圈熔岩（核对-真下界 第 1080 帧两边的地平线）
  useFrame(() => {
    groupRef.current?.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (Array.isArray(mesh.material) && isVoxelWater(mesh.material[0])) mesh.material = [getLavaMaterial(mesh.material[0]!)];
    });
  });
  if (t && t.origin.some((v, i) => v !== realNetherOrigin[i])) throw new Error(`区段包 ${realNetherPack} 的原点是 ${t.origin}，地点/真下界.tsx 按 ${realNetherOrigin} 算的`);
  const faceColor = (face: number) => new THREE.Color(toLinear(netherLight.baseLight[0] * face), toLinear(netherLight.baseLight[1] * face), toLinear(netherLight.baseLight[2] * face));
  const bottomColor = faceColor(faceShade.eastWest);
  const fillColor = (face: number) => faceColor(face).sub(bottomColor);
  return (
    <group ref={groupRef}>
      {/* 环境光的辐照度过朗伯项要除 π，乘回来：强度 π 时面的亮度 = 颜色 × 贴图 */}
      <ambientLight color={bottomColor} intensity={Math.PI} />
      <directionalLight color={fillColor(faceShade.upDown)} position={[0, 0, 1]} intensity={Math.PI} />
      <directionalLight color={fillColor(faceShade.upDown)} position={[0, 0, -1]} intensity={Math.PI} />
      <directionalLight color={fillColor(faceShade.northSouth)} position={[0, 1, 0]} intensity={Math.PI} />
      <directionalLight color={fillColor(faceShade.northSouth)} position={[0, -1, 0]} intensity={Math.PI} />
      {/* 高度不用 t.高度：engine/voxel/导入地形.ts 的维度下界表里没有下界（给出 NaN），这里直接写 y 0～128 */}
      {t && <VoxelWorld key={t.key + (carve?.keySuffix ?? '')} source={t.source} center={cameraPos as number[]} pixel={LevelParams.视频.pixel} far={netherLight.renderFar ?? netherLight.fog.far} heightRange={[0 - realNetherOrigin[1], 128 - realNetherOrigin[1]]} />}
    </group>
  );
};
