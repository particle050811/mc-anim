// 编排时钟：Composition 按输出帧率跑，段里的画面照旧按编排帧率（段.ts 的 fps）拿帧（engine/段/出帧.ts）。
// 外面包一层 Remotion 自带的 <Sequence playbackRate>：里面 useCurrentFrame() 拿到的是编排帧（输出 60、编排 24 时是 0、0.4、0.8…），
// 嵌套的 Sequence、拼段照旧按编排帧写。useVideoConfig().fps 还是输出帧率，所以画面里要秒数的用 use编排fps()。
// 声音不在这层出：Sequence 的 playbackRate 也会把里面的声音放慢，声音另按编排帧率单独出（pipeline 的声音那一遍）。
import React, { createContext, useContext, type ReactNode } from 'react';
import { Sequence, useVideoConfig } from 'remotion';

const 编排fpsContext = createContext<number | null>(null);

/** 画面里的帧率：编排时钟里是段.ts 的 fps，没包的（核对、旧组件单独挂）就是 Composition 的 */
export const use编排fps = () => {
  const 包 = useContext(编排fpsContext);
  const { fps } = useVideoConfig();
  return 包 ?? fps;
};

export const 编排时钟: React.FC<{ 编排fps: number; 输出fps: number; 相位: number; children: ReactNode }> = ({ 编排fps, 输出fps, 相位, children }) => (
  <编排fpsContext.Provider value={编排fps}>
    {编排fps === 输出fps && 相位 === 0 ? (
      children
    ) : (
      <Sequence playbackRate={编排fps / 输出fps} trimBefore={相位} layout="none" name="编排时钟">
        {children}
      </Sequence>
    )}
  </编排fpsContext.Provider>
);
