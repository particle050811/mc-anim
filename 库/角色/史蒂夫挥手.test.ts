// 原版挥手正本：和 库/角色/挥手.ts（FigurePose）、把回忆三份部件表副本（2-祭坛、2-第一晚、2-末地）在同一批 attackTime 上对。
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PartPose } from '../../engine/model/实体模型.tsx';
import { getFunction, canonicalValue, approxEqual } from '../../pipeline/检查/副本识别.ts';
import type { FigurePose } from './骨架.tsx';
import { addWave as oldAddWave, waveProgress as oldWaveProgress } from './挥手.ts';
import { addWave, waveTicks, waveProgress, waveParts, waveAmount } from './史蒂夫挥手.ts';

const root = path.resolve(import.meta.dirname, '../..');
const copyFn = (file: string, fnName: string, extra?: Record<string, unknown>) => getFunction(file, fs.readFileSync(path.join(root, file), 'utf8'), fnName, { allowLoop: true, extra });
/** 末位舍入以内一样（副本把几项加法换了顺序） */
const expectNear = (a: unknown, b: unknown) => expect(approxEqual(canonicalValue(a), canonicalValue(b), 1e-12), JSON.stringify(canonicalValue(a))).toBe(true);
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
    const expected = canonicalValue(p);
    const r = waveParts(p, 0.4);
    expect(canonicalValue(p)).toEqual(expected);
    expect(r.jacket).toBe(r.body);
    expect(r.right_sleeve).toBe(r.right_arm);
    expect(waveParts(p, 0)).toEqual(p);
  });
});

describe('原版挥手正本和旧副本对得上', () => {
  it('库/角色/挥手.ts 的 加挥手（FigurePose，度）', () => {
    for (const t of [0, 1, ...sampleTimes]) {
      const waved = addWave(pose, t) as unknown as Record<string, number>;
      const legacyWaved = oldAddWave(pose, t) as unknown as Record<string, number>;
      for (const k of Object.keys(legacyWaved)) if (typeof legacyWaved[k] === 'number') expect(waved[k], `${k} t=${t}`).toBeCloseTo(legacyWaved[k]!, 9);
    }
  });
  it('2-祭坛 的 挥手部件（身子 yRot 是设成 body.yRot：底子的 yRot 为 0 时一样）', () => {
    const legacyFn = copyFn('作品/把回忆拼好给你/场/2-祭坛/人物.tsx', '挥手部件');
    for (const t of sampleTimes) expectNear(legacyFn(basePoses(), t), waveParts(basePoses(), t));
  });
  it('2-第一晚 的 挥手部件（自己调 steveParts）', () => {
    const legacyFn = copyFn('作品/把回忆拼好给你/场/2-第一晚/史蒂夫.tsx', '挥手部件', { steveParts: () => basePoses() });
    for (const t of sampleTimes) expectNear(legacyFn(null, t), waveParts(basePoses(), t));
  });
  it('2-末地 的 叠挥手（原地改部件表）', () => {
    const legacyFn = copyFn('作品/把回忆拼好给你/场/2-末地/角色.tsx', '叠挥手');
    for (const t of sampleTimes) {
      const p = basePoses();
      legacyFn(p, t);
      expectNear(p, waveParts(basePoses(), t));
    }
  });
});
