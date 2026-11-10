// 凋灵之首。出处 goety 2.5.60.6：WitherSkullSpell、ModWitherSkull（原版 WitherSkull）；原版 WitherSkullRenderer、SkullModel。
// - 弹：原版凋灵之首，惯性 0.73、加速 0.1；模型是一个 8×8×8 的头（贴图 wither.png 的 (0,0)，64×64），渲染器 scale(−1, −1, 1)，头 yRot = yaw、xRot = pitch，亮度固定 15；每刻一颗烟。
// - 命中：威力 1 的爆炸，一颗 explosion 粒子。配下界魔杖 3 颗。
// 头的模型原版写在 SkullModel.createHeadModel 里，没走导出，这里照着手写了一个方盒。没做：炸坑、凋零效果的粒子。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性 } from '../接口.ts';
import { 弹道位置, 弹道方向 } from '../零件/弹道.ts';
import { MC空间, 度, 模型件, type EntityModelData } from '../零件/实体.tsx';
import { VanillaParticles } from '../零件/粒子.tsx';
import { 原版爆 } from '../零件/甲/爆.tsx';
import { 转向角, 道上 } from '../零件/甲/共用.ts';
import { 火球烟 } from '../零件/甲/火球片.tsx';
import 元, { 凋灵之首弹 } from './wither_skull.元.ts';
import 凋灵图 from 'asset:贴图/法术/minecraft/entity/wither/wither';

const 头模型: EntityModelData = {
  texSize: [64, 64],
  root: { name: 'root', pose: { offset: [0, 0, 0], rot: [0, 0, 0] }, cubes: [], children: [{ name: 'head', pose: { offset: [0, 0, 0], rot: [0, 0, 0] }, cubes: [{ uv: [0, 0], from: [-4, -8, -4], size: [8, 8, 8], grow: [0, 0, 0], mirror: false }], children: [] }] },
};

const 凋灵之首: React.FC<法术演出属性> = ({ 秒, 起点, 目标, 种子 }) => {
  const 刻 = 秒 * 20;
  const 弹们 = 凋灵之首弹(起点, 目标, 种子);
  return (
    <>
      {弹们.map((弹, i) => {
        if (刻 >= 弹.飞刻) return null;
        const { yaw, pitch } = 转向角(弹道方向(弹.道, 刻));
        return (
          <MC空间 key={i} 位={弹道位置(弹.道, 刻)}>
            <group scale={[-1, -1, 1]}>
              <模型件 模型={头模型} 图={png(凋灵图)} 画法="镂空" 姿态={{ head: { rot: [度(pitch), 度(yaw), 0] } }} />
            </group>
          </MC空间>
        );
      })}
      <VanillaParticles spawns={[...火球烟(弹们, 刻, 种子), ...弹们.map((弹, i) => 原版爆(道上(弹.道, 弹.飞刻), 弹.飞刻, 种子 * 17 + i))]} 秒={秒} />
    </>
  );
};

export default 定义法术演出(元, 凋灵之首);
