// 震地。出处 goety 2.5.60.6：QuakingSpell（useSpell → tremor）、ModFallingBlock（POPUP_ANIM）、ModFallingBlockRenderer。
// - 持续施法：过了蓄力时间后第 i 刻（i = 0～12），在施法者面前第 i 格、正中和左右各偏 1.5 格三处，把脚下那格方块弹起来一下。
//   位置取整到方块格；方块实体出在地面那格的上一格正中。
// - ModFallingBlock POPUP_ANIM：每刻 animY += popUp、popUp −= 0.1，popUp 初值 0.2 + 高斯 × 0.15；animY < −0.5 时消失（五六刻）。
//   渲染器：translate(0, 0.5 + animY − 1, 0) 再画整块方块，也就是方块从和地面齐平处往上顶 animY 格再落回去、沉到地下半格时没。
// - 游戏里取施法者脚下 0.5 格处那一层的方块，施法者悬空时什么都弹不起来；片里施法者在空中，按「起点正下方的地面」算（这一条是自己定的）。
// - 方块用下界岩（片子的场地；游戏里是脚下那格是什么就是什么）。
// 没做：方块各面的明暗（游戏里方块受光照，这里满亮度）；目标被顶飞；潜行时的环形震（surroundTremor）、配法杖时的弧形震（arcTremor）。
import React from 'react';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps } from '../接口.ts';
import { faceMaterial } from '../零件/材质.ts';
import { defaultGroundBlockPng } from '../零件/方块屑.tsx';
import meta, { sideOffsets, quakeRange } from './震地.元.ts';
import { mulberry32 } from '@engine/core/数学.ts';

/** 第 n 刻末的 animY（n 可带小数，刻间线性插值）；消失了给 null */
const bounceHeight = (initSpeed: number, age: number): number | null => {
  let y = 0;
  let prev = 0;
  let v = initSpeed;
  for (let n = 0; n < Math.floor(age) + 1; n++) {
    if (y < -0.5) return null;
    prev = y;
    y += v;
    v -= 0.1;
  }
  return prev + (y - prev) * (age - Math.floor(age));
};

const GroundQuake: React.FC<SpellPerformanceProps> = ({ sec, from, target, seed, landAt = point => point }) => {
  const tick = sec * 20;
  const horizontalDist = Math.hypot(target[0] - from[0], target[1] - from[1]) || 1;
  const forward = [(target[0] - from[0]) / horizontalDist, (target[1] - from[1]) / horizontalDist];
  // tremor 的侧向是 (cos yHeadRot, sin yHeadRot)：面朝方向的左手边
  const perpendicular = [-forward[1], forward[0]];
  const material = faceMaterial(defaultGroundBlockPng, { blend: '镂空' });
  const groundBlocks: React.ReactNode[] = [];
  for (let i = 0; i <= quakeRange; i++) {
    sideOffsets.forEach((sideOffset, colIndex) => {
      const age = tick - i;
      if (age < 0) return;
      const r = mulberry32(seed * 977 + i * 3 + colIndex);
      const gaussian = Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
      const height = bounceHeight(0.2 + gaussian * 0.15, age);
      if (height === null) return;
      const x = Math.floor(from[0] + forward[0] * i + perpendicular[0] * sideOffset) + 0.5;
      const y = Math.floor(from[1] + forward[1] * i + perpendicular[1] * sideOffset) + 0.5;
      groundBlocks.push(
        <mesh key={`${i}-${colIndex}`} position={[x, y, landAt([x, y, target[2]])[2] - 0.5 + height]} material={material}>
          <boxGeometry args={[1, 1, 1]} />
        </mesh>,
      );
    });
  }
  return <>{groundBlocks}</>;
};

export default defineSpellPerformance(meta, GroundQuake);
