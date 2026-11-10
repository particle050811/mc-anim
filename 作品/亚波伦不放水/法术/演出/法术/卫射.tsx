// 卫射。出处 goety 2.5.60.6：PrismaBeamSpell、PrismaBeamRenderer（照原版 GuardianRenderer 的激光改的）；原版 1.20.1 BubbleParticle。
// - 激光：蓄力的 80 刻里一直画，贴图是原版 entity/guardian_beam，entityCutoutNoCull、满亮度。
//   两片交叉的面（半宽 0.2），绕轴线慢转：角 = −刻 × 0.075；长 = 距离 + 1（多伸出 1 格）；
//   贴图取左半张（u 0～0.4999），v 从 −1 + frac(刻 × 0.5) 到 长 × 2.5 + 那个数；
//   颜色随进度 f = 刻 ÷ 80 由紫变黄白：R = 64 + f² × 191，G = 32 + f² × 191，B = 128 − f² × 64；
//   末端一个方盖（对角半径 0.282），贴图取右半张的上半或下半（偶数刻取下半）。
// - 气泡：每刻沿线撒原版 BUBBLE，间隔 1.8 − f + 随机 × (1.7 − f)，越到后面越密。原版气泡不在水里的下一刻就消失，所以每颗只闪 1 刻。
// 没做：照满时的伤害没有另外的画面（游戏里也没有）。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { rng } from '@engine/model/parts.tsx';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性, 点 } from '../接口.ts';
import { 加, 减, 乘, 长, 单位 } from '../零件/弹道.ts';
import { 束 } from '../零件/束.tsx';
import { 片, 面片们, type 面片项 } from '../零件/面片.tsx';
import { 四边面们, 轴架 } from '../零件/方管.tsx';
import type { 色 } from '../零件/材质.ts';
import 元, { 卫射蓄刻, 卫射落点 } from './卫射.元.ts';
import 激光图数据 from 'asset:贴图/法术/minecraft/entity/guardian_beam';
import 气泡图数据 from 'asset:贴图/法术/minecraft/particle/bubble';

const 激光图 = png(激光图数据);
const 气泡图 = png(气泡图数据);

const 卫射: React.FC<法术演出属性> = ({ 秒, 起点, 目标, 种子 }) => {
  const 刻 = 秒 * 20;
  if (刻 >= 卫射蓄刻) return null;
  const 落 = 卫射落点(目标);
  const 向 = 单位(减(落, 起点));
  const 距 = 长(减(落, 起点));
  const 束长 = 距 + 1;
  const 终 = 加(起点, 乘(向, 束长));
  const f = 刻 / 卫射蓄刻;
  const 色: 色 = [(64 + Math.floor(f * f * 191)) / 255, (32 + Math.floor(f * f * 191)) / 255, (128 - Math.floor(f * f * 64)) / 255];
  const 转 = -刻 * 0.075;
  const v0 = -1 + ((刻 * 0.5) % 1);
  // 末端方盖：四个角在 转 + 45°、135°、225°、315°，半径 0.282
  const { 右, 上 } = 轴架(向);
  const 角 = (a: number): 点 => 加(终, 加(乘(右, Math.cos(转 + a) * 0.282), 乘(上, Math.sin(转 + a) * 0.282)));
  const 盖v = Math.floor(刻) % 2 === 0 ? 0.5 : 0;
  const q = Math.PI / 4;
  // 气泡：这一刻撒的（只活到下一刻）
  const n = Math.floor(刻);
  const r = rng(种子 * 7919 + n);
  const d5 = n / 卫射蓄刻;
  const 泡: 面片项[] = [];
  for (let d4 = r(); d4 < 距; ) {
    d4 += 1.8 - d5 + r() * (1.7 - d5);
    // quadSize = 0.1 × (随机 × 0.5 + 0.5) × 2，BubbleParticle 再 × (随机 × 0.6 + 0.2)
    泡.push(片(加(起点, 乘(向, d4)), 0.1 * (r() * 0.5 + 0.5) * 2 * (r() * 0.6 + 0.2)));
  }
  return (
    <>
      <束 起={起点} 终={终} 图={激光图} 半宽={0.2} 片数={2} 转角={转} u={[0, 0.4999]} v起={v0} v终={束长 * 2.5 + v0} 混合="镂空" 重复 色={色} />
      <四边面们
        面们={[{ 点: [角(3 * q), 角(q), 角(7 * q), 角(5 * q)], uv: [[0.5, 盖v + 0.5], [1, 盖v + 0.5], [1, 盖v], [0.5, 盖v]] }]}
        图={激光图}
        混合="镂空"
        重复
        色={色}
      />
      <面片们 图={气泡图} 项={泡} 混合="镂空" />
    </>
  );
};

export default 定义法术演出(元, 卫射);
