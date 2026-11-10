// 尘云：Goety 的 DustCloudParticle（粒子定义 dust_cloud.json 用 cult_spell_0～7）。乙组几个破土的法术用。
// 半边长 = 选项里的 scale（格），半透明，出生 alpha 0.9、每刻 −0.015；寿命 8 ÷ (随机 × 0.8 + 0.2) 刻；贴图按年龄走；
// 速度就是给的（服务端 count 0、speed 0 时是 0），每刻只有 ±1/5000 的水平抖动和 3e-6 的下沉，这里当不动。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { rng } from '@engine/model/parts.tsx';
import type { 点 } from '../接口.ts';
import type { 色 } from './材质.ts';
import { 贴图粒子, type 粒子出生, type 粒子类 } from './粒子.tsx';
import 图0 from 'asset:贴图/法术/goety/particle/cult_spell_0';
import 图1 from 'asset:贴图/法术/goety/particle/cult_spell_1';
import 图2 from 'asset:贴图/法术/goety/particle/cult_spell_2';
import 图3 from 'asset:贴图/法术/goety/particle/cult_spell_3';
import 图4 from 'asset:贴图/法术/goety/particle/cult_spell_4';
import 图5 from 'asset:贴图/法术/goety/particle/cult_spell_5';
import 图6 from 'asset:贴图/法术/goety/particle/cult_spell_6';
import 图7 from 'asset:贴图/法术/goety/particle/cult_spell_7';

const 类: 粒子类 = { 帧: [图0, 图1, 图2, 图3, 图4, 图5, 图6, 图7].map(png), 选帧: '按年龄', 混合: '半透明', 透明度: (年龄) => Math.max(0, 0.9 - 0.015 * 年龄) };

/** 一批尘云的出生表：位们 每处一颗 */
export const 尘云出生 = (位们: readonly 点[], 刻: number, 大小: number, 颜色: 色, 种子: number): 粒子出生[] =>
  位们.map((位, i) => ({ 刻, 位, 寿命: Math.floor(8 / (rng(种子 * 71 + i)() * 0.8 + 0.2)), 半径: 大小, 色: 颜色, 种子: i }));

export const 尘云: React.FC<{ 出生们: readonly 粒子出生[]; 秒: number }> = ({ 出生们, 秒 }) => <贴图粒子 类={类} 出生们={出生们} 秒={秒} />;
