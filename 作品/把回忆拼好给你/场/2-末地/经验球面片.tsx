// 经验球的画法，照 1.20.1 ExperienceOrbRenderer：朝镜头的方片，边长 0.3 格、中心在球的位置往上 0.175；贴图按 getIcon 取 4×4 格里的一格；
// 顶点色 r = (sin(t/2) + 1)/2、g = 1、b = (sin(t/2 + 4.18879) + 1) × 0.1（t = 球的年龄刻），透明度 128，半透明混合。位置和年龄见 经验球.ts、编排.ts。
// 原版球的亮度至少是方块光 7 级再往上加，末地里看着是满亮，这里不受光。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { ParticleQuads, particleTexture, type Particle } from '@库/特效/粒子面片.tsx';
import 球图 from 'asset:贴图/特效/经验球';
import { 球图标, type 球态 } from './经验球.ts';

const 图 = png(球图);
const 贴图 = particleTexture(图.px, 图.w, 图.h, 图);

export const 经验球面片: React.FC<{ 球们: readonly 球态[] }> = ({ 球们 }) => {
  const items: Particle[] = 球们.map((b) => {
    const i = 球图标(b.值);
    const u0 = (i % 4) / 4, v0 = Math.floor(i / 4) / 4;
    const t = b.龄 / 2;
    return {
      p: [b.位[0], b.位[1], b.位[2] + 0.175],
      half: 0.15,
      uv: [u0, v0, u0 + 0.25, v0 + 0.25],
      color: [(Math.sin(t) + 1) * 0.5, 1, (Math.sin(t + 4.1887903) + 1) * 0.1],
      alpha: 128 / 255,
    };
  });
  return <ParticleQuads tex={贴图} items={items} translucent depthWrite={false} />;
};
