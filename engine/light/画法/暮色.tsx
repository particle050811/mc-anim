// 暮色画法：同 暮色光照.tsx 的 TwilightLighting（背景色 + 线性雾 + 高度雾、余晖方向雾 + 暮色穹顶和星星 + 级联投影主光 + TwilightClouds）。
// 预设 暮色环境（环境预设.ts）出的画面和 TwilightLighting 逐像素比过：作品/应力转动/核对/环境/。
import React from 'react';
import { twilightDusk } from '../光照配比.ts';
import { SkyDome, TWILIGHT, twilightCloudColor, twilightFogColor } from '../天空.tsx';
import { TwilightClouds, shadowFarFor } from '../暮色光照.tsx';
import { tierMix } from '../灯光档位.ts';
import type { V3 } from '../环境.ts';
import { defineDraw, DirFogLayer, FarFogLayer, SkyBandsLayer, ParallelMainLight, ShadowMainLight, vanillaCloud, SelfLightLayer, fogElement, fogFarEnd, HeightFogLayer, type DrawProps } from '../环境部件.tsx';

// 按时刻算到月光时主光的颜色：暂定用暮色的偏蓝灰（原版光照贴图天暗时往蓝里偏，见 天空.tsx 的 TWILIGHT.light）
const moonLightColor = TWILIGHT.light;

const twilightPaint: React.FC<DrawProps> = ({ e, lighting, cameraPos, eyeHeight, domeCenter }) => {
  const mix = tierMix(e.lightSpec);
  const fogColor = (e.fog.种类 !== '无' && e.fog.色) || twilightFogColor;
  const castShadow = e.shadow !== false;
  const cloud = e.cloud;
  // TwilightClouds 的云天色、日光、天光是 暮色光照.tsx 里没导出的函数现算的，只能整个用它：海平面 0、默认天气，不加云、不让开
  if (cloud.种类 === 'photon' && (cloud.seaLevel !== 0 || cloud.weather || cloud.加?.length || cloud.clearRect || cloud.aroundCamera || cloud.exposure !== undefined)) {
    throw new Error('暮色画法的 Photon 云只能是 TwilightClouds 那套（海平面 0、默认天气、不加不让）；要调参数得先让 暮色光照.tsx 导出云的天色函数');
  }
  const lightColor = lighting.isMoonLight ? moonLightColor : (twilightDusk.keyLight);
  return (
    <>
      {e.heightFog && <HeightFogLayer params={e.heightFog} />}
      <DirFogLayer opts={{ sunDir: lighting.sun, color: twilightDusk.afterglow, strength: twilightDusk.afterglowStrength }} />
      <SelfLightLayer k={mix.selfLight} />
      {e.farFog && <FarFogLayer far={e.farFog.far} />}
      {e.farFog && <SkyBandsLayer opts={{ k: 0, bands: twilightDusk.skyColors, glow: twilightDusk.afterglow, glowK: twilightDusk.afterglowStrength, sunDir: lighting.sun }} />}
      <color attach="background" args={[fogColor]} />
      {fogElement(e.fog, fogColor)}
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <group position={(domeCenter ?? cameraPos) as V3} scale={domeCenter ? 1 : 250}>
          <SkyDome twilight sun={lighting.sun} />
        </group>
        {castShadow ? (
          <ShadowMainLight
            lightDir={lighting.lightDir}
            normalize={false}
            色={lightColor}
            strength={mix.direct * lighting.directMult}
            shadowFar={(e.shadow && e.shadow.far) || shadowFarFor(fogFarEnd(e.fog))}
            splitDist={Math.max(300, 2 * eyeHeight)}
          />
        ) : (
          <ParallelMainLight lightDir={lighting.lightDir} 色={lightColor} strength={mix.direct * lighting.directMult} cameraPos={cameraPos} />
        )}
        <hemisphereLight args={[twilightDusk.skyLight, twilightDusk.groundLight, mix.skylight * lighting.skyLightMult]} position={[0, 0, 1]} />
        <ambientLight intensity={mix.ambient * lighting.skyLightMult} />
        {cloud.种类 === '原版' && vanillaCloud(cloud, twilightCloudColor)}
      </group>
      {cloud.种类 === 'photon' && <TwilightClouds sun={lighting.sun} />}
    </>
  );
};

export default defineDraw('暮色', twilightPaint);
