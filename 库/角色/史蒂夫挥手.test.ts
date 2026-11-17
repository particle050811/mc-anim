// 原版挥手正本：自身的取值，和 库/角色/挥手.ts（FigurePose）对；把回忆三份部件表副本（2-祭坛、2-第一晚、2-末地）在 pipeline/检查/副本对照/史蒂夫挥手.test.ts 对。
import { describe, expect, it } from 'vitest';
import type { PartPose } from '../../engine/model/实体模型.tsx';
import type { FigurePose } from './骨架.tsx';
import { addWave as oldAddWave, waveProgress as oldWaveProgress } from './挥手.ts';
import { addWave, waveTicks, waveProgress, waveParts, waveAmount } from './史蒂夫挥手.ts';

const sampleTimes = [0.01, 0.1, 0.25, 0.5, 0.75, 0.99];
const pose: FigurePose = { loc: [0, 0, 0], pitch: 0, squash: 0, headPitch: -12, headYaw: 5, legR: 0, legL: 0, armR: 10, armRRoll: 3, armL: -5, armLRoll: 0, twist: 4 };
/** steveParts 那样的部件表（身子、外套同一个对象，手臂、袖子同一个对象） */
const basePoses = (): Record<string, PartPose> => {
  const body: PartPose = { rot: [0.1, 0, 0.02] };
  const right_arm: PartPose = { offset: [-5, 2, 0], rot: [0.3, 0.1, 0.05] };
  const left_arm: PartPose = { offset: [5, 2, 0], rot: [-0.2, 0, -0.05] };
  return { head: { rot: [-0.3, 0.2, 0] }, body, jacket: body, right_arm, right_sleeve: right_arm, left_arm, left_sleeve: left_arm };
};

describe('原版挥手正本', () => {
  it('挥手进度：6 刻挥完，不在挥时给 0', () => {
    expect(waveTicks).toBe(6);
    expect(waveProgress(0)).toBe(0);
    expect(waveProgress(0.15)).toBeCloseTo(0.5, 12);
    expect(waveProgress(0.3)).toBe(0);
    expect(waveProgress(0.15, 10)).toBeCloseTo(0.3, 12);
    for (const s of [-0.1, 0, 0.05, 0.2, 0.29, 0.31]) expect(waveProgress(s)).toBe(oldWaveProgress(s));
  });
  it('挥手量：t = 0 不动；左手出手是右手的镜像', () => {
    const zero = waveAmount(0, 0.3);
    expect(zero.bodyTwist).toBe(0);
    expect(zero.rightArm.map((x) => x + 0)).toEqual([0, 0, 0]);
    for (const t of sampleTimes) {
      const rightWave = waveAmount(t, 0.2, '右');
      const leftArmSwing = waveAmount(t, 0.2, '左');
      expect(leftArmSwing.bodyTwist).toBeCloseTo(-rightWave.bodyTwist, 12);
      expect(leftArmSwing.leftArm[0]).toBeCloseTo(rightWave.rightArm[0] + leftArmSwing.bodyTwist - 0, 12);
    }
  });
  it('挥手部件 不改传进来的表，身子和外套、手臂和袖子还是同一份', () => {
    const p = basePoses();
    const expected = structuredClone(p);
    const r = waveParts(p, 0.4);
    expect(p).toEqual(expected);
    expect(r.jacket).toBe(r.body);
    expect(r.right_sleeve).toBe(r.right_arm);
    expect(waveParts(p, 0)).toEqual(p);
  });
});

describe('原版挥手正本和旧版对得上', () => {
  it('库/角色/挥手.ts 的 加挥手（FigurePose，度）', () => {
    for (const t of [0, 1, ...sampleTimes]) {
      const waved = addWave(pose, t) as unknown as Record<string, number>;
      const legacyWaved = oldAddWave(pose, t) as unknown as Record<string, number>;
      for (const k of Object.keys(legacyWaved)) if (typeof legacyWaved[k] === 'number') expect(waved[k], `${k} t=${t}`).toBeCloseTo(legacyWaved[k]!, 9);
    }
  });
});
