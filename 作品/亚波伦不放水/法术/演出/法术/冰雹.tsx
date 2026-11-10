// 冰雹。出处 goety 2.5.60.6：HailSpell、HailCloud、AbstractSpellCloud、FireParticle（SPELL_CLOUD）、原版 FallingDustParticle。
// 半径 2、持续 100 刻（配下界魔杖没变化）。云放在目标头上 4 格，水平对着目标：
// - 云出来就每刻 ⌈π × 4⌉ = 13 颗 SPELL_CLOUD 撒在云面圆盘上（颜色 = 参数 1 × 速度 0.5 = 灰 0.5，半边长 0.3～0.6、寿命 8 刻、贴图 spell_cloud 按年龄）；
// - 激活（20 刻后）起每刻 13 颗雪块的 FALLING_DUST 从云面圆盘落下（每刻竖直 −0.003，越落越快，落到地面停着，寿命约 25～144 刻）。
// 自己定的：只下 60 刻（游戏里 100 刻）；SPELL_CLOUD 的颜色按「参数 × 0.5」算，FALLING_DUST 的灰白按原版随机范围取，都没在游戏里对过。
// 没做：目标被冻结（FREEZING）、受伤。
import React from 'react';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性 } from '../接口.ts';
import { 云片类, 落尘类 } from '../零件/丁粒子.ts';
import { 云面们, 落尘们 } from '../零件/丁云.ts';
import { 贴图粒子 } from '../零件/粒子.tsx';
import 元, { 冰雹下雪刻, 冰雹激活刻 } from './冰雹.元.ts';

const 半径 = 2;

const 冰雹: React.FC<法术演出属性> = ({ 秒, 目标, 种子 }) => {
  const 云心: [number, number, number] = [目标[0], 目标[1], 目标[2] + 4];
  const 止 = 冰雹激活刻 + 冰雹下雪刻;
  return (
    <>
      <贴图粒子 类={云片类} 出生们={云面们(种子 * 17 + 1, 云心, 半径, 止, [0.5, 0.5, 0.5])} 秒={秒} />
      <贴图粒子 类={落尘类(目标[2])} 出生们={落尘们(种子 * 17 + 2, 云心, 半径, 冰雹激活刻, 止)} 秒={秒} />
    </>
  );
};

export default 定义法术演出(元, 冰雹);
