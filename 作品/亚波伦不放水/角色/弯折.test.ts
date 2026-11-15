// 弯折（肘、膝的几何）：不弯时一个三角都不动；弯了以后上半节、下半节、外侧的桥合起来还是一个封闭的壳（不露缝），上半节不越过关节。
import { describe, expect, it } from 'vitest';
import { type Triangle, bend, vertexTableToTriangles } from './弯折.ts';

/** 一根腿那样的方盒（x ±2、y 0～12、z ±2）的顶点表：六个面，每面四个顶点、法线朝外 */
const boxVertices = (): number[] => {
  const face = (n: number[], corners: number[][]) => corners.flatMap((p) => [...p, 0, 0, ...n]);
  const [a, b] = [
    [-2, 0, -2],
    [2, 12, 2],
  ];
  const corner = (i: number, j: number, k: number) => [[a, b][i]![0]!, [a, b][j]![1]!, [a, b][k]![2]!];
  return [
    ...face([-1, 0, 0], [corner(0, 0, 0), corner(0, 1, 0), corner(0, 1, 1), corner(0, 0, 1)]),
    ...face([1, 0, 0], [corner(1, 0, 0), corner(1, 0, 1), corner(1, 1, 1), corner(1, 1, 0)]),
    ...face([0, -1, 0], [corner(0, 0, 0), corner(0, 0, 1), corner(1, 0, 1), corner(1, 0, 0)]),
    ...face([0, 1, 0], [corner(0, 1, 0), corner(1, 1, 0), corner(1, 1, 1), corner(0, 1, 1)]),
    ...face([0, 0, -1], [corner(0, 0, 0), corner(1, 0, 0), corner(1, 1, 0), corner(0, 1, 0)]),
    ...face([0, 0, 1], [corner(0, 0, 1), corner(0, 1, 1), corner(1, 1, 1), corner(1, 0, 1)]),
  ];
};

/** 壳上没配上对的边有几条（每条边该被偶数个三角用到）。位置四舍五入到 1e-4 像素再比。
 *  斜接的缝两边各按自己的三角切，缝上的顶点对不齐但都在同一条线上（T 形接头，不是缝）：先把没配上的边在落在它中间的顶点处断开再数 */
const openEdgeCount = (triangles: readonly Triangle[]) => {
  type Edge = readonly [readonly number[], readonly number[]];
  const pointKey = (p: readonly number[]) => p.map((v) => Math.round(v * 1e4)).join(',');
  const singleEdges = (edges: readonly Edge[]) => {
    const counts = new Map<string, { edge: Edge; n: number }>();
    for (const edge of edges) {
      const [firstKey, endKey] = [pointKey(edge[0]), pointKey(edge[1])];
      if (firstKey === endKey) continue;
      const k = firstKey < endKey ? `${firstKey}|${endKey}` : `${endKey}|${firstKey}`;
      counts.set(k, { edge, n: (counts.get(k)?.n ?? 0) + 1 });
    }
    return [...counts.values()].filter((e) => e.n % 2).map((e) => e.edge);
  };
  const unpairedEdges = singleEdges(triangles.flatMap((triangle) => [0, 1, 2].map((i): Edge => [triangle[i]!.p, triangle[(i + 1) % 3]!.p])));
  const vertices = unpairedEdges.flat();
  const disconnected = unpairedEdges.flatMap(([a, b]): Edge[] => {
    const ab = b.map((v, i) => v - a[i]!);
    const lengthSq = ab.reduce((sum, v) => sum + v * v, 0);
    const middle = vertices
      .map((p) => ({ p, t: p.reduce((sum, v, i) => sum + (v - a[i]!) * ab[i]!, 0) / lengthSq }))
      .filter(({ p, t }) => t > 1e-6 && t < 1 - 1e-6 && Math.hypot(...p.map((v, i) => v - (a[i]! + ab[i]! * t))) < 1e-4)
      .sort((x, y) => x.t - y.t)
      .map(({ p }) => p);
    const polyline = [a, ...middle, b];
    return polyline.slice(1).map((p, i): Edge => [polyline[i]!, p]);
  });
  return singleEdges(disconnected).length;
};

describe('弯折', () => {
  const triangles = vertexTableToTriangles(boxVertices());

  it('角是 0 时原样返回', () => {
    const { 上: upper, 下: lower, bridge } = bend(triangles, { cut: 6, hingeZ: 1, 角: 0 });
    expect(upper).toEqual(triangles);
    expect(lower).toHaveLength(0);
    expect(bridge).toHaveLength(0);
  });

  it.each([
    ['膝 30 度', 6, 1, 30],
    ['膝 90 度', 6, 1, 90],
    ['膝 120 度', 6, 1, 120],
    ['肘 90 度（往前折）', 4, -1, -90],
    ['铰链在正中 60 度', 6, 0, 60],
  ])('%s：合起来是封闭的壳，上半节不过关节', (caseName, cut, hingeZ, angleDeg) => {
    const { 上: upper, 下: lower, bridge } = bend(triangles, { cut, hingeZ, 角: (angleDeg * Math.PI) / 180 });
    expect(openEdgeCount(triangles)).toBe(0);
    expect(openEdgeCount([...upper, ...lower, ...bridge])).toBe(0);
    expect(bridge.length).toBeGreaterThan(0);
    for (const triangle of upper) for (const v of triangle) expect(v.p[1]!).toBeLessThanOrEqual(cut + 1e-6);
  });

  it('下半节绕铰链转过去：脚底中心到了该到的地方', () => {
    const { 下: lower } = bend(triangles, { cut: 6, hingeZ: 1, 角: Math.PI / 2 });
    // 原来 y = 12 的脚底面转 90 度后在 z = 铰z + 6 = 7 的平面上
    const bottomTris = lower.filter((triangle) => triangle.every((v) => Math.abs(v.p[2]! - 7) < 1e-6));
    expect(bottomTris.length).toBeGreaterThan(0);
    for (const triangle of bottomTris) for (const v of triangle) expect(v.n[2]!).toBeCloseTo(1, 6);
  });
});
