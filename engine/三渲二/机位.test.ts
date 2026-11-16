import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { CameraRig, makeRigCamera, computeOrthoFraming, setOrthoCamera, type Facing, type PerspectiveRigParams } from './机位.tsx';
import { gradeMatrix } from './调子.ts';

const canvasState = vi.hoisted(() => ({
  camera: null as THREE.Camera | null,
  size: { width: 1280, height: 720 },
  viewport: { dpr: 2 },
}));
vi.mock('@react-three/fiber', () => ({ useThree: (selector: (s: typeof canvasState) => unknown) => selector(canvasState) }));

// 场景坐标的贴图像素网格点（x 东、y 北、z 上，k/16 格）投到画布上，应该都落在整数像素上
const project = (cam: THREE.Camera, [x, y, z]: number[], width: number, height: number) => {
  const v = new THREE.Vector3(x, z, -y).project(cam);
  return [((v.x + 1) / 2) * width, ((1 - v.y) / 2) * height];
};
const isWholeNumber = (v: number) => Math.abs(v - Math.round(v)) < 1e-4;

describe('正交像素机位', () => {
  for (const facing of ['北', '南', '东', '西'] as Facing[])
    for (const [N, topDepth, dpr] of [[6, 2, 2], [6, 0, 2], [8, 4, 1], [6, 4, 2], [6, 2, 1]] as const)
      it(`朝${facing} N=${N} 顶面=${topDepth} dpr=${dpr}：贴图像素的边落在整数像素上`, () => {
        const lookAt: [number, number, number] = [11.37, -10.52, 3.219];
        const q = computeOrthoFraming({ kind: '正交', 看: lookAt, facing, N, topDepth }, 1280, 720, dpr);
        const cam = new THREE.OrthographicCamera();
        setOrthoCamera(cam, q);
        const [width, height] = [1280 * dpr, 720 * dpr];
        for (const p of [[11, -10, 3], [11 + 3 / 16, -10 - 5 / 16, 2 + 7 / 16], [4, -14, 0], [15.5, -6.25, 5.125]]) {
          const [px, py] = project(cam, p, width, height);
          expect(isWholeNumber(px) && isWholeNumber(py)).toBe(true);
        }
        // 正面一个贴图像素 = N 个成片像素（换算到画布像素）
        const sideOffset = facing === '北' || facing === '南' ? [1 / 16, 0, 0] : [0, 1 / 16, 0];
        const [a] = project(cam, [11, -10, 3], width, height);
        const [b] = project(cam, [11 + sideOffset[0]!, -10 + sideOffset[1]!, 3], width, height);
        expect(Math.abs(b - a)).toBeCloseTo((N * dpr) / 2, 6);
        // 顶面往里一个贴图像素，画面上升 顶面 个成片像素
        const offset = { 北: [0, 1 / 16], 南: [0, -1 / 16], 东: [1 / 16, 0], 西: [-1 / 16, 0] }[facing];
        const [, c] = project(cam, [11, -10, 3], width, height);
        const [, d] = project(cam, [11 + offset[0]!, -10 + offset[1]!, 3], width, height);
        expect(c - d).toBeCloseTo((topDepth * dpr) / 2, 6);
      });

  it('N、顶面、画布宽高是奇数就报错', () => {
    expect(() => computeOrthoFraming({ kind: '正交', 看: [0, 0, 0], facing: '北', N: 5 }, 1280, 720, 2)).toThrow();
    expect(() => computeOrthoFraming({ kind: '正交', 看: [0, 0, 0], facing: '北', N: 6, topDepth: 3 }, 1280, 720, 2)).toThrow();
    expect(() => computeOrthoFraming({ kind: '正交', 看: [0, 0, 0], facing: '北', N: 6 }, 1281, 720, 2)).toThrow();
  });

  it('看点最多挪半个画布像素', () => {
    const q = computeOrthoFraming({ kind: '正交', 看: [3.01, 4.02, 5.03], facing: '北', N: 6 }, 1280, 720, 2);
    expect(Math.abs(q.lookPoint.x - 3.01)).toBeLessThanOrEqual(0.5 / 96 + 1e-9);
    expect(Math.abs(q.lookPoint.y - 5.03)).toBeLessThanOrEqual(0.5 / 96 + 1e-9);
  });
});

describe('调色矩阵', () => {
  it('中性参数是单位矩阵', () => {
    const m = gradeMatrix({ 饱和: 1, comparison: 1, multiply: '#ffffff', lift: '#000000', 暗角: 0, 颗粒: 0 });
    expect(m.map((v) => Math.round(v * 1e6) / 1e6)).toEqual([1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0]);
  });
  it('抬黑把纯黑抬到抬色、纯白不动', () => {
    const m = gradeMatrix({ 饱和: 0.5, comparison: 1, multiply: '#ffffff', lift: '#336699', 暗角: 0, 颗粒: 0 });
    const applyGradeMatrix = (c: number[]) => [0, 1, 2].map((i) => m[i * 5]! * c[0]! + m[i * 5 + 1]! * c[1]! + m[i * 5 + 2]! * c[2]! + m[i * 5 + 4]!);
    expect(applyGradeMatrix([0, 0, 0]).map((v) => Math.round(v * 255))).toEqual([0x33, 0x66, 0x99]);
    expect(applyGradeMatrix([1, 1, 1]).map((v) => Math.round(v * 1e6) / 1e6)).toEqual([1, 1, 1]);
  });
});

describe('透视机位的宽高比', () => {
  const rig = { kind: '透视', 眼: [0, -6, 1], 看: [0, -5, 1], fov: 50 } satisfies PerspectiveRigParams;
  const getAspect = (c: THREE.Camera) => (c as THREE.PerspectiveCamera).aspect;
  it('不给按画布宽高算，给了用给的（屋后远景按上一帧的画布高算）', () => {
    expect(getAspect(makeRigCamera(rig, 1280, 720, 1))).toBeCloseTo(1280 / 720);
    expect(getAspect(makeRigCamera({ ...rig, aspectRatio: 1280 / 1000 }, 1280, 720, 1))).toBeCloseTo(1.28);
  });
});

describe('显式宽高比不依赖上次渲染的画布尺寸', () => {
  const params = { kind: '透视', 眼: [0, -6, 1], 看: [0, -5, 1], fov: 50, aspectRatio: 1280 / 1000 } satisfies PerspectiveRigParams;
  it('旧 size 不改变投影矩阵，和画布外的投影相机一致', () => {
    const expected = makeRigCamera(params, 1280, 900, 2);
    for (const height of [720, 1000, 900]) {
      canvasState.size = { width: 1280, height };
      canvasState.camera = new THREE.PerspectiveCamera();
      CameraRig({ params: params });
      expect(canvasState.camera.projectionMatrix.elements).toEqual(expected.projectionMatrix.elements);
      expect(canvasState.camera.matrixWorld.elements).toEqual(expected.matrixWorld.elements);
    }
  });
  it('不给宽高比时保留既有的尺寸跟随', () => {
    const { aspectRatio: _, ...defaultParams } = params;
    for (const height of [720, 1000]) {
      canvasState.size = { width: 1280, height };
      canvasState.camera = new THREE.PerspectiveCamera();
      CameraRig({ params: defaultParams });
      const expected = makeRigCamera(defaultParams, 1280, height, 2);
      expect(canvasState.camera.projectionMatrix.elements).toEqual(expected.projectionMatrix.elements);
    }
  });
});
