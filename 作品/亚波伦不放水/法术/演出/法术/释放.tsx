// 释放。出处 goety 2.5.60.6：DischargeSpell、ShockwaveParticle、GroundCircleParticle、SphereExplodeParticle、SLightningPacket、ModRenderType.DRAGON_RAYS_QUADS。
// 以施法者为中心的一圈放电（不朝目标去），放出来的那一刻三样东西，颜色 16709015 = 0xFEF597：
// - 冲击波环（ShockwaveParticle）：施法者脚底 + 0.5 格处一张水平的方片（贴图 particle/shockwave，正反两面都画），
//   半边长 = 10 × clamp(年龄 ÷ 30 × 0.75, 0, 2)，30 刻里从 0 长到 7.5 格；透明度 1 − 年龄 ÷ 30；半透明粒子表、满亮度；
// - 球（SphereExplodeParticle，大小 = 法术半径 4，速度 1）：同一处一个纯色球，没有贴图，加色混合（lightning 着色器）、两面都画；
//   这个粒子每刻年龄 +2（自己加 1、父类再加 1），所以 30 的寿命 15 刻就走完，而且两刻之间不连续（一刻一跳）；
//   半径 = 4 × (0.5 + 0.5 × sin(年龄比 × π/2))，从 2 格到 4 格；透明度头 6 个年龄从 0 升到 1（1 − (1 − x)⁴），再 6 个年龄降回 0（(1 − x)³），之后看不见；
// - 16 道细电弧（shock 预设）：从施法者脚底到 脚底 + (随机 × [−4, 4] 的整数)（三个分量各抽），寿命 12 刻。
// 这里把 起点 当成球心（施法者脚底 + 0.5 格）。
// 没做：半径内的生物受击、雷雨天引下来的闪电、连锁电弧。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { rng } from '@engine/model/parts.tsx';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性, 点 } from '../接口.ts';
import { 电弧 } from '../零件/电弧.tsx';
import { 电弧预设 } from '../零件/电弧形.ts';
import { 地面贴花 } from '../零件/地面贴花.tsx';
import { 十六进制色, 面材质 } from '../零件/材质.ts';
import 元, { 释放环寿命 } from './释放.元.ts';
import 环图数据 from 'asset:贴图/法术/goety/particle/shockwave';

const 环图 = png(环图数据);
const 电黄 = 十六进制色(0xfef597);
const 球大小 = 4;
const 球寿命 = 30;

const 释放: React.FC<法术演出属性> = ({ 秒, 起点, 种子 }) => {
  const 刻 = 秒 * 20;
  const 脚: 点 = [起点[0], 起点[1], 起点[2] - 0.5];
  // 球：年龄一刻跳 2
  const 球龄 = Math.floor(刻) * 2 + (刻 - Math.floor(刻));
  const 段 = 球寿命 / 5;
  const 球透 = 球龄 >= 球寿命 ? 0 : 球龄 < 段 ? 1 - (1 - 球龄 / 段) ** 4 : (1 - Math.min(1, (球龄 - 段) / 段)) ** 3;
  const 球径 = 球大小 * (0.5 + 0.5 * Math.sin(((球龄 / 球寿命) * Math.PI) / 2));
  const r = rng(种子 * 7919 + 13);
  const 整 = () => Math.floor(r() * 9) - 4;
  const 弧们 = Array.from({ length: 16 }, (): 点 => {
    // 游戏坐标的 (x, y, z) 偏移 → 场景 (x, −z, y)
    const [a, b, c] = [整(), 整(), 整()];
    const [dx, dy, dz] = [r() * a, r() * b, r() * c];
    return [脚[0] + dx, 脚[1] - dz, 脚[2] + dy];
  });
  return (
    <>
      {刻 < 释放环寿命 && <地面贴花 位={起点} 图={环图} 半径={10 * Math.min(2, Math.max(0, (刻 / 释放环寿命) * 0.75))} 抬高={0} 混合="半透明" 色={电黄} 透明度={1 - 刻 / 释放环寿命} />}
      {球透 > 0 && (
        <mesh position={[起点[0], 起点[1], 起点[2]]} scale={球径} material={面材质(null, { 混合: '加色', 色: 电黄, 透明度: 球透 })}>
          <sphereGeometry args={[1, 32, 24]} />
        </mesh>
      )}
      {弧们.map((终, i) => (
        <电弧 key={i} 起={脚} 终={终} 设定={电弧预设.shock} 刻={刻} 寿命刻={12} 色={电黄} 种子={种子 * 131 + i} />
      ))}
    </>
  );
};

export default 定义法术演出(元, 释放);
