// 暮色森林统一光照：6-1-3 起飞到 6-1-9 降落整段（含一镜到底）都用这一套，和 6-1-2（镜头/6-1-2/娜迦参考模型.tsx）同一个配方。
// 为什么：用户 10-02 要 6-1-2 的暮色灯光和天空贯穿，免得起飞那帧天色跳变。暮色游戏里没有太阳，要方块分得出明暗面、留一道弱冷光、全程一致。
// 10-07 起默认是黄昏档（lib/光照配比.ts 的 `twilightDusk`）：灯、天色、雾色、云色都是落日的，下面说的薄荷绿、灰青是不开黄昏档时的样子。
// 配方（取自 模型/场景/天空.tsx 的 `TWILIGHT`，同 6-1-2）：
// - 天：`SkyDome` twilight（头顶深蓝、往下渐亮、地平线一圈薄荷绿、满天星星，没有太阳），背景色 = 雾色；
// - 光：暮色主光（方向 `twilightSunDir`，强度见 lib/光照配比.ts 的 `twilightMix`：以直射为主，照 Photon；地形和人物都投软影子，见 lib/级联阴影.ts）；
// - 雾：线性雾，颜色 `TWILIGHT`.fog（薄荷绿），林子里（6-1-1、6-1-2、6-1-3 起飞前）照全片的满视距只在 512 米边上淡出（lib/视距.ts）；飞上天后按镜头高度放远（`twilightFogFar`、`twilightFogNear`），再叠一层高度雾（`twilightHeightFog`，lib/高度雾.ts）；
// - 云：`TwilightClouds`（Photon 的云 + 暮色光照，用户 10-15 定，暮色所有镜头都用它）。
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { SunLight } from 'three/examples/jsm/lights/SunLight.js';
import { CloudOnlyAtmosphere } from './大气.ts';
import { PhotonClouds } from './大气/云.ts';
import type { V3 } from '../model/parts.tsx';
import { VIEW_DISTANCE, VIEW_FOG } from '../voxel/视距.ts';
import { SkyDome, TWILIGHT, twilightFogColor } from './天空.tsx';
import { useSelfLight, twilightSunDir, twilightMix, twilightDusk } from './光照配比.ts';
import { CascadedShadow, quarterOctaveCeil } from './级联阴影.ts';
import { useDirFog, useHeightFog, type HeightFogParams } from './高度雾.ts';

// 雾的远端（米）：按镜头离地高度放远，220 米以上 22 公里（冲出林海要看得到天边）；地面不近于全片的满视距（lib/视距.ts，用户 10-21「按照规矩来」）。
// 往上放远的那条曲线是一镜到底按它调好的，只把底抬到视距，所以式子里还是从 240 起
export const twilightFogFar = (aboveGround: number) => {
  const k = Math.min(1, Math.max(0, (aboveGround - 20) / 200));
  const eased = k * k * (3 - 2 * k);
  return Math.max(VIEW_DISTANCE, Math.exp(Math.log(240) + (Math.log(22000) - Math.log(240)) * eased));
};
// 一镜到底巡航时雾远端的下限（米）；6-1-3 起飞后也放到这么远，末帧才和 6-1-4 首帧接得上
export const TWILIGHT_CRUISE_FOG_FAR = 3500;
// 往导入范围的边那边看时，雾的远端压到边以内（模型/场景/暮色新世界 的 `viewEdgeDistance`），边就融进雾里；但最近只压到 900 米
export const TWILIGHT_EDGE_FOG_MIN = 900;
export const clampFogToEdge = (fogFar: number, edgeDist: number) => Math.min(fogFar, Math.max(TWILIGHT_EDGE_FOG_MIN, edgeDist));
// 雾的近端（米），按远端取：林子里（远端 = 视距）只在视距边上淡出（同 `VIEW_FOG`），远端到巡航下限以上是远端的 1/4，中间按远端的对数平滑过渡（6-1-3 起飞那几帧）
export const twilightFogNear = (fogFar: number) => {
  const groundRatio = VIEW_FOG.near / VIEW_FOG.far;
  const k = Math.min(1, Math.max(0, Math.log(fogFar / VIEW_FOG.far) / Math.log(TWILIGHT_CRUISE_FOG_FAR / VIEW_FOG.far)));
  return fogFar * (groundRatio + (0.25 - groundRatio) * k * k * (3 - 2 * k));
};

