// 三叉戟风暴。出处 goety 2.5.60.6：TridentStormSpell、WandUtil.summonTridentMinor / summonTridentStorm、TridentStorm、TridentStormRenderer、TridentStormModel（SHOOT 关键帧写在模型类里）、
// SLightningBoltPacket → ClientProxy.lightningBolt、SLightningPacket → ClientProxy.shock、CircleExplodeParticle。
// - 这个法术围着施法者放，不朝目标：施法者四周各 2.5 格一处，落到地面。每处先亮一个贴地的预警圆（模型的 circle，放大 1.25 倍），
//   warmUp 40 刻 + 各自随机 0～60 刻后激活：圆消失，三叉戟从 13 格多高处 0.25 秒落下（SHOOT：位置 posVec(0, −212, 0)）。
// - 渲染器：translate(0, 1.6, 0)，mulPose(Z 180°)；entityTranslucentEmissive（半透明、满亮度）。
// - 激活后第 5 刻：贴地扩散环 CircleExplode（白，大小 3，speed 1）；一道 lightningBolt 从正上方 250 格劈到落点（颜色 0x6464DC，寿命 5 刻）；
//   16 道 shock 小电弧从落点到落点上方 1 格、水平偏 0～1 格处（颜色 0xB1ABF1，寿命 2 刻）。warmUp + 40 + delay 时实体消失。
// 没做：SpellExplosion 的伤害和击退（没有画面）；头顶正上方有敌人时改劈那个敌人。配风暴法杖的四种大阵型不做。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps, Vec3 } from '../接口.ts';
import { ElectricArc } from '../零件/电弧.tsx';
import { arcPresets } from '../零件/电弧形.ts';
import { MinecraftSpace, getModel, ModelPart } from '../零件/实体.tsx';
import { keyframePose, type AnimDef } from '../零件/关键帧.ts';
import { hexColor } from '../零件/材质.ts';
import { RingBurst } from '../零件/乙圆环.tsx';
import meta, { prongOffsets, prongBlastGapTicks, prongStayTicks, prongWarnTicks } from './三叉戟风暴.元.ts';
import tridentStormModelData from 'asset:模型/法术/goety/TridentStormModel';
import tridentStormPng from 'asset:贴图/法术/goety/entity/projectiles/trident_storm';
import { mulberry32 } from '@engine/core/数学.ts';

const tridentStormModel = getModel(tridentStormModelData, 'TridentStormModel');
const fallAnim: AnimDef = {
  length: 0.25,
  looping: false,
  bones: { trident: [{ target: 'position', keyframes: [{ t: 0, v: [0, 0, 0], interp: 'linear' }, { t: 0.25, v: [0, 212, 0], interp: 'linear' }] }] },
};
const white: readonly [number, number, number] = [1, 1, 1];
const bigThunderColor = hexColor(0x6464dc);
const smallThunderColor = hexColor(0xb1abf1);

const TridentStorm: React.FC<SpellPerformanceProps> = ({ 秒: sec, from, 目标: target, 种子: seed }) => {
  const tick = sec * 20;
  return (
    <>
      {prongOffsets.map(([x, z], i) => {
        const r = mulberry32(seed * 883 + i);
        const pos: Vec3 = [from[0] + x, from[1] - z, target[2]];
        const landTick = prongWarnTicks + Math.floor(r() * 61);
        const blastTick = landTick + prongBlastGapTicks;
        const active = tick >= landTick;
        const smallEnds = Array.from({ length: 16 }, (): Vec3 => [pos[0] + r(), pos[1] - r(), pos[2] + 1]);
        return (
          <React.Fragment key={i}>
            {tick < landTick + prongStayTicks && (
              <MinecraftSpace 位={pos}>
                <group position={[0, 1.6, 0]}>
                  <group rotation={[0, 0, Math.PI]}>
                    <ModelPart
                      模型={tridentStormModel}
                      图={png(tridentStormPng)}
                      画法="半透明"
                      partPoses={active ? { ...keyframePose(tridentStormModel, [[fallAnim, (tick - landTick) / 20]]), circle: { hide: true } } : { circle: { scale: [1.25, 1, 1.25] }, trident: { hide: true } }}
                    />
                  </group>
                </group>
              </MinecraftSpace>
            )}
            <RingBurst 位={pos} spawnTick={blastTick} 秒={sec} 大小={3} 颜色={white} accel={1} />
            <ElectricArc 起={[pos[0], pos[1], pos[2] + 250]} end={pos} settings={arcPresets.lightningBolt} 刻={tick - blastTick} lifeTicks={5} 色={bigThunderColor} 种子={seed * 31 + i} />
            {smallEnds.map((end, k) => (
              <ElectricArc key={k} 起={pos} end={end} settings={arcPresets.shock} 刻={tick - blastTick} lifeTicks={2} 色={smallThunderColor} 种子={seed * 3001 + i * 20 + k} />
            ))}
          </React.Fragment>
        );
      })}
    </>
  );
};

export default defineSpellPerformance(meta, TridentStorm);
