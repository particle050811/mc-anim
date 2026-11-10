// 尖刺。出处 goety 2.5.60.6：SpikeSpell、WandUtil.spawnSpikes、Spike、GroundProjectile、SpikeRenderer、SpikeModel。
// - 默认法杖、不潜行：和撕咬一样朝目标排一排 16 根，间隔 1.25 格，warmup 依次 0、1、2…刻；找地面的办法也一样。
// - 动画进度（GroundProjectile.getAnimationProgress）：出土后 animationTicks 从 22 每刻减 1 减到 9 停住，进度 = 1 − animationTicks ÷ 20（−0.1 → 0.55 停）；
//   寿命剩 12 刻起改成 1 − (剩余 − 2) ÷ 20（0.5 → 1）。
// - 渲染器：mulPose(Y 90° − yRot)，scale(−f1, −f1, f1)（f1 = 2，进度过 0.9 缩没），translate(0, −0.626, 0)，scale(0.5)。
//   setupAnim：整体抬 (进度 + sin(进度 × 2.7)) × 0.6 × 12 像素；尖头 upper_jaw 每画一帧 yRot −= partialTick ÷ 10（跟帧率走，这里按每秒 3 弧度算）。
// 和游戏差在：地刺游戏里立 600 刻，片里 100 刻（见 尖刺.元.ts）；潜行绕身两圈、配灾厄法杖的三路不做。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性, 点 } from '../接口.ts';
import { MC空间, 取模型, 度, 模型件 } from '../零件/实体.tsx';
import 元, { 尖刺一排, 尖刺寿命刻 } from './尖刺.元.ts';
import 模型数据 from 'asset:模型/法术/goety/SpikeModel';
import 图数据 from 'asset:贴图/法术/goety/entity/projectiles/spike';

const 模型 = 取模型(模型数据, 'SpikeModel');
const 图 = png(图数据);

const 一根: React.FC<{ 位: 点; 朝角: number; warmup: number; 刻: number }> = ({ 位, 朝角, warmup, 刻 }) => {
  const a = 刻 - (warmup + 1);
  if (a < 0 || a >= 尖刺寿命刻) return null;
  const 剩 = 尖刺寿命刻 - a;
  const 进 = 剩 <= 12 ? (剩 - 2 <= 0 ? 1 : 1 - (剩 - 2) / 20) : 1 - Math.max(9, 22 - a) / 20;
  const f1 = 2 * (进 > 0.9 ? Math.max(0, (1 - 进) / 0.1) : 1);
  if (f1 <= 0) return null;
  const 抬 = (进 + Math.sin(进 * 2.7)) * 0.6 * 12;
  const 姿态 = { base: { offset: [-5, 24 - 抬, -5] }, upper_jaw: { offset: [0, 18 - 抬, 0], rot: [0, -(a / 20) * 3, 0] } };
  return (
    <MC空间 位={位}>
      <group rotation={[0, 度(90 - (朝角 * 180) / Math.PI), 0]}>
        <group scale={[-f1, -f1, f1]}>
          <group position={[0, -0.626, 0]}>
            <group scale={[0.5, 0.5, 0.5]}>
              <模型件 模型={模型} 图={图} 姿态={姿态} />
            </group>
          </group>
        </group>
      </group>
    </MC空间>
  );
};

const 尖刺: React.FC<法术演出属性> = ({ 秒, 起点, 目标 }) => (
  <>
    {尖刺一排(起点, 目标).map((刺, i) => (
      <一根 key={i} {...刺} 刻={秒 * 20} />
    ))}
  </>
);

export default 定义法术演出(元, 尖刺);
