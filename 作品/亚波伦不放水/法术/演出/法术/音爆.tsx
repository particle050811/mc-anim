// 音爆。出处 goety 2.5.60.6：SonicBoomSpell；粒子是原版 SONIC_BOOM（库里照 SonicBoomParticle 抄过）。
// - 放出来的那一刻：从施法者（脚底 + 1.6 格）朝目标眼睛，每隔 1 格放一个音爆粒子，一共 floor(距离) + 7 − 1 个（i 从 1 到 floor(距离) + 6），同一刻全出来，所以会穿过目标再往后 6 格左右。
// 没做：蓄力 60 刻（出手前的事）、目标被击退。
import React from 'react';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性, 点 } from '../接口.ts';
import { 加, 减, 乘, 长, 单位 } from '../零件/弹道.ts';
import { VanillaParticles, type ParticleSpawn } from '../零件/粒子.tsx';
import 元 from './音爆.元.ts';

const 音爆: React.FC<法术演出属性> = ({ 秒, 起点, 目标, 种子 }) => {
  const 眼: 点 = [目标[0], 目标[1], 目标[2] + 1.62];
  const 差 = 减(眼, 起点);
  const 向 = 单位(差);
  const 个数 = Math.floor(长(差)) + 6;
  const spawns: ParticleSpawn[] = Array.from({ length: 个数 }, (_, k) => {
    const p = 加(起点, 乘(向, k + 1));
    return { 种: 'sonic_boom', 刻: 0, p: [p[0], p[1], p[2]], 种子: 种子 * 101 + k };
  });
  return <VanillaParticles spawns={spawns} 秒={秒} />;
};

export default 定义法术演出(元, 音爆);
