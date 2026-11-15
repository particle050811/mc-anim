// 冰风暴。出处 goety 2.5.60.6：IceStormSpell、IceStorm（SpellHurtingProjectile）、IceStormRenderer（照原版末影水晶的画法：三层套着转的方块）；原版 SnowflakeParticle。
// - 弹：size 从 0 起每刻 + 0.05。PoseStack：scale((1 + size ÷ 8) × 2) · YP(年龄 × 3°) · translate(0, 0.25, 0) · 绕 (sin45°, 0, sin45°) 转 60° → 外壳 alpha 0.25；
//   scale(0.875) · 再绕那根轴转 60° · YP(年龄 × 3°) → 外壳 alpha 0.5；scale(0.875) · 转 60° · YP(年龄 × 3°) → 芯 alpha 0.75。itemEntityTranslucentCull，贴图 ice_storm（64×32）。
//   外壳、芯都是 8×8×8 的方盒（贴图 (0,0) 和 (32,0)），渲染器里内联建的模型，这里手写。
// - 每刻三圈雪花（高 −0.5 + size ÷ 4、半径 size ÷ 4 + 0.5；高 1 + size ÷ 4、同半径；高 0.5 + size ÷ 4、半径 size ÷ 2 + 1），外加一颗跟在后面的雪花。
// 没核：每圈每刻几颗（ServerParticleUtil.addAuraParticles 没读，这里每圈 4 颗、角度随机）。没做：卷到人的冻结效果。
import React from 'react';
import * as THREE from 'three';
import { png } from '@engine/model/贴图.ts';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps } from '../接口.ts';
import { trajectoryPos } from '../零件/弹道.ts';
import { MinecraftSpace, degToRad, ModelPart, type EntityModelData } from '../零件/实体.tsx';
import { TexturedParticles, type ParticleBirth } from '../零件/粒子.tsx';
import { eachTick } from '../零件/甲/共用.ts';
import { snowflake, snowflakeClass } from '../零件/甲/原版粒子.ts';
import meta, { iceStormEndTick, iceStormPath } from './ice_storm.元.ts';
import iceStormPng from 'asset:贴图/法术/goety/entity/projectiles/ice_storm';
import { mulberry32 } from '@engine/core/数学.ts';

const boxModel = (name: string, u: number): EntityModelData => ({
  texSize: [64, 32],
  root: { name: 'root', pose: { offset: [0, 0, 0], rot: [0, 0, 0] }, cubes: [], children: [{ name: name, pose: { offset: [0, 0, 0], rot: [0, 0, 0] }, cubes: [{ uv: [u, 0], from: [-4, -4, -4], size: [8, 8, 8], grow: [0, 0, 0], mirror: false }], children: [] }] },
});
const glassBox = boxModel('glass', 0);
const coreBox = boxModel('cube', 32);
const tiltQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(Math.SQRT1_2, 0, Math.SQRT1_2), Math.PI / 3);

const IceStorm: React.FC<SpellPerformanceProps> = ({ 秒: sec, from, 目标: target, 种子: seed, options }) => {
  const tick = sec * 20;
  const trajectory = iceStormPath(from, target, options?.highSpeed);
  const endTick = iceStormEndTick(from, target, options?.highSpeed);
  const r = mulberry32(seed * 29 + 7);
  const snow: ParticleBirth[] = eachTick(1, Math.min(tick, endTick)).flatMap((n) => {
    const [p, size] = [trajectory(n), n * 0.05];
    const ringAt = (height: number, radius: number) =>
      Array.from({ length: 4 }, () => {
        const angle = r() * Math.PI * 2;
        return snowflake(r, n, [p[0] + Math.cos(angle) * radius, p[1] + Math.sin(angle) * radius, p[2] + height]);
      });
    return [...ringAt(-0.5 + size / 4, size / 4 + 0.5), ...ringAt(1 + size / 4, size / 4 + 0.5), ...ringAt(0.5 + size / 4, size / 2 + 1), snowflake(r, n, p)];
  });
  const s = (1 + (tick * 0.05) / 8) * 2;
  const selfRotation: [number, number, number] = [0, degToRad(tick * 3), 0];
  const image = png(iceStormPng);
  return (
    <>
      {tick < endTick && (
        <MinecraftSpace 位={trajectoryPos(trajectory, tick)}>
          <group scale={[s, s, s]} rotation={selfRotation}>
            <group position={[0, 0.25, 0]} quaternion={tiltQuat}>
              <ModelPart 模型={glassBox} 图={image} 画法="半透明" opacity={0.25} />
              <group scale={[0.875, 0.875, 0.875]} quaternion={tiltQuat}>
                <group rotation={selfRotation}>
                  <ModelPart 模型={glassBox} 图={image} 画法="半透明" opacity={0.5} />
                  <group scale={[0.875, 0.875, 0.875]} quaternion={tiltQuat}>
                    <group rotation={selfRotation}>
                      <ModelPart 模型={coreBox} 图={image} 画法="半透明" opacity={0.75} />
                    </group>
                  </group>
                </group>
              </group>
            </group>
          </group>
        </MinecraftSpace>
      )}
      <TexturedParticles 类={{ ...snowflakeClass, ground: target[2] }} spawns={snow} 秒={sec} />
    </>
  );
};

export default defineSpellPerformance(meta, IceStorm);
