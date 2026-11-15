// 生物地雷。出处 goety 2.5.60.6：BioMineSpell、BlockFinder.SummonWaterAwayRadius、BioMine、BioMineRenderer、BioMineModel、AcidPool、CircleExplodeParticle。
// - 4 颗，各自落在目标周围：x、z 各偏 −8～8 格的整数，要离目标至少 4 格；格子正中，贴地。
// - 渲染器：scale(−1, −1, 1)，translate(0, −1.5, 0)；贴图 biomine/<游戏时间 % 19>.png 每刻换一张；再画一层 RenderType.eyes 的 glow（发光层）。
// - 炸（trigger）：贴地扩散环 CircleExplode（白，大小 3，speed 1），原地留一个酸池（半径 2，颜色 0x20B33E，3 秒）。
// 粗做：酸池游戏里是 AcidPool 实体每刻在圈里放 BIG_CULT_SPELL 粒子（poolTick 没细读），这里每刻在半径 2 的圈里撒 2 颗绿色的 cult_spell 粒子（半边长 0.3）代替。
// 没做：放下时的 summonedParticles、炸开的 SphereExplode 球壳、酸池出现时的 ROLLING_SPIRAL；被打也会炸。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { rng } from '@engine/model/parts.tsx';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps, Vec3 } from '../接口.ts';
import { MinecraftSpace, getModel, ModelPart } from '../零件/实体.tsx';
import { hexColor } from '../零件/材质.ts';
import type { ParticleBirth } from '../零件/粒子.tsx';
import { DustCloud } from '../零件/乙尘云.tsx';
import { RingBurst } from '../零件/乙圆环.tsx';
import meta, { bioMineLifeTicks, bioMineLatestTick, bioMineCount, acidPoolTicks } from './生物地雷.元.ts';
import bioMineModelData from 'asset:模型/法术/goety/BioMineModel';
import glowPng from 'asset:贴图/法术/goety/entity/projectiles/biomine/glow';
import biomine0Png from 'asset:贴图/法术/goety/entity/projectiles/biomine/0';
import biomine1Png from 'asset:贴图/法术/goety/entity/projectiles/biomine/1';
import biomine2Png from 'asset:贴图/法术/goety/entity/projectiles/biomine/2';
import biomine3Png from 'asset:贴图/法术/goety/entity/projectiles/biomine/3';
import biomine4Png from 'asset:贴图/法术/goety/entity/projectiles/biomine/4';
import biomine5Png from 'asset:贴图/法术/goety/entity/projectiles/biomine/5';
import biomine6Png from 'asset:贴图/法术/goety/entity/projectiles/biomine/6';
import biomine7Png from 'asset:贴图/法术/goety/entity/projectiles/biomine/7';
import biomine8Png from 'asset:贴图/法术/goety/entity/projectiles/biomine/8';
import biomine9Png from 'asset:贴图/法术/goety/entity/projectiles/biomine/9';
import biomine10Png from 'asset:贴图/法术/goety/entity/projectiles/biomine/10';
import biomine11Png from 'asset:贴图/法术/goety/entity/projectiles/biomine/11';
import biomine12Png from 'asset:贴图/法术/goety/entity/projectiles/biomine/12';
import biomine13Png from 'asset:贴图/法术/goety/entity/projectiles/biomine/13';
import biomine14Png from 'asset:贴图/法术/goety/entity/projectiles/biomine/14';
import biomine15Png from 'asset:贴图/法术/goety/entity/projectiles/biomine/15';
import biomine16Png from 'asset:贴图/法术/goety/entity/projectiles/biomine/16';
import biomine17Png from 'asset:贴图/法术/goety/entity/projectiles/biomine/17';
import biomine18Png from 'asset:贴图/法术/goety/entity/projectiles/biomine/18';

const bioMineModel = getModel(bioMineModelData, 'BioMineModel');
const animFrames = [biomine0Png, biomine1Png, biomine2Png, biomine3Png, biomine4Png, biomine5Png, biomine6Png, biomine7Png, biomine8Png, biomine9Png, biomine10Png, biomine11Png, biomine12Png, biomine13Png, biomine14Png, biomine15Png, biomine16Png, biomine17Png, biomine18Png].map(png);
const white: readonly [number, number, number] = [1, 1, 1];
const acidColor = hexColor(0x20b33e);

type Mine = { 位: Vec3; blastTick: number };
const mineRow = (target: Vec3, seed: number): Mine[] =>
  Array.from({ length: bioMineCount }, (_, i) => {
    const r = rng(seed * 449 + i);
    let [x, y] = [4, 0];
    for (let attempt = 0; attempt < 16; attempt++) {
      [x, y] = [Math.floor(r() * 17) - 8, Math.floor(r() * 17) - 8];
      if (x * x + y * y >= 16) break;
    }
    let blastTick = bioMineLifeTicks;
    while (blastTick < bioMineLatestTick && Math.floor(r() * 8) !== 0) blastTick++;
    return { 位: [target[0] + x, target[1] + y, target[2]] as const, blastTick };
  });

const bioMine: React.FC<SpellPerformanceProps> = ({ 秒: sec, 目标: target, 种子: seed }) => {
  const tick = sec * 20;
  const bolts = mineRow(target, seed);
  const acidSpawns: ParticleBirth[] = [];
  bolts.forEach((mine, i) => {
    const r = rng(seed * 677 + i);
    for (let t = mine.blastTick; t < Math.min(mine.blastTick + acidPoolTicks, tick); t++)
      for (let k = 0; k < 2; k++) {
        const [angle, randDistance] = [r() * Math.PI * 2, Math.sqrt(r()) * 2];
        acidSpawns.push({ 刻: t, 位: [mine.位[0] + Math.cos(angle) * randDistance, mine.位[1] + Math.sin(angle) * randDistance, mine.位[2] + 0.2], 寿命: Math.floor(8 / (r() * 0.8 + 0.2)), radius: 0.3, 色: acidColor, 种子: i * 1000 + t * 2 + k });
      }
  });
  return (
    <>
      {bolts.map((mine, i) =>
        tick < mine.blastTick ? (
          <MinecraftSpace key={i} 位={mine.位}>
            <group scale={[-1, -1, 1]}>
              <group position={[0, -1.5, 0]}>
                <ModelPart 模型={bioMineModel} 图={animFrames[Math.floor(tick) % 19]!} />
                <ModelPart 模型={bioMineModel} 图={png(glowPng)} 画法="发光" />
              </group>
            </group>
          </MinecraftSpace>
        ) : (
          <RingBurst key={i} 位={mine.位} spawnTick={mine.blastTick} 秒={sec} 大小={3} 颜色={white} accel={1} />
        ),
      )}
      <DustCloud spawns={acidSpawns} 秒={sec} />
    </>
  );
};

export default defineSpellPerformance(meta, bioMine);
