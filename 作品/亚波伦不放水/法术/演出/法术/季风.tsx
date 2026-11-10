// 季风。出处 goety 2.5.60.6：MonsoonSpell、MonsoonCloud、AbstractSpellCloud、SThunderBoltPacket、BoltRenderInfo.thunderBolt、原版 RAIN。
// 半径 2、持续 100 刻（风暴系法术，下界魔杖没变化）。云在目标头上 4 格：
// - 每刻 13 颗 SPELL_CLOUD 撒在云面圆盘上，颜色 0x434343（深灰）；
// - 激活（20 刻后）起每刻 13 颗 RAIN 从云面落下；
// - 云下有目标时每刻 5% 概率落一道雷：SThunderBoltPacket 从云心到目标半身高，颜色 11660252 = 0xB1EBDC，寿命 10 刻，thunderBolt 预设。
// 自己定的：只下 60 刻；落雷按种子抽签（一刻一次 5%），一道都没抽中就在激活后 20 刻补一道；SPELL_CLOUD 颜色直接取 0x434343 乘贴图（按 ×0.5 算会黑成一团）。
// 没做：目标受伤、痉挛效果。落雷的声音按 种子 1 排在元数据里，别的种子画面里的落雷刻不同。
import React from 'react';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性 } from '../接口.ts';
import { 电弧 } from '../零件/电弧.tsx';
import { 电弧预设 } from '../零件/电弧形.ts';
import { 十六进制色 } from '../零件/材质.ts';
import { 云片类, 雨滴类 } from '../零件/丁粒子.ts';
import { 云面们, 雨滴们 } from '../零件/丁云.ts';
import { 贴图粒子 } from '../零件/粒子.tsx';
import 元, { 季风下雨刻, 季风激活刻, 季风落雷刻 } from './季风.元.ts';

const 半径 = 2;
const 雷色 = 十六进制色(11660252);
const 云灰 = 0x43 / 255;

const 季风: React.FC<法术演出属性> = ({ 秒, 目标, 种子 }) => {
  const 刻 = 秒 * 20;
  const 云心: [number, number, number] = [目标[0], 目标[1], 目标[2] + 4];
  const 止 = 季风激活刻 + 季风下雨刻;
  return (
    <>
      <贴图粒子 类={云片类} 出生们={云面们(种子 * 17 + 1, 云心, 半径, 止, [云灰, 云灰, 云灰])} 秒={秒} />
      <贴图粒子 类={雨滴类} 出生们={雨滴们(种子 * 17 + 2, 云心, 半径, 季风激活刻, 止)} 秒={秒} />
      {季风落雷刻(种子).map((t) => (
        <电弧 key={t} 起={云心} 终={[目标[0], 目标[1], 目标[2] + 0.9]} 设定={电弧预设.thunderBolt} 刻={刻 - t} 寿命刻={10} 色={雷色} 种子={种子 * 131 + t} />
      ))}
    </>
  );
};

export default 定义法术演出(元, 季风);
