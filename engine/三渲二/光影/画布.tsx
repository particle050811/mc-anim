// 带光影层的三渲二画布：参数和 engine/三渲二/画布.tsx 的 三渲二画布 一样，多一个 光影（不给或 null = 和原画布一样画，逐像素相同）。
// 不改原画布（共用代码只增不改：改它全片段的指纹都变），要光影的地方用这一个；试看时打包把原画布整个换成 试看画布.tsx。
// 开光影时不描边（本作品全片不描边，规矩 不描边）；给了描边会提醒一次。
import { ThreeCanvas } from '@remotion/three';
import React, { useMemo } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { canvasDpr } from '../../core/渲染级别.ts';
import type { 三渲二画布参数 } from '../画布.tsx';
import { 机位, 新相机 } from '../机位.tsx';
import { 描边渲染 } from '../描边.tsx';
import { 平涂 } from '../平涂.tsx';
import { 光影渲染 } from './光影渲染.tsx';
import type { 光影选项 } from './预设.ts';

export type 光影画布参数 = 三渲二画布参数 & { 光影?: 光影选项 | null };

let 提醒过描边 = false;

export const 光影三渲二画布: React.FC<光影画布参数> = ({ 宽, 高, 机位: 参数, 天, 描边, 平涂: 开平涂 = true, style, children, 光影, ...平涂参 }) => {
  const 相机 = useMemo(() => 新相机(参数.种), [参数.种]);
  const 帧 = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (光影 && 描边 && !提醒过描边) {
    提醒过描边 = true;
    console.warn('光影画布：开光影时不描边，描边参数不管');
  }
  return (
    <ThreeCanvas key={参数.种} width={宽} height={高} gl={{ antialias: false }} flat dpr={canvasDpr(1)} camera={相机} style={style}>
      {天 && <color attach="background" args={[天]} />}
      <机位 参数={参数} />
      {光影 ? <光影渲染 选项={光影} 色调={平涂参.色调} 秒={帧 / fps} /> : <描边渲染 参数={描边} />}
      <group rotation={[-Math.PI / 2, 0, 0]}>{开平涂 ? <平涂 {...平涂参}>{children}</平涂> : children}</group>
    </ThreeCanvas>
  );
};
