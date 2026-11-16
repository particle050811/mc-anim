// 主世界画法：同 作品/应力转动/地点/飞行镜头.tsx 的 FlightSky + FlightFog（Photon 大气 + Photon 云 + 穹顶和方形太阳 + 日光 + 天光、环境光 + 指数平方雾），
// 按时刻算太阳时再加原版的月亮和星星（星月.tsx）。美术光向（描述写 太阳）不画星月：那个方向不一定在原版轨道上，预设 主世界环境 也要和 FlightSky 逐像素一样。
// 按时刻变天时，每换一个太阳方向 Photon 大气要在 CPU 上重展开一张 2048×1024 的天色图（大气.ts 的 apply），逐帧变的段每帧多花这一下。
import React from 'react';
import { Atmosphere } from '../大气.ts';
import { PhotonClouds } from '../大气/云.ts';
import { shadowFarFor } from '../暮色光照.tsx';
import { SKY, SkyDome, TWILIGHT } from '../天空.tsx';
import { tierMix } from '../灯光档位.ts';
import { effectiveGameTime, type V3 } from '../环境.ts';
import { VanillaStarMoon } from '../星月.tsx';
import { defineDraw, ParallelMainLight, ShadowMainLight, vanillaCloud, SelfLightLayer, fogElement, fogFarEnd, type DrawProps } from '../环境部件.tsx';

// 按时刻算到月光时主光的颜色：暂定借暮色的偏蓝灰（同是原版光照贴图天暗时往蓝里偏，见 天空.tsx 的 TWILIGHT.light）
const moonLightColor = TWILIGHT.light;

const overworldPaint: React.FC<DrawProps> = ({ e, lighting, cameraPos, eyeHeight, domeCenter }) => {
  const mix = tierMix(e.lightSpec);
  const atmosphereFar = e.atmosphereFar === undefined ? 40000 : e.atmosphereFar;
  const lightColor = lighting.isMoonLight ? moonLightColor : SKY.sunLight;
  const cloud = e.cloud;
  const gameTime = e.sun === undefined ? effectiveGameTime(e) : null;
  return (
    <>
      <SelfLightLayer k={mix.selfLight} />
      {fogElement(e.fog, SKY.fog)}
      <group rotation={[-Math.PI / 2, 0, 0]}>
        {atmosphereFar !== null && <Atmosphere sun={lighting.sun} far={atmosphereFar} />}
        {cloud.种类 === 'photon' && (
          <PhotonClouds
            weather={cloud.weather && { temperature: cloud.weather.temperature, humidity: cloud.weather.humidity, wind: cloud.weather.wind }}
            add={cloud.加?.map((a) => [a[0], a[1], a[2]] as [number, number, number])}
            near={cloud.aroundCamera && [cloud.aroundCamera[0], cloud.aroundCamera[1]]}
            clear={cloud.clearRect && [cloud.clearRect[0], cloud.clearRect[1], cloud.clearRect[2], cloud.clearRect[3]]}
            seaY={cloud.seaLevel}
            exposure={cloud.exposure}
          />
        )}
        <group position={(domeCenter ?? cameraPos) as V3}>
          <SkyDome sun={lighting.sun} />
          {gameTime !== null && <VanillaStarMoon gameTime={gameTime} tiltDeg={e.orbitTilt} weather={e.weather} />}
        </group>
        {e.shadow ? (
          <ShadowMainLight lightDir={lighting.lightDir} normalize 色={lightColor} strength={mix.direct * lighting.directMult} shadowFar={e.shadow.far ?? shadowFarFor(fogFarEnd(e.fog))} splitDist={Math.max(300, 2 * eyeHeight)} />
        ) : (
          <ParallelMainLight lightDir={lighting.lightDir} 色={lightColor} strength={mix.direct * lighting.directMult} cameraPos={cameraPos} />
        )}
        <hemisphereLight args={[SKY.skyLight, SKY.groundLight, mix.skylight * lighting.skyLightMult]} position={[0, 0, 1]} />
        <ambientLight intensity={mix.ambient * lighting.skyLightMult} />
        {cloud.种类 === '原版' && vanillaCloud(cloud, '#ffffff')}
      </group>
    </>
  );
};

export default defineDraw('主世界', overworldPaint);
