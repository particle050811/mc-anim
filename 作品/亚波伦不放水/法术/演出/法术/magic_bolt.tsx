// 魔弹。出处 goety 2.5.60.6：MagicBoltSpell、MagicBolt（SpellHurtingProjectile）、SoulBulletRenderer（什么都不画）、RollingParticle、MagicGround、ServerParticleUtil.circularParticles。
// - 弹没有模型，只有粒子：每刻在 位置 + 速度（竖直再 + 0.5）放一颗 magic_bolt 粒子（RollingParticle：不动，半边长 0.5 格在 20 刻里缩到 0，满亮度、半透明，带一个随机的自转），
//   再在 位置 + (随机 ÷ 2, 0.5, 随机 ÷ 2) 放一颗 witch。
// - 命中：原地留一个 MagicGround（半径 1，100 刻），每刻在半径 0.5 的圆里撒 witch（π × 0.5² < 1，一刻一颗）。
// 没做：MagicGround 有 5% 的刻会多撒一片 witch；MagicGround 自己不画东西。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { rng } from '@engine/model/parts.tsx';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性 } from '../接口.ts';
import { 减 } from '../零件/弹道.ts';
import { VanillaParticles, 贴图粒子, type ParticleSpawn, type 粒子出生, type 粒子类 } from '../零件/粒子.tsx';
import { 各刻, 道上 } from '../零件/甲/共用.ts';
import 元, { 魔弹命中刻, 魔弹地面刻, 魔弹道 } from './magic_bolt.元.ts';
import 弹粒图 from 'asset:贴图/法术/goety/particle/magic_bolt';

const 弹粒类: 粒子类 = { 帧: [png(弹粒图)], 选帧: '按年龄', 摩擦: 1, 混合: '半透明', 大小: (年龄, 寿命) => Math.max(0, 1 - 年龄 / 寿命) };

const 魔弹: React.FC<法术演出属性> = ({ 秒, 起点, 目标, 种子 }) => {
  const 刻 = 秒 * 20;
  const 道 = 魔弹道(起点, 目标);
  const 命中 = 魔弹命中刻(起点, 目标);
  const 命中位 = 道上(道, 命中);
  const r = rng(种子 * 7 + 5);
  const 弹粒: 粒子出生[] = [];
  const 巫粒: ParticleSpawn[] = [];
  for (const n of 各刻(1, Math.min(刻, 命中))) {
    const [位, 速] = [道(n), 减(道(n + 1), 道(n))];
    // roll 每刻 += 2π × rotSpeed（±0.05），这里只给出生时的随机角，不转
    弹粒.push({ 刻: n, 位: [位[0] + 速[0], 位[1] + 速[1], 位[2] + 速[2] + 0.5], 寿命: 20, 半径: 0.5, 转角: r() * Math.PI * 2 });
    巫粒.push({ 种: 'witch', 刻: n, p: [位[0] + r() / 2, 位[1] - r() / 2, 位[2] + 0.5], 种子: 种子 * 61 + n });
  }
  for (const n of 各刻(命中, Math.min(刻, 命中 + 魔弹地面刻))) {
    const [角, 距] = [r() * Math.PI * 2, Math.sqrt(r()) * 0.5];
    巫粒.push({ 种: 'witch', 刻: n, p: [命中位[0] + Math.cos(角) * 距, 命中位[1] + Math.sin(角) * 距, 目标[2]], 种子: 种子 * 67 + n });
  }
  return (
    <>
      <贴图粒子 类={弹粒类} 出生们={弹粒} 秒={秒} />
      <VanillaParticles spawns={巫粒} 秒={秒} />
    </>
  );
};

export default 定义法术演出(元, 魔弹);
