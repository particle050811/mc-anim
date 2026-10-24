import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { 算正交取景, 设正交相机, type 朝向 } from './机位.tsx';
import { 调色矩阵 } from './调子.ts';

// 场景坐标的贴图像素网格点（x 东、y 北、z 上，k/16 格）投到画布上，应该都落在整数像素上
const 投 = (cam: THREE.Camera, [x, y, z]: number[], 宽: number, 高: number) => {
  const v = new THREE.Vector3(x, z, -y).project(cam);
  return [((v.x + 1) / 2) * 宽, ((1 - v.y) / 2) * 高];
};
const 是整数 = (v: number) => Math.abs(v - Math.round(v)) < 1e-4;

describe('正交像素机位', () => {
  for (const 朝 of ['北', '南', '东', '西'] as 朝向[])
    for (const [N, 顶面, dpr] of [[6, 2, 2], [6, 0, 2], [8, 4, 1], [6, 3, 2]] as const)
      it(`朝${朝} N=${N} 顶面=${顶面} dpr=${dpr}：贴图像素的边落在整数像素上`, () => {
        const 看: [number, number, number] = [11.37, -10.52, 3.219];
        const q = 算正交取景({ 种: '正交', 看, 朝, N, 顶面 }, 1280, 720, dpr);
        const cam = new THREE.OrthographicCamera();
        设正交相机(cam, q);
        const [宽, 高] = [1280 * dpr, 720 * dpr];
        for (const p of [[11, -10, 3], [11 + 3 / 16, -10 - 5 / 16, 2 + 7 / 16], [4, -14, 0], [15.5, -6.25, 5.125]]) {
          const [px, py] = 投(cam, p, 宽, 高);
          expect(是整数(px) && 是整数(py)).toBe(true);
        }
        // 正面一个贴图像素 = N 个成片像素（换算到画布像素）
        const 横 = 朝 === '北' || 朝 === '南' ? [1 / 16, 0, 0] : [0, 1 / 16, 0];
        const [a] = 投(cam, [11, -10, 3], 宽, 高);
        const [b] = 投(cam, [11 + 横[0]!, -10 + 横[1]!, 3], 宽, 高);
        expect(Math.abs(b - a)).toBeCloseTo((N * dpr) / 2, 6);
        // 顶面往里一个贴图像素，画面上升 顶面 个成片像素
        const 里 = { 北: [0, 1 / 16], 南: [0, -1 / 16], 东: [1 / 16, 0], 西: [-1 / 16, 0] }[朝];
        const [, c] = 投(cam, [11, -10, 3], 宽, 高);
        const [, d] = 投(cam, [11 + 里[0]!, -10 + 里[1]!, 3], 宽, 高);
        expect(c - d).toBeCloseTo((顶面 * dpr) / 2, 6);
      });

  it('看点最多挪半个画布像素', () => {
    const q = 算正交取景({ 种: '正交', 看: [3.01, 4.02, 5.03], 朝: '北', N: 6 }, 1280, 720, 2);
    expect(Math.abs(q.看点.x - 3.01)).toBeLessThanOrEqual(0.5 / 96 + 1e-9);
    expect(Math.abs(q.看点.y - 5.03)).toBeLessThanOrEqual(0.5 / 96 + 1e-9);
  });
});

describe('调色矩阵', () => {
  it('中性参数是单位矩阵', () => {
    const m = 调色矩阵({ 饱和: 1, 对比: 1, 乘: '#ffffff', 抬: '#000000', 暗角: 0, 颗粒: 0 });
    expect(m.map((v) => Math.round(v * 1e6) / 1e6)).toEqual([1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0]);
  });
  it('抬黑把纯黑抬到抬色、纯白不动', () => {
    const m = 调色矩阵({ 饱和: 0.5, 对比: 1, 乘: '#ffffff', 抬: '#336699', 暗角: 0, 颗粒: 0 });
    const 用 = (c: number[]) => [0, 1, 2].map((i) => m[i * 5]! * c[0]! + m[i * 5 + 1]! * c[1]! + m[i * 5 + 2]! * c[2]! + m[i * 5 + 4]!);
    expect(用([0, 0, 0]).map((v) => Math.round(v * 255))).toEqual([0x33, 0x66, 0x99]);
    expect(用([1, 1, 1]).map((v) => Math.round(v * 1e6) / 1e6)).toEqual([1, 1, 1]);
  });
});
