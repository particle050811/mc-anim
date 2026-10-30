// <环境>：照环境描述（环境.ts）摆灯、天、云、雾。直接放在 ThreeCanvas 下面（场景坐标的东西自己转到 Z 朝上），描述可以是随帧变的环境轨。
// 两种画法，各自照现有组件原样拼，只调那些模块导出的 API：
// - 暮色：同 暮色光照.tsx 的 TwilightLighting（背景色 + 线性雾 + 高度雾、余晖方向雾 + 暮色穹顶 + 级联投影主光 + TwilightClouds）；
// - 主世界：同 作品/应力转动/地点/飞行镜头.tsx 的 FlightSky + FlightFog（Photon 大气 + Photon 云 + 穹顶 + 日光 + 天光、环境光 + 指数平方雾）。
// 预设（环境预设.ts、作品/应力转动/地点/主世界环境.ts）出的画面和现有组件逐像素比过：作品/应力转动/核对/环境/。
// 云要画布挂 <ScreenAo />；投影要画布开 shadows，投影的东西自己开 castShadow（体素世界给同一个 shadowLightDir）。
// 按时刻变天时，主世界画法每换一个太阳方向 Photon 大气要在 CPU 上重展开一张 2048×1024 的天色图（大气.ts 的 apply），逐帧变的段每帧多花这一下。
import React, { useEffect, useMemo } from 'react';
import { useCurrentFrame } from 'remotion';
import * as THREE from 'three';
import { SunLight } from 'three/examples/jsm/lights/SunLight.js';
import { Atmosphere } from './大气.ts';
import { PhotonClouds } from './大气/云.ts';
import { CascadedShadow } from './级联阴影.ts';
import { useDirFog, useHeightFog } from './高度雾.ts';
import { useSelfLight, twilightDusk } from './光照配比.ts';
import { Clouds, SKY, SkyDome, TWILIGHT, twilightCloudColor, twilightFogColor } from './天空.tsx';
import { TwilightClouds, shadowFarFor } from './暮色光照.tsx';
import { 档位配比 } from './灯光档位.ts';
import { 灯光系数, 环境在, type V3, type 画法, type 环境描述, type 环境轨, type 云, type 雾, type 灯光系数 as 灯光系数类型 } from './环境.ts';

export type 环境属性 = {
  描述: 环境描述 | 环境轨;
  /** 镜头位置（场景坐标）：穹顶跟着它，平行主光照着它 */
  镜头: readonly number[];
  /** 镜头离地多高（米）：投影的中、远两级切在 max(300, 2 × 离地)。不给 = 镜头 z */
  离地?: number;
  /** 给了穹顶就固定在这里（暮色画法不放大，同 TwilightLighting 的 domeCenter）；不给跟着镜头 */
  穹顶中心?: readonly number[];
  /** 关键帧按第几帧取（场窗口段要按场内帧取就传进来）；不给 = 段内当前帧 */
  帧?: number;
};

type 画法属性 = { e: 环境描述; 灯: 灯光系数类型; 镜头: readonly number[]; 离地: number; 穹顶中心?: readonly number[] };

// 按时刻算到月光时主光的颜色：暂定借暮色的偏蓝灰（同是原版光照贴图天暗时往蓝里偏，见 天空.tsx 的 TWILIGHT.light）
const 月光色 = TWILIGHT.light;

// 这几个钩子只在描述要时才挂（条件渲染组件，不打乱钩子顺序；卸下时各自复位共用 uniform）
const 高度雾层: React.FC<{ 参数: NonNullable<环境描述['高度雾']> }> = ({ 参数 }) => {
  useHeightFog({ start: 参数.起点, halfLife: 参数.半衰, density: 参数.浓度 });
  return null;
};
const 方向雾层: React.FC<{ opts: Parameters<typeof useDirFog>[0] }> = ({ opts }) => {
  useDirFog(opts);
  return null;
};
const 自发光层: React.FC<{ k: number }> = ({ k }) => {
  useSelfLight(k);
  return null;
};

const 雾元素 = (f: 雾, 默认色: string) =>
  f.种类 === '线性' ? (
    <fog attach="fog" args={[f.色 ?? 默认色, f.近, f.远]} />
  ) : f.种类 === '指数平方' ? (
    <fogExp2 attach="fog" args={[f.色 ?? 默认色, Math.sqrt(Math.LN2) / f.能见度]} />
  ) : null;

// 投影要的远端：线性雾取远端，指数平方取能见度 × 1.5（同 飞行镜头.tsx 的 overworldShadowFar），没雾 3 公里；再照 shadowFarFor 封顶 3 公里、按四分之一八度取整
const 雾远端 = (f: 雾) => (f.种类 === '线性' ? f.远 : f.种类 === '指数平方' ? f.能见度 * 1.5 : 3000);

