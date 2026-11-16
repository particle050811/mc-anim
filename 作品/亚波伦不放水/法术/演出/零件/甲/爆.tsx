// 甲组命中时用的几种「爆」：Goety 的 SphereExplodeParticle（一个胀开的加色球）、CircleExplodeParticle（平躺的环，序列帧）、FoggyCloudParticle（平躺的雾片），
// 和原版爆炸（Level.explode：威力 < 2 放一颗 explosion 粒子）。丁组也可能做同名的东西，这里是甲组自己的一份，放 零件/甲/ 免得撞文件。
// - 球爆：寿命 30，每刻年龄 + (1 + 速)；半径从 尺寸 × 0.5 按 OUT_SINE 到 尺寸；透明度头 1/5 寿命 OUT_QUART 升到 1，接着 1/5 寿命 OUT_CUBIC 落到 0，之后不画。DRAGON_RAYS_QUADS：纯色加色、不写深度。
// - 圆爆：寿命 30，每刻年龄 + (1 + 速)；quadSize = 尺寸（半边长），贴图 circle_explode1～8 按年龄，平躺、满亮度。
// - 雾云：见 雾云出生。平躺的方片，朝上朝下各一张（GroundCircleParticle），这里两面画一张。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import type { Vec3 } from '../../接口.ts';
import { GroundDecal } from '../地面贴花.tsx';
import { faceMaterial, type RgbColor } from '../材质.ts';
import { sequenceFrame } from '../面片.tsx';
import type { ParticleSpawn } from '../粒子.tsx';
import circleExplode1Png from 'asset:贴图/法术/goety/particle/circle_explode1';
import circleExplode2Png from 'asset:贴图/法术/goety/particle/circle_explode2';
import circleExplode3Png from 'asset:贴图/法术/goety/particle/circle_explode3';
import circleExplode4Png from 'asset:贴图/法术/goety/particle/circle_explode4';
import circleExplode5Png from 'asset:贴图/法术/goety/particle/circle_explode5';
import circleExplode6Png from 'asset:贴图/法术/goety/particle/circle_explode6';
import circleExplode7Png from 'asset:贴图/法术/goety/particle/circle_explode7';
import circleExplode8Png from 'asset:贴图/法术/goety/particle/circle_explode8';
import fogCloudPng from 'asset:贴图/法术/goety/particle/fog_cloud';
import { mulberry32 } from '@engine/core/数学.ts';

const ringFrames = [circleExplode1Png, circleExplode2Png, circleExplode3Png, circleExplode4Png, circleExplode5Png, circleExplode6Png, circleExplode7Png, circleExplode8Png].map(png);

/** 刻 = 这个粒子出生后的刻（带小数） */
export const SphereBurst: React.FC<{ 位: Vec3; 刻: number; 色: RgbColor; 尺寸: number; 速?: number }> = ({ 位: pos, 刻: tick, 色: color, 尺寸: size, 速: speed = 1 }) => {
  const age = tick * (1 + speed);
  if (tick < 0 || age >= 12) return null;
  const x = age / 6;
  const opacity = x < 1 ? 1 - (1 - x) ** 4 : (2 - x) ** 3;
  const radius = size * (0.5 + 0.5 * Math.sin(((age / 30) * Math.PI) / 2));
  return (
    <mesh position={[pos[0], pos[1], pos[2]]} scale={radius} material={faceMaterial(null, { blend: '加色', 色: color, opacity })} frustumCulled={false}>
      <sphereGeometry args={[1, 32, 24]} />
    </mesh>
  );
};

export const CircleBurst: React.FC<{ 位: Vec3; 刻: number; 色: RgbColor; 尺寸: number; 速?: number }> = ({ 位: pos, 刻: tick, 色: color, 尺寸: size, 速: speed = 1 }) => {
  const age = Math.floor(tick) * (1 + speed);
  if (tick < 0 || age >= 30) return null;
  return <GroundDecal 位={pos} image={sequenceFrame(ringFrames, (age * 8) / 30)} radius={size} lift={0} 色={color} blend="半透明" />;
};

export interface FogCloudBirth {
  刻: number;
  位: Vec3;
  色: RgbColor;
  /** FoggyCloudParticleOption 的 size（半边长）、speed（每刻年龄多加几） */
  尺寸: number;
  速: number;
  seed: number;
}
/**
 * FoggyCloudParticle：寿命 40～60 刻（每刻年龄 + 1 + 速），颜色 × (0.85～0.99)，透明度 1 − 年龄 ÷ 寿命，
 * 大小 × (1 + 年龄 ÷ 寿命 × 0.75) × clamp(年龄 ÷ 5)；初速很小（水平 ≤ 0.06、竖直约 0.075 往上），每刻水平 × 0.94、竖直 × 0.85。
 */
export const FogCloud: React.FC<{ spawns: readonly FogCloudBirth[]; 刻: number }> = ({ spawns, 刻: tick }) => (
  <>
    {spawns.map((spawn, i) => {
      const r = mulberry32(spawn.seed * 7 + 3);
      const lifetime = 40 + Math.floor(r() * 21);
      const ageTick = tick - spawn.刻;
      const age = ageTick * (1 + spawn.速);
      if (ageTick < 0 || age >= lifetime) return null;
      const f = r() * 0.14 + 0.85;
      // 竖直：初速 ≈ 0.075，每刻 × 0.85，总共升 0.075 ÷ 0.15 = 0.5 格
      const riseOffset = 0.5 * (1 - 0.85 ** ageTick);
      const drift = (r() * 2 - 1) * 0.06 * ((1 - 0.94 ** ageTick) / 0.06);
      const driftY = (r() * 2 - 1) * 0.06 * ((1 - 0.94 ** ageTick) / 0.06);
      const opacity = 1 - age / lifetime;
      return (
        <GroundDecal
          key={i}
          位={[spawn.位[0] + drift, spawn.位[1] + driftY, spawn.位[2] + riseOffset + 0.08 + opacity * 0.125]}
          image={png(fogCloudPng)}
          radius={spawn.尺寸 * (1 + Math.min(1, (age / lifetime) * 0.75)) * Math.min(1, age / 5)}
          lift={0}
          色={[spawn.色[0] * f, spawn.色[1] * f, spawn.色[2] * f]}
          opacity={opacity}
          blend="半透明"
        />
      );
    })}
  </>
);

/** 原版爆炸（威力 < 2）：一颗 explosion 粒子，参数 xd = 1（半边长 1 格） */
export const vanillaExplosion = (pos: Vec3, tick: number, seed: number): ParticleSpawn => ({ kind: 'explosion', 刻: tick, p: [pos[0], pos[1], pos[2]], v: [1, 0, 0], seed: seed });
