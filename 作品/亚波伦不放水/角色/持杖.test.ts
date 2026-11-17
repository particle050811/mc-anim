// 持杖的默认摆法「斜举」（用户 11-10 定）：不给姿势时杖在身体右侧、杖头朝斜上前方；显式给姿势的不受影响。
// 坐标：pose 取原点、yaw 0，她面朝 +Y、右手边是 +X、上是 +Z（单位格）。字节在数据根 store，vitest 按资产锁读（pipeline/资产/vitest插件.ts）。
import { describe, expect, it } from 'vitest';
import { rightHandCenter, hover, holdWandPose, raisedPose, stand } from './娘化亚波伦.tsx';

const originPose = { loc: [0, 0, 0], yaw: 0 };
const tiltFromVertical = (axis: readonly number[]) => (Math.acos(axis[2]!) * 180) / Math.PI;

describe('持杖的默认摆法（斜举）', () => {
  it('站立：不给姿势，杖头朝斜上、往外、往前，和竖直 30～45 度；杖头在头的右侧外面、不低于头，杖尾也在身体右侧', () => {
    for (const sec of [0, 0.5, 1.5, 2.6]) {
      const staff = holdWandPose({ pose: originPose, sec: sec, act: stand });
      expect(tiltFromVertical(staff.axis)).toBeGreaterThan(30);
      expect(tiltFromVertical(staff.axis)).toBeLessThan(45);
      expect(staff.axis[0]).toBeGreaterThan(0.2);
      expect(staff.axis[1]).toBeGreaterThan(0.2);
      // 头宽 ±0.15 格、帽檐 ±0.35 格，头的轴心高 1.45 格
      expect(staff.tip[0]).toBeGreaterThan(0.7);
      expect(staff.tip[2]).toBeGreaterThan(1.6);
      expect(staff.tail[0]).toBeGreaterThan(0.25);
    }
  });

  it('悬停（fly）：不给姿势用 斜举.飞，杖头朝上、朝她右边、朝前，整根杖在身体右侧；原动作（右手合在胸前）不是这样', () => {
    for (const sec of [0, 0.75, 1.4, 2.4]) {
      const staff = holdWandPose({ pose: originPose, sec: sec, act: hover });
      expect(tiltFromVertical(staff.axis)).toBeGreaterThan(45);
      expect(tiltFromVertical(staff.axis)).toBeLessThan(65);
      expect(staff.axis[0]).toBeGreaterThan(0.6);
      expect(staff.axis[1]).toBeGreaterThan(0.1);
      // fly 里头偏到右边 0.42 格、帽顶到 0.85 格上下；握杖改成杖身垂直小臂后手往里收了约 0.19 格，杖尖最里到 1.23
      expect(staff.tip[0]).toBeGreaterThan(1.15);
      // 杖尾最里在第 0 秒（身子摆到最右）：0.09，在右胯外侧（核对段「持杖-飞行-正面-0秒」）
      expect(staff.tail[0]).toBeGreaterThan(0.05);
    }
    expect(holdWandPose({ pose: originPose, sec: 0.75, act: hover, bonePose: {} }).tip[0]).toBeLessThan(0.8);
  });

  it('显式给姿势的不受默认影响：给空姿势就是动画原样（idle 垂手，杖头朝正前），给 斜举.站 和不给一样', () => {
    const handDown = holdWandPose({ pose: originPose, sec: 0, act: stand, bonePose: {} });
    expect(handDown.axis[1]).toBeCloseTo(1, 3);
    expect(holdWandPose({ pose: originPose, sec: 0.5, act: stand, bonePose: raisedPose.站 })).toEqual(holdWandPose({ pose: originPose, sec: 0.5, act: stand }));
  });

  it('杖握在手里（用户 11-10）：杖身的中轴穿过手心，站立斜举、飞行斜举、手腕另转的姿势都是；旧握法（不修正）离手心半个像素以上', () => {
    const offAxis = (staff: { tip: readonly number[]; axis: readonly number[] }, point: readonly number[]) => {
      // 杖尖比杖身中轴偏 0.5 个物品像素（杖头居中、杖身不居中），换成格是 0.5 × 0.7 / 16 ≈ 0.022
      const d = point.map((v, i) => v - staff.tip[i]!);
      const alongAxis = d.reduce((sum, v, i) => sum + v * staff.axis[i]!, 0);
      return Math.hypot(...d.map((v, i) => v - alongAxis * staff.axis[i]!));
    };
    const onePixel = 0.7 / 16;
    for (const settings of [
      { act: stand, sec: 0.5 },
      { act: hover, sec: 1.4 },
      { act: stand, sec: 0.5, bonePose: { RightArm: { rot: [-20, 0, -60] }, RightHand: { rot: [90, 0, 0] } } },
      { act: stand, sec: 0.5, bonePose: { RightArm: { rot: [-60, 0, 30] }, RightHand: { rot: [30, -50, 20] } } },
    ]) {
      const poseParams = { pose: originPose, ...settings };
      expect(offAxis(holdWandPose(poseParams), rightHandCenter(poseParams))).toBeLessThan(0.6 * onePixel);
      expect(offAxis(holdWandPose({ ...poseParams, oldGrip: true }), rightHandCenter(poseParams))).toBeGreaterThan(0.6 * onePixel);
    }
  });
});
