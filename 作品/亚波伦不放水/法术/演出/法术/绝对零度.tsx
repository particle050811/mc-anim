// 绝对零度。出处 revelationfix 2.x：IceSpell（EverChargeSpell）、IceSpear / IceSpike（goety）、FoggyCloudParticleOption。
// 按住时每刻往施法者射一颗冰矛（下界魔杖是 rightStaff → IceSpear，伤害 +6，画法同冰刺，贴图 ice_spike），
// 生在头顶周围 ±48 格的立方体（radius4 = 领域半径 24 × 4 的一半）里，每颗生出来放一片白雾云（MapColor.SNOW，尺寸 1.5）。
// 自己定的：只放 60 刻；领域半径按 12 + 12（下界魔杖）= 24；没有天花板，头顶取 15.5 格；地面以下的生点按「在方块里」重抽竖直。
// 还画了（零件/丁霜.tsx）：领域墙（客户端 WandUsingCircle：绕施法者半径 24、高 0.3～1.0 格的淡蓝圆筒，不是法阵）、
// 每 40 刻一次的边界粒子环（IceSpellParticlePacket id 0：圆周上每格 8 颗 FROST_FLOWER 往上冒）。
// 没做：减速和扣血、落地的冰碎屑、受害者身上的 FROST_NOVA 柱（id 1，需要有敌人在领域里）。
// 生位大多离镜头很远，画面里只有靠近施法者的几支矛。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps } from '../接口.ts';
import { ArrowRainGroup } from '../零件/甲/落雨画.tsx';
import { frostFlowerClass } from '../零件/丁粒子.ts';
import { frostRingSpawns, FrostWall } from '../零件/丁霜.tsx';
import { TexturedParticles } from '../零件/粒子.tsx';
import meta, { iceSpears } from './绝对零度.元.ts';
import iceSpikePng from 'asset:贴图/法术/goety/entity/projectiles/ice_spike';

const domainRadius = 24;
const ringTicks = [0, 40];

const AbsoluteZero: React.FC<SpellPerformanceProps> = ({ sec: sec, from, target: target, seed: seed }) => {
  // 法阵、边界环围着施法者水平位置，高度取目标脚底的地面（起点在演出里悬在空中）
  const feet: [number, number, number] = [from[0], from[1], target[2]];
  const frostSpawns = ringTicks.flatMap((t, i) => frostRingSpawns(seed * 41 + i, feet, domainRadius, t));
  return (
    <>
      <FrostWall 位={feet} radius={domainRadius} 刻={sec * 20} />
      <TexturedParticles type={frostFlowerClass} spawns={frostSpawns} sec={sec} />
      <ArrowRainGroup projectiles={iceSpears(from, seed)} sec={sec} image={png(iceSpikePng)} fogColor={[1, 1, 1]} seed={seed} />
    </>
  );
};

export default defineSpellPerformance(meta, AbsoluteZero);
