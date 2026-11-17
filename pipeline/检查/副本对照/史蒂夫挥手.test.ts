// 原版挥手正本和把回忆三份部件表副本（2-祭坛、2-第一晚、2-末地）在同一批 attackTime 上对（副本从源码里单独取出来编，副本识别.ts）。正本自身的测试在 库/角色/史蒂夫挥手.test.ts。
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PartPose } from '../../../engine/model/实体模型.tsx';
import { getFunction, canonicalValue, approxEqual } from '../副本识别.ts';
import { waveParts } from '../../../库/角色/史蒂夫挥手.ts';

const root = path.resolve(import.meta.dirname, '../../..');
const copyFn = (file: string, fnName: string, extra?: Record<string, unknown>) => getFunction(file, fs.readFileSync(path.join(root, file), 'utf8'), fnName, { allowLoop: true, extra });
/** 末位舍入以内一样（副本把几项加法换了顺序） */
const expectNear = (a: unknown, b: unknown) => expect(approxEqual(canonicalValue(a), canonicalValue(b), 1e-12), JSON.stringify(canonicalValue(a))).toBe(true);
const sampleTimes = [0.01, 0.1, 0.25, 0.5, 0.75, 0.99];
/** steveParts 那样的部件表（身子、外套同一个对象，手臂、袖子同一个对象） */
const basePoses = (): Record<string, PartPose> => {
  const body: PartPose = { rot: [0.1, 0, 0.02] };
  const right_arm: PartPose = { offset: [-5, 2, 0], rot: [0.3, 0.1, 0.05] };
  const left_arm: PartPose = { offset: [5, 2, 0], rot: [-0.2, 0, -0.05] };
  return { head: { rot: [-0.3, 0.2, 0] }, body, jacket: body, right_arm, right_sleeve: right_arm, left_arm, left_sleeve: left_arm };
};

describe('原版挥手正本和旧副本对得上', () => {
  it('2-祭坛 的 挥手部件（身子 yRot 是设成 body.yRot：底子的 yRot 为 0 时一样）', () => {
    const legacyFn = copyFn('作品/把回忆拼好给你/场/2-祭坛/人物.tsx', 'waveParts');
    for (const t of sampleTimes) expectNear(legacyFn(basePoses(), t), waveParts(basePoses(), t));
  });
  it('2-第一晚 的 挥手部件（自己调 steveParts）', () => {
    const legacyFn = copyFn('作品/把回忆拼好给你/场/2-第一晚/史蒂夫.tsx', 'waveParts', { steveParts: () => basePoses() });
    for (const t of sampleTimes) expectNear(legacyFn(null, t), waveParts(basePoses(), t));
  });
  it('2-末地 的 叠挥手（原地改部件表）', () => {
    const legacyFn = copyFn('作品/把回忆拼好给你/场/2-末地/角色.tsx', 'addWave');
    for (const t of sampleTimes) {
      const p = basePoses();
      legacyFn(p, t);
      expectNear(p, waveParts(basePoses(), t));
    }
  });
});
