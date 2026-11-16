// 炼狱结界演出的画面：线框按 炼狱结界演出状态.ts 的状态摆位置、大小、透明度，收缩焚烧时在结界里放火。
// 线默认用本片的辉线（./炼狱结界辉线.tsx，用户 11-10 定加粗、发光）；线='原版' 画照原版的细线（@库/特效/炼狱结界.tsx），核对段对比用。
// **火是占位**：原版炼狱聚晶不放任何粒子，也不点着目标。RevelationSpell（CFR 反编译 58～67 行）只生成结界实体；RevelationCageEntity.damageTarget、onDamageApplied（128～156 行）
// 给目标上诅咒（GoetyEffects.CURSED）、禁回血，每次伤害放一声 SoundEvents.FIRE_AMBIENT（音量 2～3、音高 0.3～1.0），没有画面。
// 这里借原版 flame、smoke 粒子（@库/特效/原版粒子.tsx）在史蒂夫身上往上冒，数量、范围、放大倍数都是随手取的，等正式做焚烧时换掉。
// 放在场景坐标（Z 朝上）的 group 里；不画史蒂夫、不画糊屏（4-18 的火光糊屏是后期的事）。
import React, { useMemo } from 'react';
import { clamp, mulberry32 } from '@engine/core/数学.ts';
import { RevelationCageWire } from '@库/特效/炼狱结界.tsx';
import { type ParticleSpawn, VanillaParticles } from '@库/特效/原版粒子.tsx';
import { RevelationCageGlow, type CageGlowAppearance } from './炼狱结界辉线.tsx';
import { cagePerformanceTimes, cagePerformanceStateAt, type CagePerformanceSetting } from './炼狱结界演出状态.ts';

/** 占位火的出生表：收缩焚烧这一段里越往后出得越密，出生在目标周围一个人大小的柱子里，往上飘。刻和演出的钟一致（秒 × 20） */
const placeholderFlames = (settings: CagePerformanceSetting, particleCount: number): ParticleSpawn[] => {
  const rand = mulberry32(20261109);
  const startTick = cagePerformanceTimes(settings).shrinkBurnSec * 20;
  const durTicks = settings.shrinkBurnSec * 20;
  return Array.from({ length: particleCount }, (_, i) => {
    const isSmoke = i % 5 === 4;
    const angle = rand() * Math.PI * 2;
    const dist = Math.sqrt(rand()) * 0.55;
    return {
      kind: isSmoke ? ('smoke' as const) : ('flame' as const),
      // sqrt：出生时刻往后段挤
      刻: startTick + Math.sqrt(rand()) * durTicks,
      p: [settings.target[0] + Math.cos(angle) * dist, settings.target[1] + Math.sin(angle) * dist, settings.target[2] - 0.9 + rand() * 1.9] as [number, number, number],
      v: [0, 0, 0.03 + rand() * 0.05] as [number, number, number],
      seed: 7000 + i,
    };
  });
};

export const RevelationCagePerformance: React.FC<{
  /** 从扔出那一刻算的秒 */
  sec: number;
  settings: CagePerformanceSetting;
  /** 占位火的颗数、放大倍数（原版 flame 半边长 0.1～0.2 格，远景里看不见） */
  flameCount?: number;
  flameScale?: number;
  /** 线的画法：默认本片的辉线，可只改几项外观；'原版' = 照原版的细线 */
  lineStyle?: Partial<CageGlowAppearance> | '原版';
}> = ({ sec: sec, settings, flameCount = 600, flameScale = 3, lineStyle }) => {
  const s = cagePerformanceStateAt(sec, settings);
  const flames = useMemo(() => placeholderFlames(settings, flameCount), [settings, flameCount]);
  if (s.stage === '未出' || s.stage === '结束') return null;
  return (
    <>
      <group position={s.center}>
        {lineStyle === '原版' ? (
          <RevelationCageWire sec={s.spinSec} radiusFactor={s.radiusFactor} opacity={s.opacity} />
        ) : (
          // 结界小的时候（刚离手、收缩完）线跟着细，不然一人大小的框上晕比框还宽；下限 0.4 是随手取的
          <RevelationCageGlow sec={s.spinSec} radiusFactor={s.radiusFactor} opacity={s.opacity} appearance={lineStyle} thicknessScale={clamp(s.radiusFactor / settings.fullRadiusFactor, 0.4, 1)} />
        )}
      </group>
      {s.stage === '收缩焚烧' && <VanillaParticles spawns={flames} sec={sec} size={flameScale} />}
    </>
  );
};
