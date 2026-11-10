// 霜冻新星。出处 goety 2.5.60.6：FrostNovaSpell、ServerParticleUtil 同款的 createParticleBall、ShockwaveParticleOption、原版 FlameParticle.Provider（FROST_NOVA 用霜的贴图）。
// 半径 3.5（取整 3），放出来当刻：
// - 施法者脚底 + 0.5 格一圈白色冲击波环：originSize 0、大小 7（半径 × 2）、速度 1（15 刻放完），淡出；
// - 施法者脚底处，7×7×7 立方的外壳（218 个点）每点一颗 FROST_NOVA，初速 = 抖动后的方向 ÷ |方向| × 0.25 格/刻，摩擦 0.96，往四面八方炸开。
// 这里把 起点 当成中心（施法者脚底 + 0.5 格）。
// 没做：半径内生物的冻伤。
import React from 'react';
import { rng } from '@engine/model/parts.tsx';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性, 点 } from '../接口.ts';
import { 冲击波环 } from '../零件/冲击波.tsx';
import { 默认半径, 上升初值, 霜新星类 } from '../零件/丁粒子.ts';
import { 贴图粒子, type 粒子出生 } from '../零件/粒子.tsx';
import 元 from './霜冻新星.元.ts';

const 半径格 = 3;

const 霜冻新星: React.FC<法术演出属性> = ({ 秒, 起点, 种子 }) => {
  const 脚: 点 = [起点[0], 起点[1], 起点[2] - 0.5];
  const r = rng(种子 * 7919 + 11);
  const 高斯 = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const 霜们: 粒子出生[] = [];
  for (let i = -半径格; i <= 半径格; i++) {
    for (let j = -半径格; j <= 半径格; j++) {
      // 内部的点只留 k = ±半径（游戏里 k += 2 × 半径 − 1 跳过中间）
      const 外壳 = i === -半径格 || i === 半径格 || j === -半径格 || j === 半径格;
      const ks: number[] = 外壳 ? Array.from({ length: 2 * 半径格 + 1 }, (_, n) => n - 半径格) : [-半径格, 半径格];
      for (const k of ks) {
        const d3 = j + (r() - r()) * 0.5;
        const d4 = i + (r() - r()) * 0.5;
        const d5 = k + (r() - r()) * 0.5;
        const d6 = Math.hypot(d3, d4, d5) / 0.5 + 高斯() * 0.05;
        // 游戏 (d3, d4 竖直, d5 南) → 场景 (x, −z, y)；速度参数 × 0.5
        const 给定: 点 = [(d3 / d6) * 0.5, (-d5 / d6) * 0.5, (d4 / d6) * 0.5];
        const rr = rng(Math.floor(r() * 1e9));
        const 初 = 上升初值(Math.floor(r() * 1e9), 脚, 给定);
        霜们.push({ 刻: 0, 位: 初.位, 速: 初.速, 寿命: Math.floor(8 / (rr() * 0.8 + 0.2)) + 4, 半径: 默认半径(rr), 种子: 初.种子 });
      }
    }
  }
  return (
    <>
      <冲击波环 位={起点} 刻={秒 * 20} 大小={半径格 * 2 + 1} 色={[1, 1, 1]} 速={1} />
      <贴图粒子 类={霜新星类} 出生们={霜们} 秒={秒} />
    </>
  );
};

export default 定义法术演出(元, 霜冻新星);
