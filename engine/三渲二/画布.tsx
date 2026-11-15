// 三渲二画布：游戏世界镜头的 3D 画布，把平涂、机位、描边、不抗锯齿、不过色调映射一次配好。children 是场景内容，坐标照场景约定（Z 朝上，单位格），
// 这里已经套好 rotation [−π/2, 0, 0] 的 group 和 <平涂>；要描边的东西在 children 里用 <描边> 包住。
// 画布的 dpr = 截图放大倍数（engine/core/渲染级别.ts 的 canvasDpr），成片 2560×1440、Studio 里 1280×720。
// 光影（./光影/，用户 11-02 定自己写、按段开）默认关：不给 光影 时和没有这一项时逐像素一样；开了由光影层接管渲染，不描边。
import { ThreeCanvas } from '@remotion/three';
import React, { createContext, useContext, useMemo } from 'react';
import { canvasDpr } from '../core/渲染级别.ts';
import { CameraRig, newCamera, type CameraRigParams } from './机位.tsx';
import { OutlineRender, type OutlineParams } from './描边.tsx';
import { FlatShade, type FlatPaintParams } from './平涂.tsx';
import { ShadingRender } from './光影/光影渲染.tsx';
import { mergeShading, type ShadingSceneParams, type ShadingOptions } from './光影/预设.ts';

export type ToonCanvasParams = {
  /** 画布的 CSS 尺寸（取偶数）；整页就是 1280×720 */
  宽: number;
  高: number;
  cameraRig: CameraRigParams;
  /** 背景（天空）色，sRGB */
  天?: string;
  /** 描边：false 或不给 = 不描 */
  outline?: OutlineParams | false;
  /** false = 不平涂、照原材质受光画（对比用） */
  flatShade?: boolean;
  /** 光影的样式（作品默认值里按段列的）：不给或 null = 不开 */
  shading?: ShadingOptions | null;
  /** 场景交代给光影的事实（太阳方向、海平面、时段）：不开光影时不管 */
  shadingScene?: ShadingSceneParams;
  style?: React.CSSProperties;
  children: React.ReactNode;
} & FlatPaintParams;

/** 一块画面里的几张三渲二画布一起开光影（比如门口那半屏：屋子、身后两层林子、屋后远景各是一张画布）：包在外面的组件给，
 *  画布自己没给 光影 时照这里的样式（自己给了，null 也算，就照自己的）；场景事实两边合起来，画布自己给的优先（试看换了样式也照用） */
export const shadingScope = createContext<{ shading?: ShadingOptions | null; shadingScene?: ShadingSceneParams }>({});

export const ToonCanvas: React.FC<ToonCanvasParams> = ({ 宽: width, 高: height, cameraRig: params, 天: sky, outline, flatShade: flatOn = true, shading: ownShade, shadingScene: ownShadingScene, style, children, ...paintProps }) => {
  const camera = useMemo(() => newCamera(params.种), [params.种]);
  const scope = useContext(shadingScope);
  const shading = ownShade === undefined ? scope.shading : ownShade;
  const shadingScene = { ...scope.shadingScene, ...ownShadingScene };
  return (
    <ThreeCanvas key={params.种} width={width} height={height} gl={{ antialias: false }} flat dpr={canvasDpr(1)} camera={camera} style={style}>
      {sky && <color attach="background" args={[sky]} />}
      <CameraRig 参数={params} />
      {shading ? <ShadingRender options={mergeShading(shading, shadingScene)} tint={paintProps.tint} /> : <OutlineRender 参数={outline} />}
      <group rotation={[-Math.PI / 2, 0, 0]}>{flatOn ? <FlatShade {...paintProps}>{children}</FlatShade> : children}</group>
    </ThreeCanvas>
  );
};
