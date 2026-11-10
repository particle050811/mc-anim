// 不死图腾触发时人身上冒的粒子（第三人称能看到的那部分），照原版 1.20.1（SRG 客户端 jar，javap 读的常数）：
// - 发射：实体事件 35 → ParticleEngine.createTrackingEmitter(人, TOTEM_OF_UNDYING, 30)。TrackingEmitter 建出来当刻放一次，之后每刻一次，共 30 次；
//   每次试 16 颗：d0、d1、d2 各取 −1～1，落在单位球外的不要（留下约一半）；位置 = (x + 宽·d0/4, y + 高·(0.5 + d1/4), z + 宽·d2/4)，速度 = (d0, d1 + 0.2, d2) 格/刻。
// - 粒子：TotemParticle（SimpleAnimatedParticle）：重力 1.25、摩擦 0.6、碰方块会停，大小 = 0.1 × (随机 × 0.5 + 0.5) × 2 × 0.75，活 60～71 刻；
//   四分之一是黄的 (0.6 + r × 0.2, 0.6 + r × 0.3, r × 0.2)，其余绿的 (0.1 + r × 0.2, 0.4 + r × 0.3, r × 0.2)；
//   过了一半寿命开始变淡：alpha = 1 − (age − 寿命/2) ÷ 寿命；贴图按 age 从 glitter_7 换到 glitter_0（particles/totem_of_undying.json 的顺序，越来越小）；满亮度，半透明。
// 第一人称屏幕上翻转的图腾（GameRenderer.displayItemActivation）不在这里；触发后的药水效果粒子也没做。
// 坐标：场景（Z 朝上，格）。
import React, { useMemo } from 'react';
import { rng, type V3 } from '@engine/model/parts.tsx';
import { interpPathPos, type Particle, particlePath, ParticleQuads } from '@库/特效/粒子面片.tsx';
import { vanillaParticleAtlas } from '@库/特效/原版粒子.tsx';

export const 图腾发射刻 = 30;

type 颗 = { 生刻: number; 路: V3[]; 半: number; 寿: number; 色: [number, number, number] };

/** 一次图腾触发的全部粒子。脚底：人的脚底中心；宽、高：碰撞箱（玩家 0.6、1.8）；地面：粒子落到这个高度停住，不给 = 不停 */
export const 图腾粒子表 = (脚底: V3, 种子: number, 选项: { 宽?: number; 高?: number; 地面?: number } = {}): 颗[] => {
  const { 宽 = 0.6, 高 = 1.8, 地面 } = 选项;
  const rand = rng(种子 * 48271 + 35);
  const 出: 颗[] = [];
  for (let 次 = 0; 次 < 图腾发射刻; 次++) {
    for (let i = 0; i < 16; i++) {
      const d0 = rand() * 2 - 1;
      const d1 = rand() * 2 - 1;
      const d2 = rand() * 2 - 1;
      if (d0 * d0 + d1 * d1 + d2 * d2 > 1) continue;
      const 寿 = 60 + Math.floor(rand() * 12);
      const 半 = 0.1 * (rand() * 0.5 + 0.5) * 2 * 0.75;
      const 色: [number, number, number] = rand() < 0.25 ? [0.6 + rand() * 0.2, 0.6 + rand() * 0.3, rand() * 0.2] : [0.1 + rand() * 0.2, 0.4 + rand() * 0.3, rand() * 0.2];
      // 游戏 y 朝上 → 场景 z
      const p: V3 = [脚底[0] + (宽 * d0) / 4, 脚底[1] + (宽 * d2) / 4, 脚底[2] + 高 * (0.5 + d1 / 4)];
      const 路 = particlePath(p, [d0, d2, d1 + 0.2], 寿, { gravity: 1.25, friction: 0.6, ground: 地面 });
      出.push({ 生刻: 次, 路, 半, 寿, 色 });
    }
  }
  return 出;
};

/** 距触发 秒 秒时的粒子（秒 < 0 不画）。表 用 图腾粒子表 算一次，别每帧重算 */
export const 图腾粒子: React.FC<{ 表: readonly 颗[]; 秒: number }> = ({ 表, 秒 }) => {
  const items = useMemo(() => {
    const 刻 = 秒 * 20;
    const out: Particle[] = [];
    if (刻 < 0) return out;
    for (const 粒 of 表) {
      const τ = 刻 - 粒.生刻;
      if (τ < 0) continue;
      const age = Math.floor(τ);
      if (age >= 粒.寿) continue;
      const 帧 = Math.min(7, Math.floor((age * 7) / 粒.寿));
      out.push({
        p: interpPathPos(粒.路, τ),
        half: 粒.半,
        uv: vanillaParticleAtlas.uv[`glitter_${7 - 帧}`]!,
        color: 粒.色,
        alpha: age > 粒.寿 / 2 ? 1 - (age - 粒.寿 / 2) / 粒.寿 : 1,
      });
    }
    return out;
  }, [表, 秒]);
  return <ParticleQuads tex={vanillaParticleAtlas.tex} items={items} translucent depthWrite={false} />;
};
