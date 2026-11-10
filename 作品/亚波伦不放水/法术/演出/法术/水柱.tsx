// 水柱。出处 goety 2.5.60.6：WaterJetSpell、WaterJetRenderer、WaterTrailParticle、TrailEffect、TrailRenderer。
// 持续施法：
// - 水柱（WaterJetRenderer）：从杖尖到目标半身高，两层方管，都是 magicBeam（半透明、不做深度测试、满亮度）：
//   里层 jet_inner 半边 0.04，贴图沿长度每 0.04 × 16 × 2 = 1.28 格铺一遍；外层 jet_outer 半边 0.05，每 12.8 格铺一遍；
//   贴图沿长度往前流：偏移 = −(刻) × 0.4（里层）、× 0.08（外层），连续的。
// - 水拖（WATER_TRAIL）：每刻在打中的点出 1 颗，速度每个分量 高斯 × 0.15 格/刻；重力 0.5（每刻 −0.02）、摩擦 0.99，落地就没；
//   画成一条沿走过的路往回拖的带子，总宽 0.06、最长 0.6 格，贴图 water_trail 头是 u1、尾是 u0，不透明粒子表。
// 和游戏的差别：水拖在游戏里侧对镜头，这里摆成十字两片；落地后带子在 1 刻内收掉，这里落地当刻就不画。
// 没做：目标被水柱往后推、灭火；循环声只登记了一次。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { rng } from '@engine/model/parts.tsx';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性, 点 } from '../接口.ts';
import { 减, 乘, 长, 混 } from '../零件/弹道.ts';
import { 带 } from '../零件/束.tsx';
import { 四边面们, 方管面 } from '../零件/方管.tsx';
import { 垂向 } from '../零件/游带.tsx';
import 元, { 水柱持续刻, 水柱落点 } from './水柱.元.ts';
import 里图数据 from 'asset:贴图/法术/goety/entity/water_jet/jet_inner';
import 外图数据 from 'asset:贴图/法术/goety/entity/water_jet/jet_outer';
import 水拖图数据 from 'asset:贴图/法术/goety/particle/water_trail';

const 里图 = png(里图数据);
const 外图 = png(外图数据);
const 水拖图 = png(水拖图数据);

/** 一颗水拖各刻末的位置（第 0 项 = 出生处），到落地为止 */
const 水拖路 = (生: 点, 种子: number, 地面: number): 点[] => {
  const r = rng(种子);
  const 高斯 = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  let v: 点 = [高斯() * 0.15, 高斯() * 0.15, 高斯() * 0.15];
  let p = 生;
  const 路 = [p];
  for (let k = 0; k < 200 && p[2] > 地面; k++) {
    v = [v[0], v[1], v[2] - 0.04 * 0.5];
    p = [p[0] + v[0], p[1] + v[1], Math.max(地面, p[2] + v[2])];
    v = 乘(v, 0.99);
    路.push(p);
  }
  return 路;
};

const 水拖: React.FC<{ 路: 点[]; 年龄: number }> = ({ 路, 年龄 }) => {
  // 游戏画上一刻到这一刻之间：年龄 a 时头在 路(a − 1)
  const a = 年龄 - 1;
  if (a <= 0 || a >= 路.length - 1) return null;
  const k = Math.floor(a);
  const 点们: 点[] = [混(路[k]!, 路[k + 1]!, a - k)];
  const 进度 = [1];
  let 剩 = 0.6;
  for (let i = k; i >= 0 && 剩 > 0; i--) {
    const 上 = 点们[点们.length - 1]!;
    const d = 长(减(路[i]!, 上));
    if (d < 1e-6) continue;
    if (d >= 剩) {
      点们.push(混(上, 路[i]!, 剩 / d));
      剩 = 0;
    } else {
      点们.push(路[i]!);
      剩 -= d;
    }
    进度.push(剩 / 0.6);
  }
  if (点们.length < 2) return null;
  return (
    <>
      {垂向(减(点们[0]!, 点们[点们.length - 1]!)).map((侧, i) => (
        <带 key={i} 点们={点们} 半宽向={乘(侧, 0.03)} 图={水拖图} u们={进度} 混合="镂空" />
      ))}
    </>
  );
};

const 水柱: React.FC<法术演出属性> = ({ 秒, 起点, 目标, 种子 }) => {
  const 刻 = 秒 * 20;
  const 落 = 水柱落点(目标);
  const 全长 = 长(减(落, 起点));
  const 滴们: number[] = [];
  for (let n = Math.max(0, Math.floor(刻) - 60); n <= Math.min(Math.floor(刻), 水柱持续刻 - 1); n++) 滴们.push(n);
  return (
    <>
      {刻 < 水柱持续刻 && (
        <>
          <四边面们 面们={方管面(起点, 落, 0.04, { 沿: 'u', 长起: -刻 * 0.4, 长终: 全长 / 1.28 - 刻 * 0.4 })} 图={里图} 混合="半透明" 重复 无深度测试 序={1} />
          <四边面们 面们={方管面(起点, 落, 0.05, { 沿: 'u', 长起: -刻 * 0.08, 长终: 全长 / 12.8 - 刻 * 0.08 })} 图={外图} 混合="半透明" 重复 无深度测试 序={2} />
        </>
      )}
      {滴们.map((n) => (
        <水拖 key={n} 路={水拖路(落, 种子 * 7919 + n, 目标[2])} 年龄={刻 - n} />
      ))}
    </>
  );
};

export default 定义法术演出(元, 水柱);
