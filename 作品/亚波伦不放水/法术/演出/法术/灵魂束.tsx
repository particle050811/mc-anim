// 灵魂束（样板：弹道类）。出处 goety 2.5.60.6：SoulBoltSpell、SoulBolt、SpellHurtingProjectile、SoulBoltRenderer、SoulBoltModel、AdditiveSpellParticle。
// - 弹：SoulBoltModel（一个 4×4×4 的头加 4×4×6 的尾），渲染器 scale(−1.25, −1.25, 1.25)，bolt 部件 yRot = 实体 yaw、xRot = 实体 pitch；
//   entityTranslucentEmissive、满亮度、alpha 0.5；贴图 soul_bolt_1～3 每刻换一张。实体朝向照原版 ProjectileUtil.rotateTowardsMovement。
// - 尾迹（renderTrail）：从弹心到 8 刻前的弹心拉一张竖着的四边形，上下各 0.25 格，色 0xDAFDFF、alpha 0.6，贴图 trail.png 的 u 每刻滚 1/8、一次取半张。
//   弹心 = 实体位置 + 高度的一半（实体 0.3125 格见方）；头 8 刻里「8 刻前」取出生位置。
// - 命中（onHit）：32 个 bullet_effect 粒子（AdditiveSpellParticle，加色），出生在弹位置 + 各轴 0～1 格的随机处；sendParticles 数量给的 0，速度是 (0.45, 0.45, 0.45) × 0.5。
// 没做：飞行中每刻掉的 summon_trail 粒子（SummonTrailParticle 是程序画的带子，要另写）；配下界魔杖加下界套装时换 WitherBolt（片里默认只算法杖，不换）。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { rng } from '@engine/model/parts.tsx';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性, 点 } from '../接口.ts';
import { 加, 弹道位置, 弹道方向 } from '../零件/弹道.ts';
import { MC空间, 取模型, 度, 模型件 } from '../零件/实体.tsx';
import { 带 } from '../零件/束.tsx';
import { 十六进制色 } from '../零件/材质.ts';
import { 原版粒子初速, 贴图粒子, type 粒子出生, type 粒子类 } from '../零件/粒子.tsx';
import 元, { 灵魂束命中刻, 灵魂束道 } from './灵魂束.元.ts';
import 模型数据 from 'asset:模型/法术/goety/SoulBoltModel';
import 弹图1 from 'asset:贴图/法术/goety/entity/projectiles/soul_bolt/soul_bolt_1';
import 弹图2 from 'asset:贴图/法术/goety/entity/projectiles/soul_bolt/soul_bolt_2';
import 弹图3 from 'asset:贴图/法术/goety/entity/projectiles/soul_bolt/soul_bolt_3';
import 尾迹图 from 'asset:贴图/法术/goety/entity/projectiles/trail';
import 粒1 from 'asset:贴图/法术/goety/particle/bullet_effect1';
import 粒2 from 'asset:贴图/法术/goety/particle/bullet_effect2';
import 粒3 from 'asset:贴图/法术/goety/particle/bullet_effect3';
import 粒4 from 'asset:贴图/法术/goety/particle/bullet_effect4';
import 粒5 from 'asset:贴图/法术/goety/particle/bullet_effect5';
import 粒6 from 'asset:贴图/法术/goety/particle/bullet_effect6';
import 粒7 from 'asset:贴图/法术/goety/particle/bullet_effect7';

const 模型 = 取模型(模型数据, 'SoulBoltModel');
const 弹图 = [弹图1, 弹图2, 弹图3].map(png);
const 尾色 = 十六进制色(0xdafdff);
const 实体高 = 0.3125;

// AdditiveSpellParticle（AlphaProvider：alpha 恒 1）：摩擦 0.96、重力 −0.1（往上飘），贴图按年龄换；bullet_effect.json 的顺序是 7 → 1
const 命中粒子类: 粒子类 = { 帧: [粒7, 粒6, 粒5, 粒4, 粒3, 粒2, 粒1].map(png), 选帧: '按年龄', 摩擦: 0.96, 重力: -0.1, 混合: '加色' };

const 命中粒子 = (位: 点, 刻: number, 种子: number): 粒子出生[] => {
  const r = rng(种子);
  return Array.from({ length: 32 }, (_, i) => {
    const 生位: 点 = [位[0] + r(), 位[1] + r(), 位[2] + r()];
    // 构造函数：super(…, 0.5 − 随机, yd, 0.5 − 随机) 过父类的随机化，再 yd × 0.2（给的 xd、zd 不是 0，水平不缩）。原版粒子初速 进出都是游戏坐标（y 竖直）
    const [vx, vy, vz] = 原版粒子初速(r, 0.5 - r(), 0.225, 0.5 - r());
    return { 刻, 位: 生位, 速: [vx, -vz, vy * 0.2], 寿命: Math.floor(8 / (r() * 0.8 + 0.2)), 半径: 0.1 * (r() * 0.5 + 0.5) * 2 * 0.75, 种子: 种子 + i };
  });
};

const 灵魂束: React.FC<法术演出属性> = ({ 秒, 起点, 目标, 种子 }) => {
  const 刻 = 秒 * 20;
  const 道 = 灵魂束道(起点, 目标);
  const 命中 = 灵魂束命中刻(起点, 目标);
  const 命中位 = 弹道位置(道, 命中);
  const 心 = (t: number): 点 => 加(弹道位置(道, t), [0, 0, 实体高 / 2]);
  const 向 = 弹道方向(道, 刻);
  // ProjectileUtil.rotateTowardsMovement：yaw = atan2(vz, vx) + 90°，pitch = atan2(水平, vy) − 90°（游戏坐标：vy 竖直，vz = −场景 y）
  const yaw = (Math.atan2(-向[1], 向[0]) * 180) / Math.PI + 90;
  const pitch = (Math.atan2(Math.hypot(向[0], 向[1]), 向[2]) * 180) / Math.PI - 90;
  const u = (Math.floor(刻) % 8) / 8;
  return (
    <>
      {刻 < 命中 && (
        <>
          <MC空间 位={弹道位置(道, 刻)}>
            <group scale={[-1.25, -1.25, 1.25]}>
              <模型件 模型={模型} 图={弹图[Math.floor(刻) % 3]!} 画法="发光" 透明度={0.5} 姿态={{ bolt: { rot: [度(pitch), 度(yaw), 0] } }} />
            </group>
          </MC空间>
          <带 点们={[心(刻), 心(刻 - 8)]} 半宽向={[0, 0, 0.25]} 图={png(尾迹图)} u们={[u, u + 0.5]} 重复 色={尾色} 透明度={0.6} 混合="半透明" />
        </>
      )}
      <贴图粒子 类={命中粒子类} 出生们={命中粒子(命中位, 命中, 种子)} 秒={秒} />
    </>
  );
};

export default 定义法术演出(元, 灵魂束);
