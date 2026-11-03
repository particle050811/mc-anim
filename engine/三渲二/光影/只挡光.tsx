// 只挡光：里面的东西平时看不见，开了光影只进太阳的影子图（光影渲染.tsx 第 1 步），挡光、不上画面。
// 为的是侧剖面剖掉的那面墙：镜头看不见它，可太阳（月亮）照进屋还得从墙上的窗口进（作品/把回忆拼好给你/场/2-卧室/）。
import type React from 'react';

export const 只挡光: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <group visible={false} userData={{ 只挡光: true }}>
    {children}
  </group>
);
