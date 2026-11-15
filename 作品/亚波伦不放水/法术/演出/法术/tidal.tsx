// 潮涌。出处 goety 2.5.60.6：TidalSpell、TidalSurge（AbstractWave）、TidalSurgeRenderer、TidalSurgeModel；原版 SplashParticle。
// - 一道贴着地往前推的浪。PoseStack：translate(0, 1.5, 0) · YN(yaw + 180°) · translate(0, −0.1 − (1 − f × 0.5), −0.5) · scale((0.2 + f) × 0.9, −1, 1)，f = min(年龄 ÷ 10, 1)（刚出来又窄又矮，10 刻长足）。
// - TidalSurgeModel（浪身 26×6×12 加一片往前卷的浪头 26×8×17）：浪头 xRot += f2、y += f2 × 8、z += f2 × 2，f2 = (sin(年龄 × 0.1) + 1) × 0.2；
//   浪身浪头 z 向拉长 stretch = min(40, 年龄) ÷ 40，浪头再 y、z 各 + stretch × 2；停下后整体按 waveScale 缩。
// - 贴图 surge_0～3（每 3 刻换）乘水色，再叠一层 overlay_0～3 乘 (水色 + 0.5)；半透明。水色游戏里取所在群系的，这里用原版默认水色 0x3F76E4。
// - 每 5 刻一片 splash。
// 没做：每 5 刻的 spell_cloud 粒子；停下拍的那 10 刻浪头往下砸的位移（slamPos）；被浪推着走的人。没核：f 是否封顶在 1、yaw 的正负（照画面调到浪头朝前）。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps } from '../接口.ts';
import { sub, facingAngle, unitVec, trajectoryPos } from '../零件/弹道.ts';
import { MinecraftSpace, getModel, degToRad, ModelPart } from '../零件/实体.tsx';
import { serverSendParticles, VanillaParticles } from '../零件/粒子.tsx';
import { eachTick, hexColor } from '../零件/甲/共用.ts';
import meta, { tidalStart, tidalPath } from './tidal.元.ts';
import tidalSurgeModelData from 'asset:模型/法术/goety/TidalSurgeModel';
import tidalSurge0Png from 'asset:贴图/法术/goety/entity/projectiles/tidal_surge/surge_0';
import tidalSurge1Png from 'asset:贴图/法术/goety/entity/projectiles/tidal_surge/surge_1';
import tidalSurge2Png from 'asset:贴图/法术/goety/entity/projectiles/tidal_surge/surge_2';
import tidalSurge3Png from 'asset:贴图/法术/goety/entity/projectiles/tidal_surge/surge_3';
import tidalOverlay0Png from 'asset:贴图/法术/goety/entity/projectiles/tidal_surge/overlay_0';
import tidalOverlay1Png from 'asset:贴图/法术/goety/entity/projectiles/tidal_surge/overlay_1';
import tidalOverlay2Png from 'asset:贴图/法术/goety/entity/projectiles/tidal_surge/overlay_2';
import tidalOverlay3Png from 'asset:贴图/法术/goety/entity/projectiles/tidal_surge/overlay_3';

const tidalSurgeModel = getModel(tidalSurgeModelData, 'TidalSurgeModel');
const waveFrames = [tidalSurge0Png, tidalSurge1Png, tidalSurge2Png, tidalSurge3Png].map(png);
const overlayPngs = [tidalOverlay0Png, tidalOverlay1Png, tidalOverlay2Png, tidalOverlay3Png].map(png);
const waterColor = hexColor(0x3f76e4);
const brightWaterColor = waterColor.map((c) => Math.min(1, c + 0.5)) as unknown as readonly [number, number, number];

const TidalSurge: React.FC<SpellPerformanceProps> = ({ 秒: sec, from, 目标: target, 种子: seed }) => {
  const tick = sec * 20;
  const { trajectory, stopTick } = tidalPath(from, target);
  const { yaw } = facingAngle(unitVec(sub(target, tidalStart(from, target))));
  const f = Math.min(tick / 10, 1);
  const f2 = (Math.sin(tick * 0.1) + 1) * 0.2;
  const stretch = Math.min(40, tick) / 40;
  const ws = Math.max(0, 1 - Math.max(0, tick - stopTick - 10) * 0.1);
  const frame = Math.floor((Math.floor(tick) % 12) / 3);
  const partPoses = {
    wave: { scale: [ws, ws, ws + stretch] },
    top: { rot: [0.3927 + f2, 0, 0], offset: [0, 0.25 + f2 * 8 + stretch * 2, 1 + f2 * 2 + stretch * 2], scale: [ws, ws, ws + stretch] },
  };
  const splashes = eachTick(1, Math.min(tick, stopTick))
    .filter((n) => n % 5 === 0)
    .flatMap((n) => {
      const p = trajectory(n);
      return serverSendParticles('splash', n, [p[0], p[1], p[2] + 0.5], 8, [1, 1, 0.3], 0.1, seed * 71 + n);
    });
  return (
    <>
      {ws > 0 && (
        <MinecraftSpace 位={trajectoryPos(trajectory, Math.min(tick, stopTick))}>
          <group position={[0, 1.5, 0]} rotation={[0, -degToRad(yaw + 180), 0]}>
            <group position={[0, -0.1 - (1 - f * 0.5), -0.5]} scale={[(0.2 + f) * 0.9, -1, 1]}>
              <ModelPart 模型={tidalSurgeModel} 图={waveFrames[frame]!} 画法="半透明" 色={waterColor} partPoses={partPoses} />
              <ModelPart 模型={tidalSurgeModel} 图={overlayPngs[frame]!} 画法="半透明" 色={brightWaterColor} partPoses={partPoses} />
            </group>
          </group>
        </MinecraftSpace>
      )}
      <VanillaParticles spawns={splashes} 秒={sec} />
    </>
  );
};

export default defineSpellPerformance(meta, TidalSurge);
