// 雷霆（样板：电弧类）。出处 goety 2.5.60.6：ThunderboltSpell、SThunderBoltPacket、ClientProxy.thunderBolt、LightningParticleOptions、BoltRenderInfo.thunderBolt、ModRenderType.LIGHTNING。
// - 服务端：从施法者眼睛到目标半身高发一个包，颜色 0xB1ABF1，寿命 10 刻；配下界魔杖没有连锁（连锁只在配风暴法杖时有）。
// - 客户端：一条电弧，size 0.25，段数 (int)sqrt(距离 × 100)，fade 0.5（头尾各用一半寿命长出来、缩回去）；只有位置和颜色，加色混合，不写深度。
//   ModRenderType.LIGHTNING 默认剔背面；每段两个面各发了正反两遍顶点，所以每个面两边都看得见、各算一遍亮度。
// - 出手后只有这一道电弧：ThunderboltSpell.SpellResult 里不放粒子（目标身上的 ELECTRIC 火花是 BoltingSpell 的，不是它）。
// 没做：蓄力期间施法者身上每 5 刻一撮 SPELL_ELECTRIC（Spell.useParticle，在出手前，归施法姿势那块）；5% 概率给目标上痉挛效果（没有画面）。
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
