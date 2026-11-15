// 指杖机位（封面八稿、第 4 幕张盘特写的机位反算）和画面自检：纯几何，不用模型字节。
import { describe, expect, it } from 'vitest';
import { cameraElevation, staffRig, projectToScreen, ellipseAxes, pictureSelfCheck, plateBasis } from './指杖机位.ts';

const aspectRatio = 16 / 9;
const normalize = (a: readonly number[]) => a.map((x) => x / Math.hypot(...a));
const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const sub = (a: readonly number[], b: readonly number[]) => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];

describe('指杖机位', () => {
  const cases = [
    { 心: [1, 2, 3], d: normalize([-0.5, -0.6, -0.7]), θ: 35, azimuthDeg: 100, 距: 2.6, lens: 22, discCenterPicture: [0.51, 0.56] as const },
    { 心: [0, 0, 5], d: normalize([0.3, -0.8, -0.5]), θ: 55, azimuthDeg: 250, 距: 4, lens: 18, discCenterPicture: [0.6, 0.6] as const },
    { 心: [-2, 1, 4], d: normalize([0.1, 0.2, -0.97]), θ: 70, azimuthDeg: 20, 距: 3, lens: 28, discCenterPicture: [0.5, 0.5] as const },
    { 心: [0, 0, 0], d: [0, 1, 0], θ: 0, azimuthDeg: 0, 距: 5, lens: 22, discCenterPicture: [0.3, 0.7] as const },
  ];
  it.each(cases)('θ $θ：镜头到盘心的距离、和杖的夹角是给的数，镜头在盘的正面一侧，盘心落在给的画面位置', (caseParams) => {
    const cameraRig = staffRig({ ...caseParams, aspectRatio });
    const toCamera = sub(cameraRig.pos, caseParams.心);
    expect(Math.hypot(...toCamera)).toBeCloseTo(caseParams.距, 9);
    expect((Math.acos(dot(toCamera, caseParams.d) / caseParams.距) * 180) / Math.PI).toBeCloseTo(caseParams.θ, 6);
    if (caseParams.θ < 90) expect(dot(toCamera, caseParams.d)).toBeGreaterThan(0);
    const project = projectToScreen(cameraRig, aspectRatio, caseParams.心);
    expect(project.x).toBeCloseTo(caseParams.discCenterPicture[0], 9);
    expect(project.y).toBeCloseTo(caseParams.discCenterPicture[1], 9);
    expect(project.depth).toBeGreaterThan(0);
  });

  it('方位角：0 偏向盘面里朝上的方向，90 偏向 d × 上', () => {
    const d = [0, -1, 0];
    const { u, v } = plateBasis(d);
    expect(u).toEqual([0, 0, 1]);
    const offsetAt = (azimuthDeg: number) => sub(staffRig({ 心: [0, 0, 0], d, θ: 90, azimuthDeg, 距: 1, lens: 22, discCenterPicture: [0.5, 0.5], aspectRatio }).pos, [0, 0, 0]);
    expect(dot(offsetAt(0), u)).toBeCloseTo(1, 9);
    expect(dot(offsetAt(90), v)).toBeCloseTo(1, 9);
  });

  it('镜头几乎竖直往上看、盘心又要偏到画面一边：不滚转摆不出来，报错', () => {
    expect(() => staffRig({ 心: [0, 0, 5], d: [0, 0, -1], θ: 0, azimuthDeg: 0, 距: 3, lens: 22, discCenterPicture: [0.9, 0.5], aspectRatio })).toThrow(/竖直/);
  });
});