// 暮色森林的高度雾（lib/高度雾.ts）：从地面（场景 z = 0）往上每 30 米淡一半，贴地每公里透过率 e^−0.25。离地 200 米时 3 公里外地面蒙一成多雾色、6 公里约三成，再远交给线性雾；高处的终焉高原（地面 32 米）比谷底清楚。
// 林子里（6-1-2，离地十几米）到视距边上（512 米）约多一成，6-1-2 → 6-1-3 接得上。用户 10-04 定加高度雾；导入真实地形后高差变大，起点和半衰要按新地形重调
export const twilightHeightFog: HeightFogParams = { start: 0, halfLife: 30, density: 2.5e-4 };

// 暮色的雾：高度雾 + 黄昏档的方向雾（远处往太阳那边褪成余晖色，lib/高度雾.ts）。`TwilightLighting` 和 6-1-1、6-1-2 自己搭场景的都调这个。光向：余晖往哪边褪（指向太阳，不给就是 `twilightSunDir`；6-1-2 自己定了光向，要和主光同向）
export const useTwilightFog = (sunDir: V3 = twilightSunDir) => {
  useHeightFog(twilightHeightFog);
  useDirFog(twilightDusk && { sunDir, color: twilightDusk.afterglow, strength: twilightDusk.afterglowStrength });
};

// 暮色主光：主光（three 的 `SunLight`，三级级联软投影 lib/级联阴影.ts）+ 天光 + 环境光，强度都是 `twilightMix`，方块材质的自发光系数也跟着设。放在 Z 朝上的场景组里。
// 光向：指向光源（不给就是 `twilightSunDir`）；远：投影远端（米）；切分：中、远两级大约在哪切（米，最多切到远端的一半）。影子边近处 0.18 米，往远渐变到远一级的一像素上下（见 级联阴影.ts）。
// 画面里的东西要投影得自己开 castShadow（体素世界给 `shadowLightDir` 才建投影网格，见 lib/体素/世界.tsx；光向要和这里一样）
// 倍：这一场的灯（直射、天光、环境光、自发光）一起乘，同 lib/光照配比.ts 的 `lightGain`，只管这一处（6-1-2 太阳抬高后庭院大片受光，压一点免得冲白）
export const TwilightSunLight: React.FC<{ lightDir?: V3; shadowFar: number; splitDist?: number; gain?: number }> = ({ lightDir = twilightSunDir, shadowFar: shadowFar, splitDist = 300, gain: gain = 1 }) => {
  useSelfLight(twilightMix.自发光 * gain);
  const light = useMemo(() => {
    const sunLight = new SunLight(twilightDusk?.keyLight ?? TWILIGHT.light, twilightMix.直射);
    const sh = new CascadedShadow();
    sh.mapSize.set(4096, 4096);
    // 阴影遍画的是背光面（three 对正面材质画背面），受光面不会被自己的影子盖住，偏移只留一点点
    sh.bias = 0;
    sh.normalBias = 0.02;
    sunLight.shadow = sh;
    sunLight.castShadow = true;
    return sunLight;
  }, []);
  useEffect(() => () => light.dispose(), [light]);
  light.position.set(...lightDir);
  light.intensity = twilightMix.直射 * gain;
  const sh = light.shadow as CascadedShadow;
  sh.camera.far = shadowFar;
  sh.splitDist = splitDist;
  return (
    <>
      <primitive object={light} />
      {/* 天光的"上"是灯的位置方向，场景坐标 Z 朝上 */}
      <hemisphereLight args={[twilightDusk?.skyLight ?? TWILIGHT.skyLight, twilightDusk?.groundLight ?? TWILIGHT.groundLight, twilightMix.天光 * gain]} position={[0, 0, 1]} />
      <ambientLight intensity={twilightMix.环境光 * gain} />
    </>
  );
};

// 投影的远端：雾的远端，不超过 3 公里，再按四分之一个八度往上取整（镜头升降时级联大小不每帧变，否则影子边每帧换一套像素格会游动），所以一镜到底实际是 2^11.75 ≈ 3444 米。
// 用户对远处的「分界线」很敏感：再远的影子以后按高度图另算，与这里同一条淡出曲线接上。6-1-2、6-1-1 在林子里自己放 `TwilightSunLight` 也按这个取（雾远 = 视距 512 米）
export const shadowFarFor = (fogFar: number) => quarterOctaveCeil(Math.min(fogFar, 3000));

