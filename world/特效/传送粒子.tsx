// 传送粒子：游戏原版的 portal 粒子（下界传送门、末影人瞬移、暮色传送门方块冒的那种紫色小方点），参数照 1.20.1 的 PortalParticle：
// - 贴图从 generic_0～7 里随机取一张（不播动画），颜色 = (0.9, 0.3, 1.0) × 随机亮度 0.4～1；半边长 0.05～0.07 格，出生后由小变大；
// - 寿命 40～49 刻；位置 = 出生点 + 偏移 × (1 + t − 2t²) + 往上 (1 − t)（t = 已过寿命的比例）：
//   先在出生点外面一点（偏移那么远、高 1 格）出现，往外荡一下再收回出生点——看上去是被吸进去的。
// 出生点、偏移按两种放法：
// - body：末影人瞬移那样，出生点在身体碰撞箱里随机，偏移水平 ±1、往下 0～1 格，一团紫点绕着人往身上收；
// - portal：暮色传送门方块（TFPortalBlock.animateTick），出生点在门的顶面随机，偏移水平 ±0.25、往上 0～1 格，紫点从门上方落回门里。
// 粒子是始终朝向镜头的面片（sprite），不受光照、不受雾。时间单位：秒；游戏 1 刻 = 1/20 秒。
// 参考视频画面小，原版的大小（宽 0.1～0.14 格）在远一点的机位里只剩一两个像素，用 size 整体放大。
// 跟着人飞的粒子（原版没有，参考视频里为了交代"人带着紫光从门里冲出来"加的）：粒子源沿 path 移动，每颗粒子出生时
// 带上那一刻人的速度（vel），按每刻 0.8 的阻力很快慢下来——跟着人冲出去一小段，落在后面收拢、散掉。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { rng, V3 } from '../../engine/model/parts.tsx';
import { pngDir } from '../../engine/model/贴图.ts';

const particlePngs = pngDir(import.meta.webpackContext('./粒子.贴图', { regExp: /\.png$/ }));
const matCache = new Map<string, THREE.SpriteMaterial>();
const spriteMat = (sprite: number, bright: number) => {
  const brightLevel = Math.round(bright * 10) / 10;
  const key = `${sprite}|${brightLevel}`;
  let material = matCache.get(key);
  if (!material) {
    const t = particlePngs[`generic_${sprite}`];
    const px = new Uint8Array(t.px.length);
    // Sprite 的贴图 v=0 在下，像素按行倒过来存
    for (let y = 0; y < t.h; y++) px.set(t.px.subarray(y * t.w * 4, (y + 1) * t.w * 4), (t.h - 1 - y) * t.w * 4);
    const tex = new THREE.DataTexture(px, t.w, t.h, THREE.RGBAFormat);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    const color = new THREE.Color().setRGB(0.9 * brightLevel, 0.3 * brightLevel, brightLevel, THREE.SRGBColorSpace);
    material = new THREE.SpriteMaterial({ map: tex, color, transparent: true, alphaTest: 0.05, depthWrite: false, fog: false, toneMapped: false });
    matCache.set(key, material);
  }
  return material;
};

type SpawnedParticle = { born: number; life: number; start: V3; off: V3; carry: V3; half: number; sprite: number; bright: number };
const DRAG = 0.8;

// 一个粒子源：kind 见文件开头；at 是脚底中心（body）或门顶面中心（portal）；w、h 是碰撞箱宽高（portal 时 w 是门的边长，h 不用）；
// 在 t0～t1 秒之间每刻放 rate 个（可以是小数，按累计取整）；life 是寿命倍数（默认 1 = 原版的 2～2.5 秒，镜头短时调小，收拢得更快）；
// size 是这个源的粒子大小倍数（再乘上组件的 size）；path、vel：粒子源跟着人动时，从 t0 起每一刻的脚底位置（代替 at）和速度（格/刻）
export type PortalEmitter = {
  kind: 'body' | 'portal'; at: V3; w: number; h?: number; t0: number; t1: number; rate: number; seed: number; life?: number; size?: number;
  path?: number[][]; vel?: number[][];
};

const spawn = (emitter: PortalEmitter): SpawnedParticle[] => {
  const rand = rng(emitter.seed * 7907 + 3);
  const out: SpawnedParticle[] = [];
  const ticks = Math.max(0, Math.round((emitter.t1 - emitter.t0) * 20));
  let acc = 0;
  for (let k = 0; k <= ticks; k++) {
    acc += emitter.rate;
    while (acc >= 1) {
      acc -= 1;
      const [x, y, z] = emitter.path ? emitter.path[Math.min(k, emitter.path.length - 1)] : emitter.at;
      const start: V3 =
        emitter.kind === 'body'
          ? [x + (rand() - 0.5) * emitter.w, y + (rand() - 0.5) * emitter.w, z + rand() * (emitter.h ?? 1.8) - 0.25]
          : [x + (rand() - 0.5) * emitter.w, y + (rand() - 0.5) * emitter.w, z];
      const off: V3 = emitter.kind === 'body' ? [(rand() - 0.5) * 2, (rand() - 0.5) * 2, -rand()] : [(rand() - 0.5) * 0.5, (rand() - 0.5) * 0.5, rand()];
      out.push({
        born: emitter.t0 * 20 + k + rand(),
        life: (40 + Math.floor(rand() * 10)) * (emitter.life ?? 1),
        start,
        off,
        carry: (emitter.vel ? emitter.vel[Math.min(k, emitter.vel.length - 1)] : [0, 0, 0]) as V3,
        half: 0.1 * (rand() * 0.2 + 0.5) * (emitter.size ?? 1),
        sprite: Math.floor(rand() * 8),
        bright: rand() * 0.6 + 0.4,
      });
    }
  }
  return out;
};

// sec：当前时间（秒，和各粒子源的 t0、t1 同一个时钟）；size：大小倍数
export const PortalParticles: React.FC<{ emitters: PortalEmitter[]; sec: number; size?: number }> = ({ emitters, sec, size = 1 }) => {
  const parts = useMemo(() => emitters.flatMap(spawn), [JSON.stringify(emitters)]);
  const tick = sec * 20;
  return (
    <>
      {parts.map((particle, i) => {
        const age = tick - particle.born;
        if (age < 0 || age >= particle.life) return null;
        const t = age / particle.life;
        const k = 1 + t - 2 * t * t;
        const grow = 1 - (1 - t) ** 2;
        // 原版的大小随寿命是 1 − (1 − t)² 从 0 长到满；刚出生那几帧太小看不见，留一个底
        const spriteSize = particle.half * 2 * size * Math.max(0.35, grow);
        const carryDist = (1 - DRAG ** age) / (1 - DRAG); // 带着出生时的速度滑出去的距离（以刻计）
        return (
          <sprite
            key={i}
            position={[
              particle.start[0] + particle.off[0] * k + particle.carry[0] * carryDist,
              particle.start[1] + particle.off[1] * k + particle.carry[1] * carryDist,
              particle.start[2] + particle.off[2] * k + (1 - t) + particle.carry[2] * carryDist,
            ]}
            scale={[spriteSize, spriteSize, 1]}
            material={spriteMat(particle.sprite, particle.bright)}
          />
        );
      })}
    </>
  );
};
