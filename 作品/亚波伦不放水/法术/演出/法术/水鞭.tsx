// 水鞭。出处 goety 2.5.60.6：GulfTentacleSpell、GulfTentacle、GulfTentacleRenderer（MobRenderer）、GulfTentacleModel（ATTACK 关键帧写在模型类里）。
// - 触手出在施法者眼睛往前 1 格、往持杖手一侧 0.5 格、往下 0.45 格，朝向跟施法者的 yRot、xRot；这里把「起点」当那个位置，朝目标甩。
// - 渲染器：LivingEntityRenderer 那套 mulPose(Y 180° − yRot)、scale(−1, −1, 1)、scale(1, 1, range ÷ 4)、translate(0, −1.501, 0)；
//   模型 setupAnim：tentacle.xRot = headPitch，再播 ATTACK（1 秒 = 整个寿命 20 刻）：三节先卷起、0.25～0.45 秒甩直、0.7 秒后缩没。
// - 只有 4 格长（RANGE 默认 4），离得远够不着目标。
// 没做：打中时的 WHIP_HIT 声和伤害；life ≤ 1 那一刻不画的细节（那时缩放本来就是 0）。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps } from '../接口.ts';
import { gameYawDeg } from '../零件/地面.ts';
import { MinecraftSpace, getModel, degToRad, ModelPart } from '../零件/实体.tsx';
import { keyframePose, type AnimDef } from '../零件/关键帧.ts';
import meta, { whipRange, whipLifeTicks } from './水鞭.元.ts';
import gulfTentacleModelData from 'asset:模型/法术/goety/GulfTentacleModel';
import gulfTentaclePng from 'asset:贴图/法术/goety/entity/projectiles/gulf_tentacle';

const gulfTentacleModel = getModel(gulfTentacleModelData, 'GulfTentacleModel');
const image = png(gulfTentaclePng);
const xRotationFromDeg = (x: number) => [(x * Math.PI) / 180, 0, 0];
const rotationChannel = (keyframes: readonly (readonly [number, number])[]) => ({ target: 'rotation' as const, keyframes: keyframes.map(([t, x]) => ({ t, v: xRotationFromDeg(x), interp: 'catmullrom' as const })) });
const whipAnim: AnimDef = {
  length: 1,
  looping: false,
  bones: {
    tentacle: [
      rotationChannel([[0, 0], [0.25, -125], [0.45, 0], [1, 0]]),
      { target: 'scale', keyframes: ([[0, 0], [0.25, 0.5], [0.45, 1], [0.7, 1], [1, 0]] as const).map(([t, k]) => ({ t, v: [k - 1, k - 1, k - 1], interp: 'catmullrom' as const })) },
    ],
    tentacle_mid: [rotationChannel([[0, 0], [0.25, 152.5], [0.35, 45], [0.45, 0], [1, 0]])],
    tentacle_tip: [rotationChannel([[0, 0], [0.25, -157.5], [0.35, 45], [0.45, 0], [1, 0]])],
  },
};

const waterWhip: React.FC<SpellPerformanceProps> = ({ sec: sec, from, target: target }) => {
  const tick = sec * 20;
  if (tick >= whipLifeTicks) return null;
  // 瞄史蒂夫胸口；游戏的 xRot 往下看为正
  const horizontalDist = Math.hypot(target[0] - from[0], target[1] - from[1]);
  const pitch = -Math.atan2(target[2] + 0.9 - from[2], horizontalDist);
  const pose = keyframePose(gulfTentacleModel, [[whipAnim, sec]]);
  const root = pose.tentacle ?? {};
  const rootRot = root.rot ?? [0, 0, 0];
  return (
    <MinecraftSpace 位={from}>
      <group rotation={[0, degToRad(180 - gameYawDeg(from, target)), 0]}>
        <group scale={[-1, -1, 1]}>
          <group scale={[1, 1, whipRange / 4]}>
            <group position={[0, -1.501, 0]}>
              <ModelPart model={gulfTentacleModel} image={image} partPoses={{ ...pose, tentacle: { ...root, rot: [rootRot[0] + pitch, rootRot[1], rootRot[2]] } }} />
            </group>
          </group>
        </group>
      </group>
    </MinecraftSpace>
  );
};

export default defineSpellPerformance(meta, waterWhip);
