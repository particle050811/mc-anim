// 亚波伦瞬移的烟：照游戏里使徒（Goety 2.5.60.6 的 Apostle，javap 读的）延迟瞬移的粒子，全是原版 smoke（ParticleTypes.SMOKE）：
// - 等着的那几刻（Apostle.tick，toTeleportPos 不空）：每刻在她身上放 5 颗（ServerParticleUtil.addParticlesAroundMiddleSelf：
//   位置在碰撞箱里随机，水平 x ± 宽、高 0～高；sendParticles 数量 0，速度 = 高斯 × 0.02 × 0.5）。
// - 挪过去那一刻（teleportHits → 实体事件 100 → Apostle.handleEntityEvent）：从旧位置到新位置连成一条线放 128 颗，
//   第 i 颗在 i/127 处，水平再偏 (随机 − 0.5) × 宽 × 2、竖直 0～高；速度各分量 (随机 − 0.5) × 0.2。
// 和游戏不一样：二阶段等 20 刻才挪，片里压到 等秒（预兆）；等的时候目的地上的 large_smoke、Goety 自己的黑色 wind 粒子和 16 条橙色吸收尾迹（AbsorbTrailParticle）没做；
// 挪过去时旧位置留下的 FireBlastTrap（会伤人的火）不做（她只躲不还手，用户 11-10）。碰撞箱照使徒：宽 0.6、高 1.95。
import React, { useMemo } from 'react';
import type { V3 } from '@engine/model/parts.tsx';
import { mulberry32 } from '@engine/core/数学.ts';
import { type ParticleSpawn, VanillaParticles } from '@库/特效/原版粒子.tsx';

export type 一次瞬移 = {
  /** 开始冒烟（预兆）的秒 */
  起: number;
  /** 挪过去的那一秒 */
  移: number;
  /** 脚底：从哪、到哪 */
  从: V3;
  到: V3;
};

const 宽 = 0.6;
const 高 = 1.95;

/** 一次瞬移的所有烟（秒 和画面同一个钟，刻 = 秒 × 20） */
export const 瞬移烟出生 = (瞬: 一次瞬移, 种子: number): ParticleSpawn[] => {
  const rand = mulberry32(种子 * 7919 + 13);
  const 高斯 = () => Math.sqrt(-2 * Math.log(Math.max(1e-9, rand()))) * Math.cos(2 * Math.PI * rand());
  const 出: ParticleSpawn[] = [];
  let 号 = 0;
  // 等的那几刻：她身上每刻 5 颗（脚底在 从 不动，片里的预兆也是她站在那儿收一下）
  for (let 刻 = Math.ceil(瞬.起 * 20); 刻 < 瞬.移 * 20; 刻++) {
    for (let i = 0; i < 5; i++) {
      出.push({
        种: 'smoke',
        刻,
        p: [瞬.从[0] + 宽 * (2 * rand() - 1), 瞬.从[1] + 宽 * (2 * rand() - 1), 瞬.从[2] + 高 * rand()],
        v: [高斯() * 0.01, 高斯() * 0.01, 高斯() * 0.01],
        种子: 种子 * 100003 + 号++,
      });
    }
  }
  // 挪过去那一刻：一条线 128 颗
  for (let i = 0; i < 128; i++) {
    const d = i / 127;
    出.push({
      种: 'smoke',
      刻: 瞬.移 * 20,
      p: [
        瞬.从[0] + (瞬.到[0] - 瞬.从[0]) * d + (rand() - 0.5) * 宽 * 2,
        瞬.从[1] + (瞬.到[1] - 瞬.从[1]) * d + (rand() - 0.5) * 宽 * 2,
        瞬.从[2] + (瞬.到[2] - 瞬.从[2]) * d + rand() * 高,
      ],
      v: [(rand() - 0.5) * 0.2, (rand() - 0.5) * 0.2, (rand() - 0.5) * 0.2],
      种子: 种子 * 100003 + 号++,
    });
  }
  return 出;
};

/** 画几次瞬移的烟。秒：和 瞬移 里的秒同一个钟；大小：整体放大（原版 1） */
export const 瞬移烟: React.FC<{ 瞬移们: readonly 一次瞬移[]; 秒: number; 大小?: number }> = ({ 瞬移们, 秒, 大小 = 1 }) => {
  const spawns = useMemo(() => 瞬移们.flatMap((瞬, i) => 瞬移烟出生(瞬, i + 1)), [瞬移们]);
  return <VanillaParticles spawns={spawns} 秒={秒} size={大小} />;
};
