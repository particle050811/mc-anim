// 魔力剑。出处 goety 2.5.60.6：SwordSpell、SwordProjectile（AbstractArrow）、SwordProjectileRenderer（scale 1.25）；原版 ItemRenderer 的 GROUND 显示、EnchantmentTableParticle。
// - 弹：把一把剑当物品画出来飞：PoseStack scale(1.25) · YP(yaw − 90) · ZP(pitch − 45)，物品 GROUND 变换（缩 0.5、抬 2/16 格）；出生 2 刻后才画。
// - 每刻一颗 enchant 粒子：出生在 位置 + 速度 × 0.75，速度参数 = 弹的速度。
// 自己定的：游戏里飞出去的是施法者副手（或主手）里那把剑的样子，片里亚波伦手里没有剑，用了钻石剑的贴图。
// 和游戏的差别：物品在游戏里有 1/16 格的厚度，这里是一张两面画的平片。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps } from '../接口.ts';
import { sub, addVec, scaleVec, trajectoryPos, trajectoryDir } from '../零件/弹道.ts';
import { MinecraftSpace, degToRad } from '../零件/实体.tsx';
import { faceMaterial } from '../零件/材质.ts';
import { VanillaParticles, type ParticleSpawn } from '../零件/粒子.tsx';
import { eachTick, arrowYawPitch } from '../零件/甲/共用.ts';
import meta, { magicSwordPath } from './sword.元.ts';
import diamondSwordPng from 'asset:贴图/法术/minecraft/item/diamond_sword';

const magicSword: React.FC<SpellPerformanceProps> = ({ sec: sec, from, target: target, seed: seed, options }) => {
  const tick = sec * 20;
  const { trajectory, arriveTick } = magicSwordPath(from, target, options?.highSpeed);
  const particles: ParticleSpawn[] = eachTick(1, Math.min(tick, arriveTick)).map((n) => {
    const speedVec = sub(trajectory(n + 1), trajectory(n));
    const p = addVec(trajectory(n), scaleVec(speedVec, 0.75));
    return { kind: 'enchant', 刻: n, p: [p[0], p[1], p[2]], v: [speedVec[0], speedVec[1], speedVec[2]], seed: seed * 53 + n };
  });
  const { yaw, pitch } = arrowYawPitch(trajectoryDir(trajectory, tick));
  return (
    <>
      {tick >= 2 && tick < arriveTick && (
        <MinecraftSpace 位={trajectoryPos(trajectory, tick)}>
          <group scale={[1.25, 1.25, 1.25]}>
            <group rotation={[0, degToRad(yaw - 90), 0]}>
              <group rotation={[0, 0, degToRad(pitch - 45)]}>
                {/* GROUND：translate(0, 2/16, 0)、scale 0.5；贴图第一行朝上，planeGeometry 的 v 反着，y 取负 */}
                <mesh position={[0, 0.125, 0]} scale={[0.5, -0.5, 0.5]} material={faceMaterial(png(diamondSwordPng), { blend: '镂空' })} frustumCulled={false}>
                  <planeGeometry args={[1, 1]} />
                </mesh>
              </group>
            </group>
          </group>
        </MinecraftSpace>
      )}
      <VanillaParticles spawns={particles} sec={sec} />
    </>
  );
};

export default defineSpellPerformance(meta, magicSword);
