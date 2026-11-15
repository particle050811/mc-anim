// 虚空闪。出处 goety 2.5.60.6：VoidFlashSpell、VoidShockBomb（SpellThrowableProjectile）、VoidShockBombRenderer、VoidShockBombModel、TrailEffect；落地生的虚空震弹见 ../零件/甲/虚空震画.tsx。
// - 炸弹：VoidShockBombModel（16³ 的外壳套 9³ 的芯），bolt.xRot = pitch + 90°，芯三个轴各转 年龄 × 20°、外壳各转 年龄 × −10°；内层发光层 alpha 1、外层 alpha 0.4。
//   尾迹 TrailEffect(宽 0.5, 长 6)，trail.png、半透明、越往尾越淡、深紫。
// - 落地：5 刻里每刻 size + 3、alpha − 0.2（scale(−size, −size, size)，translate(0, size ÷ 4, 0)）胀开消失；同时生 8 颗虚空震弹，飘到各自的信号点，第 40 + i × 5 刻起一颗一颗冲向目标。
// 自己定的：游戏里朝视线抛，片里朝史蒂夫脚边 1.5 格的地面抛。
// 没做：落地在中心和四邻放的 MagicFire（紫火，另一个实体，模型没取）；落地的龙息爆炸声时刻按参考距离写死。没核：炸弹平时的 scale（当 1）。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps } from '../接口.ts';
import { trajectoryPos, trajectoryDir } from '../零件/弹道.ts';
import { MinecraftSpace, getModel, degToRad, ModelPart } from '../零件/实体.tsx';
import { arrowYawPitch } from '../零件/甲/共用.ts';
import { Trail, trailPoints } from '../零件/甲/尾迹.tsx';
import { VoidShockGroup } from '../零件/甲/虚空震画.tsx';
import meta, { voidFlashBombPath, voidFlashShocks } from './void_flash.元.ts';
import voidShockBombModelData from 'asset:模型/法术/goety/VoidShockBombModel';
import voidBombInnerPng from 'asset:贴图/法术/goety/entity/projectiles/void_shock_bomb_inner';
import voidBombOuterPng from 'asset:贴图/法术/goety/entity/projectiles/void_shock_bomb_outer';
import trailPng from 'asset:贴图/法术/goety/entity/projectiles/trail';

const voidShockBombModel = getModel(voidShockBombModelData, 'VoidShockBombModel');

const VoidFlash: React.FC<SpellPerformanceProps> = ({ 秒: sec, from, 目标: target, 种子: seed, options }) => {
  const tick = sec * 20;
  const { trajectory, arriveTick } = voidFlashBombPath(from, target, options?.highSpeed);
  const swell = Math.max(0, tick - arriveTick);
  const swellSize = 1 + swell * 3;
  const fade = Math.max(0, 1 - swell * 0.2);
  const t = Math.min(tick, arriveTick);
  const { pitch } = arrowYawPitch(trajectoryDir(trajectory, t));
  const spinPerTick = (degPerTick: number) => [degToRad(tick * degPerTick), degToRad(tick * degPerTick), degToRad(tick * degPerTick)];
  const partPoses = { bolt: { rot: [degToRad(pitch + 90), 0, 0] }, inner: { rot: spinPerTick(20) }, outer: { rot: spinPerTick(-10) } };
  return (
    <>
      {fade > 0 && (
        <MinecraftSpace 位={trajectoryPos(trajectory, t)}>
          <group position={[0, swell > 0 ? swellSize / 4 : 0, 0]}>
            <group scale={[-swellSize, -swellSize, swellSize]}>
              <ModelPart 模型={voidShockBombModel} 图={png(voidBombInnerPng)} 画法="加色" opacity={fade} partPoses={partPoses} />
              <ModelPart 模型={voidShockBombModel} 图={png(voidBombOuterPng)} 画法="加色" opacity={0.4 * fade} partPoses={partPoses} />
            </group>
          </group>
        </MinecraftSpace>
      )}
      {tick > 2 && tick < arriveTick && <Trail points={trailPoints(trajectory, tick, { startTick: 2, offset: [0, 0, 0.25] })} 宽={0.5} 长={6} 图={png(trailPng)} 色={[0.8, 0, 0.8]} 混合="半透明" />}
      <VoidShockGroup shocks={voidFlashShocks(from, target, seed, options?.highSpeed)} 目标={target} 秒={sec} 种子={seed} />
    </>
  );
};

export default defineSpellPerformance(meta, VoidFlash);
