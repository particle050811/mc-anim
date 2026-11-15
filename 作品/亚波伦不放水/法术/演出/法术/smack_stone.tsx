// 重击石。出处 goety 2.5.60.6：SmackStoneSpell、SmackStone（SpellThrowableProjectile）、SmackStoneRenderer、SmackStoneModel、TrailEffect。
// - 弹：SmackStoneModel（4×4×4 的石头，四面各贴一片 3×3），渲染器 scale(−1, −1, 1)，rock 部件 yRot = yaw、xRot = pitch；entityTranslucent alpha 0.5，贴图 smack_stone。
// - 尾迹：TrailEffect(宽 0.2, 长 6)，solid_trail 贴图、镂空、朝镜头，色 0x79553A；出生 2 刻后开始记点，点在 位置 + 半高。
// 没做：渲染器在半透明那遍之后还用发光层（eyes）再画一遍，那张发光贴图没取；命中时的圆石碎屑（BLOCK 粒子）。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps } from '../接口.ts';
import { trajectoryPos, trajectoryDir } from '../零件/弹道.ts';
import { MinecraftSpace, getModel, degToRad, ModelPart } from '../零件/实体.tsx';
import { hexColor, yawPitch } from '../零件/甲/共用.ts';
import { Trail, trailPoints } from '../零件/甲/尾迹.tsx';
import meta, { smackStonePath } from './smack_stone.元.ts';
import smackStoneModelData from 'asset:模型/法术/goety/SmackStoneModel';
import smackStonePng from 'asset:贴图/法术/goety/entity/projectiles/smack_stone';
import solidTrailPng from 'asset:贴图/法术/goety/entity/projectiles/solid_trail';

const smackStoneModel = getModel(smackStoneModelData, 'SmackStoneModel');

const SmackStone: React.FC<SpellPerformanceProps> = ({ 秒: sec, from, 目标: target, options }) => {
  const tick = sec * 20;
  const { trajectory, arriveTick } = smackStonePath(from, target, options?.highSpeed);
  if (tick >= arriveTick) return null;
  const { yaw, pitch } = yawPitch(trajectoryDir(trajectory, tick));
  return (
    <>
      <MinecraftSpace 位={trajectoryPos(trajectory, tick)}>
        <group scale={[-1, -1, 1]}>
          <ModelPart 模型={smackStoneModel} 图={png(smackStonePng)} 画法="半透明" opacity={0.5} partPoses={{ rock: { rot: [degToRad(pitch), degToRad(yaw), 0], offset: [0, -2, 0] } }} />
        </group>
      </MinecraftSpace>
      {tick > 2 && <Trail points={trailPoints(trajectory, tick, { startTick: 2, offset: [0, 0, 0.125] })} 宽={0.2} 长={6} 图={png(solidTrailPng)} 色={hexColor(0x79553a)} 实心 混合="镂空" />}
    </>
  );
};

export default defineSpellPerformance(meta, SmackStone);
