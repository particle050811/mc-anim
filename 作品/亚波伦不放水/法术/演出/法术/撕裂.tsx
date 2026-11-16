// 撕裂。出处 goety 2.5.60.6：VoidRiftSpell、VoidRift（CastSpellTrap）、VoidRiftRenderer、ServerParticleUtil.gatheringParticles / createParticleBall、ShockwaveParticleOption。
// 裂隙放在目标脚下，一张朝向镜头的方片（实体渲染器：大小 = 4 + 半径加成，激活后 × 1.5；方片 x ∈ [−0.5, 0.5]、y ∈ [−0.25, 0.75] 乘大小）：
// - 预热：贴图 open_1～3 按预热进度三等分；每刻一颗 PORTAL 在裂隙周围随机撒（y + 0.5）；
// - 预热完：激活，换 rift_1，之后每 20 刻往后换一张（rift_1～5）；每刻从边长 2×16 的方框棱上抽 1/25 的点，放 PORTAL 往中心聚（速度 = 偏移 × 0.5）；
// - 时间到：缩回 open_3 合上 20 刻，然后爆：冲击波环（0x7317D2，大小 8，淡出）加一团龙息粒子球（半径 8）。
// 半径加成按 0 算（法术默认）。
// 预热：给了施法刻照游戏 施法刻 − 5（第 4 幕晋升之环 4 倍施法速度：120 → 30，预热 25 刻），不给是自己定的 60 刻（游戏 115）；
// 自己定的：张开 60 刻（游戏 300）；裂隙占位宽 1 格撒 PORTAL（没查实体碰撞箱）。
// 没做：吸人、拉方块、伤害、SpellExplosion 的击退和虚空侵蚀；爆炸点在地面上 0.5 格；PORTAL 的聚集中心取脚上 1.6 格（眼高没查）。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps, Vec3 } from '../接口.ts';
import { ShockwaveRing } from '../零件/冲击波.tsx';
import { Quad } from '../零件/面片.tsx';
import { hexColor } from '../零件/甲/共用.ts';
import { dragonBreath, dragonBreathClass } from '../零件/甲/原版粒子.ts';
import { VanillaParticles, type ParticleSpawn, TexturedParticles } from '../零件/粒子.tsx';
import meta, { tearBeat, tearOpenTicks } from './撕裂.元.ts';
import voidRiftOpen1Png from 'asset:贴图/法术/goety/entity/projectiles/void_rift/open_1';
import voidRiftOpen2Png from 'asset:贴图/法术/goety/entity/projectiles/void_rift/open_2';
import voidRiftOpen3Png from 'asset:贴图/法术/goety/entity/projectiles/void_rift/open_3';
import voidRift1Png from 'asset:贴图/法术/goety/entity/projectiles/void_rift/rift_1';
import voidRift2Png from 'asset:贴图/法术/goety/entity/projectiles/void_rift/rift_2';
import voidRift3Png from 'asset:贴图/法术/goety/entity/projectiles/void_rift/rift_3';
import voidRift4Png from 'asset:贴图/法术/goety/entity/projectiles/void_rift/rift_4';
import voidRift5Png from 'asset:贴图/法术/goety/entity/projectiles/void_rift/rift_5';
import { mulberry32 } from '@engine/core/数学.ts';

const textures = [voidRiftOpen1Png, voidRiftOpen2Png, voidRiftOpen3Png, voidRift1Png, voidRift2Png, voidRift3Png, voidRift4Png, voidRift5Png].map(png);
const burstColor = hexColor(7542738);
const gatherRange = 16;

/** 棱上的点（游戏格子偏移）：gatheringParticles 里 x、y、z 中至少两个等于 ±range 的那些 */
const edgePoints: readonly [number, number, number][] = (() => {
  const points: [number, number, number][] = [];
  const n = gatherRange;
  for (let x = -n; x <= n; x++) for (let y = -n; y <= n; y++) for (let z = -n; z <= n; z++) {
    const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
    if ((x !== 0 || (ay !== n && az !== n)) && (y !== 0 || (ax !== n && az !== n)) && (z !== 0 || (ax !== n && ay !== n))) continue;
    points.push([x, y, z]);
  }
  return points;
})();

