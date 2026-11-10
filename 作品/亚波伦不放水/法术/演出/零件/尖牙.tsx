// 唤魔者尖牙：Goety 的 Fangs（照抄原版 EvokerFangs）、FangsRenderer、原版 EvokerFangsModel（1.20.1）。撕咬、尖牙盛宴共用。
// - 时序：出生后等 warmup 刻，下一刻开咬（客户端收到事件 4）；开咬后动画进度 22 刻里前 20 刻从 0 走到 1，最后 2 刻停在 1 然后消失；
//   开咬第 8 刻结算伤害，同一刻冒 12 颗暴击星（CRIT）。
// - 渲染器：mulPose(Y 90° − yRot)，scale(−f1, −f1, f1)（f1 = 2，进度过 0.9 后线性缩到 0），translate(0, −0.626, 0)，scale(0.5)。
// - 模型原版没走「亚波伦法术模型」配方（那个配方只导模组类），三个方盒照 EvokerFangsModel.createBodyLayer 抄在这里；
//   setupAnim：上下颚 zRot = π ∓ (1 − min(1, 2 × 进度)³) × 0.35π，整体抬高 (进度 + sin(进度 × 2.7)) × 0.6 × 12 像素。
// - CritParticle：重力 0.5、摩擦 0.7；初速 = 父类随机速度 × 0.1 + 给的 × 0.4；灰度 0.6～0.9，绿每刻 × 0.96、蓝 × 0.9；
//   半边长 0.1 × (0.5～1) × 0.75，出生后 1/32 寿命内长满；寿命 max(1, 6 ÷ (随机 × 0.8 + 0.6))。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { rng } from '@engine/model/parts.tsx';
import type { 点 } from '../接口.ts';
import { MC空间, 度, 模型件, type EntityModelData } from './实体.tsx';
import { 原版粒子初速, 贴图粒子, type 粒子出生, type 粒子类 } from './粒子.tsx';
import 尖牙图 from 'asset:贴图/法术/minecraft/entity/illager/evoker_fangs';
import 暴击图 from 'asset:贴图/特效/粒子/critical_hit';

const 盒 = (uv: [number, number], size: [number, number, number]) => ({ uv, from: [0, 0, 0], size, grow: [0, 0, 0], mirror: false });
const 尖牙模型 = {
  texSize: [64, 32],
  root: {
    name: 'root',
    pose: { offset: [0, 0, 0], rot: [0, 0, 0] },
    cubes: [],
    children: [
      { name: 'base', pose: { offset: [-5, 24, -5], rot: [0, 0, 0] }, cubes: [盒([0, 0], [10, 12, 10])], children: [] },
      { name: 'upper_jaw', pose: { offset: [1.5, 24, -4], rot: [0, 0, 2.042035] }, cubes: [盒([40, 0], [4, 14, 8])], children: [] },
      { name: 'lower_jaw', pose: { offset: [-1.5, 24, 4], rot: [0, Math.PI, 4.2411504] }, cubes: [盒([40, 0], [4, 14, 8])], children: [] },
    ],
  },
} as unknown as EntityModelData;
const 图 = png(尖牙图);

export const 尖牙开咬刻 = (warmup: number) => warmup + 1;
export const 尖牙寿命刻 = 22;
export const 尖牙伤害刻 = 8;

/** 一颗尖牙。刻 = 这颗牙出生后的刻；朝角 = 构造函数收的 pYRot（弧度，游戏水平角） */
export const 尖牙: React.FC<{ 位: 点; 朝角: number; warmup: number; 刻: number }> = ({ 位, 朝角, warmup, 刻 }) => {
  const a = 刻 - 尖牙开咬刻(warmup);
  if (a <= 0 || a >= 尖牙寿命刻) return null;
  const 进 = Math.min(1, a / 20);
  const f1 = 2 * (进 > 0.9 ? (1 - 进) / 0.1 : 1);
  if (f1 <= 0) return null;
  const 张 = 1 - Math.min(1, 进 * 2) ** 3;
  const y = 24 - (进 + Math.sin(进 * 2.7)) * 0.6 * 12;
  const 姿态 = {
    base: { offset: [-5, y, -5] },
    upper_jaw: { offset: [1.5, y, -4], rot: [0, 0, Math.PI - 张 * 0.35 * Math.PI] },
    lower_jaw: { offset: [-1.5, y, 4], rot: [0, Math.PI, Math.PI + 张 * 0.35 * Math.PI] },
  };
  return (
    <MC空间 位={位}>
      <group rotation={[0, 度(90 - (朝角 * 180) / Math.PI), 0]}>
        <group scale={[-f1, -f1, f1]}>
          <group position={[0, -0.626, 0]}>
            <group scale={[0.5, 0.5, 0.5]}>
              <模型件 模型={尖牙模型} 图={图} 姿态={姿态} />
            </group>
          </group>
        </group>
      </group>
    </MC空间>
  );
};

const 暴击类: 粒子类 = { 帧: [png(暴击图)], 选帧: '随机', 重力: 0.5, 摩擦: 0.7, 混合: '镂空', 大小: (年龄, 寿命) => Math.min(1, Math.max(0, (年龄 / 寿命) * 32)) };

/** 一颗牙咬合时冒的 12 颗暴击星的出生表。刻 = 这颗牙出生后的刻（定颜色用） */
export const 尖牙暴击 = (位: 点, warmup: number, 刻: number, 种子: number): 粒子出生[] => {
  const 生刻 = 尖牙开咬刻(warmup) + 尖牙伤害刻;
  if (刻 < 生刻) return [];
  const 年龄 = Math.floor(刻 - 生刻);
  return Array.from({ length: 12 }, (_, i) => {
    const r = rng(种子 * 977 + i);
    const 位置: 点 = [位[0] + (r() * 2 - 1) * 0.25, 位[1] + (r() * 2 - 1) * 0.25, 位[2] + 1.05 + r()];
    const 给 = [(r() * 2 - 1) * 0.3, 0.3 + r() * 0.3, (r() * 2 - 1) * 0.3] as const;
    const 随 = 原版粒子初速(r, 0, 0, 0);
    const v = [随[0] * 0.1 + 给[0] * 0.4, 随[1] * 0.1 + 给[1] * 0.4, 随[2] * 0.1 + 给[2] * 0.4];
    const 灰 = r() * 0.3 + 0.6;
    return {
      刻: 生刻,
      位: 位置,
      速: [v[0]!, -v[2]!, v[1]!] as const,
      寿命: Math.max(1, Math.floor(6 / (r() * 0.8 + 0.6))),
      半径: 0.1 * (r() * 0.5 + 0.5) * 0.75,
      种子: i,
      色: [灰, 灰 * 0.96 ** 年龄, 灰 * 0.9 ** 年龄] as const,
    };
  });
};

export const 暴击星: React.FC<{ 出生们: readonly 粒子出生[]; 秒: number }> = ({ 出生们, 秒 }) => <贴图粒子 类={暴击类} 出生们={出生们} 秒={秒} />;
