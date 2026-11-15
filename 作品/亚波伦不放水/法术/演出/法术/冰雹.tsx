// 冰雹。出处 goety 2.5.60.6：HailSpell、HailCloud、AbstractSpellCloud、FireParticle（SPELL_CLOUD）、原版 FallingDustParticle。
// 半径 2、持续 100 刻（配下界魔杖没变化）。云放在目标头上 4 格，水平对着目标：
// - 云出来就每刻 ⌈π × 4⌉ = 13 颗 SPELL_CLOUD 撒在云面圆盘上（颜色 = 参数 1 × 速度 0.5 = 灰 0.5，半边长 0.3～0.6、寿命 8 刻、贴图 spell_cloud 按年龄）；
// - 激活（20 刻后）起每刻 13 颗雪块的 FALLING_DUST 从云面圆盘落下（每刻竖直 −0.003，越落越快，落到地面停着，寿命约 25～144 刻）。
// 自己定的：只下 60 刻（游戏里 100 刻）；SPELL_CLOUD 的颜色按「参数 × 0.5」算，FALLING_DUST 的灰白按原版随机范围取，都没在游戏里对过。
// 没做：目标被冻结（FREEZING）、受伤。
import React from 'react';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps } from '../接口.ts';
import { cloudPieceClass, fallingDustClass } from '../零件/丁粒子.ts';
import { cloudFaceSpawns, fallingDustSpawns } from '../零件/丁云.ts';
import { TexturedParticles } from '../零件/粒子.tsx';
import meta, { hailSnowTicks, hailActiveTick } from './冰雹.元.ts';

const radius = 2;

const Hail: React.FC<SpellPerformanceProps> = ({ 秒: sec, 目标: target, 种子: seed }) => {
  const cloudCenter: [number, number, number] = [target[0], target[1], target[2] + 4];
  const endTick = hailActiveTick + hailSnowTicks;
  return (
    <>
      <TexturedParticles 类={cloudPieceClass} spawns={cloudFaceSpawns(seed * 17 + 1, cloudCenter, radius, endTick, [0.5, 0.5, 0.5])} 秒={sec} />
      <TexturedParticles 类={fallingDustClass(target[2])} spawns={fallingDustSpawns(seed * 17 + 2, cloudCenter, radius, hailActiveTick, endTick)} 秒={sec} />
    </>
  );
};

export default defineSpellPerformance(meta, Hail);
