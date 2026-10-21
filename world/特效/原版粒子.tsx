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
import { rng, V3 } from '../../engine/model/parts.tsx';
import { Png, pngDir } from '../../engine/model/贴图.ts';
import { Particle, ParticleQuads } from './粒子面片.tsx';
import { 资产目录 } from '../../engine/core/资产目录.ts';
import 资_0 from 'asset:贴图/特效/粒子/critical_hit';
import 资_1 from 'asset:贴图/特效/粒子/drip_hang';
import 资_2 from 'asset:贴图/特效/粒子/explosion_0';
import 资_3 from 'asset:贴图/特效/粒子/explosion_1';
import 资_4 from 'asset:贴图/特效/粒子/explosion_10';
import 资_5 from 'asset:贴图/特效/粒子/explosion_11';
import 资_6 from 'asset:贴图/特效/粒子/explosion_12';
import 资_7 from 'asset:贴图/特效/粒子/explosion_13';
import 资_8 from 'asset:贴图/特效/粒子/explosion_14';
import 资_9 from 'asset:贴图/特效/粒子/explosion_15';
import 资_10 from 'asset:贴图/特效/粒子/explosion_2';
import 资_11 from 'asset:贴图/特效/粒子/explosion_3';
import 资_12 from 'asset:贴图/特效/粒子/explosion_4';
import 资_13 from 'asset:贴图/特效/粒子/explosion_5';
import 资_14 from 'asset:贴图/特效/粒子/explosion_6';
import 资_15 from 'asset:贴图/特效/粒子/explosion_7';
import 资_16 from 'asset:贴图/特效/粒子/explosion_8';
import 资_17 from 'asset:贴图/特效/粒子/explosion_9';
import 资_18 from 'asset:贴图/特效/粒子/generic_0';
import 资_19 from 'asset:贴图/特效/粒子/generic_1';
import 资_20 from 'asset:贴图/特效/粒子/generic_2';
import 资_21 from 'asset:贴图/特效/粒子/generic_3';
import 资_22 from 'asset:贴图/特效/粒子/generic_4';
import 资_23 from 'asset:贴图/特效/粒子/generic_5';
import 资_24 from 'asset:贴图/特效/粒子/generic_6';
import 资_25 from 'asset:贴图/特效/粒子/generic_7';
import 资_26 from 'asset:贴图/特效/粒子/glitter_0';
import 资_27 from 'asset:贴图/特效/粒子/glitter_1';
import 资_28 from 'asset:贴图/特效/粒子/glitter_2';
import 资_29 from 'asset:贴图/特效/粒子/glitter_3';
import 资_30 from 'asset:贴图/特效/粒子/glitter_4';
import 资_31 from 'asset:贴图/特效/粒子/glitter_5';
import 资_32 from 'asset:贴图/特效/粒子/glitter_6';
import 资_33 from 'asset:贴图/特效/粒子/glitter_7';
import 资_34 from 'asset:贴图/特效/粒子/splash_0';
import 资_35 from 'asset:贴图/特效/粒子/splash_1';
import 资_36 from 'asset:贴图/特效/粒子/splash_2';
import 资_37 from 'asset:贴图/特效/粒子/splash_3';
import 资_38 from 'asset:贴图/特效/药水粒子/effect_0';
import 资_39 from 'asset:贴图/特效/药水粒子/effect_1';
import 资_40 from 'asset:贴图/特效/药水粒子/effect_2';
import 资_41 from 'asset:贴图/特效/药水粒子/effect_3';
import 资_42 from 'asset:贴图/特效/药水粒子/effect_4';
import 资_43 from 'asset:贴图/特效/药水粒子/effect_5';
import 资_44 from 'asset:贴图/特效/药水粒子/effect_6';
import 资_45 from 'asset:贴图/特效/药水粒子/effect_7';
import 资_46 from 'asset:贴图/特效/药水粒子/spell_0';
import 资_47 from 'asset:贴图/特效/药水粒子/spell_1';
import 资_48 from 'asset:贴图/特效/药水粒子/spell_2';
import 资_49 from 'asset:贴图/特效/药水粒子/spell_3';
import 资_50 from 'asset:贴图/特效/药水粒子/spell_4';
import 资_51 from 'asset:贴图/特效/药水粒子/spell_5';
import 资_52 from 'asset:贴图/特效/药水粒子/spell_6';
import 资_53 from 'asset:贴图/特效/药水粒子/spell_7';
import 资_54 from 'asset:贴图/特效/杂项粒子/blastwave_1';
import 资_55 from 'asset:贴图/特效/杂项粒子/blastwave_2';
import 资_56 from 'asset:贴图/特效/杂项粒子/blastwave_3';
import 资_57 from 'asset:贴图/特效/杂项粒子/blastwave_4';
import 资_58 from 'asset:贴图/特效/杂项粒子/blastwave_5';
import 资_59 from 'asset:贴图/特效/杂项粒子/blastwave_6';
import 资_60 from 'asset:贴图/特效/杂项粒子/blastwave_7';
import 资_61 from 'asset:贴图/特效/杂项粒子/blastwave_8';
import 资_62 from 'asset:贴图/特效/杂项粒子/flame';
import 资_63 from 'asset:贴图/特效/杂项粒子/glow';
import 资_64 from 'asset:贴图/特效/杂项粒子/sga_a';
import 资_65 from 'asset:贴图/特效/杂项粒子/sga_b';
import 资_66 from 'asset:贴图/特效/杂项粒子/sga_c';
import 资_67 from 'asset:贴图/特效/杂项粒子/sga_d';
import 资_68 from 'asset:贴图/特效/杂项粒子/sga_e';
import 资_69 from 'asset:贴图/特效/杂项粒子/sga_f';
import 资_70 from 'asset:贴图/特效/杂项粒子/sga_g';
import 资_71 from 'asset:贴图/特效/杂项粒子/sga_h';
import 资_72 from 'asset:贴图/特效/杂项粒子/sga_i';
import 资_73 from 'asset:贴图/特效/杂项粒子/sga_j';
import 资_74 from 'asset:贴图/特效/杂项粒子/sga_k';
import 资_75 from 'asset:贴图/特效/杂项粒子/sga_l';
import 资_76 from 'asset:贴图/特效/杂项粒子/sga_m';
import 资_77 from 'asset:贴图/特效/杂项粒子/sga_n';
import 资_78 from 'asset:贴图/特效/杂项粒子/sga_o';
import 资_79 from 'asset:贴图/特效/杂项粒子/sga_p';
import 资_80 from 'asset:贴图/特效/杂项粒子/sga_q';
import 资_81 from 'asset:贴图/特效/杂项粒子/sga_r';
import 资_82 from 'asset:贴图/特效/杂项粒子/sga_s';
import 资_83 from 'asset:贴图/特效/杂项粒子/sga_t';
import 资_84 from 'asset:贴图/特效/杂项粒子/sga_u';
import 资_85 from 'asset:贴图/特效/杂项粒子/sga_v';
import 资_86 from 'asset:贴图/特效/杂项粒子/sga_w';
import 资_87 from 'asset:贴图/特效/杂项粒子/sga_x';
import 资_88 from 'asset:贴图/特效/杂项粒子/sga_y';
import 资_89 from 'asset:贴图/特效/杂项粒子/sga_z';
import 资_90 from 'asset:贴图/特效/杂项粒子/sonic_boom_0';
import 资_91 from 'asset:贴图/特效/杂项粒子/sonic_boom_1';
import 资_92 from 'asset:贴图/特效/杂项粒子/sonic_boom_10';
import 资_93 from 'asset:贴图/特效/杂项粒子/sonic_boom_11';
import 资_94 from 'asset:贴图/特效/杂项粒子/sonic_boom_12';
import 资_95 from 'asset:贴图/特效/杂项粒子/sonic_boom_13';
import 资_96 from 'asset:贴图/特效/杂项粒子/sonic_boom_14';
import 资_97 from 'asset:贴图/特效/杂项粒子/sonic_boom_15';
import 资_98 from 'asset:贴图/特效/杂项粒子/sonic_boom_2';
import 资_99 from 'asset:贴图/特效/杂项粒子/sonic_boom_3';
import 资_100 from 'asset:贴图/特效/杂项粒子/sonic_boom_4';
import 资_101 from 'asset:贴图/特效/杂项粒子/sonic_boom_5';
import 资_102 from 'asset:贴图/特效/杂项粒子/sonic_boom_6';
import 资_103 from 'asset:贴图/特效/杂项粒子/sonic_boom_7';
import 资_104 from 'asset:贴图/特效/杂项粒子/sonic_boom_8';
import 资_105 from 'asset:贴图/特效/杂项粒子/sonic_boom_9';

