// 传送粒子：守个数（每刻 rate 个、按累计取整）、确定性、出生前和寿命后看不见、收回出生点。
import { describe, expect, it } from 'vitest';
import { portalParticlesAt, spawnPortalParticles, type PortalEmitter } from './传送粒子轨迹.ts';

const body: PortalEmitter = { kind: 'body', at: [0, 0, 0], w: 0.6, h: 1.8, t0: 1, t1: 2, rate: 1.5, seed: 4 };

describe('传送粒子轨迹', () => {
  it('t0～t1 共 21 刻、每刻 1.5 个，累计取整 31 个；同种子同结果', () => {
    const parts = spawnPortalParticles(body);
    expect(parts).toHaveLength(31);
    expect(spawnPortalParticles({ ...body })).toEqual(parts);
  });
  it('出生前、寿命后都不画；寿命倍数缩短寿命', () => {
    const parts = spawnPortalParticles(body);
    expect(portalParticlesAt(parts, 19.99, 1)).toHaveLength(0);
    expect(portalParticlesAt(parts, 2 * 20 + 50, 1)).toHaveLength(0);
    const short = spawnPortalParticles({ ...body, life: 0.25 });
    expect(portalParticlesAt(short, 2 * 20 + 15, 1)).toHaveLength(0);
  });
  it('不跟人飞时，快到寿命时收回出生点（偏移和上飘都趋于 0）', () => {
    const parts = spawnPortalParticles({ ...body, rate: 1, t1: 1 });
    const q = parts[0]!;
    const [nearEnd] = portalParticlesAt(parts, q.born + q.life - 1e-6, 1);
    expect(nearEnd!.pos[0]).toBeCloseTo(q.start[0], 4);
    expect(nearEnd!.pos[1]).toBeCloseTo(q.start[1], 4);
    expect(nearEnd!.pos[2]).toBeCloseTo(q.start[2], 4);
  });
  it('大小有底（0.35 倍满大小），乘组件的 size', () => {
    const parts = spawnPortalParticles(body);
    const q = parts[0]!;
    const [a] = portalParticlesAt(parts, q.born, 1);
    const [b] = portalParticlesAt(parts, q.born, 3);
    expect(a!.size).toBeCloseTo(q.half * 2 * 0.35, 12);
    expect(b!.size).toBeCloseTo(a!.size * 3, 12);
  });
});
