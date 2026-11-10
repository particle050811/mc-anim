// 缠绕。出处 goety 2.5.60.6：EntanglingSpell、EntangleVines、TangleEntity、EntangleVinesRenderer、EntangleVinesModel、EntangleVinesAnimations（已提取）。
// - 藤出在目标脚下（实体位置就是目标位置），把目标定在原地。activeTick 1 播 BURST（0.1667 秒），第 2 刻起每刻 tangleTarget 把动画切成 HOLD（循环 0.25 秒），
//   到第 80 刻播 BURROW（0.75 秒），第 100 刻消失。
// - 渲染器：mulPose(Y 90° − yRot = 90°)，scale(−1, −1, 1)，translate(0, −1.45, 0)；只画 vine、vine2、vine3、vine4 四个部件；默认的 entityCutoutNoCull。
// 没做：史蒂夫被定住（那是史蒂夫的事）；游戏里这个法术没有粒子。配荒野法杖时范围内每个敌人各一丛不做。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性 } from '../接口.ts';
import { MC空间, 取模型, 度, 模型件 } from '../零件/实体.tsx';
import { 关键帧姿态, 取动画 } from '../零件/关键帧.ts';
import 元, { 藤消失刻, 藤破土刻, 藤缩回刻 } from './缠绕.元.ts';
import 模型数据 from 'asset:模型/法术/goety/EntangleVinesModel';
import 动画数据 from 'asset:动画/法术/goety/EntangleVinesAnimations';
import 图数据 from 'asset:贴图/法术/goety/entity/projectiles/entangle_vines';

const 模型 = 取模型(模型数据, 'EntangleVinesModel');
const [破土, 缠住, 缩回] = [取动画(动画数据, 'BURST'), 取动画(动画数据, 'HOLD'), 取动画(动画数据, 'BURROW')];

const 缠绕: React.FC<法术演出属性> = ({ 秒, 目标 }) => {
  const 刻 = 秒 * 20;
  if (刻 < 藤破土刻 || 刻 >= 藤消失刻) return null;
  const 姿态 =
    刻 >= 藤缩回刻 ? 关键帧姿态(模型, [[缩回, (刻 - 藤缩回刻) / 20]]) : 刻 >= 藤破土刻 + 1 ? 关键帧姿态(模型, [[缠住, (刻 - 藤破土刻 - 1) / 20]]) : 关键帧姿态(模型, [[破土, (刻 - 藤破土刻) / 20]]);
  return (
    <MC空间 位={目标}>
      <group rotation={[0, 度(90), 0]}>
        <group scale={[-1, -1, 1]}>
          <group position={[0, -1.45, 0]}>
            <模型件 模型={模型} 图={png(图数据)} 姿态={姿态} />
          </group>
        </group>
      </group>
    </MC空间>
  );
};

export default 定义法术演出(元, 缠绕);
