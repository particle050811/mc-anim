import { describe, expect, it } from 'vitest';
import { mulMatVec, skyDomeRadius, skyMatrix, OldRandom, moonVertices, moonPhaseCell, vanillaStars } from './天球.ts';
import { skyAngle, sunDirection } from './环境.ts';

describe('旧随机（java.util.Random）', () => {
  it('和 Java 逐位一样：new Random(10842) 的前几个 nextFloat、nextDouble（zulu-8 javac 跑的）', () => {
    const r = new OldRandom(10842);
    expect(Math.fround(r.nextFloat())).toBe(Math.fround(0.12987703));
    expect(Math.fround(r.nextFloat())).toBe(Math.fround(0.037620723));
    expect(Math.fround(r.nextFloat())).toBe(Math.fround(0.8834354));
    expect(Math.fround(r.nextFloat())).toBe(Math.fround(0.9509856));
    expect(r.nextDouble()).toBe(0.3331155735128949);
  });
});

describe('原版星星', () => {
  const v = vanillaStars();
  const starCount = v.length / 12;
  it('撒 1500 次、只留球壳里的，颗数固定，两次一样', () => {
    expect(v.length % 12).toBe(0);
    expect(starCount).toBeGreaterThan(700);
    expect(starCount).toBeLessThan(1500);
    expect(vanillaStars()).toEqual(v);
  });
  it('每颗是 100 格外、和视线垂直的方片，边长 0.3～0.5', () => {
    for (let i = 0; i < starCount; i++) {
      const p = [0, 1, 2, 3].map((j) => [v[i * 12 + j * 3]!, v[i * 12 + j * 3 + 1]!, v[i * 12 + j * 3 + 2]!]);
      const center = [0, 1, 2].map((k) => (p[0]![k]! + p[2]![k]!) / 2);
      expect(Math.hypot(...center)).toBeCloseTo(skyDomeRadius, 6);
      const edgeLen = Math.hypot(...[0, 1, 2].map((k) => p[1]![k]! - p[0]![k]!));
      expect(edgeLen).toBeGreaterThanOrEqual(0.3 - 1e-6);
      expect(edgeLen).toBeLessThanOrEqual(0.5 + 1e-6);
      const edgeDirs = [0, 1, 2].map((k) => p[1]![k]! - p[0]![k]!);
      expect(Math.abs(edgeDirs[0]! * center[0]! + edgeDirs[1]! * center[1]! + edgeDirs[2]! * center[2]!)).toBeLessThan(1e-6);
    }
  });
});

describe('月亮', () => {
  it('月相 → moon_phases.png 的格：上排 0～3，下排 4～7', () => {
    expect(moonPhaseCell(0)).toEqual([0, 0, 0.25, 0.5]);
    expect(moonPhaseCell(3)).toEqual([0.75, 0, 1, 0.5]);
    expect(moonPhaseCell(4)).toEqual([0, 0.5, 0.25, 1]);
    expect(moonPhaseCell(7)).toEqual([0.75, 0.5, 1, 1]);
  });
  it('方片在太阳对面（游戏 −Y 100 格），边长 40', () => {
    const q = moonVertices(0);
    for (const p of q) expect(p[1]).toBe(-skyDomeRadius);
    expect(Math.abs(q[0]![0] - q[1]![0])).toBe(40);
  });
});

describe('天球矩阵', () => {
  it('游戏 +Y 转出来就是 太阳方向（含轨道倾角）', () => {
    for (const t of [0, 3000, 6000, 12000, 13800, 18000, 22500])
      for (const tilt of [0, 20, -35]) {
        const angle = skyAngle(t);
        const sunDir = sunDirection(angle, tilt);
        const rotatedUp = mulMatVec(skyMatrix(angle, tilt), [0, 1, 0]);
        for (let k = 0; k < 3; k++) expect(rotatedUp[k]).toBeCloseTo(sunDir[k]!, 12);
      }
  });
  it('是转动：正交、行列式 1（贴图不镜像）', () => {
    const m = skyMatrix(0.37, 15);
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) expect(m[i]![0] * m[j]![0] + m[i]![1] * m[j]![1] + m[i]![2] * m[j]![2]).toBeCloseTo(i === j ? 1 : 0, 12);
    const det =
      m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    expect(det).toBeCloseTo(1, 12);
  });
  it('午夜月亮在头顶', () => {
    const angle = skyAngle(18000);
    const moonDir = mulMatVec(skyMatrix(angle), [0, -1, 0]);
    expect(moonDir[2]).toBeCloseTo(1, 6);
  });
});