describe('投影、仰角、椭圆轴', () => {
  it('光轴上的点在画面正中；右边的点 x 大，上面的点 y 小；画面右边缘在 18 / lens 处', () => {
    const cameraRig = { pos: [0, 0, 0] as [number, number, number], tgt: [0, 1, 0] as [number, number, number], lens: 18 };
    expect(projectToScreen(cameraRig, aspectRatio, [0, 7, 0])).toEqual({ x: 0.5, y: 0.5, depth: 7 });
    expect(projectToScreen(cameraRig, aspectRatio, [1, 1, 0]).x).toBeCloseTo(1, 9);
    expect(projectToScreen(cameraRig, aspectRatio, [0, 1, 1 / aspectRatio]).y).toBeCloseTo(0, 9);
  });
  it('仰角：往上 45 度看是 45', () => {
    expect(cameraElevation({ pos: [0, 0, 0], tgt: [0, 1, 1] })).toBeCloseTo(45, 9);
    expect(cameraElevation({ pos: [0, 0, 2], tgt: [3, 0, 2] })).toBeCloseTo(0, 9);
  });
  it('椭圆轴：半轴 2、1、长轴斜 30 度的椭圆', () => {
    const [c, s] = [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)];
    const outline = Array.from({ length: 720 }, (_, i) => {
      const t = (i / 720) * 2 * Math.PI;
      return [2 * Math.cos(t) * c - Math.sin(t) * s, 2 * Math.cos(t) * s + Math.sin(t) * c] as const;
    });
    const ellipseAxis = ellipseAxes(outline);
    expect(ellipseAxis.长).toBeCloseTo(4, 3);
    expect(ellipseAxis.minor).toBeCloseTo(2, 3);
    expect(Math.abs(ellipseAxis.longDir[0] * c + ellipseAxis.longDir[1] * s)).toBeCloseTo(1, 4);
  });
});

describe('画面自检', () => {
  // 她站在原点、面朝 −y（朝南），杖从 (0, −0.5, 1.5) 往南偏下指；身体点只给头顶和脚底
  const d = normalize([0, -1, -1]);
  const aimCenter = [0, -1.5, 0.5];
  const yaBoLunGeom = { staffTail: [0, -0.5, 1.5], face: [0, -0.1, 1.6], faceDir: normalize([0, -1, -1]), bodyDir: [0, -1, 0], bodyPoints: [[0, 0, 2], [0, 0, 0]] };
  const selfCheckAt = (θ: number, azimuthDeg: number, distance = 30, lens = 100) =>
    pictureSelfCheck({ cameraRig: staffRig({ 心: aimCenter, d, θ, azimuthDeg, 距: distance, lens, discCenterPicture: [0.5, 0.5], aspectRatio }), aspectRatio, 心: aimCenter, d, radius: 1, ...yaBoLunGeom });

  it('θ = 0：盘是正圆，她的脸隔着盘，镜头在正面一侧、在她下方仰拍 45 度', () => {
    const probe = selfCheckAt(0, 0);
    expect(probe.shortLongRatio).toBeCloseTo(1, 2);
    expect(probe.frontDot).toBeCloseTo(30, 6);
    expect(probe.faceBehindDisc).toBe(true);
    expect(probe.cameraElevation).toBeCloseTo(45, 6);
    expect(probe.bodyBelowShot).toBeGreaterThan(0);
    expect(probe.footNearHeadFar).toBeGreaterThan(0);
    expect(probe.faceTowardShot).toBeGreaterThan(0.99);
  });

  it('θ = 60（远、长焦）：短轴 ÷ 长轴 = cos 60°，短轴顺着杖在画面上的方向；镜头偏到哪一侧，杖就朝画面的另一侧指', () => {
    const probe90 = selfCheckAt(60, 90);
    expect(probe90.θ).toBeCloseTo(60, 6);
    expect(probe90.shortLongRatio).toBeCloseTo(0.5, 2);
    expect(probe90.shortAxisWandOffset).toBeLessThan(1);
    expect(probe90.plateInFrame).toBe(1);
    expect(probe90.frontDot).toBeGreaterThan(0);
    const probe270 = selfCheckAt(60, 270);
    expect(Math.sign(Math.cos((probe90.staffAngleDeg * Math.PI) / 180))).toBe(-Math.sign(Math.cos((probe270.staffAngleDeg * Math.PI) / 180)));
  });

  it('镜头贴近、广角：盘出画，盘在画内不到 1', () => {
    expect(selfCheckAt(60, 90, 1.2, 18).plateInFrame).toBeLessThan(1);
  });
});
