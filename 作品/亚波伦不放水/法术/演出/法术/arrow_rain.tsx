// 箭雨。出处 goety 2.5.60.6：ArrowRainSpell（蓄力类，EverChargeSpell 冷却 0 = 每刻一支）、RainArrow（原版箭的渲染换 rain_arrow 贴图）、FoggyCloudParticle。
// - 目标头顶的云里每刻落一支箭，朝目标带很大的散布；每支生出来时放一片灰雾云（色 0x4B4B4B，尺寸 1.5，速 6）。落地就没。
// 自己定的：游戏里按住多久下多久，片里一次 2 秒 40 支；云的高度取目标上方 15 格（游戏是「最多 15 格，碰到顶就矮」）。
// 没做：25% 的箭不带散布而且着火；落地消失时的 cult_spell 粒子（色 0x16FEFF）；箭在游戏里吃环境光，这里满亮度。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性 } from '../接口.ts';
import { 十六色 } from '../零件/甲/共用.ts';
import { 落雨们 } from '../零件/甲/落雨画.tsx';
import 元, { 箭雨弹 } from './arrow_rain.元.ts';
import 箭图 from 'asset:贴图/法术/goety/entity/projectiles/rain_arrow';

const 箭雨: React.FC<法术演出属性> = ({ 秒, 目标, 种子 }) => <落雨们 弹们={箭雨弹(目标, 种子)} 秒={秒} 图={png(箭图)} 雾色={十六色(0x4b4b4b)} 种子={种子} />;

export default 定义法术演出(元, 箭雨);
