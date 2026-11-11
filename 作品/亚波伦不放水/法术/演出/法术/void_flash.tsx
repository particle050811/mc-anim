// 虚空闪。出处 goety 2.5.60.6：VoidFlashSpell、VoidShockBomb（SpellThrowableProjectile）、VoidShockBombRenderer、VoidShockBombModel、TrailEffect；落地生的虚空震弹见 ../零件/甲/虚空震画.tsx。
// - 炸弹：VoidShockBombModel（16³ 的外壳套 9³ 的芯），bolt.xRot = pitch + 90°，芯三个轴各转 年龄 × 20°、外壳各转 年龄 × −10°；内层发光层 alpha 1、外层 alpha 0.4。
//   尾迹 TrailEffect(宽 0.5, 长 6)，trail.png、半透明、越往尾越淡、深紫。
// - 落地：5 刻里每刻 size + 3、alpha − 0.2（scale(−size, −size, size)，translate(0, size ÷ 4, 0)）胀开消失；同时生 8 颗虚空震弹，飘到各自的信号点，第 40 + i × 5 刻起一颗一颗冲向目标。
// 自己定的：游戏里朝视线抛，片里朝史蒂夫脚边 1.5 格的地面抛。
// 没做：落地在中心和四邻放的 MagicFire（紫火，另一个实体，模型没取）；落地的龙息爆炸声时刻按参考距离写死。没核：炸弹平时的 scale（当 1）。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性 } from '../接口.ts';
import { 弹道位置, 弹道方向 } from '../零件/弹道.ts';
import { MC空间, 取模型, 度, 模型件 } from '../零件/实体.tsx';
import { 箭角 } from '../零件/甲/共用.ts';
import { 尾迹, 尾迹点 } from '../零件/甲/尾迹.tsx';
import { 虚空震们 } from '../零件/甲/虚空震画.tsx';
import 元, { 虚空闪炸弹道, 虚空闪震 } from './void_flash.元.ts';
import 模型数据 from 'asset:模型/法术/goety/VoidShockBombModel';
import 内图 from 'asset:贴图/法术/goety/entity/projectiles/void_shock_bomb_inner';
import 外图 from 'asset:贴图/法术/goety/entity/projectiles/void_shock_bomb_outer';
import 尾迹图 from 'asset:贴图/法术/goety/entity/projectiles/trail';

const 模型 = 取模型(模型数据, 'VoidShockBombModel');

const 虚空闪: React.FC<法术演出属性> = ({ 秒, 起点, 目标, 种子, 选项 }) => {
  const 刻 = 秒 * 20;
  const { 道, 到刻 } = 虚空闪炸弹道(起点, 目标, 选项?.高速);
  const 胀 = Math.max(0, 刻 - 到刻);
  const 大 = 1 + 胀 * 3;
  const 淡 = Math.max(0, 1 - 胀 * 0.2);
  const t = Math.min(刻, 到刻);
  const { pitch } = 箭角(弹道方向(道, t));
  const 转 = (每刻度: number) => [度(刻 * 每刻度), 度(刻 * 每刻度), 度(刻 * 每刻度)];
  const 姿态 = { bolt: { rot: [度(pitch + 90), 0, 0] }, inner: { rot: 转(20) }, outer: { rot: 转(-10) } };
  return (
    <>
      {淡 > 0 && (
        <MC空间 位={弹道位置(道, t)}>
          <group position={[0, 胀 > 0 ? 大 / 4 : 0, 0]}>
            <group scale={[-大, -大, 大]}>
              <模型件 模型={模型} 图={png(内图)} 画法="加色" 透明度={淡} 姿态={姿态} />
              <模型件 模型={模型} 图={png(外图)} 画法="加色" 透明度={0.4 * 淡} 姿态={姿态} />
            </group>
          </group>
        </MC空间>
      )}
      {刻 > 2 && 刻 < 到刻 && <尾迹 点们={尾迹点(道, 刻, { 起刻: 2, 偏: [0, 0, 0.25] })} 宽={0.5} 长={6} 图={png(尾迹图)} 色={[0.8, 0, 0.8]} 混合="半透明" />}
      <虚空震们 震们={虚空闪震(起点, 目标, 种子, 选项?.高速)} 目标={目标} 秒={秒} 种子={种子} />
    </>
  );
};

export default 定义法术演出(元, 虚空闪);
