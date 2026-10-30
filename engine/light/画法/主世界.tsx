// 主世界画法：同 作品/应力转动/地点/飞行镜头.tsx 的 FlightSky + FlightFog（Photon 大气 + Photon 云 + 穹顶和方形太阳 + 日光 + 天光、环境光 + 指数平方雾），
// 按时刻算太阳时再加原版的月亮和星星（星月.tsx）。美术光向（描述写 太阳）不画星月：那个方向不一定在原版轨道上，预设 主世界环境 也要和 FlightSky 逐像素一样。
// 按时刻变天时，每换一个太阳方向 Photon 大气要在 CPU 上重展开一张 2048×1024 的天色图（大气.ts 的 apply），逐帧变的段每帧多花这一下。
import React from 'react';
import { Atmosphere } from '../大气.ts';
import { PhotonClouds } from '../大气/云.ts';
import { shadowFarFor } from '../暮色光照.tsx';
import { SKY, SkyDome, TWILIGHT } from '../天空.tsx';
import { 档位配比 } from '../灯光档位.ts';
import { 有效时刻, type V3 } from '../环境.ts';
import { 原版星月 } from '../星月.tsx';
import { 定义画法, 平行主光, 投影主光, 原版云, 自发光层, 雾元素, 雾远端, type 画法属性 } from '../环境部件.tsx';

// 按时刻算到月光时主光的颜色：暂定借暮色的偏蓝灰（同是原版光照贴图天暗时往蓝里偏，见 天空.tsx 的 TWILIGHT.light）
const 月光色 = TWILIGHT.light;

const 主世界: React.FC<画法属性> = ({ e, 灯, 镜头, 离地, 穹顶中心 }) => {
  const mix = 档位配比(e.灯光);
  const 大气远 = e.大气远 === undefined ? 40000 : e.大气远;
  const 光色 = 灯.月光 ? 月光色 : SKY.sunLight;
  const 云 = e.云;
  const 时刻 = e.太阳 === undefined ? 有效时刻(e) : null;
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
          {时刻 !== null && <原版星月 时刻={时刻} 倾角={e.轨道倾角} 天气={e.天气} />}
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

export default 定义画法('主世界', 主世界);
