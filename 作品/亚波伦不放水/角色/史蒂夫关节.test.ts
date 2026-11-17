// 史蒂夫的关节：膝是 0 时根矩阵和库里原版那套一模一样；蹲腿角让脚底在髋正下方；髋跟着膝弯往下沉；盔甲块怎么跟关节。
import { describe, expect, it } from 'vitest';
import { stevePose, steveRootMatrix } from '@库/角色/史蒂夫.tsx';
import { joints, jointRootMatrix, meshSection, legExtend, squatLegAngle, hipHeight } from './史蒂夫关节.ts';

describe('史蒂夫关节', () => {
  it('膝是 0 时根矩阵同 steveRootMatrix（腿怎么摆、前倾、贴不贴地都一样）', () => {
    for (const poseOverride of [{}, { legR: 40, legL: -40, ground: 1 }, { legR: 40, legL: -40, ground: 0.5, pitch: -12 }, { legR: -70, legL: -70, ground: 1 }]) {
      const pose = { ...stevePose([3, 4, 5], 30), ...poseOverride };
      const [firstMatrix, steveElems] = [jointRootMatrix(pose).elements, steveRootMatrix(pose).elements];
      firstMatrix.forEach((v, i) => expect(v).toBeCloseTo(steveElems[i]!, 9));
    }
  });

  it('蹲腿角：大腿抬到这个角，脚底中心在髋正下方；膝越弯髋越低', () => {
    let prevHeight = 12;
    for (const knee of [30, 60, 90, 120]) {
      const legPitch = squatLegAngle(knee);
      expect(legExtend(legPitch, knee).前).toBeCloseTo(0, 9);
      const height = hipHeight({ ...stevePose([0, 0, 0], 0), legR: legPitch, legL: legPitch, kneeR: knee, kneeL: knee, ground: 1 });
      expect(height).toBeLessThan(prevHeight);
      prevHeight = height;
    }
  });

  it('盔甲块跟关节：跨过关节的正方盒折，斜的、只探过一点的整块跟上半节', () => {
    const slab = (low: number, height: number, n: number[] = [0, 0, 1]) => [low, height, low, height].flatMap((y, i) => [i < 2 ? -2 : 2, y, 3, 0, 0, ...n]);
    expect(meshSection(slab(-2.7, 11.3), joints.knee.cut)).toBe('弯');
    expect(meshSection(slab(-2, 5), joints.elbow.cut)).toBe('上');
    expect(meshSection(slab(-5, 10, [0, 0.6, 0.8]), joints.elbow.cut)).toBe('上');
    expect(meshSection(slab(7, 12.5), joints.knee.cut)).toBe('下');
  });
});
