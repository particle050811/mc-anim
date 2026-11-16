// 原版粒子（1.20.1）通用模拟：法术、传送石、火把、苦力怕迫击炮、监守者音波等要好几种原版粒子，这里按各粒子类的构造函数和 `tick()` 照抄常数，统一用 `ParticleQuads`（和镜头平行的方片，实例化一次画完）。
// 出处：game/缓存/client-1.20.1-srg.jar 反汇编（javap），SRG 名对照 取材mod/build/createMcpToSrg/output.tsrg。对应的原版类：
//   portal=PortalParticle、reverse_portal=ReversePortalParticle、crimson_spore=SuspendedParticle+CrimsonSporeProvider、witch=SpellParticle+WitchProvider、enchant=EnchantmentTableParticle、
//   flame=FlameParticle/RisingParticle、smoke=SmokeParticle/BaseAshSmokeParticle、poof=ExplodeParticle、explosion=HugeExplosionParticle、sonic_boom=SonicBoomParticle（继承 HugeExplosion）。
//   splash=SplashParticle（继承 WaterDropParticle）。
// 通用 Particle：速度各分量加 (随机×2−1)×0.4，再归一到 (随机+随机+1)×0.15×0.4，竖直再 +0.1（`ParticleQuads.tsx` 的 `particleInitVel`）。`Particle.tick`：先 yd −= 0.04×重力，再移动，再乘摩擦；
//   不处理 speedUpWhenYMotionIsBlocked（不碰方块）。贴图按 age×(帧数−1)/lifetime 换；渲染位置在上一刻和这一刻之间插值（画出来比物理晚一刻）。
// 不受光（夜视下满亮度），暗处由 黑暗效果.tsx 整体压暗。坐标是场景坐标（Z 朝上，格），速度 格/刻。参考视频机位远时原版大小会小到看不见，组件给整体放大 `size`（默认 1 = 原版）。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { type V3 } from '../../engine/model/parts.tsx';
import { type Png, pngDir } from '../../engine/model/贴图.ts';
import { type Particle, ParticleQuads } from './粒子面片.tsx';
import { assetDir } from '../../engine/core/资产目录.ts';
import criticalHitPng from 'asset:贴图/特效/粒子/critical_hit';
import dripHangPng from 'asset:贴图/特效/粒子/drip_hang';
import explosion0Png from 'asset:贴图/特效/粒子/explosion_0';
import explosion1Png from 'asset:贴图/特效/粒子/explosion_1';
import explosion10Png from 'asset:贴图/特效/粒子/explosion_10';
import explosion11Png from 'asset:贴图/特效/粒子/explosion_11';
import explosion12Png from 'asset:贴图/特效/粒子/explosion_12';
import explosion13Png from 'asset:贴图/特效/粒子/explosion_13';
import explosion14Png from 'asset:贴图/特效/粒子/explosion_14';
import explosion15Png from 'asset:贴图/特效/粒子/explosion_15';
import explosion2Png from 'asset:贴图/特效/粒子/explosion_2';
import explosion3Png from 'asset:贴图/特效/粒子/explosion_3';
import explosion4Png from 'asset:贴图/特效/粒子/explosion_4';
import explosion5Png from 'asset:贴图/特效/粒子/explosion_5';
import explosion6Png from 'asset:贴图/特效/粒子/explosion_6';
import explosion7Png from 'asset:贴图/特效/粒子/explosion_7';
import explosion8Png from 'asset:贴图/特效/粒子/explosion_8';
import explosion9Png from 'asset:贴图/特效/粒子/explosion_9';
import generic0Png from 'asset:贴图/特效/粒子/generic_0';
import generic1Png from 'asset:贴图/特效/粒子/generic_1';
import generic2Png from 'asset:贴图/特效/粒子/generic_2';
import generic3Png from 'asset:贴图/特效/粒子/generic_3';
import generic4Png from 'asset:贴图/特效/粒子/generic_4';
import generic5Png from 'asset:贴图/特效/粒子/generic_5';
import generic6Png from 'asset:贴图/特效/粒子/generic_6';
import generic7Png from 'asset:贴图/特效/粒子/generic_7';
import glitter0Png from 'asset:贴图/特效/粒子/glitter_0';
import glitter1Png from 'asset:贴图/特效/粒子/glitter_1';
import glitter2Png from 'asset:贴图/特效/粒子/glitter_2';
import glitter3Png from 'asset:贴图/特效/粒子/glitter_3';
import glitter4Png from 'asset:贴图/特效/粒子/glitter_4';
import glitter5Png from 'asset:贴图/特效/粒子/glitter_5';
import glitter6Png from 'asset:贴图/特效/粒子/glitter_6';
import glitter7Png from 'asset:贴图/特效/粒子/glitter_7';
import splash0Png from 'asset:贴图/特效/粒子/splash_0';
import splash1Png from 'asset:贴图/特效/粒子/splash_1';
import splash2Png from 'asset:贴图/特效/粒子/splash_2';
import splash3Png from 'asset:贴图/特效/粒子/splash_3';
import potionEffect0Png from 'asset:贴图/特效/药水粒子/effect_0';
import potionEffect1Png from 'asset:贴图/特效/药水粒子/effect_1';
import potionEffect2Png from 'asset:贴图/特效/药水粒子/effect_2';
import potionEffect3Png from 'asset:贴图/特效/药水粒子/effect_3';
import potionEffect4Png from 'asset:贴图/特效/药水粒子/effect_4';
import potionEffect5Png from 'asset:贴图/特效/药水粒子/effect_5';
import potionEffect6Png from 'asset:贴图/特效/药水粒子/effect_6';
import potionEffect7Png from 'asset:贴图/特效/药水粒子/effect_7';
import potionSpell0Png from 'asset:贴图/特效/药水粒子/spell_0';
import potionSpell1Png from 'asset:贴图/特效/药水粒子/spell_1';
import potionSpell2Png from 'asset:贴图/特效/药水粒子/spell_2';
import potionSpell3Png from 'asset:贴图/特效/药水粒子/spell_3';
import potionSpell4Png from 'asset:贴图/特效/药水粒子/spell_4';
import potionSpell5Png from 'asset:贴图/特效/药水粒子/spell_5';
import potionSpell6Png from 'asset:贴图/特效/药水粒子/spell_6';
import potionSpell7Png from 'asset:贴图/特效/药水粒子/spell_7';
import blastwave1Png from 'asset:贴图/特效/杂项粒子/blastwave_1';
import blastwave2Png from 'asset:贴图/特效/杂项粒子/blastwave_2';
import blastwave3Png from 'asset:贴图/特效/杂项粒子/blastwave_3';
import blastwave4Png from 'asset:贴图/特效/杂项粒子/blastwave_4';
import blastwave5Png from 'asset:贴图/特效/杂项粒子/blastwave_5';
import blastwave6Png from 'asset:贴图/特效/杂项粒子/blastwave_6';
import blastwave7Png from 'asset:贴图/特效/杂项粒子/blastwave_7';
import blastwave8Png from 'asset:贴图/特效/杂项粒子/blastwave_8';
import flamePng from 'asset:贴图/特效/杂项粒子/flame';
import glowPng from 'asset:贴图/特效/杂项粒子/glow';
import sgaAPng from 'asset:贴图/特效/杂项粒子/sga_a';
import sgaBPng from 'asset:贴图/特效/杂项粒子/sga_b';
import sgaCPng from 'asset:贴图/特效/杂项粒子/sga_c';
import sgaDPng from 'asset:贴图/特效/杂项粒子/sga_d';
import sgaEPng from 'asset:贴图/特效/杂项粒子/sga_e';
import sgaFPng from 'asset:贴图/特效/杂项粒子/sga_f';
import sgaGPng from 'asset:贴图/特效/杂项粒子/sga_g';
import sgaHPng from 'asset:贴图/特效/杂项粒子/sga_h';
import sgaIPng from 'asset:贴图/特效/杂项粒子/sga_i';
import sgaJPng from 'asset:贴图/特效/杂项粒子/sga_j';
import sgaKPng from 'asset:贴图/特效/杂项粒子/sga_k';
import sgaLPng from 'asset:贴图/特效/杂项粒子/sga_l';
import sgaMPng from 'asset:贴图/特效/杂项粒子/sga_m';
import sgaNPng from 'asset:贴图/特效/杂项粒子/sga_n';
import sgaOPng from 'asset:贴图/特效/杂项粒子/sga_o';
import sgaPPng from 'asset:贴图/特效/杂项粒子/sga_p';
import sgaQPng from 'asset:贴图/特效/杂项粒子/sga_q';
import sgaRPng from 'asset:贴图/特效/杂项粒子/sga_r';
import sgaSPng from 'asset:贴图/特效/杂项粒子/sga_s';
import sgaTPng from 'asset:贴图/特效/杂项粒子/sga_t';
import sgaUPng from 'asset:贴图/特效/杂项粒子/sga_u';
import sgaVPng from 'asset:贴图/特效/杂项粒子/sga_v';
import sgaWPng from 'asset:贴图/特效/杂项粒子/sga_w';
import sgaXPng from 'asset:贴图/特效/杂项粒子/sga_x';
import sgaYPng from 'asset:贴图/特效/杂项粒子/sga_y';
import sgaZPng from 'asset:贴图/特效/杂项粒子/sga_z';
import sonicBoom0Png from 'asset:贴图/特效/杂项粒子/sonic_boom_0';
import sonicBoom1Png from 'asset:贴图/特效/杂项粒子/sonic_boom_1';
import sonicBoom10Png from 'asset:贴图/特效/杂项粒子/sonic_boom_10';
import sonicBoom11Png from 'asset:贴图/特效/杂项粒子/sonic_boom_11';
import sonicBoom12Png from 'asset:贴图/特效/杂项粒子/sonic_boom_12';
import sonicBoom13Png from 'asset:贴图/特效/杂项粒子/sonic_boom_13';
import sonicBoom14Png from 'asset:贴图/特效/杂项粒子/sonic_boom_14';
import sonicBoom15Png from 'asset:贴图/特效/杂项粒子/sonic_boom_15';
import sonicBoom2Png from 'asset:贴图/特效/杂项粒子/sonic_boom_2';
import sonicBoom3Png from 'asset:贴图/特效/杂项粒子/sonic_boom_3';
import sonicBoom4Png from 'asset:贴图/特效/杂项粒子/sonic_boom_4';
import sonicBoom5Png from 'asset:贴图/特效/杂项粒子/sonic_boom_5';
import sonicBoom6Png from 'asset:贴图/特效/杂项粒子/sonic_boom_6';
import sonicBoom7Png from 'asset:贴图/特效/杂项粒子/sonic_boom_7';
import sonicBoom8Png from 'asset:贴图/特效/杂项粒子/sonic_boom_8';
import sonicBoom9Png from 'asset:贴图/特效/杂项粒子/sonic_boom_9';
import { lerpV, mulberry32 } from '../../engine/core/数学.ts';

