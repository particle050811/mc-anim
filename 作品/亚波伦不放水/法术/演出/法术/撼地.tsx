// 撼地。出处 goety 2.5.60.6：EarthFistSpell、EarthFist、EarthFistRenderer、EarthFistModel（ATTACK、REMOVE 两段关键帧写在模型类里）、DustCloudParticle。
// - 拳头出在目标脚下，yRot = 施法者指向目标的水平角。warmup 10 刻里每刻 circularParticles(BLOCK, 半径 1.5) = 8 颗碎屑（方块取脚下那格）。
// - 破土那一刻：8 次 circularParticles(BLOCK, 速度 (0, 1, 0) × 0.5, 半径 1.5) = 64 颗往上蹿的碎屑；一圈 8 颗尘云（颜色 0x7F7D7D、大小 1）。
// - 渲染器：只在破土后画；mulPose(Y 90° − yRot)，scale(−1, −1, 1)，translate(0, −1, 0)。
//   ATTACK（0.4 秒）：fist 位置从 posVec(0, −40, 0) 到 0、缩放从 0 到 1；REMOVE（0.4 秒）：位置回到 posVec(0, −40, 0)，缩放后一半时间里缩到 0。
// 没做：史蒂夫被顶飞（那是史蒂夫的事）。配占卜法杖时范围内每个敌人各一拳不做。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps, Vec3 } from '../接口.ts';
import { gameHorizAngleRad } from '../零件/地面.ts';
import { MinecraftSpace, getModel, degToRad, ModelPart } from '../零件/实体.tsx';
import { keyframePose, type AnimDef } from '../零件/关键帧.ts';
import { hexColor } from '../零件/材质.ts';
import { scatterInCircle, BlockDebris, type DebrisBirth } from '../零件/方块屑.tsx';
import { DustCloud, dustCloudSpawns } from '../零件/乙尘云.tsx';
import meta, { fistVanishTick, fistEmergeTick, fistRetractTick } from './撼地.元.ts';
import earthFistModelData from 'asset:模型/法术/goety/EarthFistModel';
import earthFistPng from 'asset:贴图/法术/goety/entity/projectiles/earth_fist';

const earthFistModel = getModel(earthFistModelData, 'EarthFistModel');
const image = png(earthFistPng);
const punchOut: AnimDef = {
  length: 0.4,
  looping: false,
  bones: {
    fist: [
      { target: 'position', keyframes: [{ t: 0, v: [0, 40, 0], interp: 'catmullrom' }, { t: 0.4, v: [0, 0, 0], interp: 'linear' }] },
      { target: 'scale', keyframes: [{ t: 0, v: [-1, -1, -1], interp: 'catmullrom' }, { t: 0.4, v: [0, 0, 0], interp: 'catmullrom' }] },
    ],
  },
};
const punchBack: AnimDef = {
  length: 0.4,
  looping: false,
  bones: {
    fist: [
      { target: 'position', keyframes: [{ t: 0, v: [0, 0, 0], interp: 'linear' }, { t: 0.4, v: [0, 40, 0], interp: 'catmullrom' }] },
      { target: 'scale', keyframes: [{ t: 0, v: [0, 0, 0], interp: 'linear' }, { t: 0.2, v: [0, 0, 0], interp: 'linear' }, { t: 0.4, v: [-1, -1, -1], interp: 'linear' }] },
    ],
  },
};
const dustColor = hexColor(0x7f7d7d);

const circlePoints = (center: Vec3, radius: number, seed: number): Vec3[] => scatterInCircle(center, radius, 0, seed).map((spawn) => spawn.位);

const EarthShake: React.FC<SpellPerformanceProps> = ({ 秒: sec, from, 目标: target, 种子: seed }) => {
  const tick = sec * 20;
  const debris: DebrisBirth[] = [];
  for (let t = 0; t < Math.min(fistEmergeTick - 1, tick); t++) debris.push(...scatterInCircle(target, 1.5, t, seed * 211 + t));
  for (let k = 0; k < 8; k++) debris.push(...scatterInCircle(target, 1.5, fistEmergeTick, seed * 211 + 100 + k).map((spawn) => ({ ...spawn, 速: [0, 0, 0.5] as const })));
  // 收拳的 AnimationState 开始时出拳的被 stop
  const partPoses = tick >= fistRetractTick ? keyframePose(earthFistModel, [[punchBack, (tick - fistRetractTick) / 20]]) : keyframePose(earthFistModel, [[punchOut, (tick - fistEmergeTick) / 20]]);
  return (
    <>
      {tick >= fistEmergeTick && tick < fistVanishTick && (
        <MinecraftSpace 位={target}>
          <group rotation={[0, degToRad(90 - (gameHorizAngleRad(from, target) * 180) / Math.PI), 0]}>
            <group scale={[-1, -1, 1]}>
              <group position={[0, -1, 0]}>
                <ModelPart 模型={earthFistModel} 图={image} partPoses={partPoses} />
              </group>
            </group>
          </group>
        </MinecraftSpace>
      )}
      <BlockDebris spawns={debris} 秒={sec} ground={target[2]} />
      <DustCloud spawns={dustCloudSpawns(circlePoints(target, 1.5, seed * 3 + 1), fistEmergeTick, 1, dustColor, seed)} 秒={sec} />
    </>
  );
};

export default defineSpellPerformance(meta, EarthShake);
