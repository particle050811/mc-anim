// 过度生长。出处 goety 2.5.60.6：OvergrowthSpell、WandUtil.summonSurroundTrap / summonMonolith、QuickGrowingVine、AbstractVine、QuickGrowingVineRenderer、QuickGrowingVineModel、QuickGrowingVineAnimations（已提取）。
// - 不潜行、有目标时五种阵型随机（小方阵、夹道、立方、圆、围一圈）；片里固定用「围一圈」：目标周围 8 格各一根速生藤，第 i 根晚 i 刻破土，每根朝向四个正方向随机。
// - 渲染器是 MobRenderer：mulPose(Y 180° − yRot)，scale(−1, −1, 1)，translate(0, −1.501, 0)；外加一层 RenderType.eyes 的 quick_growing_vine_glow（发光层）。
//   动画：BURST（0.75 秒）→ 第 15 刻 IDLE（循环 1.125 秒）→ 寿命 3 秒到了 BURROW（0.75 秒）。
// - 破土、缩回时 diggingParticles：一圈 8 颗脚下方块碎屑（半径 1）。
// 粗做：缩回按 15 刻算（游戏里是 age 每刻减 getAgeSpeed 减到 0，没细查）；贴图用新版（配置 QuickGrowingVineTexture 的默认值没查，另一张是 _original）。
// 没做：破土时一圈往上飘的尘云（颜色取脚下方块的地图色）；藤打人（近战 AI）；另外四种阵型；潜行放的毒刺藤。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps } from '../接口.ts';
import { MinecraftSpace, getModel, degToRad, ModelPart } from '../零件/实体.tsx';
import { keyframePose, getAnim } from '../零件/关键帧.ts';
import { scatterInCircle, BlockDebris, type DebrisBirth } from '../零件/方块屑.tsx';
import meta, { vinePositions, vineLifeTicks, vineEmergeTick, vineRetractSpanTicks, vineIdleTicks } from './过度生长.元.ts';
import quickGrowingVineModelData from 'asset:模型/法术/goety/QuickGrowingVineModel';
import quickGrowingVineAnims from 'asset:动画/法术/goety/QuickGrowingVineAnimations';
import quickGrowingVinePng from 'asset:贴图/法术/goety/entity/monolith/quick_growing_vine/quick_growing_vine';
import quickGrowingVineGlowPng from 'asset:贴图/法术/goety/entity/monolith/quick_growing_vine/quick_growing_vine_glow';
import { mulberry32 } from '@engine/core/数学.ts';

const quickGrowingVineModel = getModel(quickGrowingVineModelData, 'QuickGrowingVineModel');
const [burstAnim, idleAnim, burrowAnim] = [getAnim(quickGrowingVineAnims, 'BURST'), getAnim(quickGrowingVineAnims, 'IDLE'), getAnim(quickGrowingVineAnims, 'BURROW')];

const overgrowth: React.FC<SpellPerformanceProps> = ({ 秒: sec, 目标: target, 种子: seed }) => {
  const tick = sec * 20;
  const positions = vinePositions(target);
  const debris: DebrisBirth[] = positions.flatMap((pos, i) => [
    ...scatterInCircle([pos[0], pos[1], pos[2] + 0.25], 1, vineEmergeTick(i), seed * 53 + i),
    ...scatterInCircle([pos[0], pos[1], pos[2] + 0.25], 1, vineEmergeTick(i) + vineLifeTicks, seed * 59 + i),
  ]);
  return (
    <>
      {positions.map((pos, i) => {
        const ageTicks = tick - vineEmergeTick(i);
        if (ageTicks < 0 || ageTicks >= vineLifeTicks + vineRetractSpanTicks) return null;
        const partPoses = keyframePose(quickGrowingVineModel, [ageTicks >= vineLifeTicks ? [burrowAnim, (ageTicks - vineLifeTicks) / 20] : ageTicks >= vineIdleTicks ? [idleAnim, (ageTicks - vineIdleTicks) / 20] : [burstAnim, ageTicks / 20]]);
        const angleDeg = Math.floor(mulberry32(seed * 97 + i)() * 4) * 90;
        return (
          <MinecraftSpace key={i} 位={pos}>
            <group rotation={[0, degToRad(180 - angleDeg), 0]}>
              <group scale={[-1, -1, 1]}>
                <group position={[0, -1.501, 0]}>
                  <ModelPart 模型={quickGrowingVineModel} 图={png(quickGrowingVinePng)} partPoses={partPoses} />
                  <ModelPart 模型={quickGrowingVineModel} 图={png(quickGrowingVineGlowPng)} 画法="发光" partPoses={partPoses} />
                </group>
              </group>
            </group>
          </MinecraftSpace>
        );
      })}
      <BlockDebris spawns={debris} 秒={sec} ground={target[2]} />
    </>
  );
};

export default defineSpellPerformance(meta, overgrowth);
