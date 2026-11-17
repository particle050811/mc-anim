// 原版粒子逐刻状态：守确定性、出生前和寿命后看不见、几种放法的个数。
import { describe, expect, it } from 'vitest';
import { deathPoof, particleStateAt, serverSendParticles, visibleVanillaParticles, waterSplash, type ParticleKind, type ParticleSpawn } from './原版粒子状态.ts';

const kinds: ParticleKind[] = ['portal', 'reverse_portal', 'crimson_spore', 'witch', 'enchant', 'flame', 'smoke', 'poof', 'explosion', 'sonic_boom', 'splash'];

describe('原版粒子逐刻状态', () => {
  it('同一颗粒子、同一刻，算两次一样', () => {
    for (const kind of kinds) {
      const spawn: ParticleSpawn = { kind, 刻: 3, p: [1, 2, 3], v: [0.1, 0, 0.05], seed: 17 };
      expect(particleStateAt(spawn, 7.25)).toEqual(particleStateAt({ ...spawn }, 7.25));
    }
  });
  it('出生前看不见，出生那一刻在出生点附近，几十刻后都没了', () => {
    for (const kind of kinds) {
      const spawn: ParticleSpawn = { kind, 刻: 10, p: [0, 0, 0], seed: 5 };
      expect(particleStateAt(spawn, 9.99)).toBeNull();
      const born = particleStateAt(spawn, 10);
      expect(born).not.toBeNull();
      expect(Math.hypot(...born!.p)).toBeLessThan(1.5);
      expect(particleStateAt(spawn, 10 + 200)).toBeNull();
    }
  });
  it('splash 落到水面以下就消失', () => {
    const dry: ParticleSpawn = { kind: 'splash', 刻: 0, p: [0, 0, 1], seed: 2 };
    const wet: ParticleSpawn = { ...dry, waterLevel: 0.999 };
    const aliveTicks = (spawn: ParticleSpawn) => Array.from({ length: 41 }, (_, k) => particleStateAt(spawn, k)).filter((s) => s !== null);
    const alive = aliveTicks(wet);
    for (const s of alive) expect(s.p[2]).toBeGreaterThanOrEqual(0.999);
    expect(alive.length).toBeLessThan(aliveTicks(dry).length);
  });
  it('一批：按出生表顺序分不透明、半透明，没出生的不算', () => {
    const spawns: ParticleSpawn[] = [
      { kind: 'portal', 刻: 0, p: [0, 0, 0], seed: 1 },
      { kind: 'poof', 刻: 0, p: [0, 0, 0], seed: 2 },
      { kind: 'witch', 刻: 0, p: [0, 0, 0], seed: 3 },
      { kind: 'poof', 刻: 50, p: [0, 0, 0], seed: 4 },
    ];
    const { opaque, translucent } = visibleVanillaParticles(spawns, 1.5);
    expect(opaque).toHaveLength(1);
    expect(translucent).toHaveLength(2);
    expect(translucent.map((s) => s.tex.startsWith('spell_') || s.tex.startsWith('generic_'))).toEqual([true, true]);
    for (const s of [...opaque, ...translucent]) expect(s.half).toBeGreaterThan(0);
  });
  it('放法：死亡 20 个 poof 在死后第 20 刻；宽 0.6 落水 14 个 splash；sendParticles 给几个出几个；同种子同结果', () => {
    const poofs = deathPoof([0, 0, 0], 0.6, 1.8, 100, 9);
    expect(poofs).toHaveLength(20);
    expect(poofs.every((s) => s.kind === 'poof' && s.刻 === 120)).toBe(true);
    expect(deathPoof([0, 0, 0], 0.6, 1.8, 100, 9)).toEqual(poofs);
    expect(waterSplash([0, 0, 0.2], [0, 0, -0.5], 0, 0.6, 0.9, 1)).toHaveLength(14);
    expect(serverSendParticles('smoke', 0, [0, 0, 0], 7, [0.5, 0.5, 0.5], 0.1, 3)).toHaveLength(7);
  });
});
