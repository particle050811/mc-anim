// 冲刺。出处 goety 2.5.60.6：BoltingSpell、BoltingDashTask、ElectricExplosionParticle、BigElectricParticle、WindParticle、原版 GlowParticle.ElectricSparkProvider。
// 施法者沿视线冲出去（力度 2.5 格/刻，最多 20 刻，撞到东西就停），放出来当刻和冲刺中：
// - 4 条黄色（0xFFFF55）风带绕着施法者转：宽 2，高 (2×随机−1)×0.5，跟着施法者走；
// - 1 个 ELECTRIC_EXPLODE（黄色、半边长 2、寿命 6～9 刻，贴图 circle_explode 按年龄，朝镜头）在施法者半身高；
// - 冲刺的每一刻：2 颗 BIG_ELECTRIC 在施法者碰撞箱里随机出，5 颗 ELECTRIC 在施法者半身高、几乎不动。
// 这里把 起点 当成施法者半身（脚底 = 起点 − 0.5 格），朝目标半身高冲，停在离目标 1.5 格处。
// 自己定的/粗做的：ELECTRIC（原版 ElectricSparkProvider）寿命、大小没逐行核，按 5～12 刻、半边长 0.1～0.2 画；冲刺的空气阻力、
// 施法者自己的旋转冲刺姿势没做（那是施法者身上的东西）。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { rng } from '@engine/model/parts.tsx';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性, 点 } from '../接口.ts';
import { 加, 减, 乘, 单位, 长 } from '../零件/弹道.ts';
import { 十六进制色 } from '../零件/材质.ts';
import { 风粒们, type 风粒生 } from '../零件/丁风.tsx';
import { 默认半径 } from '../零件/丁粒子.ts';
import { 贴图粒子, type 粒子出生, type 粒子类 } from '../零件/粒子.tsx';
import 元 from './冲刺.元.ts';
import 电1 from 'asset:贴图/法术/goety/particle/electric_1';
import 电2 from 'asset:贴图/法术/goety/particle/electric_2';
import 电3 from 'asset:贴图/法术/goety/particle/electric_3';
import 电4 from 'asset:贴图/法术/goety/particle/electric_4';
import 电5 from 'asset:贴图/法术/goety/particle/electric_5';
import 电6 from 'asset:贴图/法术/goety/particle/electric_6';
import 电7 from 'asset:贴图/法术/goety/particle/electric_7';
import 电8 from 'asset:贴图/法术/goety/particle/electric_8';
import 电9 from 'asset:贴图/法术/goety/particle/electric_9';
import 电10 from 'asset:贴图/法术/goety/particle/electric_10';
import 电11 from 'asset:贴图/法术/goety/particle/electric_11';
import 电12 from 'asset:贴图/法术/goety/particle/electric_12';
import 电13 from 'asset:贴图/法术/goety/particle/electric_13';
import 电14 from 'asset:贴图/法术/goety/particle/electric_14';
import 电15 from 'asset:贴图/法术/goety/particle/electric_15';
import 电16 from 'asset:贴图/法术/goety/particle/electric_16';
import 环1 from 'asset:贴图/法术/goety/particle/circle_explode1';
import 环2 from 'asset:贴图/法术/goety/particle/circle_explode2';
import 环3 from 'asset:贴图/法术/goety/particle/circle_explode3';
import 环4 from 'asset:贴图/法术/goety/particle/circle_explode4';
import 环5 from 'asset:贴图/法术/goety/particle/circle_explode5';
import 环6 from 'asset:贴图/法术/goety/particle/circle_explode6';
import 环7 from 'asset:贴图/法术/goety/particle/circle_explode7';
import 环8 from 'asset:贴图/法术/goety/particle/circle_explode8';
import 大1 from 'asset:贴图/法术/goety/particle/big_electric_1';
import 大2 from 'asset:贴图/法术/goety/particle/big_electric_2';
import 大3 from 'asset:贴图/法术/goety/particle/big_electric_3';

const 黄 = 十六进制色(0xffff55);
const 电类: 粒子类 = { 帧: [电1,电2,电3,电4,电5,电6,电7,电8,电9,电10,电11,电12,电13,电14,电15,电16].map(png), 选帧: '按年龄', 混合: '半透明', 摩擦: 0.96 };
const 大电类: 粒子类 = { 帧: [大1, 大2, 大3].map(png), 选帧: '按年龄', 混合: '半透明', 摩擦: 0.96, 色: [1, 0.9, 1] };
const 爆类: 粒子类 = { 帧: [环1, 环2, 环3, 环4, 环5, 环6, 环7, 环8].map(png), 选帧: '按年龄', 混合: '半透明', 色: 黄 };

const 冲刺: React.FC<法术演出属性> = ({ 秒, 起点, 目标, 种子 }) => {
  const 刻 = 秒 * 20;
  const 终 = 加(目标, [0, 0, 0.9]);
  const 向 = 单位(减(终, 起点));
  const 冲刻 = Math.min(20, Math.max(1, Math.ceil((长(减(终, 起点)) - 1.5) / 2.5)));
  const 身 = (k: number): 点 => 加(起点, 乘(向, 2.5 * Math.min(k, 冲刻)));
  const r = rng(种子 * 7919 + 29);
  const 风们: 风粒生[] = Array.from({ length: 4 }, (_, i) => ({ 刻: 0, 主人: (k) => 加(身(k), [0, 0, -0.5]), 宽: 2, 高: (2 * r() - 1) * 0.5, 种子: 种子 * 1009 + i }));
  const 大电: 粒子出生[] = [];
  const 电: 粒子出生[] = [];
  for (let t = 0; t <= 冲刻; t++) {
    const 中 = 身(t);
    for (let i = 0; i < 2; i++) {
      const 速: 点 = [(r() - 0.5) * 0.1, (r() - 0.5) * 0.1, (r() - 0.5) * 0.1];
      大电.push({ 刻: t, 位: [中[0] + (r() - 0.5) * 0.6, 中[1] + (r() - 0.5) * 0.6, 中[2] + 0.4 + (r() - 0.5) * 1.8], 速, 寿命: 2 + Math.floor(r() * 2), 半径: 默认半径(r) * 2 });
    }
    for (let i = 0; i < 5; i++) {
      电.push({ 刻: t, 位: [中[0], 中[1], 中[2] + 0.4], 速: [(r() - 0.5) * 0.05, (r() - 0.5) * 0.05, (r() - 0.5) * 0.05], 寿命: 5 + Math.floor(r() * 8), 半径: 默认半径(r) });
    }
  }
  const 爆: 粒子出生[] = [{ 刻: 0, 位: [起点[0], 起点[1], 起点[2] + 0.4], 寿命: 6 + Math.floor(r() * 4), 半径: 2 }];
  return (
    <>
      <风粒们 出生们={风们} 刻={刻} 色={黄} />
      <贴图粒子 类={爆类} 出生们={爆} 秒={秒} />
      <贴图粒子 类={大电类} 出生们={大电} 秒={秒} />
      <贴图粒子 类={电类} 出生们={电} 秒={秒} />
    </>
  );
};

export default 定义法术演出(元, 冲刺);
