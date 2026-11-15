import { describe, expect, it } from 'vitest';
import { staffTipPlatePose, discPoint, discCellPos } from './杖尖盘位姿.ts';
import { arrangeWheel } from './轮盘法术.ts';

const expectNear = (a: readonly number[], b: readonly number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 6));
const staff = { tip: [1, 2, 5] as [number, number, number], axis: [0, -0.6, 0.8] as [number, number, number] };

describe('杖尖盘位姿', () => {
  it('垂直杖身：圆心在杖尖，法向顺着杖身，上、右都在盘面里', () => {
    const disc = staffTipPlatePose(staff, { facing: '垂直杖身' });
    expectNear(disc.心, staff.tip);
    expectNear(disc.normal, staff.axis);
    expectNear(disc.上, [0, 0.8, 0.6]);
    expectNear(disc.right, [1, 0, 0]);
    expectNear(staffTipPlatePose(staff, { facing: '垂直杖身', reverseSide: true }).normal, [0, 0.6, -0.8]);
  });
  it('正对镜头：盘面和画面平行，圆心还在杖尖；浮起沿法向往镜头挪', () => {
    const disc = staffTipPlatePose(staff, { facing: { faceCamera: { pos: [1, -8, 5], tgt: [1, 2, 5] } }, lift: 0.2 });
    expectNear(disc.normal, [0, -1, 0]);
    expectNear(disc.上, [0, 0, 1]);
    expectNear(disc.right, [1, 0, 0]);
    expectNear(disc.心, [1, 1.8, 5]);
  });
  it('定死朝上（张在头顶）：上取北；离尖沿杖身往外', () => {
    const disc = staffTipPlatePose({ tip: [0, 0, 4], axis: [0, 0, 1] }, { facing: { normal: [0, 0, -1] }, tipOffset: 0.5 });
    expectNear(disc.心, [0, 0, 4.5]);
    expectNear(disc.上, [0, 1, 0]);
    // 朝下的盘从下面仰看、北在上：右手边是西
    expectNear(disc.right, [-1, 0, 0]);
  });
  it('盘上点、盘格位置：第 0 圈第 0 格朝正上，离圆心 45 GUI 像素；没弹开的圈返回 null', () => {
    const disc = staffTipPlatePose(staff, { facing: { faceCamera: { pos: [1, -8, 5], tgt: [1, 2, 5] } } });
    expectNear(discPoint(disc, 0.1, 10, -20), [2, 2, 7]);
    const { 项: items } = arrangeWheel({});
    const firstSlot = items.find((p) => p.ring === 0 && p.格 === 0)!;
    const outerRing = items.find((p) => p.ring === 2)!;
    const pos = discCellPos(disc, 0.02, { 刻: 2.5, openClose: { rotSpeed: 0 } }, firstSlot.键)!;
    expect(Math.hypot(pos[0] - 1, pos[2] - 5)).toBeCloseTo(0.9, 6);
    expect(pos[2]).toBeGreaterThan(5);
    expect(discCellPos(disc, 0.02, { 刻: 2.5 }, outerRing.键)).toBeNull();
    expect(discCellPos(disc, 0.02, { 刻: 40 }, 'goety:没有这个')).toBeNull();
  });
});