const Tear: React.FC<SpellPerformanceProps> = ({ sec: sec, target: target, seed: seed, options }) => {
  const tick = sec * 20;
  const { warmup: tearWarmupTick, burstTick: tearBurstTick } = tearBeat(options);
  const active = tick >= tearWarmupTick;
  const isClosing = tick >= tearWarmupTick + tearOpenTicks;
  const hasBurst = tick >= tearBurstTick;
  let stage = 0;
  if (!active) stage = Math.min(2, Math.floor((tick / tearWarmupTick) * 3));
  else if (isClosing) stage = 2;
  else stage = 3 + (Math.floor((tick - tearWarmupTick) / 20) % 5);
  const size = (active ? 6 : 4);
  const tearCenter: Vec3 = [target[0], target[1], target[2] + 0.25 * size];

  // PORTAL：预热期每刻一颗；张开期每刻 1/25 的棱点往中心聚（场景速度 = [x, −z, y] × 0.5，偏移加 [−0.5..0, −2..−1, −0.5..0] 随机）
  const particles: ParticleSpawn[] = [];
  const endTick = Math.min(tick, tearBurstTick);
  for (let t = 0; t < endTick; t++) {
    const r = mulberry32(seed * 7919 + t);
    if (t < tearWarmupTick) {
      particles.push({ kind: 'portal', 刻: t, p: [target[0] + (r() - 0.5), target[1] + (r() - 0.5), target[2] + 0.5], v: [0, 0, 0], seed: seed * 31 + t });
    } else if (t < tearWarmupTick + tearOpenTicks) {
      for (const [bx, by, bz] of edgePoints) {
        if (r() >= 1 / 25) continue;
        const f = -0.5 + r();
        const f1 = -2 + r();
        const f2 = -0.5 + r();
        particles.push({ kind: 'portal', 刻: t, p: [target[0], target[1], target[2] + 1.6], v: [(f + bx) * 0.5, -(f2 + bz) * 0.5, (f1 + by) * 0.5], seed: seed * 53 + t * 1009 + particles.length });
      }
    }
  }

  // 爆：createParticleBall(龙息, 半径 8)：只有外壳（i 到头才扫满 j、k）
  const breaths = React.useMemo(() => {
    const r = mulberry32(seed * 104729);
    const breaths: ReturnType<typeof dragonBreath>[] = [];
    const halfExtent = 8;
    const aimPoint: Vec3 = [target[0], target[1], target[2] + 0.5];
    for (let i = -halfExtent; i <= halfExtent; i++) for (let j = -halfExtent; j <= halfExtent; j++) for (let k = -halfExtent; k <= halfExtent; k += (i === -halfExtent || i === halfExtent || j === -halfExtent || j === halfExtent) ? 1 : halfExtent * 2) {
      const d3 = j + (r() - r()) * 0.5;
      const d4 = i + (r() - r()) * 0.5;
      const d5 = k + (r() - r()) * 0.5;
      const d6 = Math.sqrt(d3 * d3 + d4 * d4 + d5 * d5) / 0.5 + (r() + r() + r() - 1.5) * 0.1;
      breaths.push(dragonBreath(r, tearBurstTick, aimPoint, [(d3 / d6) * 0.5, -(d5 / d6) * 0.5, (d4 / d6) * 0.5]));
    }
    return breaths;
  }, [target[0], target[1], target[2], seed, tearBurstTick]);

  return (
    <>
      {!hasBurst && <Quad image={textures[stage]!} 位={tearCenter} halfWidth={size / 2} blend="镂空" />}
      <VanillaParticles spawns={particles} sec={sec} />
      {hasBurst && <ShockwaveRing 位={[target[0], target[1], target[2] + 0.5]} 刻={tick - tearBurstTick} size={8} 色={burstColor} 速={0} />}
      {hasBurst && <TexturedParticles type={dragonBreathClass} spawns={breaths} sec={sec} />}
    </>
  );
};

export default defineSpellPerformance(meta, Tear);
