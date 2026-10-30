// 暮色画法：同 暮色光照.tsx 的 TwilightLighting（背景色 + 线性雾 + 高度雾、余晖方向雾 + 暮色穹顶和星星 + 级联投影主光 + TwilightClouds）。
// 预设 暮色环境（环境预设.ts）出的画面和 TwilightLighting 逐像素比过：作品/应力转动/核对/环境/。
import React from 'react';
import { twilightDusk } from '../光照配比.ts';
import { SkyDome, TWILIGHT, twilightCloudColor, twilightFogColor } from '../天空.tsx';
import { TwilightClouds, shadowFarFor } from '../暮色光照.tsx';
import { 档位配比 } from '../灯光档位.ts';
import type { V3 } from '../环境.ts';
import { 定义画法, 方向雾层, 平行主光, 投影主光, 原版云, 自发光层, 雾元素, 雾远端, 高度雾层, type 画法属性 } from '../环境部件.tsx';

// 按时刻算到月光时主光的颜色：暂定用暮色的偏蓝灰（原版光照贴图天暗时往蓝里偏，见 天空.tsx 的 TWILIGHT.light）
const 月光色 = TWILIGHT.light;

const 暮色: React.FC<画法属性> = ({ e, 灯, 镜头, 离地, 穹顶中心 }) => {
  const mix = 档位配比(e.灯光);
  const 雾色 = (e.雾.种类 !== '无' && e.雾.色) || twilightFogColor;
  const 投影 = e.投影 !== false;
  const 云 = e.云;
  // TwilightClouds 的云天色、日光、天光是 暮色光照.tsx 里没导出的函数现算的，只能整个用它：海平面 0、默认天气，不加云、不让开
  if (云.种类 === 'photon' && (云.海平面 !== 0 || 云.天气 || 云.加?.length || 云.让开 || 云.镜头周围 || 云.曝光 !== undefined)) {
    throw new Error('暮色画法的 Photon 云只能是 TwilightClouds 那套（海平面 0、默认天气、不加不让）；要调参数得先让 暮色光照.tsx 导出云的天色函数');
  }
  const 光色 = 灯.月光 ? 月光色 : (twilightDusk?.keyLight ?? TWILIGHT.light);
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
            色={光色}
            强={mix.直射 * 灯.直射倍}
            远={(e.投影 && e.投影.远) || shadowFarFor(雾远端(e.雾))}
            切分={Math.max(300, 2 * 离地)}
          />
        ) : (
          <平行主光 方向={灯.光向} 色={光色} 强={mix.直射 * 灯.直射倍} 镜头={镜头} />
        )}
        <hemisphereLight args={[twilightDusk?.skyLight ?? TWILIGHT.skyLight, twilightDusk?.groundLight ?? TWILIGHT.groundLight, mix.天光 * 灯.天光倍]} position={[0, 0, 1]} />
        <ambientLight intensity={mix.环境光 * 灯.天光倍} />
        {云.种类 === '原版' && 原版云(云, twilightCloudColor)}
      </group>
      {云.种类 === 'photon' && <TwilightClouds sun={灯.太阳} />}
    </>
  );
};

export default 定义画法('暮色', 暮色);