const vanillaPngs = pngDir(资产目录({ './critical_hit.png': 资_0, './drip_hang.png': 资_1, './explosion_0.png': 资_2, './explosion_1.png': 资_3, './explosion_10.png': 资_4, './explosion_11.png': 资_5, './explosion_12.png': 资_6, './explosion_13.png': 资_7, './explosion_14.png': 资_8, './explosion_15.png': 资_9, './explosion_2.png': 资_10, './explosion_3.png': 资_11, './explosion_4.png': 资_12, './explosion_5.png': 资_13, './explosion_6.png': 资_14, './explosion_7.png': 资_15, './explosion_8.png': 资_16, './explosion_9.png': 资_17, './generic_0.png': 资_18, './generic_1.png': 资_19, './generic_2.png': 资_20, './generic_3.png': 资_21, './generic_4.png': 资_22, './generic_5.png': 资_23, './generic_6.png': 资_24, './generic_7.png': 资_25, './glitter_0.png': 资_26, './glitter_1.png': 资_27, './glitter_2.png': 资_28, './glitter_3.png': 资_29, './glitter_4.png': 资_30, './glitter_5.png': 资_31, './glitter_6.png': 资_32, './glitter_7.png': 资_33, './splash_0.png': 资_34, './splash_1.png': 资_35, './splash_2.png': 资_36, './splash_3.png': 资_37 }));
const potionPngs = pngDir(资产目录({ './effect_0.png': 资_38, './effect_1.png': 资_39, './effect_2.png': 资_40, './effect_3.png': 资_41, './effect_4.png': 资_42, './effect_5.png': 资_43, './effect_6.png': 资_44, './effect_7.png': 资_45, './spell_0.png': 资_46, './spell_1.png': 资_47, './spell_2.png': 资_48, './spell_3.png': 资_49, './spell_4.png': 资_50, './spell_5.png': 资_51, './spell_6.png': 资_52, './spell_7.png': 资_53 }));
const ch7Pngs = pngDir(资产目录({ './blastwave_1.png': 资_54, './blastwave_2.png': 资_55, './blastwave_3.png': 资_56, './blastwave_4.png': 资_57, './blastwave_5.png': 资_58, './blastwave_6.png': 资_59, './blastwave_7.png': 资_60, './blastwave_8.png': 资_61, './flame.png': 资_62, './glow.png': 资_63, './sga_a.png': 资_64, './sga_b.png': 资_65, './sga_c.png': 资_66, './sga_d.png': 资_67, './sga_e.png': 资_68, './sga_f.png': 资_69, './sga_g.png': 资_70, './sga_h.png': 资_71, './sga_i.png': 资_72, './sga_j.png': 资_73, './sga_k.png': 资_74, './sga_l.png': 资_75, './sga_m.png': 资_76, './sga_n.png': 资_77, './sga_o.png': 资_78, './sga_p.png': 资_79, './sga_q.png': 资_80, './sga_r.png': 资_81, './sga_s.png': 资_82, './sga_t.png': 资_83, './sga_u.png': 资_84, './sga_v.png': 资_85, './sga_w.png': 资_86, './sga_x.png': 资_87, './sga_y.png': 资_88, './sga_z.png': 资_89, './sonic_boom_0.png': 资_90, './sonic_boom_1.png': 资_91, './sonic_boom_10.png': 资_92, './sonic_boom_11.png': 资_93, './sonic_boom_12.png': 资_94, './sonic_boom_13.png': 资_95, './sonic_boom_14.png': 资_96, './sonic_boom_15.png': 资_97, './sonic_boom_2.png': 资_98, './sonic_boom_3.png': 资_99, './sonic_boom_4.png': 资_100, './sonic_boom_5.png': 资_101, './sonic_boom_6.png': 资_102, './sonic_boom_7.png': 资_103, './sonic_boom_8.png': 资_104, './sonic_boom_9.png': 资_105 }));
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
export type ParticleSpawn = { 种: ParticleKind; 刻: number; p: V3; v?: V3; 种子: number; 水面?: number };

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
const lerp3 = (a: V3, b: V3, f: number): V3 => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
const animFrame = (age: number, life: number, n: number) => Math.min(n - 1, Math.floor((age * (n - 1)) / life));
const SGA = 'abcdefghijklmnopqrstuvwxyz'.split('').map((c) => `sga_${c}`);

