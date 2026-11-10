// 尖牙盛宴。出处 goety 2.5.60.6：FeastSpell（ChargingSpell）、ServerParticleUtil.circularParticles、WandUtil.spawnFangs、Fangs。
// - 按住期间每刻（useSpell）：每个敌人脚边 4 次 circularParticles(BLOCK, 半径 1)，每次 ⌈π⌉ = 4 颗，出在脚底上 0.25 格、半径 1 格的圆里，方块取脚下那格。
// - 每 20 刻（SpellResult）：每个敌人脚下一颗尖牙（warmup 1，朝向 = 施法者指向敌人）；施法者眼睛处 10～44 颗 POOF。
// - 片里按住 3 轮（游戏里按多久咬多久）。配灾厄法杖才有的外圈 5 颗牙、半径 3 的碎屑不做。
import React from 'react';
import { rng } from '@engine/model/parts.tsx';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性 } from '../接口.ts';
import { 游戏水平角 } from '../零件/地面.ts';
import { 尖牙, 尖牙暴击, 暴击星 } from '../零件/尖牙.tsx';
import { 圆里撒, 方块屑, type 屑出生 } from '../零件/方块屑.tsx';
import { VanillaParticles, type ParticleSpawn } from '../零件/粒子.tsx';
import 元, { 盛宴轮数, 盛宴间隔刻 } from './尖牙盛宴.元.ts';

const 按住刻 = (盛宴轮数 - 1) * 盛宴间隔刻 + 1;

const 尖牙盛宴: React.FC<法术演出属性> = ({ 秒, 起点, 目标, 种子 }) => {
  const 刻 = 秒 * 20;
  const 朝角 = 游戏水平角(起点, 目标);
  const 屑: 屑出生[] = [];
  // 碎屑寿命最长 40 刻，只排还可能活着的那几刻
  for (let t = Math.max(0, Math.floor(刻) - 40); t <= Math.min(刻, 按住刻); t++) for (let k = 0; k < 4; k++) 屑.push(...圆里撒([目标[0], 目标[1], 目标[2] + 0.25], 1, t, 种子 * 7919 + t * 4 + k));
  const 烟: ParticleSpawn[] = [];
  for (let 轮 = 0; 轮 < 盛宴轮数; 轮++) {
    const r = rng(种子 * 53 + 轮);
    const n = 10 + Math.floor(r() * 35);
    for (let i = 0; i < n; i++) 烟.push({ 种: 'poof', 刻: 轮 * 盛宴间隔刻, p: [起点[0], 起点[1], 起点[2]], 种子: 种子 * 1000 + 轮 * 50 + i });
  }
  return (
    <>
      {Array.from({ length: 盛宴轮数 }, (_, 轮) => (
        <尖牙 key={轮} 位={目标} 朝角={朝角} warmup={1} 刻={刻 - 轮 * 盛宴间隔刻} />
      ))}
      <暴击星 出生们={Array.from({ length: 盛宴轮数 }, (_, 轮) => 尖牙暴击(目标, 1, 刻 - 轮 * 盛宴间隔刻, 种子 * 100 + 轮).map((生) => ({ ...生, 刻: 生.刻 + 轮 * 盛宴间隔刻 }))).flat()} 秒={秒} />
      <方块屑 出生们={屑} 秒={秒} 地面={目标[2]} />
      <VanillaParticles spawns={烟} 秒={秒} />
    </>
  );
};

export default 定义法术演出(元, 尖牙盛宴);
