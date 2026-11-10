// 雷霆（样板：电弧类）。出处 goety 2.5.60.6：ThunderboltSpell、SThunderBoltPacket、ClientProxy.thunderBolt、LightningParticleOptions、BoltRenderInfo.thunderBolt、ModRenderType.LIGHTNING。
// - 服务端：从施法者眼睛到目标半身高发一个包，颜色 0xB1ABF1，寿命 10 刻；配下界魔杖没有连锁（连锁只在配风暴法杖时有）。
// - 客户端：一条电弧，size 0.25，段数 (int)sqrt(距离 × 100)，fade 0.5（头尾各用一半寿命长出来、缩回去）；只有位置和颜色，加色混合，不写深度。
// 没做：目标身上 ModParticleTypes.ELECTRIC 的火花、蓄力 40 刻期间的法杖粒子（这两样不在「出手后」的电弧上；火花留给以后）。
import React from 'react';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性 } from '../接口.ts';
import { 电弧 } from '../零件/电弧.tsx';
import { 电弧预设 } from '../零件/电弧形.ts';
import { 十六进制色 } from '../零件/材质.ts';
import 元, { 雷霆寿命刻, 雷霆落点 } from './雷霆.元.ts';

const 雷色 = 十六进制色(0xb1abf1);

const 雷霆: React.FC<法术演出属性> = ({ 秒, 起点, 目标, 种子 }) => (
  <电弧 起={起点} 终={雷霆落点(目标)} 设定={电弧预设.thunderBolt} 刻={秒 * 20} 寿命刻={雷霆寿命刻} 色={雷色} 种子={种子} />
);

export default 定义法术演出(元, 雷霆);
