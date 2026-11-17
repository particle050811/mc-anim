// 传送粒子（原版 PortalParticle）的出生和逐刻位置（纯模块，不引 react、three、asset:）：参数、两种放法和跟着人飞的做法见 传送粒子.tsx 文件头。
// 出生按粒子源的 seed 一条 mulberry32 串；逐刻函数的输入是刻（秒 × 20），输出是普通数据。
import type { V3 } from '../../engine/core/坐标.ts';
import { mulberry32 } from '../../engine/core/数学.ts';

export type SpawnedParticle = { born: number; life: number; start: V3; off: V3; carry: V3; half: number; sprite: number; bright: number };
const DRAG = 0.8;

// 一个粒子源：kind 见文件开头；at 是脚底中心（body）或门顶面中心（portal）；w、h 是碰撞箱宽高（portal 时 w 是门的边长，h 不用）；
// 在 t0～t1 秒之间每刻放 rate 个（可以是小数，按累计取整）；life 是寿命倍数（默认 1 = 原版的 2～2.5 秒，镜头短时调小，收拢得更快）；
// size 是这个源的粒子大小倍数（再乘上组件的 size）；path、vel：粒子源跟着人动时，从 t0 起每一刻的脚底位置（代替 at）和速度（格/刻）
export type PortalEmitter = {
  kind: 'body' | 'portal'; at: V3; w: number; h?: number; t0: number; t1: number; rate: number; seed: number; life?: number; size?: number;
  path?: number[][]; vel?: number[][];
};

export const spawnPortalParticles = (emitter: PortalEmitter): SpawnedParticle[] => {
  const rand = mulberry32(emitter.seed * 7907 + 3);
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

// 第 tick 刻看得见的粒子：index = 在出生表里的序号，size = 画出来的边长（已乘大小倍数 size），sprite、bright 给材质
export const portalParticlesAt = (parts: SpawnedParticle[], tick: number, size: number): { index: number; pos: V3; size: number; sprite: number; bright: number }[] => {
  const out: { index: number; pos: V3; size: number; sprite: number; bright: number }[] = [];
  parts.forEach((particle, i) => {
    const age = tick - particle.born;
    if (age < 0 || age >= particle.life) return;
    const t = age / particle.life;
    const k = 1 + t - 2 * t * t;
    const grow = 1 - (1 - t) ** 2;
    // 原版的大小随寿命是 1 − (1 − t)² 从 0 长到满；刚出生那几帧太小看不见，留一个底
    const spriteSize = particle.half * 2 * size * Math.max(0.35, grow);
    const carryDist = (1 - DRAG ** age) / (1 - DRAG); // 带着出生时的速度滑出去的距离（以刻计）
    out.push({
      index: i,
      pos: [
        particle.start[0] + particle.off[0] * k + particle.carry[0] * carryDist,
        particle.start[1] + particle.off[1] * k + particle.carry[1] * carryDist,
        particle.start[2] + particle.off[2] * k + (1 - t) + particle.carry[2] * carryDist,
      ],
      size: spriteSize,
      sprite: particle.sprite,
      bright: particle.bright,
    });
  });
  return out;
};
