// 贴地扩散环：Goety 的 CircleExplodeParticle（GroundCircleParticle 的子类，粒子定义 circle_explode.json 用 circle_explode1～8）。乙组砸地、爆炸的法术用。
// 平躺的方片，半边长 = 选项里的 size（格），满亮度，带颜色；寿命 30，每刻 age += speed + 1，贴图按 age 走；不动。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import type { 点 } from '../接口.ts';
import { 地面贴花 } from './地面贴花.tsx';
import type { 色 } from './材质.ts';
import 图1 from 'asset:贴图/法术/goety/particle/circle_explode1';
import 图2 from 'asset:贴图/法术/goety/particle/circle_explode2';
import 图3 from 'asset:贴图/法术/goety/particle/circle_explode3';
import 图4 from 'asset:贴图/法术/goety/particle/circle_explode4';
import 图5 from 'asset:贴图/法术/goety/particle/circle_explode5';
import 图6 from 'asset:贴图/法术/goety/particle/circle_explode6';
import 图7 from 'asset:贴图/法术/goety/particle/circle_explode7';
import 图8 from 'asset:贴图/法术/goety/particle/circle_explode8';

const 帧 = [图1, 图2, 图3, 图4, 图5, 图6, 图7, 图8].map(png);

/** 出生刻 和 秒 × 20 同一个钟；加速 = 选项里的 speed（0 时 30 刻放完，1 时 15 刻） */
export const 圆环爆: React.FC<{ 位: 点; 出生刻: number; 秒: number; 大小: number; 颜色: 色; 加速?: number }> = ({ 位, 出生刻, 秒, 大小, 颜色, 加速 = 0 }) => {
  const 过 = Math.floor(秒 * 20 - 出生刻);
  if (过 < 0) return null;
  const 年龄 = 过 * (加速 + 1);
  if (年龄 >= 30) return null;
  return <地面贴花 位={位} 图={帧[Math.min(7, Math.floor((年龄 * 8) / 30))]!} 半径={大小} 色={颜色} 抬高={0.05} />;
};
