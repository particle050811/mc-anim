// 甲组命中时用的几种「爆」：Goety 的 SphereExplodeParticle（一个胀开的加色球）、CircleExplodeParticle（平躺的环，序列帧）、FoggyCloudParticle（平躺的雾片），
// 和原版爆炸（Level.explode：威力 < 2 放一颗 explosion 粒子）。丁组也可能做同名的东西，这里是甲组自己的一份，放 零件/甲/ 免得撞文件。
// - 球爆：寿命 30，每刻年龄 + (1 + 速)；半径从 尺寸 × 0.5 按 OUT_SINE 到 尺寸；透明度头 1/5 寿命 OUT_QUART 升到 1，接着 1/5 寿命 OUT_CUBIC 落到 0，之后不画。DRAGON_RAYS_QUADS：纯色加色、不写深度。
// - 圆爆：寿命 30，每刻年龄 + (1 + 速)；quadSize = 尺寸（半边长），贴图 circle_explode1～8 按年龄，平躺、满亮度。
// - 雾云：见 雾云出生。平躺的方片，朝上朝下各一张（GroundCircleParticle），这里两面画一张。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { rng } from '@engine/model/parts.tsx';
import type { 点 } from '../../接口.ts';
import { 地面贴花 } from '../地面贴花.tsx';
import { 面材质, type 色 } from '../材质.ts';
import { 序列帧 } from '../面片.tsx';
import type { ParticleSpawn } from '../粒子.tsx';
import 环1 from 'asset:贴图/法术/goety/particle/circle_explode1';
import 环2 from 'asset:贴图/法术/goety/particle/circle_explode2';
import 环3 from 'asset:贴图/法术/goety/particle/circle_explode3';
import 环4 from 'asset:贴图/法术/goety/particle/circle_explode4';
import 环5 from 'asset:贴图/法术/goety/particle/circle_explode5';
import 环6 from 'asset:贴图/法术/goety/particle/circle_explode6';
import 环7 from 'asset:贴图/法术/goety/particle/circle_explode7';
import 环8 from 'asset:贴图/法术/goety/particle/circle_explode8';
import 雾图 from 'asset:贴图/法术/goety/particle/fog_cloud';

const 环帧 = [环1, 环2, 环3, 环4, 环5, 环6, 环7, 环8].map(png);

/** 刻 = 这个粒子出生后的刻（带小数） */
export const 球爆: React.FC<{ 位: 点; 刻: number; 色: 色; 尺寸: number; 速?: number }> = ({ 位, 刻, 色, 尺寸, 速 = 1 }) => {
  const 年龄 = 刻 * (1 + 速);
  if (刻 < 0 || 年龄 >= 12) return null;
  const x = 年龄 / 6;
  const 透明度 = x < 1 ? 1 - (1 - x) ** 4 : (2 - x) ** 3;
  const 半径 = 尺寸 * (0.5 + 0.5 * Math.sin(((年龄 / 30) * Math.PI) / 2));
  return (
    <mesh position={[位[0], 位[1], 位[2]]} scale={半径} material={面材质(null, { 混合: '加色', 色, 透明度 })} frustumCulled={false}>
      <sphereGeometry args={[1, 32, 24]} />
    </mesh>
  );
};

export const 圆爆: React.FC<{ 位: 点; 刻: number; 色: 色; 尺寸: number; 速?: number }> = ({ 位, 刻, 色, 尺寸, 速 = 1 }) => {
  const 年龄 = Math.floor(刻) * (1 + 速);
  if (刻 < 0 || 年龄 >= 30) return null;
  return <地面贴花 位={位} 图={序列帧(环帧, (年龄 * 8) / 30)} 半径={尺寸} 抬高={0} 色={色} 混合="半透明" />;
};

export interface 雾云出生 {
  刻: number;
  位: 点;
  色: 色;
  /** FoggyCloudParticleOption 的 size（半边长）、speed（每刻年龄多加几） */
  尺寸: number;
  速: number;
  种子: number;
}
/**
 * FoggyCloudParticle：寿命 40～60 刻（每刻年龄 + 1 + 速），颜色 × (0.85～0.99)，透明度 1 − 年龄 ÷ 寿命，
 * 大小 × (1 + 年龄 ÷ 寿命 × 0.75) × clamp(年龄 ÷ 5)；初速很小（水平 ≤ 0.06、竖直约 0.075 往上），每刻水平 × 0.94、竖直 × 0.85。
 */
export const 雾云: React.FC<{ 出生们: readonly 雾云出生[]; 刻: number }> = ({ 出生们, 刻 }) => (
  <>
    {出生们.map((生, i) => {
      const r = rng(生.种子 * 7 + 3);
      const 寿命 = 40 + Math.floor(r() * 21);
      const 过 = 刻 - 生.刻;
      const 年龄 = 过 * (1 + 生.速);
      if (过 < 0 || 年龄 >= 寿命) return null;
      const f = r() * 0.14 + 0.85;
      // 竖直：初速 ≈ 0.075，每刻 × 0.85，总共升 0.075 ÷ 0.15 = 0.5 格
      const 升 = 0.5 * (1 - 0.85 ** 过);
      const 漂 = (r() * 2 - 1) * 0.06 * ((1 - 0.94 ** 过) / 0.06);
      const 漂2 = (r() * 2 - 1) * 0.06 * ((1 - 0.94 ** 过) / 0.06);
      const 透明度 = 1 - 年龄 / 寿命;
      return (
        <地面贴花
          key={i}
          位={[生.位[0] + 漂, 生.位[1] + 漂2, 生.位[2] + 升 + 0.08 + 透明度 * 0.125]}
          图={png(雾图)}
          半径={生.尺寸 * (1 + Math.min(1, (年龄 / 寿命) * 0.75)) * Math.min(1, 年龄 / 5)}
          抬高={0}
          色={[生.色[0] * f, 生.色[1] * f, 生.色[2] * f]}
          透明度={透明度}
          混合="半透明"
        />
      );
    })}
  </>
);

/** 原版爆炸（威力 < 2）：一颗 explosion 粒子，参数 xd = 1（半边长 1 格） */
export const 原版爆 = (位: 点, 刻: number, 种子: number): ParticleSpawn => ({ 种: 'explosion', 刻, p: [位[0], 位[1], 位[2]], v: [1, 0, 0], 种子 });
