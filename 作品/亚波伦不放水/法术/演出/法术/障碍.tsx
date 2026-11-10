// 障碍。出处 goety 2.5.60.6：BarricadeSpell、WandUtil.summonSquareTrap / summonMonolith、TotemicWall、AbstractMonolith、AbstractMonolithRenderer、TotemicWallRenderer、MonolithModel。
// - 不潜行、有目标时三种阵型随机（缺一边的方阵、目标身后一排 10 根、25 次乱柱）；片里固定用方阵：目标所在格周围 5×5 外圈 16 格去掉一边 5 格，剩 11 根。
//   去哪一边看目标面朝哪（Direction.fromYRot）。每根在格子正中、贴地。
// - 渲染器：mulPose(Y yRot = 0)，scale(−1, −1, 1)；模型一根 14×50×14 像素的柱子；setupAnim：升、沉时 monolith.y = 60 − age（像素），立稳后 0。
//   石墙没有激活层、没有裂纹层。
// - 出生时每根 10～44 颗 POOF（sendParticles 数量 1、散布 0）。
// 没做：另外两种阵型；潜行放的图腾炸弹；配霜冻法杖的冰墙。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { rng } from '@engine/model/parts.tsx';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性 } from '../接口.ts';
import { MC空间, 取模型, 模型件 } from '../零件/实体.tsx';
import { VanillaParticles, type ParticleSpawn } from '../零件/粒子.tsx';
import 元, { 墙龄, 障碍墙位 } from './障碍.元.ts';
import 模型数据 from 'asset:模型/法术/goety/MonolithModel';
import 图数据 from 'asset:贴图/法术/goety/entity/monolith/totemic_wall';

const 模型 = 取模型(模型数据, 'MonolithModel');
const 图 = png(图数据);

const 障碍: React.FC<法术演出属性> = ({ 秒, 目标, 种子 }) => {
  const 刻 = 秒 * 20;
  const 龄 = 墙龄(刻);
  const 位们 = 障碍墙位(目标);
  const 烟: ParticleSpawn[] = 位们.flatMap((位, i) => {
    const n = 10 + Math.floor(rng(种子 * 37 + i)() * 35);
    return Array.from({ length: n }, (_, k): ParticleSpawn => ({ 种: 'poof', 刻: 0, p: [位[0], 位[1], 位[2]], 种子: 种子 * 5000 + i * 60 + k }));
  });
  return (
    <>
      {龄 > 0 &&
        位们.map((位, i) => (
          <MC空间 key={i} 位={位}>
            <group scale={[-1, -1, 1]}>
              <模型件 模型={模型} 图={图} 姿态={{ monolith: { offset: [0, 60 - 龄, 0] } }} />
            </group>
          </MC空间>
        ))}
      <VanillaParticles spawns={烟} 秒={秒} />
    </>
  );
};

export default 定义法术演出(元, 障碍);
