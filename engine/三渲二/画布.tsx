// 三渲二画布：游戏世界镜头的 3D 画布，把平涂、机位、描边、不抗锯齿、不过色调映射一次配好。children 是场景内容，坐标照场景约定（Z 朝上，单位格），
// 这里已经套好 rotation [−π/2, 0, 0] 的 group 和 <平涂>；要描边的东西在 children 里用 <描边> 包住。
// 画布的 dpr = 截图放大倍数（engine/core/渲染级别.ts 的 canvasDpr），成片 2560×1440、Studio 里 1280×720。
// 光影（./光影/，用户 11-02 定自己写、按段开）默认关：不给 光影 时和没有这一项时逐像素一样；开了由光影层接管渲染，不描边。
import { ThreeCanvas } from '@remotion/three';
import React, { createContext, useContext, useMemo } from 'react';
import { canvasDpr } from '../core/渲染级别.ts';
import { 机位, 新相机, type 机位参数 } from './机位.tsx';
import { 描边渲染, type 描边参数 } from './描边.tsx';
import { 平涂, type 平涂参数 } from './平涂.tsx';
import { 光影渲染 } from './光影/光影渲染.tsx';
import { 合光影, type 光影场参数, type 光影选项 } from './光影/预设.ts';

export type 三渲二画布参数 = {
  /** 画布的 CSS 尺寸（取偶数）；整页就是 1280×720 */
  宽: number;
  高: number;
  机位: 机位参数;
  /** 背景（天空）色，sRGB */
  天?: string;
  /** 描边：false 或不给 = 不描 */
  描边?: 描边参数 | false;
  /** false = 不平涂、照原材质受光画（对比用） */
  平涂?: boolean;
  /** 光影的样式（作品默认值里按段列的）：不给或 null = 不开 */
  光影?: 光影选项 | null;
  /** 场景交代给光影的事实（太阳方向、海平面、时段）：不开光影时不管 */
  光影场?: 光影场参数;
  style?: React.CSSProperties;
  children: React.ReactNode;
} & 平涂参数;

/** 一块画面里的几张三渲二画布一起开光影（比如门口那半屏：屋子、身后两层林子、屋后远景各是一张画布）：包在外面的组件给，
 *  画布自己没给 光影 时照这里的样式（自己给了，null 也算，就照自己的）；场景事实两边合起来，画布自己给的优先（试看换了样式也照用） */
export const 光影范围 = createContext<{ 光影?: 光影选项 | null; 光影场?: 光影场参数 }>({});

export const 三渲二画布: React.FC<三渲二画布参数> = ({ 宽, 高, 机位: 参数, 天, 描边, 平涂: 开平涂 = true, 光影: 自己的, 光影场: 自己的场, style, children, ...平涂参 }) => {
  const 相机 = useMemo(() => 新相机(参数.种), [参数.种]);
  const 范围 = useContext(光影范围);
  const 光影 = 自己的 === undefined ? 范围.光影 : 自己的;
  const 光影场 = { ...范围.光影场, ...自己的场 };
  return (
    <ThreeCanvas key={参数.种} width={宽} height={高} gl={{ antialias: false }} flat dpr={canvasDpr(1)} camera={相机} style={style}>
      {天 && <color attach="background" args={[天]} />}
      <机位 参数={参数} />
      {光影 ? <光影渲染 选项={合光影(光影, 光影场)} 色调={平涂参.色调} /> : <描边渲染 参数={描边} />}
      <group rotation={[-Math.PI / 2, 0, 0]}>{开平涂 ? <平涂 {...平涂参}>{children}</平涂> : children}</group>
    </ThreeCanvas>
  );
};
