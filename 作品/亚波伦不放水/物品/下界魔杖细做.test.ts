// 细做的下界魔杖：拿在手上握点、杖轴要和原版落在同一处（斜举这些手摆的姿势才不用跟着改）；网格要是能看的（没有坏数、法线朝外、不超出全长太多）
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { heldStaffMatrix } from './下界魔杖.tsx';
import { heldRefinedStaffMatrix, staffPoints, refinedVariants, faceCount, lathe, type RefinedVariant } from './下界魔杖细做.tsx';

const transformPoint = (m: THREE.Matrix4, p: readonly number[]) => new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(m).toArray();
const variants = Object.keys(refinedVariants) as RefinedVariant[];

describe('下界魔杖细做', () => {
  // 原版物品空间里的握点：杖轴在模型像素 x = 7.5、z = 8.5，握在 y = 15（display 平移 [0, −7, 1]）
  const originalGrip = transformPoint(heldStaffMatrix(), [-0.5 / 16, 7 / 16, 0.5 / 16]);
  const originalTop = transformPoint(heldStaffMatrix(), [-0.5 / 16, 23 / 16, 0.5 / 16]);
  for (const variant of variants)
    it(`${variant}：握点和原版重合，杖轴同向，自转不挪握点`, () => {
      const { grip, tip, core, tail } = staffPoints(variant);
      for (const m of [heldRefinedStaffMatrix(variant), heldRefinedStaffMatrix(variant, 135)]) {
        transformPoint(m, grip).forEach((v, i) => expect(v).toBeCloseTo(originalGrip[i]!, 9));
        // 握点往杖头走 1 格，和原版往杖头走 1 格到同一点
        transformPoint(m, [grip[0], grip[1] + 1, grip[2]]).forEach((v, i) => expect(v).toBeCloseTo(originalTop[i]!, 9));
      }
      expect(tail[1]).toBeLessThan(grip[1]);
      expect(grip[1]).toBeLessThan(core[1]);
      expect(core[1]).toBeLessThan(tip[1]);
    });

  it('全长是她身高（约 45.7 杖像素）的 0.9～1.2 倍，三款都是上万面的顺滑网格', () => {
    for (const variant of variants) {
      const lengthRatio = refinedVariants[variant].fullLength / 45.7;
      expect(lengthRatio).toBeGreaterThanOrEqual(0.9);
      expect(lengthRatio).toBeLessThanOrEqual(1.2);
      expect(faceCount(variant)).toBeGreaterThan(10000);
    }
  });

  it('车削：没有坏数，法线是单位长、朝外', () => {
    const g = lathe([[0.001, 0], [1, 0.5], [1, 2], [0.001, 2.5]]);
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      const [x, y, z, nx, ny, nz] = [p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i)];
      for (const v of [x, y, z, nx, ny, nz]) expect(Number.isFinite(v)).toBe(true);
      expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 4);
      // 侧面的点法线不朝里
      if (Math.hypot(x, z) > 0.5) expect(nx * x + nz * z).toBeGreaterThan(-1e-6);
    }
  });
});
