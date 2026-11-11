// 重击石。出处 goety 2.5.60.6：SmackStoneSpell、SmackStone（SpellThrowableProjectile）、SmackStoneRenderer、SmackStoneModel、TrailEffect。
// - 弹：SmackStoneModel（4×4×4 的石头，四面各贴一片 3×3），渲染器 scale(−1, −1, 1)，rock 部件 yRot = yaw、xRot = pitch；entityTranslucent alpha 0.5，贴图 smack_stone。
// - 尾迹：TrailEffect(宽 0.2, 长 6)，solid_trail 贴图、镂空、朝镜头，色 0x79553A；出生 2 刻后开始记点，点在 位置 + 半高。
// 没做：渲染器在半透明那遍之后还用发光层（eyes）再画一遍，那张发光贴图没取；命中时的圆石碎屑（BLOCK 粒子）。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性 } from '../接口.ts';
import { 弹道位置, 弹道方向 } from '../零件/弹道.ts';
import { MC空间, 取模型, 度, 模型件 } from '../零件/实体.tsx';
import { 十六色, 转向角 } from '../零件/甲/共用.ts';
import { 尾迹, 尾迹点 } from '../零件/甲/尾迹.tsx';
import 元, { 重击石道 } from './smack_stone.元.ts';
import 模型数据 from 'asset:模型/法术/goety/SmackStoneModel';
import 石图 from 'asset:贴图/法术/goety/entity/projectiles/smack_stone';
import 尾迹图 from 'asset:贴图/法术/goety/entity/projectiles/solid_trail';

const 模型 = 取模型(模型数据, 'SmackStoneModel');

const 重击石: React.FC<法术演出属性> = ({ 秒, 起点, 目标, 选项 }) => {
  const 刻 = 秒 * 20;
  const { 道, 到刻 } = 重击石道(起点, 目标, 选项?.高速);
  if (刻 >= 到刻) return null;
  const { yaw, pitch } = 转向角(弹道方向(道, 刻));
  return (
    <>
      <MC空间 位={弹道位置(道, 刻)}>
        <group scale={[-1, -1, 1]}>
          <模型件 模型={模型} 图={png(石图)} 画法="半透明" 透明度={0.5} 姿态={{ rock: { rot: [度(pitch), 度(yaw), 0], offset: [0, -2, 0] } }} />
        </group>
      </MC空间>
      {刻 > 2 && <尾迹 点们={尾迹点(道, 刻, { 起刻: 2, 偏: [0, 0, 0.125] })} 宽={0.2} 长={6} 图={png(尾迹图)} 色={十六色(0x79553a)} 实心 混合="镂空" />}
    </>
  );
};

export default 定义法术演出(元, 重击石);
