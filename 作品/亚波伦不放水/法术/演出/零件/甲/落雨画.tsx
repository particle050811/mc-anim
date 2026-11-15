// 画落雨的一群箭形弹和头顶的雾云。每颗生出来时在生位放一片雾云（FoggyCloudParticle，尺寸 1.5、速 6：很快就散）。
import React from 'react';
import type { Png } from '@engine/model/贴图.ts';
import type { RgbColor } from '../材质.ts';
import { trajectoryPos, trajectoryDir } from '../弹道.ts';
import { FogCloud } from './爆.tsx';
import { ArrowShape } from './箭形.tsx';
import type { ArrowRainShot } from './落雨.ts';

export const ArrowRainGroup: React.FC<{ projectiles: readonly ArrowRainShot[]; 秒: number; 图: Png; fogColor: RgbColor; 种子: number }> = ({ projectiles, 秒: sec, 图: image, fogColor, 种子: seed }) => {
  const tick = sec * 20;
  return (
    <>
      {projectiles.map((projectile, i) => {
        const t = tick - projectile.launchTick;
        return t >= 0 && t < projectile.flightTick ? <ArrowShape key={i} 位={trajectoryPos(projectile.trajectory, t)} dir={trajectoryDir(projectile.trajectory, t)} 图={image} /> : null;
      })}
      <FogCloud spawns={projectiles.map((projectile, i) => ({ 刻: projectile.launchTick, 位: projectile.spawnPos, 色: fogColor, 尺寸: 1.5, 速: 6, 种子: seed * 101 + i }))} 刻={tick} />
    </>
  );
};
