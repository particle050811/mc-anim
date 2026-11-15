// 披风布料：用一块小的假披风（3 列 × 4 行、没有碰撞三角形）验移植的规则，不读资产。
import { describe, expect, it } from 'vitest';
import { buildCape, settleCape, capeVertexTable, type CapeData } from './神灵金披风.ts';

const fakeCape = (collisions: number[] = []): CapeData => {
  const restPositions: number[] = [];
  for (let row = 0; row < 4; row++) for (let c = 0; c < 3; c++) restPositions.push((c - 1) * 3, row * 2, 4 + row * 0.5);
  return { 列: 3, 行: 4, 接缝行: 2, 静止: restPositions, 正面UV: [[0, 0, 1, 0, 0, 0.5, 1, 0.5], [0, 0.5, 1, 0.5, 0, 1, 1, 1]], 背面UV: [[1, 0, 0, 0, 1, 0.5, 0, 0.5], [1, 0.5, 0, 0.5, 1, 1, 0, 1]], 碰撞: collisions };
};

describe('神灵金披风', () => {
  it('第 0 行钉住不动，站着不动会跑到稳', () => {
    const d = fakeCape();
    const cloth = buildCape(d);
    for (let i = 0; i < 400; i++) cloth.刻();
    const before = [...cloth.位置()];
    cloth.刻();
    const laterPos = cloth.位置();
    expect(laterPos.slice(0, 9)).toEqual(d.静止.slice(0, 9));
    expect(Math.max(...laterPos.map((v, i) => Math.abs(v - before[i]!)))).toBeLessThan(1e-3);
    expect(settleCape(d)).toEqual(before);
  });

  it('往后的加速度把下摆往后带，越靠下带得越多', () => {
    const cloth = buildCape(fakeCape());
    cloth.刻([0, 0, 1]);
    const p = cloth.位置();
    const z = (row: number) => p[(row * 3 + 1) * 3 + 2]! - (4 + row * 0.5);
    expect(z(0)).toBe(0);
    expect(z(3)).toBeGreaterThan(z(1));
    expect(z(1)).toBeGreaterThan(0);
  });

  it('碰撞三角形把落在它投影里的节点往后顶出 0.15', () => {
    // 一块盖住整幅披风、z = 9 的三角形
    const d = fakeCape([-100, -100, 9, 100, -100, 9, 0, 200, 9]);
    expect(buildCape(d).静止.every((v, i) => i % 3 !== 2 || Math.abs(v - 9.15) < 1e-9)).toBe(true);
  });

  it('每格出背面、正面两个面，uv 在接缝行换幅', () => {
    const d = fakeCape();
    const vertexTable = capeVertexTable(d, d.静止);
    expect(vertexTable.length).toBe(3 * 2 * 2 * 4 * 8);
    // 第一格背面的第一个顶点：节点 0，背面UV 第 0 幅的左上角；法线朝后（+z）
    expect(vertexTable.slice(3, 5)).toEqual([1, 0]);
    expect(vertexTable[7]).toBeGreaterThan(0);
    // 第 2 行起（第 5 格）用第 1 幅：节点 6 在这一幅的最上沿
    const fifthCellOffset = 4 * 2 * 4 * 8;
    expect(vertexTable.slice(fifthCellOffset + 3, fifthCellOffset + 5)).toEqual([1, 0.5]);
  });
});
