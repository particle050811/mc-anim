// 震颤猛击。出处 goety 2.5.60.6：TemblorClapSpell、SmashParticle。
// 半径 3 + 0.5（站在地面上）= 3.5（地系法杖才再 +0.5，下界魔杖不算）。放出来当刻：
// 施法者脚底 + 0.5 格一圈砸地墙（Smash，宽 3.5，寿命 10 刻，高 0.21 格），颜色 = 脚下方块的地图色。
// 脚下方块的颜色是自己定的：片里按下界地面（下界岩 MapColor.NETHER 0x700000）画，换了地面要改 地图色。
// 这里把 起点 当成中心（施法者脚底 + 0.5 格）。
// 没做：半径内生物的震飞和方块崩起。
import React from 'react';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性 } from '../接口.ts';
import { 十六进制色 } from '../零件/材质.ts';
import { 砸地墙 } from '../零件/冲击波.tsx';
import 元 from './震颤猛击.元.ts';

const 地图色 = 十六进制色(0x700000);

const 震颤猛击: React.FC<法术演出属性> = ({ 秒, 起点 }) => <砸地墙 位={起点} 刻={秒 * 20} 宽={3.5} 色={地图色} 寿命={10} />;

export default 定义法术演出(元, 震颤猛击);
