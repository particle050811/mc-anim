// 弯折（肘、膝的几何）：不弯时一个三角都不动；弯了以后上半节、下半节、外侧的桥合起来还是一个封闭的壳（不露缝），上半节不越过关节。
import { describe, expect, it } from 'vitest';
import { type 三角, 弯折, 顶点表转三角 } from './弯折.ts';

/** 一根腿那样的方盒（x ±2、y 0～12、z ±2）的顶点表：六个面，每面四个顶点、法线朝外 */
const 方盒 = (): number[] => {
  const 面 = (n: number[], 角们: number[][]) => 角们.flatMap((p) => [...p, 0, 0, ...n]);
  const [a, b] = [
    [-2, 0, -2],
    [2, 12, 2],
  ];
  const 点 = (i: number, j: number, k: number) => [[a, b][i]![0]!, [a, b][j]![1]!, [a, b][k]![2]!];
  return [
    ...面([-1, 0, 0], [点(0, 0, 0), 点(0, 1, 0), 点(0, 1, 1), 点(0, 0, 1)]),
    ...面([1, 0, 0], [点(1, 0, 0), 点(1, 0, 1), 点(1, 1, 1), 点(1, 1, 0)]),
    ...面([0, -1, 0], [点(0, 0, 0), 点(0, 0, 1), 点(1, 0, 1), 点(1, 0, 0)]),
    ...面([0, 1, 0], [点(0, 1, 0), 点(1, 1, 0), 点(1, 1, 1), 点(0, 1, 1)]),
    ...面([0, 0, -1], [点(0, 0, 0), 点(1, 0, 0), 点(1, 1, 0), 点(0, 1, 0)]),
    ...面([0, 0, 1], [点(0, 0, 1), 点(0, 1, 1), 点(1, 1, 1), 点(1, 0, 1)]),
  ];
};

/** 壳上没配上对的边有几条（每条边该被偶数个三角用到）。位置四舍五入到 1e-4 像素再比。
 *  斜接的缝两边各按自己的三角切，缝上的顶点对不齐但都在同一条线上（T 形接头，不是缝）：先把没配上的边在落在它中间的顶点处断开再数 */
const 开口边 = (三角们: readonly 三角[]) => {
  type 边 = readonly [readonly number[], readonly number[]];
  const 键 = (p: readonly number[]) => p.map((v) => Math.round(v * 1e4)).join(',');
  const 单 = (边们: readonly 边[]) => {
    const 数 = new Map<string, { 边: 边; n: number }>();
    for (const 边 of 边们) {
      const [甲, 乙] = [键(边[0]), 键(边[1])];
      if (甲 === 乙) continue;
      const k = 甲 < 乙 ? `${甲}|${乙}` : `${乙}|${甲}`;
      数.set(k, { 边, n: (数.get(k)?.n ?? 0) + 1 });
    }
    return [...数.values()].filter((e) => e.n % 2).map((e) => e.边);
  };
  const 剩 = 单(三角们.flatMap((三) => [0, 1, 2].map((i): 边 => [三[i]!.p, 三[(i + 1) % 3]!.p])));
  const 顶点 = 剩.flat();
  const 断开 = 剩.flatMap(([a, b]): 边[] => {
    const ab = b.map((v, i) => v - a[i]!);
    const 长方 = ab.reduce((和, v) => 和 + v * v, 0);
    const 中间 = 顶点
      .map((p) => ({ p, t: p.reduce((和, v, i) => 和 + (v - a[i]!) * ab[i]!, 0) / 长方 }))
      .filter(({ p, t }) => t > 1e-6 && t < 1 - 1e-6 && Math.hypot(...p.map((v, i) => v - (a[i]! + ab[i]! * t))) < 1e-4)
      .sort((x, y) => x.t - y.t)
      .map(({ p }) => p);
    const 串 = [a, ...中间, b];
    return 串.slice(1).map((p, i): 边 => [串[i]!, p]);
  });
  return 单(断开).length;
};

describe('弯折', () => {
  const 盒 = 顶点表转三角(方盒());

  it('角是 0 时原样返回', () => {
    const { 上, 下, 桥 } = 弯折(盒, { 切: 6, 铰z: 1, 角: 0 });
    expect(上).toEqual(盒);
    expect(下).toHaveLength(0);
    expect(桥).toHaveLength(0);
  });

  it.each([
    ['膝 30 度', 6, 1, 30],
    ['膝 90 度', 6, 1, 90],
    ['膝 120 度', 6, 1, 120],
    ['肘 90 度（往前折）', 4, -1, -90],
    ['铰链在正中 60 度', 6, 0, 60],
  ])('%s：合起来是封闭的壳，上半节不过关节', (_名, 切, 铰z, 度) => {
    const { 上, 下, 桥 } = 弯折(盒, { 切, 铰z, 角: (度 * Math.PI) / 180 });
    expect(开口边(盒)).toBe(0);
    expect(开口边([...上, ...下, ...桥])).toBe(0);
    expect(桥.length).toBeGreaterThan(0);
    for (const 三 of 上) for (const v of 三) expect(v.p[1]!).toBeLessThanOrEqual(切 + 1e-6);
  });

  it('下半节绕铰链转过去：脚底中心到了该到的地方', () => {
    const { 下 } = 弯折(盒, { 切: 6, 铰z: 1, 角: Math.PI / 2 });
    // 原来 y = 12 的脚底面转 90 度后在 z = 铰z + 6 = 7 的平面上
    const 底 = 下.filter((三) => 三.every((v) => Math.abs(v.p[2]! - 7) < 1e-6));
    expect(底.length).toBeGreaterThan(0);
    for (const 三 of 底) for (const v of 三) expect(v.n[2]!).toBeCloseTo(1, 6);
  });
});
