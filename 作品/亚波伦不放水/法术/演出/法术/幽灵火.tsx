// 幽灵火（样板：落在地面的）。出处 goety 2.5.60.6：IceBouquetSpell、WandUtil.spawn4x4IceBouquet、IceBouquet、GroundProjectile、IceBouquetRenderer、IceBouquetModel、IceBouquetTextures、MagicSmokeParticle。
// - 摆位（默认法杖走 spawn4x4IceBouquet）：目标脚下一丛，再随机挑一个象限，隔 1.5 格补三丛，排成 2×2。配死灵法杖是单丛、无名法杖是塔，片里用不到。
// - 贴图（IceBouquetTextures）：每刻换一张，先 pre1～13（鬼火冒头），再 fire1～32 循环。
// - 渲染器：mulPose(Y 轴 90° − yaw)，scale(−f, −1.25, f)，translate(0, −1.45, 0)；f = 0.8，pre 阶段（头 13 刻）是 0.4。
//   先用模型默认的 entityCutoutNoCull 画一遍 alpha 0.15（镂空不混合：贴图 alpha × 0.15 < 0.1 的丢掉，剩下的不透明），再用 ModRenderType.wraith（eyes 着色器、加色、满亮度）画一遍。
//   大小的钟（GroundProjectile.getAnimationProgress）：animationTicks 从 22 每刻减到 9；减到 20 的那一刻进度正好是 0，渲染器整丛不画（冒头时闪一刻）。
//   收尾：服务端 lifeTicks 减到 14 时通知客户端，客户端接着减；f 在第 96～98 刻从 1 线性缩到 0，之后到实体移除（第 101 刻）都看不见。
// - 位置：WandUtil.spawnIceBouquet 把实体落到地面上 1/16 格（MobUtil.moveDownToGround）。
//   模型 IceBouquetModel 是几片交叉的 16×16 面片，setupAnim 给 middle 部件套了常量缩放 (0.9, 1.5, 0.9)。
// - 烟（IceBouquet.tick 客户端，第 10 刻起每刻一颗）：MagicSmokeParticle，颜色从 0xB8E5FF 渐变到 0x015687，寿命 10～19 刻，大小 0.2，
//   出生在碰撞箱（0.8 宽 × 1 高）里随机处；速度 水平 ±0.05、竖直 0.1～0.2，摩擦 0.96，重力 −0.1（四个参数的 MagicSmokeParticleOption 给的，越飘越快）；贴图是原版 generic_0。
// 没做：烧着时每刻 1/24 概率响一声原版火的噼啪（block.fire.ambient，随机的，没排进声音表）。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps, Vec3 } from '../接口.ts';
import { MinecraftSpace, getModel, degToRad, ModelPart } from '../零件/实体.tsx';
import { sequenceFrame } from '../零件/面片.tsx';
import { hexColor, type RgbColor } from '../零件/材质.ts';
import { TexturedParticles, type ParticleBirth, type ParticleClass } from '../零件/粒子.tsx';
import meta, { ghostFireLifeTicks } from './幽灵火.元.ts';
import iceBouquetModelData from 'asset:模型/法术/goety/IceBouquetModel';
import smokePng from 'asset:贴图/特效/粒子/generic_0';
import ghostFirePre1Png from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/pre/pre1';
import ghostFirePre2Png from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/pre/pre2';
import ghostFirePre3Png from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/pre/pre3';
import ghostFirePre4Png from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/pre/pre4';
import ghostFirePre5Png from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/pre/pre5';
import ghostFirePre6Png from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/pre/pre6';
import ghostFirePre7Png from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/pre/pre7';
import ghostFirePre8Png from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/pre/pre8';
import ghostFirePre9Png from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/pre/pre9';
import ghostFirePre10Png from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/pre/pre10';
import ghostFirePre11Png from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/pre/pre11';
import ghostFirePre12Png from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/pre/pre12';
import ghostFirePre13Png from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/pre/pre13';
import ghostFire1Png from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire1';
import ghostFire2Png from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire2';
import ghostFire3Png from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire3';
import ghostFire4Png from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire4';
import ghostFire5Png from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire5';
import ghostFire6Png from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire6';
import ghostFire7Png from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire7';
import ghostFire8Png from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire8';
import ghostFire9Png from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire9';
import ghostFire10Png from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire10';
import ghostFire11Png from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire11';
import ghostFire12Png from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire12';
import ghostFire13Png from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire13';
import ghostFire14Png from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire14';
import ghostFire15Png from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire15';
import ghostFire16Png from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire16';
import ghostFire17Png from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire17';
import ghostFire18Png from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire18';
import ghostFire19Png from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire19';
import ghostFire20Png from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire20';
import ghostFire21Png from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire21';
import ghostFire22Png from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire22';
import ghostFire23Png from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire23';
import ghostFire24Png from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire24';
import ghostFire25Png from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire25';
import ghostFire26Png from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire26';
import ghostFire27Png from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire27';
import ghostFire28Png from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire28';
import ghostFire29Png from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire29';
import ghostFire30Png from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire30';
import ghostFire31Png from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire31';
import ghostFire32Png from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire32';
import { mulberry32 } from '@engine/core/数学.ts';

