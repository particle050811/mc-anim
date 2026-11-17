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
import { type Png, pngDir } from '../../engine/model/贴图.ts';
import { ParticleQuads } from './粒子面片.tsx';
import type { Particle } from './粒子物理.ts';
import { type ParticleSpawn, type ParticleState, visibleVanillaParticles } from './原版粒子状态.ts';
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

// 逐刻状态和放法在纯模块 原版粒子状态.ts，这里原样转出，老代码照旧从这里引
export { deathPoof, particleStateAt, serverSendParticles, waterSplash, type ParticleKind, type ParticleSpawn } from './原版粒子状态.ts';

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

// 画一批粒子。秒：当前时间（和出生的 刻 同一个钟，秒×20 = 刻）；size：整体放大
export const VanillaParticles: React.FC<{ spawns: ParticleSpawn[]; sec: number; size?: number }> = ({ spawns, sec: sec, size = 1 }) => {
  const tick = sec * 20;
  const { op, tr } = useMemo(() => {
    const { opaque, translucent } = visibleVanillaParticles(spawns, tick);
    const toQuad = (state: ParticleState): Particle => ({ p: state.p, half: state.half * size, uv: ATLAS.uv[state.tex], color: state.color, alpha: state.alpha });
    return { op: opaque.map(toQuad), tr: translucent.map(toQuad) };
  }, [spawns, tick, size]);
  return (
    <>
      <ParticleQuads tex={ATLAS.tex} items={op} />
      <ParticleQuads tex={ATLAS.tex} items={tr} translucent depthWrite={false} />
    </>
  );
};
