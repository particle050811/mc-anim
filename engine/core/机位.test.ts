// 机位正本：焦距 ↔ 视角、插值、摆相机、样条（和旧副本 aimCamera、lerpCam、camLerp、2-新世界 的 插机位 对的在 pipeline/检查/副本对照/机位.test.ts）。
import { describe, expect, it } from 'vitest';
import { makeCamera, projectToPicture } from './three换算.ts';
import { lerpV } from './数学.ts';
import * as J from './机位.ts';

const expectNear = (a: readonly number[], b: readonly number[], digits = 10) => {
  expect(a.length).toBe(b.length);
  a.forEach((x, i) => expect(x).toBeCloseTo(b[i]!, digits));
};
const rigFirst: J.Cam = { pos: [5.5, -7.3, 2.5], tgt: [5.5, -1, 1.7], lens: 26 };
const secondCam: J.Cam = { pos: [-3, 4, 10], tgt: [0, 0, 0], lens: 60 };

describe('机位正本', () => {
  it('焦距 ↔ 视角：36 mm 横向画幅，16:9 时 lens 18 的竖直视角', () => {
    expect(J.lensToFov(18, 1)).toBeCloseTo(90, 12);
    expect(J.lensToFov(18, 16 / 9)).toBeCloseTo((2 * Math.atan(9 / 16) * 180) / Math.PI, 12);
    for (const lens of [12, 26, 50, 135]) expect(J.fovToLens(J.lensToFov(lens, 16 / 9), 16 / 9)).toBeCloseTo(lens, 9);
  });
  it('插机位：两头、线性、对数焦距、roll 只在给了时带', () => {
    expect(J.lerpRig(rigFirst, secondCam, 0)).toEqual(rigFirst);
    // a + (b − a)·1 有末位舍入，k = 1 时只是近似等于 乙
    const atEnd = J.lerpRig(rigFirst, secondCam, 1);
    expectNear(atEnd.pos, secondCam.pos, 12);
    expectNear(atEnd.tgt, secondCam.tgt, 12);
    const midRig = J.lerpRig(rigFirst, secondCam, 0.5);
    expectNear(midRig.pos, lerpV(rigFirst.pos, secondCam.pos, 0.5));
    expect(midRig.lens).toBe(43);
    expect('roll' in midRig).toBe(false);
    expect(J.lerpRig(rigFirst, secondCam, 0.5, { lensMode: '对数' }).lens).toBeCloseTo(Math.sqrt(26 * 60), 12);
    expect(J.lerpRig({ ...rigFirst, roll: 180 }, secondCam, 0.25).roll).toBe(135);
  });
  it('插机位 球面转向：视线方向匀角速转，看点距离线性插', () => {
    const a: J.Cam = { pos: [0, 0, 0], tgt: [10, 0, 0], lens: 30 };
    const b: J.Cam = { pos: [0, 0, 0], tgt: [0, 20, 0], lens: 30 };
    const c = J.lerpRig(a, b, 0.5, { rotInterp: '球面' });
    expectNear(c.tgt, [15 * Math.SQRT1_2, 15 * Math.SQRT1_2, 0]);
  });
  it('机位轨：端点外停住、缓动作用在段内进度上', () => {
    const cameraTrack: [number, J.Cam][] = [[10, rigFirst], [20, secondCam]];
    expect(J.rigTrack(cameraTrack, 0)).toBe(rigFirst);
    expect(J.rigTrack(cameraTrack, 30)).toBe(secondCam);
    expect(J.rigTrack(cameraTrack, 15, (t) => t * t).lens).toBeCloseTo(26 + 34 * 0.25, 12);
  });
  it('摆相机 + 投到画面：看点投在画面正中，相机朝 −Z（three）看向看点', () => {
    const cam = makeCamera(rigFirst, 1920, 1080);
    const p = projectToPicture(cam, rigFirst.tgt, 1920, 1080);
    expect(p.x).toBeCloseTo(960, 6);
    expect(p.y).toBeCloseTo(540, 6);
    expect(p.depth).toBeGreaterThan(0);
    expect(cam.fov).toBeCloseTo(J.lensToFov(26, 16 / 9), 12);
    // 场景上方（+z）的点在画面上半
    expect(projectToPicture(cam, [rigFirst.tgt[0], rigFirst.tgt[1], rigFirst.tgt[2] + 1], 1920, 1080).y).toBeLessThan(540);
  });
  it('转透视参数、从透视参数来回不变；roll 非 0 报错', () => {
    const p = J.toPerspectiveParams(rigFirst, 16 / 9);
    expect(p.kind).toBe('透视');
    const camera = J.fromPerspectiveParams(p, 16 / 9);
    expect(camera.lens).toBeCloseTo(26, 9);
    expect(() => J.toPerspectiveParams({ ...rigFirst, roll: 90 }, 1)).toThrow(/roll/);
    expect(() => J.toPerspectiveParams({ ...rigFirst, roll: 360 }, 1)).not.toThrow();
  });
  it('从游戏机位：眼睛在场景里的位置、看向 yaw 方向', () => {
    const c = J.fromGameRig({ 眼: [10, 70, -5], yaw: 90, pitch: 0, fov: 70 }, [0, 64, 0], 16 / 9);
    expectNear(c.pos, [10, 5, 6]);
    expectNear(c.tgt, [0, 5, 6]);
    expect(J.lensToFov(c.lens, 16 / 9)).toBeCloseTo(70, 9);
  });
  it('机位样条：过每个关键点、关键点两侧速度连续、两头之外停在端点', () => {
    const camThird: J.Cam = { pos: [2, 9, 4], tgt: [1, 1, 1], lens: 35 };
    const keyframes: J.SplineKey[] = [[0, rigFirst], [1.5, secondCam], [4, camThird]];
    const camVector = (c: J.Cam) => [...c.pos, ...c.tgt, c.lens];
    expectNear(camVector(J.rigSpline(keyframes, 0)), camVector(rigFirst));
    expectNear(camVector(J.rigSpline(keyframes, 1.5)), camVector(secondCam), 9);
    expectNear(camVector(J.rigSpline(keyframes, 9)), camVector(camThird));
    const e = 1e-5;
    const speedAt = (t: number) => camVector(J.rigSpline(keyframes, t + e)).map((v, i) => (v - camVector(J.rigSpline(keyframes, t - e))[i]!) / (2 * e));
    const [leftSpeed, right] = [speedAt(1.5 - 2 * e), speedAt(1.5 + 2 * e)];
    leftSpeed.forEach((v, i) => expect(Math.abs(v - right[i]!)).toBeLessThan(1e-2));
    // 停：头上的速度是 0
    const stopped = J.rigSpline(keyframes, e, { 头: '停' });
    expect(Math.hypot(...stopped.pos.map((v, i) => v - rigFirst.pos[i]!)) / e).toBeLessThan(1e-3);
  });
});
