import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { 机位, 做机位相机, 算正交取景, 设正交相机, type 朝向, type 透视机位参数 } from './机位.tsx';
import { 调色矩阵 } from './调子.ts';

const 画布状态 = vi.hoisted(() => ({
  camera: null as THREE.Camera | null,
  size: { width: 1280, height: 720 },
  viewport: { dpr: 2 },
}));
vi.mock('@react-three/fiber', () => ({ useThree: (取: (s: typeof 画布状态) => unknown) => 取(画布状态) }));

// 场景坐标的贴图像素网格点（x 东、y 北、z 上，k/16 格）投到画布上，应该都落在整数像素上
const 投 = (cam: THREE.Camera, [x, y, z]: number[], 宽: number, 高: number) => {
  const v = new THREE.Vector3(x, z, -y).project(cam);
  return [((v.x + 1) / 2) * 宽, ((1 - v.y) / 2) * 高];
};
const 是整数 = (v: number) => Math.abs(v - Math.round(v)) < 1e-4;

describe('正交像素机位', () => {
  for (const 朝 of ['北', '南', '东', '西'] as 朝向[])
    for (const [N, 顶面, dpr] of [[6, 2, 2], [6, 0, 2], [8, 4, 1], [6, 4, 2], [6, 2, 1]] as const)
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

  it('N、顶面、画布宽高是奇数就报错', () => {
    expect(() => 算正交取景({ 种: '正交', 看: [0, 0, 0], 朝: '北', N: 5 }, 1280, 720, 2)).toThrow();
    expect(() => 算正交取景({ 种: '正交', 看: [0, 0, 0], 朝: '北', N: 6, 顶面: 3 }, 1280, 720, 2)).toThrow();
    expect(() => 算正交取景({ 种: '正交', 看: [0, 0, 0], 朝: '北', N: 6 }, 1281, 720, 2)).toThrow();
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

describe('透视机位的宽高比', () => {
  const 机 = { 种: '透视', 眼: [0, -6, 1], 看: [0, -5, 1], 视角: 50 } satisfies 透视机位参数;
  const 比 = (c: THREE.Camera) => (c as THREE.PerspectiveCamera).aspect;
  it('不给按画布宽高算，给了用给的（屋后远景按上一帧的画布高算）', () => {
    expect(比(做机位相机(机, 1280, 720, 1))).toBeCloseTo(1280 / 720);
    expect(比(做机位相机({ ...机, 宽高比: 1280 / 1000 }, 1280, 720, 1))).toBeCloseTo(1.28);
  });
});

describe('显式宽高比不依赖上次渲染的画布尺寸', () => {
  const 参数 = { 种: '透视', 眼: [0, -6, 1], 看: [0, -5, 1], 视角: 50, 宽高比: 1280 / 1000 } satisfies 透视机位参数;
  it('旧 size 不改变投影矩阵，和画布外的投影相机一致', () => {
    const 期望 = 做机位相机(参数, 1280, 900, 2);
    for (const height of [720, 1000, 900]) {
      画布状态.size = { width: 1280, height };
      画布状态.camera = new THREE.PerspectiveCamera();
      机位({ 参数 });
      expect(画布状态.camera.projectionMatrix.elements).toEqual(期望.projectionMatrix.elements);
      expect(画布状态.camera.matrixWorld.elements).toEqual(期望.matrixWorld.elements);
    }
  });
  it('不给宽高比时保留既有的尺寸跟随', () => {
    const { 宽高比: _, ...默认参数 } = 参数;
    for (const height of [720, 1000]) {
      画布状态.size = { width: 1280, height };
      画布状态.camera = new THREE.PerspectiveCamera();
      机位({ 参数: 默认参数 });
      const 期望 = 做机位相机(默认参数, 1280, height, 2);
      expect(画布状态.camera.projectionMatrix.elements).toEqual(期望.projectionMatrix.elements);
    }
  });
});
