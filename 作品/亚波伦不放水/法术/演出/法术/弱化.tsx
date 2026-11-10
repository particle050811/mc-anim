// 弱化。出处 goety 2.5.60.6：WeakeningSpell、ShockwaveParticleOption、SpellSquareParticle。
// 半径 7（int），放出来当刻：
// - 粉色（LIGHT_PURPLE 0xFF55FF）冲击波环：施法者脚底 + 0.25 格，大小 7，速度 1（15 刻放完），淡出；
// - 施法者所在方块周围 [−7, 7)² 的每个格子 25% 概率在方块角上出一颗 SPELL_SQUARE（贴图 trail），颜色 = 粉色 × 0.5（count 0 时参数 × 速度 0.5），
//   往上飘（重力 −0.1），寿命 8～40 刻，透明度 1 − 年龄 ÷ 寿命。
// 这里把 起点 当成中心（施法者脚底 + 0.5 格）。
// 没做：半径内生物的 SAPPED / 虚弱效果。
import React from 'react';
import { rng } from '@engine/model/parts.tsx';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性, 点 } from '../接口.ts';
import { 十六进制色 } from '../零件/材质.ts';
import { 冲击波环 } from '../零件/冲击波.tsx';
import { 方块类, 默认半径 } from '../零件/丁粒子.ts';
import { 原版粒子初速, 贴图粒子, type 粒子出生 } from '../零件/粒子.tsx';
import 元 from './弱化.元.ts';

const 粉 = 十六进制色(0xff55ff);
const 半径格 = 7;

const 弱化: React.FC<法术演出属性> = ({ 秒, 起点, 种子 }) => {
  const 脚z = 起点[2] - 0.5;
  const r = rng(种子 * 7919 + 3);
  const 方块: 粒子出生[] = [];
  const bx = Math.floor(起点[0]);
  const by = Math.floor(起点[1]);
  for (let i = -半径格; i < 半径格; i++) {
    for (let k = -半径格; k < 半径格; k++) {
      if (r() > 0.25) continue;
      const 色 = [粉[0] * 0.5, 粉[1] * 0.5, 粉[2] * 0.5] as const;
      // SpellSquareParticle：super 收到 (0.5 − rand, 绿色参数, 0.5 − rand) 过一遍 Particle 的随机速度，竖直再 × 0.2；绿色参数非 0，水平不缩
      const rr = rng(Math.floor(r() * 1e9));
      const [gx, gy, gz] = 原版粒子初速(rr, 0.5 - rr(), 色[1], 0.5 - rr());
      const 速: [number, number, number] = [gx, -gz, gy * 0.2];
      const 半 = 默认半径(rr);
      const 寿命 = Math.floor(8 / (rr() * 0.8 + 0.2));
      const 位: 点 = [bx + i, by + k, 脚z];
      方块.push({ 刻: 0, 位, 速, 寿命, 半径: 半, 种子: 1, 色 });
    }
  }
  return (
    <>
      <冲击波环 位={[起点[0], 起点[1], 脚z + 0.25]} 刻={秒 * 20} 大小={半径格} 色={粉} 速={1} />
      <贴图粒子 类={方块类} 出生们={方块} 秒={秒} />
    </>
  );
};

export default 定义法术演出(元, 弱化);
