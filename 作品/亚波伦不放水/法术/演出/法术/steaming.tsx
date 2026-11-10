// 蒸汽。出处 goety 2.5.60.6：SteamSpell（蓄力类）、SteamMissile（SpellHurtingProjectile）、SteamMissileRenderer、SoulBoltModel。
// - 每 2 刻一发，方向带一点水平散布；不配对应法杖一共 5 发。
// - 弹：SoulBoltModel，scale(−1.25, −1.25, 1.25)，bolt yRot = yaw、xRot = pitch；发光层（eyes）alpha 0.5，贴图 steam_missile_1～3 每刻换。没有尾迹粒子。
// 和游戏的差别：片里时长照 种子 1 的散布算（元数据拿不到种子），别的种子个别弹会早几刻或晚几刻没。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性 } from '../接口.ts';
import { 弹道位置, 弹道方向 } from '../零件/弹道.ts';
import { MC空间, 取模型, 度, 模型件 } from '../零件/实体.tsx';
import { 转向角 } from '../零件/甲/共用.ts';
import 元, { 蒸汽弹 } from './steaming.元.ts';
import 模型数据 from 'asset:模型/法术/goety/SoulBoltModel';
import 图1 from 'asset:贴图/法术/goety/entity/projectiles/soul_bolt/steam_missile_1';
import 图2 from 'asset:贴图/法术/goety/entity/projectiles/soul_bolt/steam_missile_2';
import 图3 from 'asset:贴图/法术/goety/entity/projectiles/soul_bolt/steam_missile_3';

const 模型 = 取模型(模型数据, 'SoulBoltModel');
const 弹图 = [图1, 图2, 图3].map(png);

const 蒸汽: React.FC<法术演出属性> = ({ 秒, 起点, 目标, 种子 }) => {
  const 刻 = 秒 * 20;
  return (
    <>
      {蒸汽弹(起点, 目标, 种子).map((弹, i) => {
        const t = 刻 - 弹.出刻;
        if (t < 0 || t >= 弹.飞刻) return null;
        const { yaw, pitch } = 转向角(弹道方向(弹.道, t));
        return (
          <MC空间 key={i} 位={弹道位置(弹.道, t)}>
            <group scale={[-1.25, -1.25, 1.25]}>
              <模型件 模型={模型} 图={弹图[Math.floor(t) % 3]!} 画法="加色" 透明度={0.5} 姿态={{ bolt: { rot: [度(pitch), 度(yaw), 0] } }} />
            </group>
          </MC空间>
        );
      })}
    </>
  );
};

export default 定义法术演出(元, 蒸汽);
