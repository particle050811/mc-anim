// 真下界：从存档导入的真实下界地形（区段包 下界-无结构-1110，世界声明 sourcing/worlds/下界-无结构-1110.toml），封面和正片的背景用
// （用户 11-10 定：不编假地形，直接导入真实的；视距起码 32 区块；「这个地狱怎么这么黑……背景你要看清」）。
// 放在 ThreeCanvas 里、场景组（rotation [−π/2, 0, 0]，Z 朝上）下面：<真下界 镜头={机位.pos} 光={下界提亮} />。它管地形、灯、雾、底色，机位和 <ScreenAo /> 外面自己放。
//
// 坐标：场景 X = 游戏 x − ox，场景 Y = oz − 游戏 z，场景 Z = 游戏 y（下界 oy = 0）；用 真下界场景(x, y, z) 换（真下界位置.ts，纯数据，段.ts 也能引）。
//
// 光：下界没有天光，这里画「方块光 0 级」的底光，发光方块自己发亮，再用光体照亮周围：
// - 底光照原版光照图（LightTexture.updateLightTexture）在下界、方块光 0、天光 0、亮度滑块 50% 时算出的颜色，每个朝向再乘下界的面明暗
//   （constantAmbientLight：上下 0.9、南北 0.8、东西 0.6）。原版在 sRGB 数值上乘，这里按 2.2 次幂折到线性光里：一盏环境光（东西面的亮度）加四盏平行光补出上下、南北面。
// - 发光方块（熔岩、火、灵魂火、萤石、菌光体、岩浆块……，表在 engine/voxel/方块发光.ts）按 贴图原色 × 发光强度 × 发光倍 自己亮（engine 的 blockGlow，用户 11-16 要远处的火、熔岩也亮）；
//   粗级里露在外面的发光方块合并时优先，远处不被合成地狱岩（世界声明 glowFirst）。
// - 照亮周围：光体（engine/light/光体.ts，用户 11-17 定「用光体更加真实」、光要圆的、按距离平方衰减），只在正片那套（netherBrighter）开，原版那套照游戏不开。地形、人物、模型都照到。
// - 雾色、雾远照原版：原版下界（isFoggyAt 恒真）是线性雾，从 视距 × 0.05 起、到 min(视距, 192) × 0.5 = 96 格全满，雾色是群系的 fog_color（下界荒地 #330808）。
//   雾的形状换成全片的远雾（engine/light/高度雾.ts 的 `useFarFog`，用户 11-16 定下界也用）：D = 雾远，0.9 D 以内没有雾、到 D 拉满成雾色（也是底色），
//   线性雾的近端不起作用。地形越出 D 的部分全进雾，地平线上不再多出一圈熔岩和剪影（原来靠远裁）。
//
// 熔岩的材质：体素世界把液体都归进「水」那一类材质（波纹、菲涅尔、反射天色）。下界的包里液体只有熔岩，这里把这个世界的水类网格换成一份改过的材质
// （不反射天、粗糙度照方块、不透明、自发光），只换本世界键下的网格，别的世界和 engine 的水材质不动。
import { useFrame, useThree } from '@react-three/fiber';
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { LevelParams } from '@engine/core/渲染级别.ts';
import { useBlockGlow, useSelfLight, useTerrainLightGain } from '@engine/light/光照配比.ts';
import { trialFarM, useFarFog } from '@engine/light/高度雾.ts';
import { VoxelWorld } from '@engine/voxel/世界.tsx';
import { useImportedTerrain, type LandmarkCutout } from '@engine/voxel/导入地形.ts';
import { voxelMaterial } from '@engine/voxel/材质.ts';
import { useBlockTextureAnimation, type AnimatedBlockTexture } from '@engine/voxel/贴图动画.ts';
import { useCurrentSec } from '@engine/段/时间.tsx';
import fire0Png from 'asset:贴图/方块动画/minecraft/block/fire_0';
import fire1Png from 'asset:贴图/方块动画/minecraft/block/fire_1';
import soulFire0Png from 'asset:贴图/仪式/minecraft/block/soul_fire_0';
import soulFire1Png from 'asset:贴图/仪式/minecraft/block/soul_fire_1';
import { LightVolume } from '@engine/light/光体组件.tsx';
import type { ExtraBlock, LightVolumeParams } from '@engine/light/光体.ts';
import { trialLightVolume } from '@engine/light/光体试看.ts';
import { trialParams } from '@engine/core/试看.ts';
import { realNetherPack, realNetherOrigin } from './真下界位置.ts';

