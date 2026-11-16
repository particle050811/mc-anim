// 缠绕。出处 goety 2.5.60.6：EntanglingSpell、EntangleVines、TangleEntity、EntangleVinesRenderer、EntangleVinesModel、EntangleVinesAnimations（已提取）。
// - 藤出在目标脚下（实体位置就是目标位置），把目标定在原地。activeTick 1 播 BURST（0.1667 秒），第 2 刻起每刻 tangleTarget 把动画切成 HOLD（循环 0.25 秒），
//   到第 80 刻播 BURROW（0.75 秒），第 100 刻消失。
// - 渲染器：mulPose(Y 90° − yRot = 90°)，scale(−1, −1, 1)，translate(0, −1.45, 0)；只画 vine、vine2、vine3、vine4 四个部件；默认的 entityCutoutNoCull。
// 没做：史蒂夫被定住（那是史蒂夫的事）；游戏里这个法术没有粒子。配荒野法杖时范围内每个敌人各一丛不做。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps } from '../接口.ts';
import { MinecraftSpace, getModel, degToRad, ModelPart } from '../零件/实体.tsx';
import { keyframePose, getAnim } from '../零件/关键帧.ts';
import meta, { vineVanishTick, vineEmergeTick, vineRetractTick } from './缠绕.元.ts';
import entangleVinesModelData from 'asset:模型/法术/goety/EntangleVinesModel';
import entangleVinesAnims from 'asset:动画/法术/goety/EntangleVinesAnimations';
import entangleVinesPng from 'asset:贴图/法术/goety/entity/projectiles/entangle_vines';

const entangleVinesModel = getModel(entangleVinesModelData, 'EntangleVinesModel');
const [burstAnim, holdAnim, burrowAnim] = [getAnim(entangleVinesAnims, 'BURST'), getAnim(entangleVinesAnims, 'HOLD'), getAnim(entangleVinesAnims, 'BURROW')];

const entangle: React.FC<SpellPerformanceProps> = ({ sec: sec, target: target }) => {
  const tick = sec * 20;
  if (tick < vineEmergeTick || tick >= vineVanishTick) return null;
  const partPoses =
    tick >= vineRetractTick ? keyframePose(entangleVinesModel, [[burrowAnim, (tick - vineRetractTick) / 20]]) : tick >= vineEmergeTick + 1 ? keyframePose(entangleVinesModel, [[holdAnim, (tick - vineEmergeTick - 1) / 20]]) : keyframePose(entangleVinesModel, [[burstAnim, (tick - vineEmergeTick) / 20]]);
  return (
    <MinecraftSpace 位={target}>
      <group rotation={[0, degToRad(90), 0]}>
        <group scale={[-1, -1, 1]}>
          <group position={[0, -1.45, 0]}>
            <ModelPart model={entangleVinesModel} image={png(entangleVinesPng)} partPoses={partPoses} />
          </group>
        </group>
      </group>
    </MinecraftSpace>
  );
};

export default defineSpellPerformance(meta, entangle);
