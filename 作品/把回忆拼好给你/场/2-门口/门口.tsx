// 门口这一场的画布：后面一张 2D 的天（地点/天空.tsx），开了 远景 的话中间一块透视画布画屋后的地、樱花林、云和雾（地点/屋后远景.tsx），
// 前面三渲二画布（平涂、正交像素机位带俯角、描边，背景透明）里放小木屋，
// 角色放 children（Z 朝上，坐标同 地点/门口小木屋.tsx；要描边的自己包 <描边>），气泡、聊天栏放 叠层。整片后期在段里包在最外面。
import React from 'react';
import { ToonCanvas, shadingScope } from '@engine/三渲二/画布.tsx';
import { shadingDrawsCloud, type ShadingSceneParams, type ShadingOptions } from '@engine/三渲二/光影/预设.ts';
import type { Tone } from '@engine/三渲二/调子.ts';
import { sideRig } from '../../地点/侧剖面.tsx';
import { SideSectionSky, type SideSkyProps } from '../../地点/天空.tsx';
import type { SkyArc as SkyArc } from '../../地点/天体.ts';
import { EntranceCabin, type EntranceCabinProps } from '../../地点/门口小木屋.tsx';
import { BehindHouseVista, type BackViewOptions } from '../../地点/屋后远景.tsx';
import { outline as defaultOutline } from '../../画风.ts';
import { palette, type ToneName } from '../../色板.ts';
import { framing as defaultFraming, skyColors, orthoTop, dayShadingScene, dayTick, defaultSkyArc, biome, type DoorFraming } from './参数.ts';

const scaleColor = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(Math.min(255, v * k)));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};

export type DoorCanvasProps = EntranceCabinProps & {
  /** 画布的页面尺寸（成片 scale 2），要偶数；半屏给 宽 640 和 半屏取景(1280, …) */
  width?: number;
  height?: number;
  /** 默认 N = 6 的整屏取景（参数.ts 的 取景，核对-门口 用）。成片里整屏的镜头传 参数.ts 的 整屏镜头（N = 10，连 描边宽 一起：{...整屏镜头}）；
   *  半屏用 半屏取景(…) */
  framing?: DoorFraming;
  /** 斜投影俯角（画风.ts 的 正交顶面）；0 = 纯侧面 */
  topDepth?: number;
  /** 游戏刻（地点/天体.ts：0 日出、6000 正午、18000 午夜，可以超过 24000 往后数天），天色和太阳月亮跟着走；默认 白天刻 */
  刻?: number;
  /** 太阳月亮走的弧；null 不画太阳月亮。默认 参数.ts 的 默认天弧（跟着取景和画布大小算） */
  arc?: SkyArc | null;
  /** 天随昼夜变暗的程度（0～1） */
  lightDarkAmp?: number;
  /** 太阳月亮身后的残影（第 13 句快转），见 地点/天空.tsx */
  afterimage?: SideSkyProps['afterimage'];
  /** 3D 的调子（色板.ts 的名字，或 插调子 插出来的）：平涂色调、描边色从这里取；天不用调子的，另画。默认 夏日白天 */
  tone?: ToneName | Tone;
  /** 再乘在平涂色调上的亮度（sRGB 乘数）：夜里压暗方块和角色，发光的（火把）不乘 */
  brightness?: number;
  /** 描边宽（成片像素）。坑：默认固定是 画风.ts 的 6，不跟着 取景 的 N 走（核对-门口 的 N = 8、10 对比帧就是 6 像素线）；
   *  取景换了 N 的镜头要自己传 取景.每格 / 16，线才是一个贴图像素宽（参数.ts 的 整屏镜头 里带着） */
  outlineWidth?: number;
  /** 屋后的远景（地点/屋后远景.tsx：同第 6、7 句那片起伏的地、樱花林、橡树，远处照原版的雾淡进天里）：true 开，给对象可以再给 云；
   *  默认不画（第 8 句起各句自己开） */
  farView?: boolean | BackViewOptions;
  /** 画在三维画布上面的 2D 叠层（气泡、聊天栏），坐标是这块画布的页面坐标（地点/侧剖面.tsx 的 侧投影 算，顶面要同一个） */
  overlay?: React.ReactNode;
  /** 三维的场景内容：角色等 */
  children?: React.ReactNode;
  /** 光影的样式（段里传 默认.ts 的 光影段[段键]）：不给 = 不开。开了天以外的几张画布（屋子、屋后远景或身后的林子）一起开，
   *  太阳照 参数.ts 的 白天光影场。样式开了 Photon 天和光影层的云、又开着 远景 时，天、云在屋后远景那张透视画布的光影层画，2D 天、远景的原版云不画 */
  shading?: ShadingOptions | null;
  /** 再盖在 白天光影场 上的光影场（海平面、Photon 云的洞这些按帧变的事） */
  shadingScene?: ShadingSceneParams;
};

