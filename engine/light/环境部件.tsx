// <环境> 各画法共用的部件：画法的接口（定义画法、画法属性）、级联投影主光、平行主光、雾、原版方块云、挂共用 uniform 的钩子层。
// 画法各放一个模块（engine/light/画法/<名>.tsx），段只引自己用的那个：加一种画法不碰已有段的依赖。改这个文件会让所有用到 <环境> 的段过期。
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { SunLight } from 'three/examples/jsm/lights/SunLight.js';
import { CascadedShadow } from './级联阴影.ts';
import { useDirFog, useHeightFog } from './高度雾.ts';
import { useSelfLight } from './光照配比.ts';
import { Clouds } from './天空.tsx';
import type { V3, 环境描述, 云, 雾, 灯光系数 } from './环境.ts';

/** 画法组件拿到的：这一帧的描述、灯光系数（环境.ts 的 灯光系数）、镜头、离地、穹顶中心 */
export type 画法属性 = { e: 环境描述; 灯: 灯光系数; 镜头: readonly number[]; 离地: number; 穹顶中心?: readonly number[] };

/** 一种画法：名 = 环境描述的 画法，也是模块的文件名（engine/light/画法/<名>.tsx；anim check 照这个查描述里的画法有没有） */
export type 画法模块 = { readonly 名: string; readonly 组件: React.FC<画法属性> };
export const 定义画法 = (名: string, 组件: React.FC<画法属性>): 画法模块 => ({ 名, 组件 });

// 这几个钩子只在描述要时才挂（条件渲染组件，不打乱钩子顺序；卸下时各自复位共用 uniform）
export const 高度雾层: React.FC<{ 参数: NonNullable<环境描述['高度雾']> }> = ({ 参数 }) => {
  useHeightFog({ start: 参数.起点, halfLife: 参数.半衰, density: 参数.浓度 });
  return null;
};
export const 方向雾层: React.FC<{ opts: Parameters<typeof useDirFog>[0] }> = ({ opts }) => {
  useDirFog(opts);
  return null;
};
export const 自发光层: React.FC<{ k: number }> = ({ k }) => {
  useSelfLight(k);
  return null;
};

export const 雾元素 = (f: 雾, 默认色: string) =>
  f.种类 === '线性' ? (
    <fog attach="fog" args={[f.色 ?? 默认色, f.近, f.远]} />
  ) : f.种类 === '指数平方' ? (
    <fogExp2 attach="fog" args={[f.色 ?? 默认色, Math.sqrt(Math.LN2) / f.能见度]} />
  ) : null;

/** 投影要的远端：线性雾取远端，指数平方取能见度 × 1.5（同 飞行镜头.tsx 的 overworldShadowFar），没雾 3 公里；再照 shadowFarFor 封顶 3 公里、按四分之一八度取整 */
export const 雾远端 = (f: 雾) => (f.种类 === '线性' ? f.远 : f.种类 === '指数平方' ? f.能见度 * 1.5 : 3000);

/** 级联软投影的主光（同 暮色光照.tsx 的 TwilightSunLight、飞行镜头.tsx 的 OverworldSunLight）。归一：主世界那边先把光向归一再设（照原样，差一个末位也会让影子差一点） */
export const 投影主光: React.FC<{ 方向: V3; 归一: boolean; 色: string; 强: number; 远: number; 切分: number }> = ({ 方向, 归一, 色, 强, 远, 切分 }) => {
  const light = useMemo(() => {
    const sunLight = new SunLight(色, 强);
    const sh = new CascadedShadow();
    sh.mapSize.set(4096, 4096);
    sh.bias = 0;
    sh.normalBias = 0.02;
    sunLight.shadow = sh;
    sunLight.castShadow = true;
    return sunLight;
  }, []);
  useEffect(() => () => light.dispose(), [light]);
  if (归一) {
    const d = new THREE.Vector3(...方向).normalize();
    light.position.set(d.x, d.y, d.z);
  } else light.position.set(...方向);
  light.color.set(色);
  light.intensity = 强;
  const sh = light.shadow as CascadedShadow;
  sh.camera.far = 远;
  sh.splitDist = 切分;
  return <primitive object={light} />;
};

/** 不投影的平行主光：放在镜头往光源方向 1000 米、照着镜头（同 FlightSky 不投影时） */
export const 平行主光: React.FC<{ 方向: V3; 色: string; 强: number; 镜头: readonly number[] }> = ({ 方向, 色, 强, 镜头 }) => {
  const light = useMemo(() => new THREE.DirectionalLight(色, 强), []);
  useEffect(() => () => light.dispose(), [light]);
  light.color.set(色);
  light.intensity = 强;
  const off = new THREE.Vector3(...方向).normalize().multiplyScalar(1000);
  light.position.set(镜头[0]! + off.x, 镜头[1]! + off.y, 镜头[2]! + off.z);
  light.target.position.set(镜头[0]!, 镜头[1]!, 镜头[2]!);
  light.target.updateMatrixWorld();
  return (
    <>
      <primitive object={light} />
      <primitive object={light.target} />
    </>
  );
};

export const 原版云 = (c: Extract<云, { 种类: '原版' }>, 默认色: string) => (
  <Clouds height={c.高} radius={c.半径} color={c.色 ?? 默认色} offset={c.偏移 ? [c.偏移[0], c.偏移[1]] : undefined} />
);