const vanillaPngs = pngDir(assetDir({ './critical_hit.png': criticalHitPng, './drip_hang.png': dripHangPng, './explosion_0.png': explosion0Png, './explosion_1.png': explosion1Png, './explosion_10.png': explosion10Png, './explosion_11.png': explosion11Png, './explosion_12.png': explosion12Png, './explosion_13.png': explosion13Png, './explosion_14.png': explosion14Png, './explosion_15.png': explosion15Png, './explosion_2.png': explosion2Png, './explosion_3.png': explosion3Png, './explosion_4.png': explosion4Png, './explosion_5.png': explosion5Png, './explosion_6.png': explosion6Png, './explosion_7.png': explosion7Png, './explosion_8.png': explosion8Png, './explosion_9.png': explosion9Png, './generic_0.png': generic0Png, './generic_1.png': generic1Png, './generic_2.png': generic2Png, './generic_3.png': generic3Png, './generic_4.png': generic4Png, './generic_5.png': generic5Png, './generic_6.png': generic6Png, './generic_7.png': generic7Png, './glitter_0.png': glitter0Png, './glitter_1.png': glitter1Png, './glitter_2.png': glitter2Png, './glitter_3.png': glitter3Png, './glitter_4.png': glitter4Png, './glitter_5.png': glitter5Png, './glitter_6.png': glitter6Png, './glitter_7.png': glitter7Png, './splash_0.png': splash0Png, './splash_1.png': splash1Png, './splash_2.png': splash2Png, './splash_3.png': splash3Png }));
const potionPngs = pngDir(assetDir({ './effect_0.png': potionEffect0Png, './effect_1.png': potionEffect1Png, './effect_2.png': potionEffect2Png, './effect_3.png': potionEffect3Png, './effect_4.png': potionEffect4Png, './effect_5.png': potionEffect5Png, './effect_6.png': potionEffect6Png, './effect_7.png': potionEffect7Png, './spell_0.png': potionSpell0Png, './spell_1.png': potionSpell1Png, './spell_2.png': potionSpell2Png, './spell_3.png': potionSpell3Png, './spell_4.png': potionSpell4Png, './spell_5.png': potionSpell5Png, './spell_6.png': potionSpell6Png, './spell_7.png': potionSpell7Png }));
const ch7Pngs = pngDir(assetDir({ './blastwave_1.png': blastwave1Png, './blastwave_2.png': blastwave2Png, './blastwave_3.png': blastwave3Png, './blastwave_4.png': blastwave4Png, './blastwave_5.png': blastwave5Png, './blastwave_6.png': blastwave6Png, './blastwave_7.png': blastwave7Png, './blastwave_8.png': blastwave8Png, './flame.png': flamePng, './glow.png': glowPng, './sga_a.png': sgaAPng, './sga_b.png': sgaBPng, './sga_c.png': sgaCPng, './sga_d.png': sgaDPng, './sga_e.png': sgaEPng, './sga_f.png': sgaFPng, './sga_g.png': sgaGPng, './sga_h.png': sgaHPng, './sga_i.png': sgaIPng, './sga_j.png': sgaJPng, './sga_k.png': sgaKPng, './sga_l.png': sgaLPng, './sga_m.png': sgaMPng, './sga_n.png': sgaNPng, './sga_o.png': sgaOPng, './sga_p.png': sgaPPng, './sga_q.png': sgaQPng, './sga_r.png': sgaRPng, './sga_s.png': sgaSPng, './sga_t.png': sgaTPng, './sga_u.png': sgaUPng, './sga_v.png': sgaVPng, './sga_w.png': sgaWPng, './sga_x.png': sgaXPng, './sga_y.png': sgaYPng, './sga_z.png': sgaZPng, './sonic_boom_0.png': sonicBoom0Png, './sonic_boom_1.png': sonicBoom1Png, './sonic_boom_10.png': sonicBoom10Png, './sonic_boom_11.png': sonicBoom11Png, './sonic_boom_12.png': sonicBoom12Png, './sonic_boom_13.png': sonicBoom13Png, './sonic_boom_14.png': sonicBoom14Png, './sonic_boom_15.png': sonicBoom15Png, './sonic_boom_2.png': sonicBoom2Png, './sonic_boom_3.png': sonicBoom3Png, './sonic_boom_4.png': sonicBoom4Png, './sonic_boom_5.png': sonicBoom5Png, './sonic_boom_6.png': sonicBoom6Png, './sonic_boom_7.png': sonicBoom7Png, './sonic_boom_8.png': sonicBoom8Png, './sonic_boom_9.png': sonicBoom9Png }));
const ALL: Record<string, Png> = { ...vanillaPngs, ...potionPngs, ...ch7Pngs };

