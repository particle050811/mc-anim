// 索命。出处 goety 2.5.60.6：KillingSpell、SThunderBoltPacket、GatherTrailParticle、WindParticle、ServerParticleUtil.windParticle。
// 放出来的那一刻（蓄力 60 刻之后），颜色都是 14226710 = 0xD91516：
// - 一道雷霆电弧（thunderBolt 预设）从施法者眼睛到目标半身高，寿命 10 刻；
// - 8 条聚流从目标眼睛窜向 8 格内的随机点（Vec3.offsetRandom(8)：每个分量 ±4 格）；
// - 8 条风带绕着目标脚底转：半径 1 格、带高 0.5 格（中线在脚底高度，下半截埋在地里，游戏里也是）、4 段，
//   起始角随机，每刻转 (10～20)° × {−1, 0, 1}（抽到 0 的不转，带子零长看不见），寿命 20～39 刻，透明度 1 − 年龄 ÷ 寿命。
// 没做：蓄力 60 刻期间每刻一条的风带（出手前的事）；施法者自己吃的反噬没有画面。
import React from 'react';
import { rng } from '@engine/model/parts.tsx';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性, 点 } from '../接口.ts';
import { 电弧 } from '../零件/电弧.tsx';
import { 电弧预设 } from '../零件/电弧形.ts';
import { 十六进制色 } from '../零件/材质.ts';
import { 聚流, 聚流寿命, 风带 } from '../零件/游带.tsx';
import 元, { 索命电弧刻 } from './索命.元.ts';

const 血色 = 十六进制色(0xd91516);

const 索命: React.FC<法术演出属性> = ({ 秒, 起点, 目标, 种子 }) => {
  const 刻 = 秒 * 20;
  const 眼: 点 = [目标[0], 目标[1], 目标[2] + 1.62];
  const r = rng(种子 * 7919 + 3);
  const 八 = Array.from({ length: 8 }, () => {
    const 到: 点 = [眼[0] + (r() - 0.5) * 8, 眼[1] + (r() - 0.5) * 8, 眼[2] + (r() - 0.5) * 8];
    const 聚寿 = 聚流寿命(r());
    const 风寿 = 20 + Math.floor(r() * 20);
    const 起角 = r() * 360;
    const 每刻角 = (10 + r() * 10) * (Math.floor(r() * 3) - 1);
    return { 到, 聚寿, 风寿, 起角, 每刻角 };
  });
  return (
    <>
      <电弧 起={起点} 终={[目标[0], 目标[1], 目标[2] + 0.9]} 设定={电弧预设.thunderBolt} 刻={刻} 寿命刻={索命电弧刻} 色={血色} 种子={种子} />
      {八.map((项, i) => (
        <React.Fragment key={i}>
          <聚流 从={眼} 到={项.到} 年龄={刻} 寿命={项.聚寿} 色={血色} />
          {刻 < 项.风寿 && (
            <风带
              // (0, 0, 1) 绕游戏的 Y 轴转 角：游戏 (sin, 0, cos) → 场景 (sin, −cos, 0)
              位置={(k) => {
                const a = ((项.起角 + 项.每刻角 * k) * Math.PI) / 180;
                return [目标[0] + Math.sin(a), 目标[1] - Math.cos(a), 目标[2]];
              }}
              年龄={刻}
              段数={4}
              高={0.5}
              色={血色}
              透明度={1 - Math.floor(刻) / 项.风寿}
            />
          )}
        </React.Fragment>
      ))}
    </>
  );
};

export default 定义法术演出(元, 索命);
