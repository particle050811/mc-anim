// 几段 Composition 各截一段 [从, 到) 首尾相接，拼成一个 Composition：每截是一个带 trimBefore 的 <Sequence>，
// 截里的组件看到的帧号和单独渲那一段时一样，声音也照那一段的放法、只出这一截的窗口，拼出来和旧的去帧拼接逐帧一样。
// 每秒：从、到 以 1/每秒 秒为一格（第 6、7 章的截表是 1/24 秒）；原生段按 Composition 帧率换算，可以落在两帧之间。不给就是当前时钟的帧（兼容层里是编排帧）。
import React from 'react';
import { Sequence } from 'remotion';
import { logRenderFrames } from '../audio/音效清单.ts';
import { use帧率 } from '../段/时间.tsx';

export type 截 = { 段: string; 从: number; 到: number };

export const 截长 = (截们: readonly 截[]) => 截们.reduce((n, c) => n + c.到 - c.从, 0);

export const 拼段: React.FC<{ 截们: readonly (截 & { 画: React.ComponentType })[]; 每秒?: number }> = ({ 截们, 每秒 }) => {
  logRenderFrames(截们.map((_, i) => 截长(截们.slice(0, i))));
  const r = use帧率();
  const k = 每秒 === undefined ? 1 : r / 每秒;
  let at = 0;
  return (
    <>
      {截们.map(({ 段, 从, 到, 画: Part }) => {
        const from = at;
        at += 到 - 从;
        return (
          <Sequence key={`${段}:${从}`} name={`${段} [${从}, ${到})`} from={from * k} durationInFrames={(到 - 从) * k} trimBefore={从 * k}>
            <Part />
          </Sequence>
        );
      })}
    </>
  );
};
