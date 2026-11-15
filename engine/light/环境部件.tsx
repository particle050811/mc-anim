// <环境> 各画法共用的部件：画法的接口（defineDraw、画法属性）、级联投影主光、平行主光、雾、原版方块云、挂共用 uniform 的钩子层。
// 画法各放一个模块（engine/light/画法/<名>.tsx），段只引自己用的那个：加一种画法不碰已有段的依赖。改这个文件会让所有用到 <环境> 的段过期。
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { SunLight } from 'three/examples/jsm/lights/SunLight.js';
import { CascadedShadow } from './级联阴影.ts';
import { useDirFog, useHeightFog } from './高度雾.ts';
import { useSelfLight } from './光照配比.ts';
import { Clouds } from './天空.tsx';
import type { V3, EnvDescription, Cloud, Fog, LightCoeffs } from './环境.ts';

/** 画法组件拿到的：这一帧的描述、灯光系数（环境.ts 的 灯光系数）、镜头、离地、穹顶中心 */
export type DrawProps = { e: EnvDescription; lighting: LightCoeffs; cameraPos: readonly number[]; eyeHeight: number; domeCenter?: readonly number[] };

/** 一种画法：名 = 环境描述的 画法，也是模块的文件名（engine/light/画法/<名>.tsx；anim check 照这个查描述里的画法有没有） */
export type DrawModule = { readonly 名: string; readonly component: React.FC<DrawProps> };
export const defineDraw = (name: string, component: React.FC<DrawProps>): DrawModule => ({ 名: name, component });

// 这几个钩子只在描述要时才挂（条件渲染组件，不打乱钩子顺序；卸下时各自复位共用 uniform）
export const HeightFogLayer: React.FC<{ 参数: NonNullable<EnvDescription['heightFog']> }> = ({ 参数: params }) => {
  useHeightFog({ start: params.start, halfLife: params.halfLife, density: params.density });
  return null;
};
export const DirFogLayer: React.FC<{ opts: Parameters<typeof useDirFog>[0] }> = ({ opts }) => {
  useDirFog(opts);
  return null;
};
export const SelfLightLayer: React.FC<{ k: number }> = ({ k }) => {
  useSelfLight(k);
  return null;
};

export const fogElement = (f: Fog, defaultColor: string) =>
  f.种类 === '线性' ? (
    <fog attach="fog" args={[f.色 ?? defaultColor, f.near, f.far]} />
  ) : f.种类 === '指数平方' ? (
    <fogExp2 attach="fog" args={[f.色 ?? defaultColor, Math.sqrt(Math.LN2) / f.visibility]} />
  ) : null;

/** 投影要的远端：线性雾取远端，指数平方取能见度 × 1.5（同 飞行镜头.tsx 的 overworldShadowFar），没雾 3 公里；再照 shadowFarFor 封顶 3 公里、按四分之一八度取整 */
export const fogFarEnd = (f: Fog) => (f.种类 === '线性' ? f.far : f.种类 === '指数平方' ? f.visibility * 1.5 : 3000);

/** 级联软投影的主光（同 暮色光照.tsx 的 TwilightSunLight、飞行镜头.tsx 的 OverworldSunLight）。归一：主世界那边先把光向归一再设（照原样，差一个末位也会让影子差一点） */
export const ShadowMainLight: React.FC<{ lightDir: V3; normalize: boolean; 色: string; 强: number; shadowFar: number; splitDist: number }> = ({ lightDir, normalize, 色: color, 强: strength, shadowFar, splitDist }) => {
  const light = useMemo(() => {
    const sunLight = new SunLight(color, strength);
    const sh = new CascadedShadow();
    sh.mapSize.set(4096, 4096);
    sh.bias = 0;
    sh.normalBias = 0.02;
    sunLight.shadow = sh;
    sunLight.castShadow = true;
    return sunLight;
  }, []);
  useEffect(() => () => light.dispose(), [light]);
  if (normalize) {
    const d = new THREE.Vector3(...lightDir).normalize();
    light.position.set(d.x, d.y, d.z);
  } else light.position.set(...lightDir);
  light.color.set(color);
  light.intensity = strength;
  const sh = light.shadow as CascadedShadow;
  sh.camera.far = shadowFar;
  sh.splitDist = splitDist;
  return <primitive object={light} />;
};

/** 不投影的平行主光：放在镜头往光源方向 1000 米、照着镜头（同 FlightSky 不投影时） */
export const ParallelMainLight: React.FC<{ lightDir: V3; 色: string; 强: number; cameraPos: readonly number[] }> = ({ lightDir, 色: color, 强: strength, cameraPos }) => {
  const light = useMemo(() => new THREE.DirectionalLight(color, strength), []);
  useEffect(() => () => light.dispose(), [light]);
  light.color.set(color);
  light.intensity = strength;
  const off = new THREE.Vector3(...lightDir).normalize().multiplyScalar(1000);
  light.position.set(cameraPos[0]! + off.x, cameraPos[1]! + off.y, cameraPos[2]! + off.z);
  light.target.position.set(cameraPos[0]!, cameraPos[1]!, cameraPos[2]!);
  light.target.updateMatrixWorld();
  return (
    <>
      <primitive object={light} />
      <primitive object={light.target} />
    </>
  );
};

export const vanillaCloud = (c: Extract<Cloud, { 种类: '原版' }>, defaultColor: string) => (
  <Clouds height={c.高} radius={c.radius} color={c.色 ?? defaultColor} offset={c.offset ? [c.offset[0], c.offset[1]] : undefined} />
);
