// 炎爆（配下界魔杖：半径 +0.5，大火 4～16 颗）。出处 goety 2.5.60.6：FireBlastSpell、ShockwaveParticleOption、SphereExplodeParticleOption、FireParticle（BIG_FIRE）。
// 半径 3 + 0.5 = 3.5，颜色 14523414 = 0xDD9C16（橙金），放出来当刻，施法者脚底 + 0.5 格：
// - 冲击波环（大小 3.5、速度 1、淡出）和加色球（大小 3.5、速度 1）；
// - BIG_FIRE 4～16 颗，位置 = 中心 + 每个分量 (rand − 0.5) × 3.5，不动（速度 0，只有构造里 ×0.01 的随机），寿命 8 刻，半边长 0.3～0.6，贴图按年龄。
// 这里把 起点 当成中心（施法者脚底 + 0.5 格）。
// 没做：半径内生物受击着火；BIG_FIRE 随机左右翻转。
import React from 'react';
import { rng } from '@engine/model/parts.tsx';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性 } from '../接口.ts';
import { 十六进制色 } from '../零件/材质.ts';
import { 冲击波环 } from '../零件/冲击波.tsx';
import { 默认半径, 上升初值, 大火类, 大火寿命 } from '../零件/丁粒子.ts';
import { 球爆 } from '../零件/甲/爆.tsx';
import { 贴图粒子, type 粒子出生 } from '../零件/粒子.tsx';
import 元 from './炎爆.元.ts';

const 橙金 = 十六进制色(0xdd9c16);
const 半径 = 3.5;

const 炎爆: React.FC<法术演出属性> = ({ 秒, 起点, 种子 }) => {
  const 刻 = 秒 * 20;
  const r = rng(种子 * 7919 + 17);
  const 颗数 = 4 + Math.floor(r() * 13);
  const 火们: 粒子出生[] = Array.from({ length: 颗数 }, (_, i) => {
    const 位: [number, number, number] = [起点[0] + (r() - 0.5) * 半径, 起点[1] + (r() - 0.5) * 半径, 起点[2] + (r() - 0.5) * 半径];
    const 初 = 上升初值(种子 * 101 + i, 位, [0, 0, 0], false);
    return { 刻: 0, 位: 初.位, 速: 初.速, 寿命: 大火寿命, 半径: 默认半径(r) * 3, 种子: 初.种子 };
  });
  return (
    <>
      <冲击波环 位={起点} 刻={刻} 大小={半径} 色={橙金} 速={1} />
      <球爆 位={起点} 刻={刻} 色={橙金} 尺寸={半径} 速={1} />
      <贴图粒子 类={大火类} 出生们={火们} 秒={秒} />
    </>
  );
};

export default 定义法术演出(元, 炎爆);
