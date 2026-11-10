// 披风布料：用一块小的假披风（3 列 × 4 行、没有碰撞三角形）验移植的规则，不读资产。
import { describe, expect, it } from 'vitest';
import { 建披风, 披风站定, 披风顶点表, type 披风数据 } from './神灵金披风.ts';

const 假披风 = (碰撞: number[] = []): 披风数据 => {
  const 静止: number[] = [];
  for (let 行 = 0; 行 < 4; 行++) for (let c = 0; c < 3; c++) 静止.push((c - 1) * 3, 行 * 2, 4 + 行 * 0.5);
  return { 列: 3, 行: 4, 接缝行: 2, 静止, 正面UV: [[0, 0, 1, 0, 0, 0.5, 1, 0.5], [0, 0.5, 1, 0.5, 0, 1, 1, 1]], 背面UV: [[1, 0, 0, 0, 1, 0.5, 0, 0.5], [1, 0.5, 0, 0.5, 1, 1, 0, 1]], 碰撞 };
};

describe('神灵金披风', () => {
  it('第 0 行钉住不动，站着不动会跑到稳', () => {
    const d = 假披风();
    const 布 = 建披风(d);
    for (let i = 0; i < 400; i++) 布.刻();
    const 前 = [...布.位置()];
    布.刻();
    const 后 = 布.位置();
    expect(后.slice(0, 9)).toEqual(d.静止.slice(0, 9));
    expect(Math.max(...后.map((v, i) => Math.abs(v - 前[i]!)))).toBeLessThan(1e-3);
    expect(披风站定(d)).toEqual(前);
  });

  it('往后的加速度把下摆往后带，越靠下带得越多', () => {
    const 布 = 建披风(假披风());
    布.刻([0, 0, 1]);
    const p = 布.位置();
    const z = (行: number) => p[(行 * 3 + 1) * 3 + 2]! - (4 + 行 * 0.5);
    expect(z(0)).toBe(0);
    expect(z(3)).toBeGreaterThan(z(1));
    expect(z(1)).toBeGreaterThan(0);
  });

  it('碰撞三角形把落在它投影里的节点往后顶出 0.15', () => {
    // 一块盖住整幅披风、z = 9 的三角形
    const d = 假披风([-100, -100, 9, 100, -100, 9, 0, 200, 9]);
    expect(建披风(d).静止.every((v, i) => i % 3 !== 2 || Math.abs(v - 9.15) < 1e-9)).toBe(true);
  });

  it('每格出背面、正面两个面，uv 在接缝行换幅', () => {
    const d = 假披风();
    const 表 = 披风顶点表(d, d.静止);
    expect(表.length).toBe(3 * 2 * 2 * 4 * 8);
    // 第一格背面的第一个顶点：节点 0，背面UV 第 0 幅的左上角；法线朝后（+z）
    expect(表.slice(3, 5)).toEqual([1, 0]);
    expect(表[7]).toBeGreaterThan(0);
    // 第 2 行起（第 5 格）用第 1 幅：节点 6 在这一幅的最上沿
    const 第五格 = 4 * 2 * 4 * 8;
    expect(表.slice(第五格 + 3, 第五格 + 5)).toEqual([1, 0.5]);
  });
});
