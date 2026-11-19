// 雷暴。出处 goety 2.5.60.6：ThunderstormSpell、MagicLightningTrap、AoEParticle、SLightningBoltPacket、SLightningPacket。
// 举杖 20 刻后每刻放 2 处（下界魔杖 rightStaff；前 20 刻围着目标 ±16 格，之后围着施法者 ±16 格）。每处：
// - 预警圈 AoEParticle：白色贴地方片，半边长从 3 格每刻缩 3÷40 到 0，透明度 0.25，活 40 刻；
// - 40 刻后落雷：CircleExplode（0xB1EBDC，大小 3）、SphereExplode（同色，大小 3）、一道 lightningBolt 从高空劈下（寿命 10 刻）、
//   施法者头顶也劈一道往天上去的（寿命 10 刻）、16 道 shock 小电弧（从落点上方 1 格往四周偏 ±4，寿命 12 刻）。
// 选项 无预警圈：不画预警圈，落雷照旧（亚波伦第 4 幕连放时地上铺满白圈，用户 11-11「雷暴预警圈全部删掉」；核对段照旧画）。
// 自己定的：只放到第 50 刻；闪电起点取 40 格高（游戏里 250 格，画面里看不出差别）。
// 没做：GatherTrailParticle 八条汇聚拖尾；伤害、痉挛。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps, Vec3 } from '../接口.ts';
import { ElectricArc } from '../零件/电弧.tsx';
import { arcPresets } from '../零件/电弧形.ts';
import { GroundDecal } from '../零件/地面贴花.tsx';
import { hexColor } from '../零件/材质.ts';
import { CircleBurst, SphereBurst } from '../零件/甲/爆.tsx';
import meta, { strikePoints, stormWarnTicks } from './雷暴.元.ts';
import aoeIndicatorPng from 'asset:贴图/法术/goety/particle/aoe_indicator';
import { mulberry32 } from '@engine/core/数学.ts';

const warningImg = png(aoeIndicatorPng);
const thunderColor = hexColor(11660252);
const white = hexColor(0xffffff);

const Thunderstorm: React.FC<SpellPerformanceProps> = ({ sec, from, target, seed, options, casterFootAt, targetFootAt, landAt = point => point }) => {
  const tick = sec * 20;
  return (
    <>
      {strikePoints(seed).map((p, i) => {
        const age = tick - p.生;
        const strikeAge = age - stormWarnTicks;
        if (age < 0 || strikeAge >= 12) return null;
        const baseCenter = p.nearTarget ? targetFootAt?.(p.生 / 20) ?? target : casterFootAt?.(p.生 / 20) ?? from;
        const pos = landAt([baseCenter[0] + p.offsetX, baseCenter[1] - p.offsetZ, target[2]]);
        const caster = casterFootAt?.((p.生 + stormWarnTicks) / 20) ?? from;
        const boltBase: Vec3 = [caster[0], caster[1], caster[2] + 1.5];
        const r = mulberry32(seed * 733 + i);
        return (
          <React.Fragment key={i}>
            {!options?.noWarningRing && age >= 1 && age < stormWarnTicks && <GroundDecal 位={pos} image={warningImg} radius={3 * (1 - (age - 1) / stormWarnTicks)} 色={white} opacity={0.25} lift={0.1} />}
            {strikeAge >= 0 && strikeAge < 12 && (
              <>
            <CircleBurst 位={pos} 刻={strikeAge} 色={thunderColor} 尺寸={3} 速={1} />
            <SphereBurst 位={pos} 刻={strikeAge} 色={thunderColor} 尺寸={3} 速={1} />
            <ElectricArc start={[pos[0], pos[1], pos[2] + 40]} end={pos} settings={arcPresets.lightningBolt} 刻={strikeAge} lifeTicks={10} 色={thunderColor} seed={seed * 31 + i} />
            <ElectricArc start={boltBase} end={[boltBase[0], boltBase[1], boltBase[2] + 40]} settings={arcPresets.lightningBolt} 刻={strikeAge} lifeTicks={10} 色={thunderColor} seed={seed * 37 + i} />
            {Array.from({ length: 16 }, (_, k) => {
              const end: Vec3 = [pos[0] + Math.floor(r() * 9 - 4) * r(), pos[1] + Math.floor(r() * 9 - 4) * r(), pos[2] + 1 + r()];
              return <ElectricArc key={k} start={[pos[0], pos[1], pos[2] + 1]} end={end} settings={arcPresets.shock} 刻={strikeAge} lifeTicks={12} 色={thunderColor} seed={seed * 3001 + i * 20 + k} />;
            })}
              </>
            )}
          </React.Fragment>
        );
      })}
    </>
  );
};

export default defineSpellPerformance(meta, Thunderstorm);
