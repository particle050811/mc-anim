// 画虚空震弹和它的爆。出处 goety 2.5.60.6：VoidShock、VoidShockRenderer、VoidShockModel、TrailEffect、CircleExplodeParticle、SphereExplodeParticle。
// - 弹：VoidShockModel（4×4×4 的外壳套一个 3×3×3 的芯），translate(0, 0.3, 0)；内层贴图发光层（eyes）alpha 1，外层贴图再画一遍 alpha 0.4；锁定后 bolt 朝飞行方向。
// - 每刻一颗 portal 粒子；锁定后拖尾迹 TrailEffect(宽 0.2, 长 3)，solid_trail、深紫（DARK_PURPLE 0xAA00AA × 1.2）。
// - 爆：圆爆、球爆各两个（尺寸 1.5、3.0），色 0xB103D8。
// 没做：锁定那一刻的 sparkle 粒子、爆的时候两圈 dust_cloud 粒子。没核：渲染器的 scale（这里照同类用 (−1, −1, 1)）、圆爆球爆的 speed 参数（当 1）。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import type { Vec3 } from '../../接口.ts';
import { sub, unitVec } from '../弹道.ts';
import { MinecraftSpace, getModel, degToRad, ModelPart } from '../实体.tsx';
import { VanillaParticles, type ParticleSpawn } from '../粒子.tsx';
import { CircleBurst, SphereBurst } from './爆.tsx';
import { eachTick, hexColor, yawPitch } from './共用.ts';
import { Trail } from './尾迹.tsx';
import { voidShockPos, voidShockHitTick, type VoidShock } from './虚空震.ts';
import voidShockModelData from 'asset:模型/法术/goety/VoidShockModel';
import voidShockInnerPng from 'asset:贴图/法术/goety/entity/projectiles/void_shock_inner';
import voidShockOuterPng from 'asset:贴图/法术/goety/entity/projectiles/void_shock_outer';
import solidTrailPng from 'asset:贴图/法术/goety/entity/projectiles/solid_trail';

const voidShockModel = getModel(voidShockModelData, 'VoidShockModel');
const deepPurple: readonly [number, number, number] = [0.8, 0, 0.8];
const burstColor = hexColor(0xb103d8);

export const VoidShockGroup: React.FC<{ shocks: readonly VoidShock[]; 目标: Vec3; 秒: number; 种子: number }> = ({ shocks, 目标: target, 秒: sec, 种子: seed }) => {
  const tick = sec * 20;
  const particles: ParticleSpawn[] = shocks.flatMap((tremor, i) =>
    eachTick(1, Math.min(tick - tremor.launchTick, voidShockHitTick(tremor, target))).map((n) => {
      const p = voidShockPos(tremor, target, n);
      return { 种: 'portal' as const, 刻: tremor.launchTick + n, p: [p[0], p[1], p[2] + 0.3] as [number, number, number], 种子: seed * 211 + i * 1009 + n };
    }),
  );
  return (
    <>
      {shocks.map((tremor, i) => {
        const t = tick - tremor.launchTick;
        if (t < 0) return null;
        const hitTick = voidShockHitTick(tremor, target);
        if (t >= hitTick) {
          const pos = voidShockPos(tremor, target, hitTick);
          return (
            <React.Fragment key={i}>
              {[1.5, 3].map((size) => (
                <React.Fragment key={size}>
                  <CircleBurst 位={pos} 刻={t - hitTick} 色={burstColor} 尺寸={size} />
                  <SphereBurst 位={pos} 刻={t - hitTick} 色={burstColor} 尺寸={size} />
                </React.Fragment>
              ))}
            </React.Fragment>
          );
        }
        const p = voidShockPos(tremor, target, t);
        const locked = t > tremor.lockTick;
        const rotation = locked ? yawPitch(unitVec(sub(voidShockPos(tremor, target, t + 1), p))) : { yaw: 0, pitch: 0 };
        const partPoses = { bolt: { rot: [degToRad(rotation.pitch), degToRad(rotation.yaw), 0] } };
        return (
          <React.Fragment key={i}>
            <MinecraftSpace 位={p}>
              <group position={[0, 0.3, 0]}>
                <group scale={[-1, -1, 1]}>
                  <ModelPart 模型={voidShockModel} 图={png(voidShockInnerPng)} 画法="加色" partPoses={partPoses} />
                  <ModelPart 模型={voidShockModel} 图={png(voidShockOuterPng)} 画法="加色" opacity={0.4} partPoses={partPoses} />
                </group>
              </group>
            </MinecraftSpace>
            {locked && (
              <Trail
                points={Array.from({ length: Math.min(8, Math.floor(t - tremor.lockTick) + 2) }, (_, j) => {
                  const q = voidShockPos(tremor, target, Math.max(tremor.lockTick, t - j));
                  return [q[0], q[1], q[2] + 0.3] as const;
                })}
                宽={0.2}
                长={3}
                图={png(solidTrailPng)}
                色={deepPurple}
                实心
                混合="镂空"
              />
            )}
          </React.Fragment>
        );
      })}
      <VanillaParticles spawns={particles} 秒={sec} />
    </>
  );
};