// 图集：每张贴图占一个 64×64 的格子（最大的 blastwave 是 64），uv 只框贴图本身那块
const CELL = 64;
const COLS = 16;
const ATLAS = (() => {
  const names = Object.keys(ALL).sort();
  const rows = Math.ceil(names.length / COLS);
  const width = CELL * COLS;
  const height = CELL * rows;
  const px = new Uint8Array(width * height * 4);
  const uv: Record<string, [number, number, number, number]> = {};
  names.forEach((name, i) => {
    const t = ALL[name];
    const x0 = (i % COLS) * CELL;
    const y0 = Math.floor(i / COLS) * CELL;
    for (let y = 0; y < t.h; y++) px.set(t.px.subarray(y * t.w * 4, (y + 1) * t.w * 4), ((y0 + y) * width + x0) * 4);
    uv[name] = [x0 / width, y0 / height, (x0 + t.w) / width, (y0 + t.h) / height];
  });
  const tex = new THREE.DataTexture(px, width, height, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return { tex, uv };
})();
export const vanillaParticleAtlas = ATLAS;

export type ParticleKind = 'portal' | 'reverse_portal' | 'crimson_spore' | 'witch' | 'enchant' | 'flame' | 'smoke' | 'poof' | 'explosion' | 'sonic_boom' | 'splash';
// 一颗粒子的出生：刻 = 出生时刻（刻，可以带小数，和组件的 秒×20 同一个钟）；p、v = addParticle 的位置和速度（场景坐标）；
// 种子：这颗粒子自己的随机数（同一个种子每帧算出来一样）；水面：splash 落回这个高度以下（掉进水里）就消失
export type ParticleSpawn = { kind: ParticleKind; 刻: number; p: V3; v?: V3; seed: number; waterLevel?: number };

// 状态：位置、半边长、贴图名、颜色、透明度
type ParticleState = { p: V3; half: number; tex: string; color: [number, number, number]; alpha: number; translucent: boolean };

// 父类构造的随机速度（场景坐标：z 朝上）
const randomVelocity = (rand: () => number, baseVel: V3): V3 => {
  let x = baseVel[0] + (rand() * 2 - 1) * 0.4;
  let y = baseVel[1] + (rand() * 2 - 1) * 0.4;
  let z = baseVel[2] + (rand() * 2 - 1) * 0.4;
  const speed = (rand() + rand() + 1) * 0.15;
  const len = Math.hypot(x, y, z) || 1;
  x = (x / len) * speed * 0.4;
  y = (y / len) * speed * 0.4;
  z = (z / len) * speed * 0.4 + 0.1;
  return [x, y, z];
};

// 按 Particle.tick 走 n 刻，返回第 n−1、n 刻末的位置（给插值用）
const simulateTicks = (p0: V3, v0: V3, ticks: number, gravity: number, friction: number): [V3, V3] => {
  let [x, y, z] = p0;
  let [vx, vy, vz] = v0;
  let prev: V3 = [x, y, z];
  for (let k = 0; k < ticks; k++) {
    prev = [x, y, z];
    vz -= 0.04 * gravity;
    x += vx;
    y += vy;
    z += vz;
    vx *= friction;
    vy *= friction;
    vz *= friction;
  }
  return [prev, [x, y, z]];
};
const animFrame = (age: number, life: number, n: number) => Math.min(n - 1, Math.floor((age * (n - 1)) / life));
const SGA = 'abcdefghijklmnopqrstuvwxyz'.split('').map((c) => `sga_${c}`);

// 一颗粒子在 tick 时刻的样子；没出生或已消失返回 null
export const particleStateAt = (spawn: ParticleSpawn, tick: number): ParticleState | null => {
  const τ = tick - spawn.刻;
  if (τ < 0) return null;
  const rand = mulberry32(spawn.seed * 2654435761 + 97);
  const vel = spawn.v ?? [0, 0, 0];
  const age = Math.floor(τ);
  const pt = τ - age;
  switch (spawn.kind) {
    case 'portal':
    case 'reverse_portal': {
      const rev = spawn.kind === 'reverse_portal';
      // PortalParticle 构造：xd 等直接用给的速度（不加随机）
      const half0 = 0.1 * (rand() * 0.2 + 0.5) * (rev ? 1.5 : 1);
      const shade = rand() * 0.6 + 0.4;
      const tex = `generic_${Math.floor(rand() * 8)}`;
      const life = rev ? Math.floor(rand() * 2) + 60 : Math.floor(rand() * 10) + 40;
      if (age >= life) return null;
      if (!rev) {
        const t = (age + pt) / life;
        const k = 1 + t - 2 * t * t;
        const position: V3 = [spawn.p[0] + vel[0] * k, spawn.p[1] + vel[1] * k, spawn.p[2] + vel[2] * k + (1 - t)];
        const half = half0 * (1 - (1 - t) * (1 - t));
        return { p: position, half, tex, color: [0.9 * shade, 0.3 * shade, shade], alpha: 1, translucent: true };
      }
      // reverse：每刻 位置 += 速度 × (age/寿命)（age 先加 1）
      const pos = (ticks: number): V3 => {
        let travelFrac = 0;
        for (let k = 1; k <= ticks; k++) travelFrac += k / life;
        return [spawn.p[0] + vel[0] * travelFrac, spawn.p[1] + vel[1] * travelFrac, spawn.p[2] + vel[2] * travelFrac];
      };
      const position = lerpV(pos(Math.max(0, age - 1)), pos(age), pt);
      const half = half0 * (1 - (age + pt) / (life * 1.5));
      return { p: position, half, tex, color: [0.9 * shade, 0.3 * shade, shade], alpha: 1, translucent: true };
    }
    case 'crimson_spore': {
      const v0 = randomVelocity(rand, vel);
      const half = 0.1 * (rand() * 0.5 + 0.5) * (rand() * 0.6 + 0.6);
      const life = Math.floor(16 / (rand() * 0.8 + 0.2));
      if (age >= life) return null;
      const [prevPos, curPos] = simulateTicks([spawn.p[0], spawn.p[1], spawn.p[2] - 0.125], v0, age, 0, 1);
      return { p: lerpV(prevPos, curPos, pt), half, tex: 'generic_0', color: [0.9, 0.4, 0.5], alpha: 1, translucent: false };
    }
    case 'witch': {
      const base = randomVelocity(rand, [0.5 - rand(), 0.5 - rand(), vel[2]]);
      let [vx, vy, vz] = base;
      vz *= 0.2;
      if (vel[0] === 0 && vel[1] === 0) {
        vx *= 0.1;
        vy *= 0.1;
      }
      const half = 0.1 * (rand() * 0.5 + 0.5) * 2 * 0.75;
      const life = Math.floor(8 / (rand() * 0.8 + 0.2));
      const shade = rand() * 0.5 + 0.35;
      if (age >= life) return null;
      const [prevPos, curPos] = simulateTicks(spawn.p, [vx, vy, vz], age, -0.1, 0.96);
      const frameCount = 8;
      return { p: lerpV(prevPos, curPos, pt), half, tex: `spell_${7 - animFrame(age, life, frameCount)}`, color: [shade, 0, shade], alpha: 1, translucent: true };
    }
    case 'enchant': {
      const half = 0.1 * (rand() * 0.5 + 0.2);
      const f0 = (rand() * 0.6 + 0.4) * 0.9;
      const life = Math.floor(rand() * 10) + 30;
      const tex = SGA[Math.floor(rand() * SGA.length)];
      if (age >= life) return null;
      const at = (ageTick: number): V3 => {
        const remain = 1 - ageTick / life;
        const f1 = (1 - remain) ** 4;
        return [spawn.p[0] + vel[0] * remain, spawn.p[1] + vel[1] * remain, spawn.p[2] + vel[2] * remain - f1 * 1.2];
      };
      return { p: lerpV(at(Math.max(0, age - 1)), at(age), pt), half, tex, color: [0.9 * f0, 0.9 * f0, f0], alpha: 1, translucent: false };
    }
    case 'flame': {
      const rv = randomVelocity(rand, vel);
      const v0: V3 = [rv[0] * 0.01 + vel[0], rv[1] * 0.01 + vel[1], rv[2] * 0.01 + vel[2]];
      const p0: V3 = [spawn.p[0] + (rand() - rand()) * 0.05, spawn.p[1] + (rand() - rand()) * 0.05, spawn.p[2] + (rand() - rand()) * 0.05];
      const half0 = 0.1 * (rand() * 0.5 + 0.5) * 2;
      const life = Math.floor(8 / (rand() * 0.8 + 0.2)) + 4;
      if (age >= life) return null;
      const [prevPos, curPos] = simulateTicks(p0, v0, age, 0, 0.96);
      const lifeFrac = (age + pt) / life;
      return { p: lerpV(prevPos, curPos, pt), half: half0 * (1 - lifeFrac * lifeFrac * 0.5), tex: 'flame', color: [1, 1, 1], alpha: 1, translucent: false };
    }
    case 'smoke': {
      const rv = randomVelocity(rand, vel);
      const v0: V3 = [rv[0] * 0.1 + vel[0], rv[1] * 0.1 + vel[1], rv[2] * 0.1 + vel[2]];
      const gray = rand() * 0.3;
      const half = 0.1 * (rand() * 0.5 + 0.5) * 2 * 0.75;
      const life = Math.max(1, Math.floor(8 / (rand() * 0.8 + 0.2)));
      if (age >= life) return null;
      const [prevPos, curPos] = simulateTicks(spawn.p, v0, age, -0.1, 0.96);
      return { p: lerpV(prevPos, curPos, pt), half, tex: `generic_${7 - animFrame(age, life, 8)}`, color: [gray, gray, gray], alpha: 1, translucent: false };
    }
    case 'poof': {
      const v0: V3 = [vel[0] + (rand() * 2 - 1) * 0.05, vel[1] + (rand() * 2 - 1) * 0.05, vel[2] + (rand() * 2 - 1) * 0.05];
      const gray = rand() * 0.3 + 0.7;
      const half = 0.1 * (rand() * rand() * 6 + 1);
      const life = Math.floor(16 / (rand() * 0.8 + 0.2)) + 2;
      if (age >= life) return null;
      const [prevPos, curPos] = simulateTicks(spawn.p, v0, age, -0.1, 0.9);
      return { p: lerpV(prevPos, curPos, pt), half, tex: `generic_${7 - animFrame(age, life, 8)}`, color: [gray, gray, gray], alpha: 1, translucent: false };
    }
    case 'splash': {
      // WaterDropParticle 构造：父类随机速度后 xd、zd × 0.3，yd = 随机 × 0.2 + 0.1；寿命 8 / (随机 × 0.8 + 0.2)。SplashParticle：重力 0.04；给的 yd 为 0、水平不为 0 时改用给的速度（实体落水给的是实体速度，竖直不为 0，不走这条）。
      // tick：寿命到了就消失，yd −= 重力（不乘 0.04），移动，三向 × 0.98，再查所在格：低于水面就消失（不处理碰地）。贴图 splash_0～3 随机一张，不受光、不透明
      const rv = randomVelocity(rand, [0, 0, 0]);
      const half = 0.1 * (rand() * 0.5 + 0.5) * 2;
      const tex = `splash_${Math.floor(rand() * 4)}`;
      let v: V3 = [rv[0] * 0.3, rv[1] * 0.3, rand() * 0.2 + 0.1];
      if (vel[2] === 0 && (vel[0] !== 0 || vel[1] !== 0)) v = [vel[0], vel[1], 0.1];
      const life = Math.floor(8 / (rand() * 0.8 + 0.2));
      if (age >= life) return null;
      let p: V3 = [...spawn.p];
      let prev: V3 = p;
      for (let k = 0; k < age; k++) {
        prev = p;
        v = [v[0], v[1], v[2] - 0.04];
        p = [p[0] + v[0], p[1] + v[1], p[2] + v[2]];
        v = [v[0] * 0.98, v[1] * 0.98, v[2] * 0.98];
        if (spawn.waterLevel !== undefined && p[2] < spawn.waterLevel) return null;
      }
      return { p: lerpV(prev, p, pt), half, tex, color: [1, 1, 1], alpha: 1, translucent: false };
    }
    case 'explosion':
    case 'sonic_boom': {
      const sb = spawn.kind === 'sonic_boom';
      const lifeR = 6 + Math.floor(rand() * 4);
      const gray = rand() * 0.6 + 0.4;
      const life = sb ? 16 : lifeR;
      if (age >= life) return null;
      const half = sb ? 1.5 : 2 * (1 - vel[0] * 0.5);
      return { p: spawn.p, half, tex: `${sb ? 'sonic_boom' : 'explosion'}_${animFrame(age, life, 16)}`, color: [gray, gray, gray], alpha: 1, translucent: false };
    }
  }
};

// 画一批粒子。秒：当前时间（和出生的 刻 同一个钟，秒×20 = 刻）；size：整体放大
export const VanillaParticles: React.FC<{ spawns: ParticleSpawn[]; sec: number; size?: number }> = ({ spawns, sec: sec, size = 1 }) => {
  const tick = sec * 20;
  const { op, tr } = useMemo(() => {
    const op: Particle[] = [];
    const tr: Particle[] = [];
    for (const spawn of spawns) {
      const state = particleStateAt(spawn, tick);
      if (!state || state.half <= 0) continue;
      const it: Particle = { p: state.p, half: state.half * size, uv: ATLAS.uv[state.tex], color: state.color, alpha: state.alpha };
      (state.translucent ? tr : op).push(it);
    }
    return { op, tr };
  }, [spawns, tick, size]);
  return (
    <>
      <ParticleQuads tex={ATLAS.tex} items={op} />
      <ParticleQuads tex={ATLAS.tex} items={tr} translucent depthWrite={false} />
    </>
  );
};

// ---- 几种常用的放法（照游戏代码里的 addParticle 调用）----

// 原版生物死亡（LivingEntity.tickDeath → 实体事件 60 → makePoofParticles）：死后第 20 刻在碰撞箱里放 20 个 poof，速度各分量 高斯×0.02。
// at：脚底中心；宽、高：碰撞箱；死刻：死亡那一刻（刻）。返回出生表
export const deathPoof = (at: V3, width: number, height: number, deathTick: number, seed: number): ParticleSpawn[] => {
  const rand = mulberry32(seed * 7919 + 11);
  const gauss = () => Math.sqrt(-2 * Math.log(Math.max(1e-9, rand()))) * Math.cos(2 * Math.PI * rand());
  return Array.from({ length: 20 }, (_, i) => ({
    kind: 'poof' as const,
    刻: deathTick + 20,
    p: [at[0] + width * (2 * rand() - 1), at[1] + width * (2 * rand() - 1), at[2] + height * rand()] as V3,
    v: [gauss() * 0.02, gauss() * 0.02, gauss() * 0.02] as V3,
    seed: seed * 131 + i,
  }));
};

// 实体落水（Entity.doWaterSplashEffect）：落水那一刻在 (x ± 宽, floor(脚底) + 1, y ± 宽) 放 splash，个数是 float 下 i < 1 + 宽 × 20 的 i 数（宽 0.6 是 14 个），速度 = 实体速度（格/刻）。
// 同一刻还放同样多的 bubble，出生在水面以上那格就不在水里、下一刻就没了，这里不画。at：脚底中心；水面：落水那格的水面高度
export const waterSplash = (at: V3, vel: V3, tick: number, width: number, waterLevel: number, seed: number): ParticleSpawn[] => {
  const rand = mulberry32(seed * 6271 + 3);
  const z = Math.floor(at[2]) + 1;
  return Array.from({ length: Math.ceil(1 + Math.fround(width) * 20) }, (_, i) => ({
    kind: 'splash' as const,
    刻: tick,
    p: [at[0] + (rand() * 2 - 1) * width, at[1] + (rand() * 2 - 1) * width, z] as V3,
    v: vel,
    seed: seed * 389 + i,
    waterLevel,
  }));
};

// ServerLevel.sendParticles(类型, x,y,z, 数量, dx,dy,dz, 速度)：数量 > 0 时客户端每颗 位置 = 中心 + 高斯×(dx,dy,dz)，速度 = 高斯×速度
// （ClientPacketListener.handleParticleEvent）。场景坐标：dx、dy 是水平两个方向，dz 是竖直
export const serverSendParticles = (kind: ParticleKind, tick: number, at: V3, count: number, spread: V3, speed: number, seed: number): ParticleSpawn[] => {
  const rand = mulberry32(seed * 104729 + 5);
  const gauss = () => Math.sqrt(-2 * Math.log(Math.max(1e-9, rand()))) * Math.cos(2 * Math.PI * rand());
  return Array.from({ length: count }, (_, i) => ({
    kind: kind,
    刻: tick,
    p: [at[0] + gauss() * spread[0], at[1] + gauss() * spread[1], at[2] + gauss() * spread[2]] as V3,
    v: [gauss() * speed, gauss() * speed, gauss() * speed] as V3,
    seed: seed * 977 + i,
  }));
};
