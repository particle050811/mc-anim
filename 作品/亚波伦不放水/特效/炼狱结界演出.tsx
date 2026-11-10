// 炼狱结界演出的画面：线框（照原版，@库/特效/炼狱结界.tsx）按 炼狱结界演出状态.ts 的状态摆位置、大小、透明度，收缩焚烧时在结界里放火。
// **火是占位**：原版炼狱聚晶不放任何粒子，也不点着目标。RevelationSpell（CFR 反编译 58～67 行）只生成结界实体；RevelationCageEntity.damageTarget、onDamageApplied（128～156 行）
// 给目标上诅咒（GoetyEffects.CURSED）、禁回血，每次伤害放一声 SoundEvents.FIRE_AMBIENT（音量 2～3、音高 0.3～1.0），没有画面。
// 这里借原版 flame、smoke 粒子（@库/特效/原版粒子.tsx）在史蒂夫身上往上冒，数量、范围、放大倍数都是随手取的，等正式做焚烧时换掉。
// 放在场景坐标（Z 朝上）的 group 里；不画史蒂夫、不画糊屏（4-18 的火光糊屏是后期的事）。
import React, { useMemo } from 'react';
import { rng } from '@engine/model/parts.tsx';
import { 炼狱结界线框 } from '@库/特效/炼狱结界.tsx';
import { type ParticleSpawn, VanillaParticles } from '@库/特效/原版粒子.tsx';
import { 结界演出时刻, 结界演出状态在, type 结界演出设定 } from './炼狱结界演出状态.ts';

/** 占位火的出生表：收缩焚烧这一段里越往后出得越密，出生在目标周围一个人大小的柱子里，往上飘。刻和演出的钟一致（秒 × 20） */
const 占位火 = (设: 结界演出设定, 颗数: number): ParticleSpawn[] => {
  const rand = rng(20261109);
  const 起刻 = 结界演出时刻(设).收缩焚烧 * 20;
  const 长刻 = 设.收缩焚烧秒 * 20;
  return Array.from({ length: 颗数 }, (_, i) => {
    const 烟 = i % 5 === 4;
    const 角 = rand() * Math.PI * 2;
    const 远 = Math.sqrt(rand()) * 0.55;
    return {
      种: 烟 ? ('smoke' as const) : ('flame' as const),
      // sqrt：出生时刻往后段挤
      刻: 起刻 + Math.sqrt(rand()) * 长刻,
      p: [设.目标[0] + Math.cos(角) * 远, 设.目标[1] + Math.sin(角) * 远, 设.目标[2] - 0.9 + rand() * 1.9] as [number, number, number],
      v: [0, 0, 0.03 + rand() * 0.05] as [number, number, number],
      种子: 7000 + i,
    };
  });
};

export const 炼狱结界演出: React.FC<{
  /** 从扔出那一刻算的秒 */
  秒: number;
  设定: 结界演出设定;
  /** 占位火的颗数、放大倍数（原版 flame 半边长 0.1～0.2 格，远景里看不见） */
  火颗数?: number;
  火放大?: number;
}> = ({ 秒, 设定, 火颗数 = 600, 火放大 = 3 }) => {
  const s = 结界演出状态在(秒, 设定);
  const 火 = useMemo(() => 占位火(设定, 火颗数), [设定, 火颗数]);
  if (s.阶段 === '未出' || s.阶段 === '结束') return null;
  return (
    <>
      <group position={s.中心}>
        <炼狱结界线框 秒={s.转动秒} 半径系数={s.半径系数} 透明度={s.透明度} />
      </group>
      {s.阶段 === '收缩焚烧' && <VanillaParticles spawns={火} 秒={秒} size={火放大} />}
    </>
  );
};