export { realNetherPack, realNetherOrigin } from './真下界位置.ts';

export type NetherLight = {
  /** 光照图在方块光 0 级的颜色（sRGB 数值上的倍数，原版 [0.393, 0.323, 0.267]）；乘面明暗后折到线性 */
  baseLight: readonly [number, number, number];
  /** 地形（体素地形、方块拼搭）的底光再乘几（sRGB 数值上，同 baseLight）；人物、模型照 baseLight。不给 = 1 */
  terrainBase?: number;
  /** 发光倍：发光方块（含熔岩）的自发光 = 贴图原色 × 发光强度 × 这个数 */
  lavaBright: number;
  /** 雾：色（#rrggbb，也是底色）、从几格起（远雾开着不起作用）、到几格全满（远雾的 D） */
  fog: { 色: string; near: number; far: number };
  /** 地形最远画到多远（格）；不给 = 雾.远 */
  renderFar?: number;
  /** 光体（发光方块照亮周围）；不给 = 不开 */
  lightVolume?: LightVolumeParams;
};

/** 照原版：亮度滑块 50%、视距 32 区块时的下界荒地 */
export const netherVanilla: NetherLight = { baseLight: [0.393, 0.323, 0.267], lavaBright: 1, fog: { 色: '#330808', near: 25.6, far: 96 } };
/** 整体提亮、雾放远（用户 11-10 嫌黑、要看清背景）：底光提到原版方块光约 12 级的亮度，雾推到 32 区块外才满，雾色提亮 */
// 雾远（= 远雾的 D）1000：用户 11-16「地狱 我看 D1000 就够了」；包按镜头范围外扩 1000 烘（sourcing/worlds/下界-无结构-1110.toml）
// 地形底光压到 0.7 倍、光体用「圆洪水」强 2（用户 11-19 看 预览/1119-1452-底光对比 定「0.7 圆洪水」：底光压下去，熔岩、火照亮周围才显得出来）；
// 人物、模型补回原来的底光（用户 11-19 看 预览/1119-1518-下界新光-正片，人跟着变暗，定「人物补回原来的底光」）。软封顶、最小光是 Agent 暂定；圆洪水不用软封顶
export const netherBrighter: NetherLight = {
  baseLight: [0.86, 0.74, 0.64],
  terrainBase: 0.7,
  lavaBright: 1.1,
  fog: { 色: '#5a1a12', near: 96, far: 1000 },
  lightVolume: { strength: 2, knee: 1.5, minLight: 0.004, scheme: { kind: '圆洪水', curve: '原版', metersPerLevel: 1, p: 4 } },
};

/** 远雾的 D（格）= 雾远；试看 {"雾曲线": {"远": 格}} 盖掉，地形最远距离跟着换（用户 11-16 要比下界放大视距）。包烘了 x −512～2047、z −1536～1023 */
export const netherFarM = (light: NetherLight) => trialFarM(light.fog.far);

// 面明暗（下界 constantAmbientLight）：东西 0.6、南北 0.8、上下 0.9
const faceShade = { eastWest: 0.6, northSouth: 0.8, upDown: 0.9 };
const toLinear = (v: number) => v ** 2.2;
const noCuts: LandmarkCutout[] = [];

let lavaMaterial: THREE.Material | null = null;
const getLavaMaterial = (waterMaterial: THREE.Material) => {
  if (lavaMaterial) return lavaMaterial;
  const m = waterMaterial.clone() as THREE.MeshStandardMaterial;
  m.roughness = 0.95;
  m.transparent = false;
  m.depthWrite = true;
  m.onBeforeCompile = (sh, r) => {
    waterMaterial.onBeforeCompile(sh, r);
    // 自发光走 engine 的发光方块（熔岩贴图的发光强度 1 × blockGlow），这里只关掉反射天色
    sh.fragmentShader = sh.fragmentShader.replace('pow(1.0 - cosT, 5.0), waterReflMax)', 'pow(1.0 - cosT, 5.0), 0.0)');
    // engine 的水材质改了写法这里就对不上：宁可报错，不要悄悄画成反射天色的水
    if (!sh.fragmentShader.includes('(1.0 - vCol.a) * blockGlow') || sh.fragmentShader.includes('waterReflMax)')) throw new Error('真下界：熔岩材质接不上 engine/voxel/材质.ts、水面.ts 的着色器（那边改了写法）');
  };
  m.customProgramCacheKey = () => '体素-熔岩';
  lavaMaterial = m;
  return m;
};

