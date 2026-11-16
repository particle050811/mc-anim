// 蒸汽。出处 goety 2.5.60.6：SteamSpell（蓄力类）、SteamMissile（SpellHurtingProjectile）、SteamMissileRenderer、SoulBoltModel。
// - 每 2 刻一发，方向带一点水平散布；不配对应法杖一共 5 发。
// - 弹：SoulBoltModel，scale(−1.25, −1.25, 1.25)，bolt yRot = yaw、xRot = pitch；发光层（eyes）alpha 0.5，贴图 steam_missile_1～3 每刻换。没有尾迹粒子。
// 和游戏的差别：片里时长照 种子 1 的散布算（元数据拿不到种子），别的种子个别弹会早几刻或晚几刻没。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps } from '../接口.ts';
import { trajectoryPos, trajectoryDir } from '../零件/弹道.ts';
import { MinecraftSpace, getModel, degToRad, ModelPart } from '../零件/实体.tsx';
import { yawPitch } from '../零件/甲/共用.ts';
import meta, { steamShots } from './steaming.元.ts';
import soulBoltModelData from 'asset:模型/法术/goety/SoulBoltModel';
import steamMissile1Png from 'asset:贴图/法术/goety/entity/projectiles/soul_bolt/steam_missile_1';
import steamMissile2Png from 'asset:贴图/法术/goety/entity/projectiles/soul_bolt/steam_missile_2';
import steamMissile3Png from 'asset:贴图/法术/goety/entity/projectiles/soul_bolt/steam_missile_3';

const soulBoltModel = getModel(soulBoltModelData, 'SoulBoltModel');
const projectileFrames = [steamMissile1Png, steamMissile2Png, steamMissile3Png].map(png);

const Steam: React.FC<SpellPerformanceProps> = ({ sec: sec, from, target: target, seed: seed }) => {
  const tick = sec * 20;
  return (
    <>
      {steamShots(from, target, seed).map((projectile, i) => {
        const t = tick - projectile.launchTick;
        if (t < 0 || t >= projectile.flightTick) return null;
        const { yaw, pitch } = yawPitch(trajectoryDir(projectile.trajectory, t));
        return (
          <MinecraftSpace key={i} 位={trajectoryPos(projectile.trajectory, t)}>
            <group scale={[-1.25, -1.25, 1.25]}>
              <ModelPart model={soulBoltModel} image={projectileFrames[Math.floor(t) % 3]!} 画法="加色" opacity={0.5} partPoses={{ bolt: { rot: [degToRad(pitch), degToRad(yaw), 0] } }} />
            </group>
          </MinecraftSpace>
        );
      })}
    </>
  );
};

export default defineSpellPerformance(meta, Steam);
