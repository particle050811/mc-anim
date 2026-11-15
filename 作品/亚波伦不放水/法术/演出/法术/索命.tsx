// 索命。出处 goety 2.5.60.6：KillingSpell、SThunderBoltPacket、GatherTrailParticle、WindParticle、ServerParticleUtil.windParticle。
// 放出来的那一刻（蓄力 60 刻之后），颜色都是 14226710 = 0xD91516：
// - 一道雷霆电弧（thunderBolt 预设）从施法者眼睛到目标半身高，寿命 10 刻；
// - 8 条聚流从目标眼睛窜向 8 格内的随机点（Vec3.offsetRandom(8)：每个分量 ±4 格）；
// - 8 条风带绕着目标脚底转：半径 1 格、带高 0.5 格（中线在脚底高度，下半截埋在地里，游戏里也是）、4 段，
//   起始角随机，每刻转 (10～20)° × {−1, 0, 1}（抽到 0 的不转，带子零长看不见），寿命 20～39 刻，透明度 1 − 年龄 ÷ 寿命。
// 没做：蓄力 60 刻期间每刻一条的风带（出手前的事）；施法者自己吃的反噬没有画面。
import React from 'react';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps, Vec3 } from '../接口.ts';
import { ElectricArc } from '../零件/电弧.tsx';
import { arcPresets } from '../零件/电弧形.ts';
import { hexColor } from '../零件/材质.ts';
import { GatherStream, gatherLifetime, WindBand } from '../零件/游带.tsx';
import meta, { killingArcTicks } from './索命.元.ts';
import { mulberry32 } from '@engine/core/数学.ts';

const bloodColor = hexColor(0xd91516);

const Killing: React.FC<SpellPerformanceProps> = ({ 秒: sec, from, 目标: target, 种子: seed }) => {
  const tick = sec * 20;
  const eye: Vec3 = [target[0], target[1], target[2] + 1.62];
  const r = mulberry32(seed * 7919 + 3);
  const chains = Array.from({ length: 8 }, () => {
    const scatterPoint: Vec3 = [eye[0] + (r() - 0.5) * 8, eye[1] + (r() - 0.5) * 8, eye[2] + (r() - 0.5) * 8];
    const gatherLife = gatherLifetime(r());
    const windLife = 20 + Math.floor(r() * 20);
    const startAngle = r() * 360;
    const anglePerTick = (10 + r() * 10) * (Math.floor(r() * 3) - 1);
    return { 到: scatterPoint, gatherLife, windLife, startAngle, anglePerTick };
  });
  return (
    <>
      <ElectricArc 起={from} end={[target[0], target[1], target[2] + 0.9]} settings={arcPresets.thunderBolt} 刻={tick} lifeTicks={killingArcTicks} 色={bloodColor} 种子={seed} />
      {chains.map((item, i) => (
        <React.Fragment key={i}>
          <GatherStream 从={eye} 到={item.到} age={tick} 寿命={item.gatherLife} 色={bloodColor} />
          {tick < item.windLife && (
            <WindBand
              // (0, 0, 1) 绕游戏的 Y 轴转 角：游戏 (sin, 0, cos) → 场景 (sin, −cos, 0)
              位置={(k) => {
                const a = ((item.startAngle + item.anglePerTick * k) * Math.PI) / 180;
                return [target[0] + Math.sin(a), target[1] - Math.cos(a), target[2]];
              }}
              age={tick}
              段数={4}
              高={0.5}
              色={bloodColor}
              opacity={1 - Math.floor(tick) / item.windLife}
            />
          )}
        </React.Fragment>
      ))}
    </>
  );
};

export default defineSpellPerformance(meta, Killing);