const iceBouquetModel = getModel(iceBouquetModelData, 'IceBouquetModel');
const frameImages = [ghostFirePre1Png, ghostFirePre2Png, ghostFirePre3Png, ghostFirePre4Png, ghostFirePre5Png, ghostFirePre6Png, ghostFirePre7Png, ghostFirePre8Png, ghostFirePre9Png, ghostFirePre10Png, ghostFirePre11Png, ghostFirePre12Png, ghostFirePre13Png, ghostFire1Png, ghostFire2Png, ghostFire3Png, ghostFire4Png, ghostFire5Png, ghostFire6Png, ghostFire7Png, ghostFire8Png, ghostFire9Png, ghostFire10Png, ghostFire11Png, ghostFire12Png, ghostFire13Png, ghostFire14Png, ghostFire15Png, ghostFire16Png, ghostFire17Png, ghostFire18Png, ghostFire19Png, ghostFire20Png, ghostFire21Png, ghostFire22Png, ghostFire23Png, ghostFire24Png, ghostFire25Png, ghostFire26Png, ghostFire27Png, ghostFire28Png, ghostFire29Png, ghostFire30Png, ghostFire31Png, ghostFire32Png].map(png);
const preFrameCount = 13;
const partPoses = { middle: { scale: [0.9, 1.5, 0.9] } };
/** 看得见的最后一刻：客户端 lifeTicks 减到 2 时进度到 1、f 缩到 0 */
const ghostFireFinishTick = ghostFireLifeTicks - 2;
/** animationTicks 22 → 20 的那一刻进度 = 0，不画 */
const flashTicks = 2;
const zOffset = 0.0625;

/** 四丛的位置：目标脚下一丛，加一个随机象限的三丛（间隔 1.5 格） */
const tuftPoints = (target: Vec3, seed: number): Vec3[] => {
  const quadrant = Math.floor(mulberry32(seed)() * 4);
  const [sx, sy] = [quadrant >= 2 ? -1.5 : 1.5, quadrant % 2 === 1 ? -1.5 : 1.5];
  return [target, [target[0], target[1] + sy, target[2]], [target[0] + sx, target[1], target[2]], [target[0] + sx, target[1] + sy, target[2]]];
};

const smokeColorFrom = hexColor(0xb8e5ff);
const smokeColorTo = hexColor(0x015687);
const mixColor = (t: number): RgbColor => [0, 1, 2].map((i) => smokeColorFrom[i]! + (smokeColorTo[i]! - smokeColorFrom[i]!) * t) as unknown as RgbColor;
// getQuadSize：大小 × clamp(年龄 ÷ 寿命 × 32, 0, 1)，出生后很快长到满
const smokeParticleClass: ParticleClass = { 帧: [png(smokePng)], 选帧: '随机', 摩擦: 0.96, 重力: -0.1, 混合: '镂空', 大小: (age, lifetime) => Math.min(1, Math.max(0, (age / lifetime) * 32)) };

const smokeAt = (pos: Vec3, lastTick: number, seed: number): ParticleBirth[] => {
  const smokeSpawns: ParticleBirth[] = [];
  for (let t = 10; t <= Math.min(lastTick, ghostFireLifeTicks - 1); t++) {
    const r = mulberry32(seed * 131 + t);
    const lifetime = 10 + Math.floor(r() * 10);
    smokeSpawns.push({
      刻: t,
      位: [pos[0] + (r() - 0.5) * 0.8, pos[1] + (r() - 0.5) * 0.8, pos[2] + zOffset + r()],
      速: [((r() * 2 - 1) / 10) * 0.5, ((r() * 2 - 1) / 10) * 0.5, 0.1 + r() / 10],
      寿命: lifetime,
      radius: 0.2,
      种子: t,
      // 颜色随年龄渐变：出生表每帧重排，直接按当前年龄给
      色: mixColor(Math.min(1, Math.max(0, (lastTick - t) / lifetime))),
    });
  }
  return smokeSpawns;
};

const SingleTuft: React.FC<{ 位: Vec3; 刻: number }> = ({ 位: pos, 刻: tick }) => {
  // 贴图序号每刻 +1：0～12 是 pre，13～44 是 fire，到 44 回 13
  const n = Math.floor(tick);
  const image = n < preFrameCount ? frameImages[n]! : sequenceFrame(frameImages.slice(preFrameCount), n - preFrameCount, true);
  const remainTick = ghostFireFinishTick - tick;
  const f = (n < preFrameCount ? 0.5 : 1) * 0.8 * Math.min(1, Math.max(0, remainTick / 2));
  if (f <= 0 || n === flashTicks) return null;
  return (
    <MinecraftSpace 位={[pos[0], pos[1], pos[2] + zOffset]}>
      {/* 实体 yaw 恒 0：mulPose(YP 90°) */}
      <group rotation={[0, degToRad(90), 0]}>
        <group scale={[-f, -1.25, f]}>
          <group position={[0, -1.45, 0]}>
            <ModelPart 模型={iceBouquetModel} 图={image} 画法="镂空" opacity={0.15} partPoses={partPoses} />
            <ModelPart 模型={iceBouquetModel} 图={image} 画法="加色" partPoses={partPoses} />
          </group>
        </group>
      </group>
    </MinecraftSpace>
  );
};

const GhostFire: React.FC<SpellPerformanceProps> = ({ 秒: sec, 目标: target, 种子: seed }) => {
  const tick = sec * 20;
  const tufts = tuftPoints(target, seed);
  return (
    <>
      {tufts.map((pos, i) => (
        <React.Fragment key={i}>
          <SingleTuft 位={pos} 刻={tick} />
          <TexturedParticles 类={smokeParticleClass} spawns={smokeAt(pos, tick, seed + i)} 秒={sec} />
        </React.Fragment>
      ))}
    </>
  );
};

export default defineSpellPerformance(meta, GhostFire);