/** 门口这几张三维画布一起开光影（engine 三渲二画布的 光影范围）；不开时原样 */
export const DoorShading: React.FC<{ shading?: ShadingOptions | null; shadingScene?: ShadingSceneParams; children: React.ReactNode }> = ({ shading, shadingScene, children }) =>
  shading ? <shadingScope.Provider value={{ shading, shadingScene: { ...dayShadingScene, ...shadingScene } }}>{children}</shadingScope.Provider> : children;

/** 一块 宽 × 高 的定位容器：天、三维、叠层三层叠在一起 */
export const DoorCanvas: React.FC<DoorCanvasProps> = ({
  width: width = 1280,
  height: height = 720,
  framing = defaultFraming,
  topDepth = orthoTop,
  刻: tick = dayTick,
  arc,
  lightDarkAmp,
  afterimage,
  tone: tone = '夏日白天',
  brightness = 1,
  outlineWidth = defaultOutline.width,
  farView: farView = false,
  overlay: overlay,
  children,
  biome: biomeName = biome,
  shading,
  shadingScene,
  ...houseProps
}) => {
  if (width % 2 || height % 2) throw new Error(`门口画布的宽高要是偶数：${width}×${height}`);
  const skyArc = arc === null ? undefined : (arc ?? defaultSkyArc(framing, width, height));
  const t = typeof tone === 'string' ? palette[tone] : tone;
  const tint = scaleColor(t.tint, brightness);
  // 只有透视画布画得出 Photon 的天（光影渲染.tsx 的 画天），这里就是屋后远景那张；它比画面高、盖满整块，画布不透明
  const photonSky = !!farView && shadingDrawsCloud(shading);
  return (
    <DoorShading shading={shading} {...(shadingScene ? { shadingScene } : {})}>
      <div style={{ position: 'relative', width: width, height: height, overflow: 'hidden' }}>
        {!photonSky && <SideSectionSky framing={framing} width={width} height={height} 色={skyColors} 刻={tick} arc={skyArc} lightDarkAmp={lightDarkAmp} afterimage={afterimage} />}
        {farView && (
          <BehindHouseVista
            {...(farView === true || photonSky ? {} : farView)}
            framing={framing}
            width={width}
            height={height}
            topDepth={topDepth}
            tint={tint}
            skyColors={skyColors}
            刻={tick}
            lightDarkAmp={lightDarkAmp ?? 1}
          />
        )}
        <ToonCanvas
          width={width}
          height={height}
          cameraRig={sideRig(framing, topDepth)}
          tint={tint}
          outline={defaultOutline.开 ? { width: outlineWidth, 色: t.outlineColor } : false}
          style={{ position: 'absolute', left: 0, top: 0 }}
        >
          <EntranceCabin {...houseProps} biome={biomeName} />
          {children}
        </ToonCanvas>
        {overlay}
      </div>
    </DoorShading>
  );
};
