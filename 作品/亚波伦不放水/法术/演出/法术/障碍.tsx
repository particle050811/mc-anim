// 障碍。出处 goety 2.5.60.6：BarricadeSpell、WandUtil.summonSquareTrap / summonMonolith、TotemicWall、AbstractMonolith、AbstractMonolithRenderer、TotemicWallRenderer、MonolithModel。
// - 不潜行、有目标时三种阵型随机（缺一边的方阵、目标身后一排 10 根、25 次乱柱）；片里固定用方阵：目标所在格周围 5×5 外圈 16 格去掉一边 5 格，剩 11 根。
//   去哪一边看目标面朝哪（Direction.fromYRot）。每根在格子正中、贴地。
// - 渲染器：mulPose(Y yRot = 0)，scale(−1, −1, 1)；模型一根 14×50×14 像素的柱子；setupAnim：升、沉时 monolith.y = 60 − age（像素），立稳后 0。
//   石墙没有激活层、没有裂纹层。
// - 出生时每根 10～44 颗 POOF（sendParticles 数量 1、散布 0）。
// 没做：另外两种阵型；潜行放的图腾炸弹；配霜冻法杖的冰墙。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps } from '../接口.ts';
import { MinecraftSpace, getModel, ModelPart } from '../零件/实体.tsx';
import { VanillaParticles, type ParticleSpawn } from '../零件/粒子.tsx';
import meta, { wallAge, wallPositions } from './障碍.元.ts';
import monolithModelData from 'asset:模型/法术/goety/MonolithModel';
import totemicWallPng from 'asset:贴图/法术/goety/entity/monolith/totemic_wall';
import { mulberry32 } from '@engine/core/数学.ts';

const monolithModel = getModel(monolithModelData, 'MonolithModel');
const image = png(totemicWallPng);

const obstacle: React.FC<SpellPerformanceProps> = ({ 秒: sec, 目标: target, 种子: seed }) => {
  const tick = sec * 20;
  const age = wallAge(tick);
  const positions = wallPositions(target);
  const smokeSpawns: ParticleSpawn[] = positions.flatMap((pos, i) => {
    const n = 10 + Math.floor(mulberry32(seed * 37 + i)() * 35);
    return Array.from({ length: n }, (_, k): ParticleSpawn => ({ 种: 'poof', 刻: 0, p: [pos[0], pos[1], pos[2]], 种子: seed * 5000 + i * 60 + k }));
  });
  return (
    <>
      {age > 0 &&
        positions.map((pos, i) => (
          <MinecraftSpace key={i} 位={pos}>
            <group scale={[-1, -1, 1]}>
              <ModelPart 模型={monolithModel} 图={image} partPoses={{ monolith: { offset: [0, 60 - age, 0] } }} />
            </group>
          </MinecraftSpace>
        ))}
      <VanillaParticles spawns={smokeSpawns} 秒={sec} />
    </>
  );
};

export default defineSpellPerformance(meta, obstacle);
