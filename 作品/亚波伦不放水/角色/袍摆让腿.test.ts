// 袍摆让腿：算式和 engine 的骨骼正解对得上；站着不动时不改袍摆；忘情牛肉面每 1/60 秒腿都不穿出袍子。
// 模型字节在数据根 store（作品资产锁）；没有就整组跳过。
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { skeletonMatrix } from '@engine/model/基岩正解.ts';
import type { BedrockBone } from '@engine/model/基岩模型.tsx';
import { bytesPath, readAssetLock } from '../../../pipeline/资产/资产锁.ts';
import { onePassSec, noodleDancePose } from './动作/忘情牛肉面.ts';
import { relativeMatrix, hemPierceDetails, hemYieldLeg } from './袍摆让腿.ts';

const assetLock = readAssetLock(path.join(import.meta.dirname, '..', '资产锁'));
const file = assetLock['模型/角色/娘化亚波伦'] && bytesPath(assetLock['模型/角色/娘化亚波伦']!);
const boneModel = file && fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as { bones: BedrockBone[] }) : undefined;

describe.skipIf(!boneModel)('袍摆让腿', () => {
  const g = boneModel!;

  it('自己的骨骼算式和 engine 的 骨骼矩阵 一样（带转角、平移、横向缩放）', () => {
    const t = { ...noodleDancePose(7.8), FrontSkirt: { rot: [-20, 0, 0] }, bone27: { scale: [1.4, 1, 1], pos: [0.6, 0, 0] } };
    const rootMatrix = skeletonMatrix(g, 'Skirt', t, 1);
    for (const boneName of ['bone29', 'bone153', 'LeftLowerLeg']) {
      const ancestor = boneName === 'LeftLowerLeg' ? 'DownBody' : 'Skirt';
      const expected = (ancestor === 'Skirt' ? rootMatrix : skeletonMatrix(g, ancestor, t, 1)).clone().multiply(relativeMatrix(g, ancestor, boneName, t));
      const actual = skeletonMatrix(g, boneName, t, 1);
      for (let i = 0; i < 16; i++) expect(expected.elements[i]).toBeCloseTo(actual.elements[i]!, 9);
    }
  });

  it('站着不动（空姿势表）不改袍摆', () => {
    const r = hemYieldLeg(g, {});
    expect(r.bonePose).toEqual({});
    expect(r.remain).toBe(0);
  });

  it('改过的骨骼喂回 骨骼矩阵 也有限（scale、pos 的写法 engine 认）', () => {
    const t = noodleDancePose(7.8);
    const r = hemYieldLeg(g, t);
    const m = skeletonMatrix(g, 'bone29', { ...t, ...r.bonePose });
    expect(m.elements.every(Number.isFinite)).toBe(true);
    expect(new THREE.Vector3().setFromMatrixPosition(m).length()).toBeGreaterThan(0);
  });

  it('忘情牛肉面每 1/60 秒：腿不穿出袍子，各组甩的角度逐帧连续', () => {
    let prevAngles: ReturnType<typeof hemYieldLeg>['angle'] | undefined;
    const maxAngles = { 前: 0, 后: 0, 左: 0, 右: 0 };
    let maxJump = 0;
    for (let f = 0; f <= Math.ceil(onePassSec * 60); f++) {
      const r = hemYieldLeg(g, noodleDancePose(f / 60));
      if (r.remain) expect.fail(`第 ${f} 帧还有点露在外面：${JSON.stringify(hemPierceDetails(g, noodleDancePose(f / 60)))}`);
      for (const k of ['前', '后', '左', '右'] as const) {
        maxAngles[k] = Math.max(maxAngles[k], r.angle[k]);
        if (prevAngles) maxJump = Math.max(maxJump, Math.abs(r.angle[k] - prevAngles[k]));
      }
      prevAngles = r.angle;
    }
    expect(maxJump).toBeLessThan(8);
  });
});