// 天、光、雾、云一起放（直接放在 ThreeCanvas 下面，雾和背景色挂在场景上；云要画布挂 <ScreenAo />）。
// 镜头：镜头位置（穹顶跟着它）；穹顶中心：不给就跟镜头（地面镜头要和 6-1-2 逐像素一致时给 [0,0,0]，6-1-2 穹顶在原点、半径 480）。
// 跟着镜头时穹顶放大到 120 公里：星星是半透明点、最后画又不被雾盖，穹顶只 480 米的话高空往下看时 480 米外的地面会撒满星星；放大后星星大小不变（按像素画）。
// 雾远：雾的远端（米）；雾近：近端（米，不给就是远 × 0.25；贴地的镜头给 `twilightFogNear`(雾远)）；离地：镜头离地多高（米，不给就是镜头的 z）。投影的中、远两级切在 max(300, 2 × 离地) 米，近处地面都在细的那两级里
export const TwilightLighting: React.FC<{ camPos: number[]; domeCenter?: number[]; fogFar: number; fogNear?: number; aboveGround?: number }> = ({ camPos: camPos, domeCenter, fogFar: fogFar, fogNear = fogFar * 0.25, aboveGround: aboveGround = camPos[2] }) => {
  useTwilightFog();
  return (
    <>
      <color attach="background" args={[twilightFogColor]} />
      <fog attach="fog" args={[twilightFogColor, fogNear, fogFar]} />
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <group position={(domeCenter ?? camPos) as V3} scale={domeCenter ? 1 : 250}>
          <SkyDome twilight sun={twilightSunDir} />
        </group>
        <TwilightSunLight shadowFar={shadowFarFor(fogFar)} splitDist={Math.max(300, 2 * aboveGround)} />
      </group>
      <TwilightClouds />
    </>
  );
};

// ---------- 暮色的云（用户 10-15 定：Photon 云 + 暮色光照） ----------
// 形状、高度、天气同主世界（lib/大气/云.ts，积云每团云底在离地 300～1100 米），天、雾、灯不换。云的光照：
// - 远处融进的天色 = 暮色穹顶的颜色（同 模型/场景/天空.tsx 的 skyShader 暮色那支，含余晖）；
// - 日光 = 暮色主光的颜色 × 直射 × 0.9（主世界 Photon 云高处的日光亮度 ≈ FlightSky 直射 8.4 × 0.9）；
// - 天光照 Photon 的取法：天色在仰角正弦 0.78、和太阳方位垂直那一点 × 2π × 1.13。
const linColor = (hex: string) => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};
const skyBands = (twilightDusk?.skyColors ?? TWILIGHT.sky).map(([at, hex]) => [at, linColor(hex)] as const);
const glowColor = twilightDusk ? linColor(twilightDusk.afterglow) : null;
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
// 暮色穹顶在方向 d 的颜色（线性），sun：余晖朝哪边
const twilightSkyAt = (sun: V3) => (d: number[]) => {
  const h = d[2];
  let col = [...skyBands[0][1]];
  for (let i = 1; i < skyBands.length; i++) {
    const k = smoothstep(skyBands[i - 1][0], skyBands[i][0], h);
    col = col.map((x, j) => x + (skyBands[i][1][j] - x) * k);
  }
  if (glowColor && twilightDusk) {
    const s = sun;
    const sl = Math.hypot(...s);
    const gk = twilightDusk.afterglowStrength;
    const lh = Math.hypot(d[0], d[1]) || 1;
    const ls = Math.hypot(s[0], s[1]);
    const az = Math.max((d[0] * s[0] + d[1] * s[1]) / lh / ls, 0);
    const m = gk * az ** 3 * (1 - smoothstep(-0.05, 0.4, h));
    const halo = gk * 0.6 * Math.max((d[0] * s[0] + d[1] * s[1] + d[2] * s[2]) / sl, 0) ** 40;
    col = col.map((x, j) => x + (glowColor[j] - x) * m + glowColor[j] * halo);
  }
  return col;
};
const cloudLight = linColor(twilightDusk?.keyLight ?? TWILIGHT.light).map((x) => x * twilightMix.直射 * 0.9);
const cloudAmbient = (sun: V3) => {
  const l = Math.hypot(sun[0], sun[1]);
  const c = Math.sqrt(1 - 0.78 * 0.78);
  return twilightSkyAt(sun)([(-sun[1] / l) * c, (sun[0] / l) * c, 0.78]).map((x) => x * 2 * Math.PI * 1.13);
};
// 要挂 <ScreenAo />（云画在它第 3 遍的水面之后，见 lib/大气/云.ts 的 `PhotonClouds`），没挂就不画。sun：指向主光（不给就是 `twilightSunDir`，6-1-2 的庭院另有光向）
export const TwilightClouds: React.FC<{ sun?: V3 }> = ({ sun = twilightSunDir }) => {
  const skyAt = useMemo(() => twilightSkyAt(sun), [sun[0], sun[1], sun[2]]);
  const ambient = useMemo(() => cloudAmbient(sun), [sun[0], sun[1], sun[2]]);
  return (
    <>
      <CloudOnlyAtmosphere sun={sun} skyAt={skyAt} light={cloudLight} ambient={ambient} skyKey={sun.join(',')} />
      <PhotonClouds seaY={0} />
    </>
  );
};
