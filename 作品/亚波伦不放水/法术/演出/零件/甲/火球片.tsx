// 画原版火球一类：ThrownItemRenderer 把物品（火焰弹）当朝镜头的方片画，小火球 scale 0.75、大火球（恶魂火球）scale 3.0；
// 物品的 GROUND 变换再缩 0.5、抬 2/16 格 → 半边长 0.25 × scale，中心比实体位置高 0.125 × scale。
// 每刻在 位置 + 0.5 格 放一颗 smoke（AbstractHurtingProjectile.tick 的 getTrailParticle）。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { 弹道位置 } from '../弹道.ts';
import { 片, 面片们 } from '../面片.tsx';
import { VanillaParticles, type ParticleSpawn } from '../粒子.tsx';
import { 各刻 } from './共用.ts';
import type { 火球弹 } from './火球.ts';
import 火焰弹图 from 'asset:贴图/法术/minecraft/item/fire_charge';

export const 火球烟 = (弹们: readonly 火球弹[], 刻: number, 种子: number): ParticleSpawn[] =>
  弹们.flatMap((弹, i) =>
    各刻(1, Math.min(刻 - 弹.出刻, 弹.飞刻)).map((n) => {
      const p = 弹.道(n);
      return { 种: 'smoke' as const, 刻: 弹.出刻 + n, p: [p[0], p[1], p[2] + 0.5] as [number, number, number], 种子: 种子 * 131 + i * 977 + n };
    }),
  );

export const 火球们: React.FC<{ 弹们: readonly 火球弹[]; 秒: number; /** 渲染器的 scale：小火球 0.75，大火球 3 */ 倍: number; 种子: number }> = ({ 弹们, 秒, 倍, 种子 }) => {
  const 刻 = 秒 * 20;
  const 项 = 弹们
    .filter((弹) => 刻 >= 弹.出刻 && 刻 - 弹.出刻 < 弹.飞刻)
    .map((弹) => {
      const p = 弹道位置(弹.道, 刻 - 弹.出刻);
      return 片([p[0], p[1], p[2] + 0.125 * 倍], 0.25 * 倍);
    });
  return (
    <>
      <面片们 图={png(火焰弹图)} 项={项} 混合="镂空" />
      <VanillaParticles spawns={火球烟(弹们, 刻, 种子)} 秒={秒} />
    </>
  );
};
