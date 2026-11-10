// 水蛭。出处 goety 2.5.60.6：LeechingSpell、GatherTrailParticle、AbsorbTrailParticle。
// 持续施法，每刻（都是从目标吸向施法者）：
// - 1 条聚流（暗红 0xAA0000 = ChatFormatting.DARK_RED）：从目标半身高窜到施法者眼睛高度、水平随机偏 ±0.6 格的一点；
// - 8 颗吸收粒子（AbsorbTrailParticle）：出生在目标碰撞箱附近随机处（水平 ±0.6 格、高度 0～1.8），10 刻里匀速飞到同一个施法者点；
//   半边长 0.26 格的不透明方片（贴图原版 generic_0），颜色从 0xAA0000（每个分量 × 0.875～1.125）渐变到 0x00000A，满亮度。
// 这里施法者那头用起点。没做：施法者回血没有画面；配对的吸血声只按无敌帧估了时刻。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { rng } from '@engine/model/parts.tsx';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性, 点 } from '../接口.ts';
import { 混 } from '../零件/弹道.ts';
import { 片, 面片们, type 面片项 } from '../零件/面片.tsx';
import { 十六进制色, type 色 } from '../零件/材质.ts';
import { 聚流, 聚流寿命 } from '../零件/游带.tsx';
import 元, { 水蛭持续刻 } from './水蛭.元.ts';
import 方片图数据 from 'asset:贴图/特效/粒子/generic_0';

const 方片图 = png(方片图数据);
const 暗红 = 十六进制色(0xaa0000);
const 终色 = 十六进制色(0x00000a);
const 吸收寿命 = 10;

const 水蛭: React.FC<法术演出属性> = ({ 秒, 起点, 目标, 种子 }) => {
  const 刻 = 秒 * 20;
  const 流们: React.ReactNode[] = [];
  const 片们: 面片项[] = [];
  for (let n = Math.max(0, Math.floor(刻) - 吸收寿命); n <= Math.min(Math.floor(刻), 水蛭持续刻 - 1); n++) {
    const r = rng(种子 * 7919 + n);
    const 年龄 = 刻 - n;
    const 到: 点 = [起点[0] + (r() * 2 - 1) * 0.6, 起点[1] + (r() * 2 - 1) * 0.6, 起点[2]];
    流们.push(<聚流 key={n} 从={[目标[0], 目标[1], 目标[2] + 0.9]} 到={到} 年龄={年龄} 寿命={聚流寿命(r())} 色={暗红} />);
    for (let i = 0; i < 8; i++) {
      const 生: 点 = [目标[0] + (r() * 2 - 1) * 0.6, 目标[1] + (r() * 2 - 1) * 0.6, 目标[2] + r() * 1.8];
      const 偏 = [0.875 + r() * 0.25, 0.875 + r() * 0.25, 0.875 + r() * 0.25];
      if (年龄 >= 吸收寿命) continue;
      // 第 k 刻末走完全程的 k ÷ 寿命；画的是上一刻到这一刻之间
      const 比 = Math.max(0, 年龄 - 1) / 吸收寿命;
      const 色比 = Math.min(1, 年龄 / 吸收寿命);
      const 色: 色 = [0, 1, 2].map((c) => Math.min(1, 暗红[c]! * 偏[c]!) * (1 - 色比) + 终色[c]! * 色比) as unknown as 色;
      片们.push(片(混(生, 到, 比), 0.26, 色));
    }
  }
  return (
    <>
      {流们}
      <面片们 图={方片图} 项={片们} 混合="镂空" />
    </>
  );
};

export default 定义法术演出(元, 水蛭);
