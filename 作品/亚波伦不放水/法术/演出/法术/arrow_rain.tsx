// 箭雨。出处 goety 2.5.60.6：ArrowRainSpell（蓄力类，EverChargeSpell 冷却 0 = 每刻一支）、RainArrow（原版箭的渲染换 rain_arrow 贴图）、FoggyCloudParticle。
// - 目标头顶的云里每刻落一支箭，朝目标带很大的散布；每支生出来时放一片灰雾云（色 0x4B4B4B，尺寸 1.5，速 6）。落地就没。
// 自己定的：游戏里按住多久下多久，片里一次 2 秒 40 支；云的高度取目标上方 15 格（游戏是「最多 15 格，碰到顶就矮」）。
// 没做：25% 的箭不带散布而且着火；落地消失时的 cult_spell 粒子（色 0x16FEFF）；箭在游戏里吃环境光，这里满亮度。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps } from '../接口.ts';
import { hexColor } from '../零件/甲/共用.ts';
import { ArrowRainGroup } from '../零件/甲/落雨画.tsx';
import meta, { arrowRainShots } from './arrow_rain.元.ts';
import rainArrowPng from 'asset:贴图/法术/goety/entity/projectiles/rain_arrow';

const ArrowRain: React.FC<SpellPerformanceProps> = ({ sec: sec, target: target, seed: seed }) => <ArrowRainGroup projectiles={arrowRainShots(target, seed)} sec={sec} image={png(rainArrowPng)} fogColor={hexColor(0x4b4b4b)} seed={seed} />;

export default defineSpellPerformance(meta, ArrowRain);