// 一颗粒子在 tick 时刻的样子；没出生或已消失返回 null
export const particleStateAt = (spawn: ParticleSpawn, tick: number): ParticleState | null => {
  const τ = tick - spawn.刻;
  if (τ < 0) return null;
  const rand = rng(spawn.种子 * 2654435761 + 97);
  const vel = spawn.v ?? [0, 0, 0];
  const age = Math.floor(τ);
  const pt = τ - age;
  switch (spawn.种) {
    case 'portal':
    case 'reverse_portal': {
      const rev = spawn.种 === 'reverse_portal';
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
      const position = lerp3(pos(Math.max(0, age - 1)), pos(age), pt);
      const half = half0 * (1 - (age + pt) / (life * 1.5));
      return { p: position, half, tex, color: [0.9 * shade, 0.3 * shade, shade], alpha: 1, translucent: true };
    }
    case 'crimson_spore': {
      const v0 = randomVelocity(rand, vel);
      const half = 0.1 * (rand() * 0.5 + 0.5) * (rand() * 0.6 + 0.6);
      const life = Math.floor(16 / (rand() * 0.8 + 0.2));
      if (age >= life) return null;
      const [prevPos, curPos] = simulateTicks([spawn.p[0], spawn.p[1], spawn.p[2] - 0.125], v0, age, 0, 1);
      return { p: lerp3(prevPos, curPos, pt), half, tex: 'generic_0', color: [0.9, 0.4, 0.5], alpha: 1, translucent: false };
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
      return { p: lerp3(prevPos, curPos, pt), half, tex: `spell_${7 - animFrame(age, life, frameCount)}`, color: [shade, 0, shade], alpha: 1, translucent: true };
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
      return { p: lerp3(at(Math.max(0, age - 1)), at(age), pt), half, tex, color: [0.9 * f0, 0.9 * f0, f0], alpha: 1, translucent: false };
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
      return { p: lerp3(prevPos, curPos, pt), half: half0 * (1 - lifeFrac * lifeFrac * 0.5), tex: 'flame', color: [1, 1, 1], alpha: 1, translucent: false };
    }
    case 'smoke': {
      const rv = randomVelocity(rand, vel);
      const v0: V3 = [rv[0] * 0.1 + vel[0], rv[1] * 0.1 + vel[1], rv[2] * 0.1 + vel[2]];
      const gray = rand() * 0.3;
      const half = 0.1 * (rand() * 0.5 + 0.5) * 2 * 0.75;
      const life = Math.max(1, Math.floor(8 / (rand() * 0.8 + 0.2)));
      if (age >= life) return null;
      const [prevPos, curPos] = simulateTicks(spawn.p, v0, age, -0.1, 0.96);
      return { p: lerp3(prevPos, curPos, pt), half, tex: `generic_${7 - animFrame(age, life, 8)}`, color: [gray, gray, gray], alpha: 1, translucent: false };
    }
    case 'poof': {
      const v0: V3 = [vel[0] + (rand() * 2 - 1) * 0.05, vel[1] + (rand() * 2 - 1) * 0.05, vel[2] + (rand() * 2 - 1) * 0.05];
      const gray = rand() * 0.3 + 0.7;
      const half = 0.1 * (rand() * rand() * 6 + 1);
      const life = Math.floor(16 / (rand() * 0.8 + 0.2)) + 2;
      if (age >= life) return null;
      const [prevPos, curPos] = simulateTicks(spawn.p, v0, age, -0.1, 0.9);
      return { p: lerp3(prevPos, curPos, pt), half, tex: `generic_${7 - animFrame(age, life, 8)}`, color: [gray, gray, gray], alpha: 1, translucent: false };
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
        if (spawn.水面 !== undefined && p[2] < spawn.水面) return null;
      }
      return { p: lerp3(prev, p, pt), half, tex, color: [1, 1, 1], alpha: 1, translucent: false };
    }
    case 'explosion':
    case 'sonic_boom': {
      const sb = spawn.种 === 'sonic_boom';
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
export const VanillaParticles: React.FC<{ spawns: ParticleSpawn[]; 秒: number; size?: number }> = ({ spawns, 秒: sec, size = 1 }) => {
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
  const rand = rng(seed * 7919 + 11);
  const gauss = () => Math.sqrt(-2 * Math.log(Math.max(1e-9, rand()))) * Math.cos(2 * Math.PI * rand());
  return Array.from({ length: 20 }, (_, i) => ({
    种: 'poof' as const,
    刻: deathTick + 20,
    p: [at[0] + width * (2 * rand() - 1), at[1] + width * (2 * rand() - 1), at[2] + height * rand()] as V3,
    v: [gauss() * 0.02, gauss() * 0.02, gauss() * 0.02] as V3,
    种子: seed * 131 + i,
  }));
};

// 实体落水（Entity.doWaterSplashEffect）：落水那一刻在 (x ± 宽, floor(脚底) + 1, y ± 宽) 放 splash，个数是 float 下 i < 1 + 宽 × 20 的 i 数（宽 0.6 是 14 个），速度 = 实体速度（格/刻）。
// 同一刻还放同样多的 bubble，出生在水面以上那格就不在水里、下一刻就没了，这里不画。at：脚底中心；水面：落水那格的水面高度
export const waterSplash = (at: V3, vel: V3, tick: number, width: number, 水面: number, seed: number): ParticleSpawn[] => {
  const rand = rng(seed * 6271 + 3);
  const z = Math.floor(at[2]) + 1;
  return Array.from({ length: Math.ceil(1 + Math.fround(width) * 20) }, (_, i) => ({
    种: 'splash' as const,
    刻: tick,
    p: [at[0] + (rand() * 2 - 1) * width, at[1] + (rand() * 2 - 1) * width, z] as V3,
    v: vel,
    种子: seed * 389 + i,
    水面,
  }));
};

// ServerLevel.sendParticles(类型, x,y,z, 数量, dx,dy,dz, 速度)：数量 > 0 时客户端每颗 位置 = 中心 + 高斯×(dx,dy,dz)，速度 = 高斯×速度
// （ClientPacketListener.handleParticleEvent）。场景坐标：dx、dy 是水平两个方向，dz 是竖直
export const serverSendParticles = (kind: ParticleKind, tick: number, at: V3, count: number, spread: V3, speed: number, seed: number): ParticleSpawn[] => {
  const rand = rng(seed * 104729 + 5);
  const gauss = () => Math.sqrt(-2 * Math.log(Math.max(1e-9, rand()))) * Math.cos(2 * Math.PI * rand());
  return Array.from({ length: count }, (_, i) => ({
    种: kind,
    刻: tick,
    p: [at[0] + gauss() * spread[0], at[1] + gauss() * spread[1], at[2] + gauss() * spread[2]] as V3,
    v: [gauss() * speed, gauss() * speed, gauss() * speed] as V3,
    种子: seed * 977 + i,
  }));
};
