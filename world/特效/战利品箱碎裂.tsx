// 战利品箱碎裂：第 1 场一镜到底里，长矛冲刺击杀 boss 的那一下，矛尖碰到它的地方冒出一个战利品箱，立刻被包着动力钻头虚影的长矛打掉（用户 10-02 定）。
// 箱子不碎成一块块木板飞出去（不是 MC 的风格），而是像原版破坏方块那样崩成方块破坏粒子消散，重点是把掉出来的物品展示清楚（物品拾取.tsx）。所以：冒出来、钻头钻进去的那一下画完整的箱子（物品/箱子.tsx），
// 打掉的那一刻箱子消失，原地崩出一把破坏粒子（方块破坏粒子.tsx：整格 4×4×4 = 64 个小方片，往外迸一下、受重力往下落、几刻到两秒内消失），
// 小方片的贴图取箱子贴图四个侧面那一圈里随机的 4×4 像素（暮色 boss 的箱子是各自那种暮色木箱的木板，见 物品/箱子.tsx）。
// 坐标：箱子本地，单位格，原点在底面中心，正面（锁扣）朝 -Y（朝着冲过来的扫帚）。
import React, { useMemo } from 'react';
import { rng } from '../../engine/model/parts.tsx';
import type { Png } from '../../engine/model/贴图.ts';
import { Chest, LOOTR_TEX } from '../物品/箱子.tsx';
import { spawnBlockBreak, collectBreakParticles, BreakParticleQuads } from './方块破坏粒子.tsx';
import { type Particle, particleTexture } from './粒子面片.tsx';

const halfSize = 7 / 16; // 箱子半边长、中心高度
// boss 被矛尖碰到、死的那一刻起画成多透明（用户 10-02 定巫妖死的一瞬间虚化 50%）：箱子就冒在它身上（一镜到底/战利品.tsx），身子不透明会把箱子埋住；近景的几处（巫妖、冰雪女王、巨人）的 编排.ts 都用它
export const bossDeathOpacity = 0.5;
const ss = (x: number) => {
  const clamped = Math.min(1, Math.max(0, x));
  return clamped * clamped * (3 - 2 * clamped);
};

// 碎：打掉以后的物理秒数（< 0 还是整的）；冒出：箱子在打掉前多久冒出来（秒）；粒子倍速：粒子时钟比物理时钟快多少（慢放的近景按特效倍速，原速的远景 1）；
// 放大：整体缩放（以箱子中心为准，远景放大用）；贴图：哪种箱子（不给 = Lootr）
export const LootChestBurst: React.FC<{ secSinceBreak: number; popLeadSec: number; particleClockScale?: number; scale?: number; seed?: number; texture?: Png }> = ({
  secSinceBreak: secSinceBreak,
  popLeadSec,
  particleClockScale = 1,
  scale: scale = 1,
  seed = 1,
  texture: TEX = LOOTR_TEX,
}) => {
  const ps = useMemo(() => {
    const rand = rng(seed * 7919 + 13);
    // 原版：整格方块 4×4×4 个；每个粒子的贴图小块在箱体侧面那一圈（展开图 v 33～43、u 0～56）里随机取一块 4×4 像素
    return spawnBlockBreak([0, 0, halfSize], [2 * halfSize, 2 * halfSize, 2 * halfSize], [0, 0, 1, 1], [0.6, 0.6, 0.6], seed).map((particle) => {
      const x = Math.floor(rand() * 52);
      const y = 33 + Math.floor(rand() * 6);
      return { ...particle, uv: [(x + 4) / TEX.w, y / TEX.h, x / TEX.w, (y + 4) / TEX.h] as [number, number, number, number] };
    });
  }, [seed, TEX]);
  if (secSinceBreak + popLeadSec < 0) return null;
  if (secSinceBreak < 0) {
    // 整个箱子：冒出来的那一下从六成大弹到原大（0.4 毫秒）
    const chestScale = scale * (0.6 + 0.4 * ss((secSinceBreak + popLeadSec) / 0.0004));
    return (
      <group position={[0, 0, halfSize]} scale={chestScale}>
        <group position={[0, 0, -halfSize]}>
          <Chest 贴图={TEX} />
        </group>
      </group>
    );
  }
  const items: Particle[] = [];
  collectBreakParticles(ps, secSinceBreak * particleClockScale, items, scale, [0, 0, halfSize]);
  return <BreakParticleQuads tex={particleTexture(TEX.px, TEX.w, TEX.h, TEX)} items={items} />;
};