/** 挖：场地上自己摆了方块的地方，把导入地形的那几格挖掉，不然两层共面互相闪（要模块顶层的同一个数组）；键后缀 让挖法不同的不共用网格缓存 */
export type NetherCut = { box: LandmarkCutout[]; keySuffix: string };
// 地形里的火、灵魂火逐刻换帧（用户 11-19「近处的火居然不会烧动，应该像灵魂火那样会烧动」）。帧序照 1.20.1 jar 里的 .png.mcmeta：
// fire_0、soul_fire_0 从第 16 帧起，fire_1、soul_fire_1 顺序，都是每刻一帧。熔岩（lava_still 也会动）没开，用户没提。
const fireFrames = [...Array.from({ length: 16 }, (_, i) => 16 + i), ...Array.from({ length: 16 }, (_, i) => i)];
const netherAnimatedTextures: readonly AnimatedBlockTexture[] = [
  { name: 'minecraft:block/fire_0', strip: fire0Png, frames: fireFrames },
  { name: 'minecraft:block/fire_1', strip: fire1Png },
  { name: 'minecraft:block/soul_fire_0', strip: soulFire0Png, frames: fireFrames },
  { name: 'minecraft:block/soul_fire_1', strip: soulFire1Png },
];

/** lightBlocks：地形外另摆、要进光体的方块（模型画的发光、挡光方块），模块级常量 */
export const RealNether: React.FC<{ cameraPos: readonly number[]; 光: NetherLight; carve?: NetherCut; lightBlocks?: readonly ExtraBlock[] }> = ({ cameraPos, 光: netherLight, carve, lightBlocks }) => {
  const t = useImportedTerrain(realNetherPack, carve?.box ?? noCuts);
  const scene = useThree((s) => s.scene);
  const groupRef = useRef<THREE.Group>(null);
  useSelfLight(0);
  useBlockGlow(netherLight.lavaBright);
  useTerrainLightGain(toLinear(netherLight.terrainBase ?? 1));
  useBlockTextureAnimation(netherAnimatedTextures, useCurrentSec());
  const farM = netherFarM(netherLight);
  useFarFog({ far: farM });
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
  // 这个世界的水类网格（全是熔岩）换材质：体素世界每次渲染把这一帧要画的网格挂进组里，画之前换
  useFrame(() => {
    const waterMaterial = voxelMaterial('水');
    const rockMat = getLavaMaterial(waterMaterial);
    groupRef.current?.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (Array.isArray(mesh.material) && mesh.material[0] === waterMaterial) mesh.material = [rockMat];
    });
  });
  if (t && t.origin.some((v, i) => v !== realNetherOrigin[i])) throw new Error(`区段包 ${realNetherPack} 的原点是 ${t.origin}，地点/真下界.tsx 按 ${realNetherOrigin} 算的`);
  // 试看「下界底光」：底光整体再乘一个倍数
  const baseScale = trialParams<{ '倍'?: number }>('下界底光')?.['倍'] ?? 1;
  const faceColor = (face: number) => new THREE.Color(toLinear(netherLight.baseLight[0] * baseScale * face), toLinear(netherLight.baseLight[1] * baseScale * face), toLinear(netherLight.baseLight[2] * baseScale * face));
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
      <LightVolume t={t} center={cameraPos} heightRange={[0 - realNetherOrigin[1], 128 - realNetherOrigin[1]]} params={trialLightVolume(netherLight.lightVolume) ?? netherLight.lightVolume} extraBlocks={lightBlocks} />
      {t && <VoxelWorld worldKey={t.key + (carve?.keySuffix ?? '')} source={t.source} center={cameraPos as number[]} pixel={LevelParams.视频.pixel} far={netherLight.renderFar ?? farM} heightRange={[0 - realNetherOrigin[1], 128 - realNetherOrigin[1]]} />}
    </group>
  );
};
