// 震颤猛击。出处 goety 2.5.60.6：TemblorClapSpell、SmashParticle。
// 半径 3 + 0.5（站在地面上）= 3.5（地系法杖才再 +0.5，下界魔杖不算）。放出来当刻：
// 施法者脚底 + 0.5 格一圈砸地墙（Smash，宽 3.5，寿命 10 刻，高 0.21 格），颜色 = 脚下方块的地图色。
// 脚下方块的颜色是自己定的：片里按下界地面（下界岩 MapColor.NETHER 0x700000）画，换了地面要改 地图色。
// 这里把 起点 当成中心（施法者脚底 + 0.5 格）。
// 没做：半径内生物的震飞和方块崩起。
import React from 'react';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps } from '../接口.ts';
import { hexColor } from '../零件/材质.ts';
import { SlamWall } from '../零件/冲击波.tsx';
import meta from './震颤猛击.元.ts';

const groundColor = hexColor(0x700000);

const temblorClap: React.FC<SpellPerformanceProps> = ({ 秒: sec, from }) => <SlamWall 位={from} 刻={sec * 20} 宽={3.5} 色={groundColor} 寿命={10} />;

export default defineSpellPerformance(meta, temblorClap);
