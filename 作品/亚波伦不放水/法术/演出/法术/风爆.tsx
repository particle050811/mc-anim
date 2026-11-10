// 风爆（配下界魔杖：气浪里带火焰粒子）。出处 goety 2.5.60.6：WindBlastSpell、WindBlowParticle、WindTrailParticle；火焰是原版 FLAME。
// 放出来的那一刻：
// - 16 条白色气浪（WindBlowParticle）：出生在 口 + 高斯 ÷ 2（每个分量），速度 = 视线方向 × (1.1～2.2) 格/刻（基速 0.3 + 射程 8 ÷ 10），每刻 × 0.99，不受重力；
//   每条是一段竖着的带子：往回拖 1～4 刻走过的路，带高 随机 × 0.5 格，寿命 20～39 刻，透明度 1 − 年龄 ÷ 寿命。
// - 配下界魔杖：沿视线每隔 1 格放 1 颗原版火焰粒子，共 7 颗（i 从 1 到 射程 − 1）。
// 气浪很快（一两格每刻），一秒就飞出 20～40 格，会从目标身边穿过去，游戏里也是。
// 没做：目标被推开、着火。
import React from 'react';
import { rng } from '@engine/model/parts.tsx';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性, 点 } from '../接口.ts';
import { 加, 减, 乘, 单位 } from '../零件/弹道.ts';
import { VanillaParticles, type ParticleSpawn } from '../零件/粒子.tsx';
import { 风带 } from '../零件/游带.tsx';
import 元 from './风爆.元.ts';

const 白: readonly [number, number, number] = [1, 1, 1];

const 风爆: React.FC<法术演出属性> = ({ 秒, 起点, 目标, 种子 }) => {
  const 刻 = 秒 * 20;
  const 向 = 单位(减([目标[0], 目标[1], 目标[2] + 0.9], 起点));
  const r = rng(种子 * 7919 + 5);
  const 高斯 = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const 浪们 = Array.from({ length: 16 }, () => {
    const 速 = 乘(向, 1.1 + r() * 1.1);
    const 生: 点 = [起点[0] + 高斯() / 2, 起点[1] + 高斯() / 2, 起点[2] + 高斯() / 2];
    const 段数 = 1 + Math.floor(r() * 4);
    const 高 = r() * 0.5;
    const 寿命 = 20 + Math.floor(r() * 20);
    // 第 k 刻末的位置：每刻先 × 0.99 再走
    const 位置 = (k: number): 点 => 加(生, 乘(速, (0.99 * (1 - 0.99 ** k)) / 0.01));
    return { 位置, 段数, 高, 寿命 };
  });
  const 火: ParticleSpawn[] = Array.from({ length: 7 }, (_, i) => {
    const p = 加(起点, 乘(向, i + 1));
    return { 种: 'flame', 刻: 0, p: [p[0], p[1], p[2]], v: [0, 0, 0], 种子: 种子 * 101 + i };
  });
  return (
    <>
      {浪们.map((浪, i) => 刻 < 浪.寿命 && <风带 key={i} 位置={浪.位置} 年龄={刻} 段数={浪.段数} 高={浪.高} 色={白} 透明度={1 - Math.floor(刻) / 浪.寿命} />)}
      <VanillaParticles spawns={火} 秒={秒} />
    </>
  );
};

export default 定义法术演出(元, 风爆);
