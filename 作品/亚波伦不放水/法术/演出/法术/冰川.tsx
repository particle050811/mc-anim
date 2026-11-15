// 冰川。出处 goety 2.5.60.6：IceChunkSpell、IceChunk、IceChunkRenderer、IceChunkModel、CircleExplodeParticle。
// - 冰块出在目标头上 4 格。头 20 刻（isStarting）从小长大：scale = hovering ÷ 10，用 RenderType.eyes 画 ice_chunk_spawn（发光、加色），模型绕竖轴自转；
//   之后 scale 2、贴图 ice_chunk（entityCutoutNoCull）。渲染器：mulPose(Y 90° − yRot)，scale(−f, −f, f)，translate(0, −1.45, 0)。
// - 悬停到第 100 刻（会跟着目标飘，片里目标不动），之后每刻加速 0.25 格/刻砸下。
// - 砸中（onHit）：256 颗浮冰碎屑；贴地扩散环 CircleExplode（0xFFFEFF，大小 5，speed 1）；60 颗 POOF 往外；冰块消失。
// 粗做：长大时的自转游戏里每画一帧累加 ageInTicks（转速跟帧率走、越转越快），这里按每刻 0.6 弧度匀速。
// 没做：长大时外圈往里聚的 GatherFrost 粒子、第 20 刻的 SUMMON 粒子、悬停时的 CLOUD 光环和落雪（FALLING_DUST）——原版 cloud、falling_dust 粒子库里还没有。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps, Vec3 } from '../接口.ts';
import { MinecraftSpace, getModel, degToRad, ModelPart } from '../零件/实体.tsx';
import { hexColor } from '../零件/材质.ts';
import { scatterDebris, BlockDebris } from '../零件/方块屑.tsx';
import { VanillaParticles, type ParticleSpawn } from '../零件/粒子.tsx';
import { RingBurst } from '../零件/乙圆环.tsx';
import meta, { iceBlockHitTick, iceBlockGrowTicks, iceBlockHeight } from './冰川.元.ts';
import iceChunkModelData from 'asset:模型/法术/goety/IceChunkModel';
import iceChunkPng from 'asset:贴图/法术/goety/entity/projectiles/ice_chunk';
import iceChunkSpawnPng from 'asset:贴图/法术/goety/entity/projectiles/ice_chunk_spawn';
import packedIcePng from 'asset:贴图/法术/minecraft/block/packed_ice';
import { mulberry32 } from '@engine/core/数学.ts';

const iceChunkModel = getModel(iceChunkModelData, 'IceChunkModel');
const ringColor = hexColor(0xfffeff);

const Glacier: React.FC<SpellPerformanceProps> = ({ 秒: sec, 目标: target, 种子: seed }) => {
  const tick = sec * 20;
  const isLengthening = tick < iceBlockGrowTicks;
  const f = isLengthening ? Math.floor(tick) / 10 : 2;
  const pos: Vec3 = [target[0], target[1], target[2] + iceBlockHeight(Math.min(tick, iceBlockHitTick))];
  // 砸中时冰块中心（碰撞箱 2 × 2 估）
  const slamPos: Vec3 = [target[0], target[1], target[2] + iceBlockHeight(iceBlockHitTick) + 1];
  const r = mulberry32(seed * 409 + 1);
  const smokeSpawns: ParticleSpawn[] = Array.from({ length: 60 }, (_, i): ParticleSpawn => {
    const angle = r() * Math.PI * 2;
    const speed = 0.2 + r() * 0.3;
    return { 种: 'poof', 刻: iceBlockHitTick, p: [target[0], target[1], target[2] + 0.2], v: [Math.cos(angle) * speed, Math.sin(angle) * speed, 0.05], 种子: seed * 3000 + i };
  });
  return (
    <>
      {tick < iceBlockHitTick && f > 0 && (
        <MinecraftSpace 位={pos}>
          <group rotation={[0, degToRad(90), 0]}>
            <group scale={[-f, -f, f]}>
              <group position={[0, -1.45, 0]}>
                <ModelPart 模型={iceChunkModel} 图={png(isLengthening ? iceChunkSpawnPng : iceChunkPng)} 画法={isLengthening ? '发光' : '镂空'} partPoses={isLengthening ? { chunk: { rot: [0, tick * 0.6, 0] } } : undefined} />
              </group>
            </group>
          </group>
        </MinecraftSpace>
      )}
      <BlockDebris spawns={scatterDebris(slamPos, 256, [1, 1, 1], 1, iceBlockHitTick, seed * 23)} 秒={sec} 图={png(packedIcePng)} ground={target[2]} />
      <RingBurst 位={target} spawnTick={iceBlockHitTick} 秒={sec} 大小={5} 颜色={ringColor} accel={1} />
      <VanillaParticles spawns={smokeSpawns} 秒={sec} />
    </>
  );
};

export default defineSpellPerformance(meta, Glacier);
