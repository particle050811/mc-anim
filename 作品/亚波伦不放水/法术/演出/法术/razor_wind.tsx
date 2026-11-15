// 剃刀风。出处 goety 2.5.60.6：RazorWindSpell、RazorWind（SlashProjectile）、RazorWindRenderer；原版 PlayerCloudParticle。
// - 一片平躺着往前飞的月牙：PoseStack YP(yaw) · XP(−pitch)，在 y = −0.1 画一张边长 = 碰撞箱宽（半径 × 2）的方片，贴图 slash/1～4；
//   先用 entityCutoutNoCull alpha 0.5 画一遍，再用加色（wraith）画一遍。半径每刻 + 0.12。贴图游戏里每 6 个渲染帧换一张，这里按 60 帧算成每 0.1 秒一张。
// - 每刻沿宽度每 0.25 格放一颗 cloud。
// 没核：起始半径 = 0.3 + 法术的 radius 属性，默认 radius 没翻到，这里当 0；第二遍加色层换帧带的偏移量。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { rng } from '@engine/model/parts.tsx';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps } from '../接口.ts';
import { unitVec, trajectoryPos, trajectoryDir } from '../零件/弹道.ts';
import { MinecraftSpace, degToRad } from '../零件/实体.tsx';
import { TexturedParticles, type ParticleBirth } from '../零件/粒子.tsx';
import { eachTick, arrowYawPitch } from '../零件/甲/共用.ts';
import { FlatQuad, type CornerVertex } from '../零件/甲/平片.tsx';
import { cloudParticle, cloudClass } from '../零件/甲/原版粒子.ts';
import meta, { razorWindEndTick, razorWindPath } from './razor_wind.元.ts';
import slash1Png from 'asset:贴图/法术/goety/entity/projectiles/slash/1';
import slash2Png from 'asset:贴图/法术/goety/entity/projectiles/slash/2';
import slash3Png from 'asset:贴图/法术/goety/entity/projectiles/slash/3';
import slash4Png from 'asset:贴图/法术/goety/entity/projectiles/slash/4';

const slashFrames = [slash1Png, slash2Png, slash3Png, slash4Png].map(png);
const radiusAt = (tick: number) => 0.3 + 0.12 * tick;

const RazorWind: React.FC<SpellPerformanceProps> = ({ 秒: sec, from, 目标: target, 种子: seed }) => {
  const tick = sec * 20;
  const trajectory = razorWindPath(from, target);
  const endTick = razorWindEndTick(from, target);
  const dir = trajectoryDir(trajectory, 0);
  // 宽度方向：水平、和飞行方向垂直
  const perpDir = unitVec([-dir[1], dir[0], 0]);
  const r = rng(seed * 11 + 3);
  const clouds: ParticleBirth[] = eachTick(1, Math.min(tick, endTick)).flatMap((n) => {
    const [p, radius] = [trajectory(n), radiusAt(n)];
    return Array.from({ length: Math.floor((radius * 2) / 0.25) + 1 }, (_, k) => cloudParticle(r, n, [p[0] + perpDir[0] * (k * 0.25 - radius), p[1] + perpDir[1] * (k * 0.25 - radius), p[2]]));
  });
  const { yaw, pitch } = arrowYawPitch(dir);
  const h = radiusAt(tick);
  const corners: [CornerVertex, CornerVertex, CornerVertex, CornerVertex] = [
    [-h, -0.1, -h, 0, 1],
    [h, -0.1, -h, 1, 1],
    [h, -0.1, h, 1, 0],
    [-h, -0.1, h, 0, 0],
  ];
  const image = slashFrames[Math.floor(sec * 10) % 4]!;
  return (
    <>
      <TexturedParticles 类={cloudClass} spawns={clouds} 秒={sec} />
      {tick < endTick && (
        <MinecraftSpace 位={trajectoryPos(trajectory, tick)}>
          <group rotation={[0, degToRad(yaw), 0]}>
            <group rotation={[degToRad(-pitch), 0, 0]}>
              <FlatQuad corners={corners} 图={image} 混合="半透明" opacity={0.5} />
              <FlatQuad corners={corners} 图={image} 混合="加色" opacity={0.5} />
            </group>
          </group>
        </MinecraftSpace>
      )}
    </>
  );
};

export default defineSpellPerformance(meta, RazorWind);