// 级联软投影的主光（同 暮色光照.tsx 的 TwilightSunLight、飞行镜头.tsx 的 OverworldSunLight）。归一：主世界那边先把光向归一再设（照原样，差一个末位也会让影子差一点）
const 投影主光: React.FC<{ 方向: V3; 归一: boolean; 色: string; 强: number; 远: number; 切分: number }> = ({ 方向, 归一, 色, 强, 远, 切分 }) => {
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

// 不投影的平行主光：放在镜头往光源方向 1000 米、照着镜头（同 FlightSky 不投影时）
const 平行主光: React.FC<{ 方向: V3; 色: string; 强: number; 镜头: readonly number[] }> = ({ 方向, 色, 强, 镜头 }) => {
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

const 原版云 = (c: Extract<云, { 种类: '原版' }>, 默认色: string) => (
  <Clouds height={c.高} radius={c.半径} color={c.色 ?? 默认色} offset={c.偏移 ? [c.偏移[0], c.偏移[1]] : undefined} />
);

const 暮色画法: React.FC<画法属性> = ({ e, 灯, 镜头, 离地, 穹顶中心 }) => {
  const mix = 档位配比(e.灯光);
  const 雾色 = (e.雾.种类 !== '无' && e.雾.色) || twilightFogColor;
  const 投影 = e.投影 !== false;
  const 云 = e.云;
  // TwilightClouds 的云天色、日光、天光是 暮色光照.tsx 里没导出的函数现算的，只能整个用它：海平面 0、默认天气，不加云、不让开
  if (云.种类 === 'photon' && (云.海平面 !== 0 || 云.天气 || 云.加?.length || 云.让开 || 云.镜头周围 || 云.曝光 !== undefined)) {
    throw new Error('暮色画法的 Photon 云只能是 TwilightClouds 那套（海平面 0、默认天气、不加不让）；要调参数得先让 暮色光照.tsx 导出云的天色函数');
  }
  return (
    <>
      {e.高度雾 && <高度雾层 参数={e.高度雾} />}
      <方向雾层 opts={twilightDusk && { sunDir: 灯.太阳, color: twilightDusk.afterglow, strength: twilightDusk.afterglowStrength }} />
      <自发光层 k={mix.自发光} />
      <color attach="background" args={[雾色]} />
      {雾元素(e.雾, 雾色)}
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <group position={(穹顶中心 ?? 镜头) as V3} scale={穹顶中心 ? 1 : 250}>
          <SkyDome twilight sun={灯.太阳} />
        </group>
        {投影 ? (
          <投影主光
            方向={灯.光向}
            归一={false}
            色={灯.月光 ? 月光色 : (twilightDusk?.keyLight ?? TWILIGHT.light)}
            强={mix.直射 * 灯.直射倍}
            远={(e.投影 && e.投影.远) || shadowFarFor(雾远端(e.雾))}
            切分={Math.max(300, 2 * 离地)}
          />
        ) : (
          <平行主光 方向={灯.光向} 色={灯.月光 ? 月光色 : (twilightDusk?.keyLight ?? TWILIGHT.light)} 强={mix.直射 * 灯.直射倍} 镜头={镜头} />
        )}
        <hemisphereLight args={[twilightDusk?.skyLight ?? TWILIGHT.skyLight, twilightDusk?.groundLight ?? TWILIGHT.groundLight, mix.天光 * 灯.天光倍]} position={[0, 0, 1]} />
        <ambientLight intensity={mix.环境光 * 灯.天光倍} />
        {云.种类 === '原版' && 原版云(云, twilightCloudColor)}
      </group>
      {云.种类 === 'photon' && <TwilightClouds sun={灯.太阳} />}
    </>
  );
};

const 主世界画法: React.FC<画法属性> = ({ e, 灯, 镜头, 离地, 穹顶中心 }) => {
  const mix = 档位配比(e.灯光);
  const 大气远 = e.大气远 === undefined ? 40000 : e.大气远;
  const 光色 = 灯.月光 ? 月光色 : SKY.sunLight;
  const 云 = e.云;
  return (
    <>
      <自发光层 k={mix.自发光} />
      {雾元素(e.雾, SKY.fog)}
      <group rotation={[-Math.PI / 2, 0, 0]}>
        {大气远 !== null && <Atmosphere sun={灯.太阳} far={大气远} />}
        {云.种类 === 'photon' && (
          <PhotonClouds
            weather={云.天气 && { temperature: 云.天气.温度, humidity: 云.天气.湿度, wind: 云.天气.风 }}
            add={云.加?.map((a) => [a[0], a[1], a[2]] as [number, number, number])}
            near={云.镜头周围 && [云.镜头周围[0], 云.镜头周围[1]]}
            clear={云.让开 && [云.让开[0], 云.让开[1], 云.让开[2], 云.让开[3]]}
            seaY={云.海平面}
            exposure={云.曝光}
          />
        )}
        <group position={(穹顶中心 ?? 镜头) as V3}>
          <SkyDome sun={灯.太阳} />
        </group>
        {e.投影 ? (
          <投影主光 方向={灯.光向} 归一 色={光色} 强={mix.直射 * 灯.直射倍} 远={e.投影.远 ?? shadowFarFor(雾远端(e.雾))} 切分={Math.max(300, 2 * 离地)} />
        ) : (
          <平行主光 方向={灯.光向} 色={光色} 强={mix.直射 * 灯.直射倍} 镜头={镜头} />
        )}
        <hemisphereLight args={[SKY.skyLight, SKY.groundLight, mix.天光 * 灯.天光倍]} position={[0, 0, 1]} />
        <ambientLight intensity={mix.环境光 * 灯.天光倍} />
        {云.种类 === '原版' && 原版云(云, '#ffffff')}
      </group>
    </>
  );
};

/** 画法 → 怎么画。加一种画法（下界、末地……）在这里加一项，环境.ts 的 画法 类型跟着加 */
export const 画法表: Readonly<Record<画法, React.FC<画法属性>>> = { 暮色: 暮色画法, 主世界: 主世界画法 };

export const 环境: React.FC<环境属性> = ({ 描述, 镜头, 离地, 穹顶中心, 帧 }) => {
  const 当前帧 = useCurrentFrame();
  const e = 环境在(描述, 帧 ?? 当前帧);
  const 灯 = 灯光系数(e);
  const 画 = 画法表[e.画法];
  if (!画) throw new Error(`没有画法「${e.画法}」（有：${Object.keys(画法表).join('、')}）`);
  return <画 e={e} 灯={灯} 镜头={镜头} 离地={离地 ?? 镜头[2]!} 穹顶中心={穹顶中心} />;
};
