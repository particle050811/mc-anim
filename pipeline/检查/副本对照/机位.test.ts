// 机位正本和旧副本（aimCamera、lerpCam、camLerp、2-新世界 的 插机位）在同一批输入上对：副本从源码里单独取出来编（副本识别.ts）。正本自身的测试在 engine/core/机位.test.ts。
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getFunction, type CompileOptions } from '../副本识别.ts';
import { placeCamera, sceneToThree } from '../../../engine/core/three换算.ts';
import { lerp, lerpV, rad } from '../../../engine/core/数学.ts';
import * as J from '../../../engine/core/机位.ts';

const root = path.resolve(import.meta.dirname, '../../..');
type AnyFn = (...a: unknown[]) => unknown;
const copyFn = (file: string, fnName: string, options?: CompileOptions) => getFunction(file, fs.readFileSync(path.join(root, file), 'utf8'), fnName, { allowLoop: true, ...options }) as AnyFn;
const expectNear = (a: readonly number[], b: readonly number[], digits = 10) => {
  expect(a.length).toBe(b.length);
  a.forEach((x, i) => expect(x).toBeCloseTo(b[i]!, digits));
};
const rigFirst: J.Cam = { pos: [5.5, -7.3, 2.5], tgt: [5.5, -1, 1.7], lens: 26 };
const secondCam: J.Cam = { pos: [-3, 4, 10], tgt: [0, 0, 0], lens: 60 };

describe('机位正本和旧副本对得上', () => {
  it('aimCamera（应力转动 古城画面）摆出来的相机和 摆相机 一样（远裁剪面 900）', () => {
    const aim = copyFn('作品/应力转动/地点/古城4x/6-4-1/古城画面.tsx', 'aimCamera', { globals: { THREE }, extra: { rad, lensToFov: J.lensToFov, sceneToThree } });
    for (const c of [rigFirst, secondCam, { ...secondCam, roll: 180 }] as J.Cam[]) {
      for (const aspect of [16 / 9, 1]) {
        const prevCam = new THREE.PerspectiveCamera();
        aim(prevCam, c, aspect, 900);
        prevCam.updateMatrixWorld();
        const nextCam = placeCamera(new THREE.PerspectiveCamera(), c, aspect);
        expectNear(prevCam.projectionMatrix.elements, nextCam.projectionMatrix.elements, 9);
        expectNear(prevCam.matrixWorld.elements, nextCam.matrixWorld.elements, 9);
      }
    }
  });
  it('6-3-8 的 slerpDir（three 四元数）和 camLerp（球面 + 对数，看点放在视线 100 格处）', () => {
    const toolSource = fs.readFileSync(path.join(root, '作品/应力转动/地点/边城/6-3-8/编排/工具.ts'), 'utf8');
    // slerpDir 要 new THREE.Quaternion，副本识别 不编；照它的三行在这里用真的 three 写一遍
    expect(toolSource).toMatch(/setFromUnitVectors\(va, new THREE\.Vector3\(\.\.\.dirB\)\)[^]*va\.applyQuaternion\(new THREE\.Quaternion\(\)\.slerp\(quat, k\)\)/);
    const slerpDir = (a: number[], b: number[], k: number) => {
      const va = new THREE.Vector3(...a);
      const quat = new THREE.Quaternion().setFromUnitVectors(va, new THREE.Vector3(...b));
      const r = va.applyQuaternion(new THREE.Quaternion().slerp(quat, k));
      return [r.x, r.y, r.z];
    };
    const unitVec = (v: number[]) => v.map((x) => x / Math.hypot(...v));
    const pairs: [number[], number[]][] = [
      [[1, 0, 0], [0, 1, 0]],
      [unitVec([0.3, -0.8, 0.2]), unitVec([-0.5, 0.1, -0.7])],
      [unitVec([1, 2, 3]), unitVec([1, 2, 3.0000001])],
      [[1, 0, 0], [1, 0, 0]],
      // 正好反向：两边都绕和 a 垂直的同一根轴转
      [unitVec([0.6, 0.8, 0]), unitVec([-0.6, -0.8, 0])],
      [[0, 0, 1], [0, 0, -1]],
    ];
    for (const [a, b] of pairs) for (const k of [0, 0.2, 0.5, 0.9, 1, 1.3]) expectNear(J.slerpDir(a, b, k), slerpDir(a, b, k), 12);
    const camLerp = copyFn('作品/应力转动/地点/边城/6-3-8/编排/机位.ts', 'camLerp', {
      extra: { ...Object.fromEntries(['add', 'sub', 'norm'].map((n) => [n, getFunction('工具.ts', toolSource, n)])), lerp, lerpV, slerpDir },
    });
    for (const k of [0, 0.3, 0.75, 1]) {
      const prevCam = camLerp(rigFirst, secondCam, k) as J.Cam;
      const nextCam = J.lerpRig(rigFirst, secondCam, k, { rotInterp: '球面', lensMode: '对数' });
      expectNear(prevCam.pos, nextCam.pos);
      expectNear(J.sightDir(prevCam), J.sightDir(nextCam));
      expect(prevCam.lens).toBeCloseTo(nextCam.lens, 12);
    }
  });
  it('lerpCam（7-起疑、6-4-3）和 2-新世界 的 插机位 = 线性 插机位', () => {
    const doubtLerpCam = copyFn('作品/应力转动/段/7-起疑/编排.ts', 'lerpCam');
    const ancientCityLerp = copyFn('作品/应力转动/场/6-古城/6-4-3/编排/机位.ts', 'lerpCam', { extra: { lerpV } });
    const newWorldInsertRig = copyFn('作品/把回忆拼好给你/场/2-新世界/编排.ts', 'lerpRig', { extra: { lerp } });
    for (const k of [0, 0.3, 0.5, 1, 1.2]) {
      const nextCam = J.lerpRig(rigFirst, secondCam, k);
      for (const prevCam of [doubtLerpCam(rigFirst, secondCam, k), ancientCityLerp(rigFirst, secondCam, k)] as J.Cam[]) {
        expectNear(prevCam.pos, nextCam.pos);
        expectNear(prevCam.tgt, nextCam.tgt);
        expect(prevCam.lens).toBeCloseTo(nextCam.lens, 12);
      }
      const pose = newWorldInsertRig({ 眼: rigFirst.pos, 看: rigFirst.tgt, fov: rigFirst.lens }, { 眼: secondCam.pos, 看: secondCam.tgt, fov: secondCam.lens }, k) as { 眼: number[]; 看: number[]; fov: number };
      expectNear(pose.眼, nextCam.pos);
      expectNear(pose.看, nextCam.tgt);
      expect(pose.fov).toBeCloseTo(nextCam.lens, 12);
    }
  });
});
