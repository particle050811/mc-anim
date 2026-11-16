// 姿态求值器跑真 jar 翻出的程序（原版监守者、骆驼、烈焰人、蜜蜂，暮色森林的松鼠、狗头人）：程序、部件树和 JVM 真值由 py/tests/test_动作翻译真jar.py 写到 ANIM_REAL_POSE_DUMP 目录。
// 那些东西来自 Mojang 和模组作者的 jar，不进仓库；没设这个环境变量就跳过。
// 跑法：ANIM_REAL_POSE_DUMP=<目录> uv run pytest py/tests/test_动作翻译真jar.py && ANIM_REAL_POSE_DUMP=<目录> npx vitest run engine/anim/姿态程序.真jar.test.ts
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EntityPart } from '../model/实体模型.tsx';
import { poseEvaluator, type PoseInput, type PoseProgram } from './姿态程序.ts';

const dir = process.env.ANIM_REAL_POSE_DUMP;
const jsonFiles = dir && fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : [];

const bitsToFloat = (h: string) => {
  const dv = new DataView(new ArrayBuffer(4));
  dv.setUint32(0, parseInt(h, 16));
  return dv.getFloat32(0);
};
const floatToBits = (x: number) => {
  const dv = new DataView(new ArrayBuffer(4));
  dv.setFloat32(0, x);
  return dv.getUint32(0).toString(16);
};

type RealJarSample = { program: PoseProgram; root: EntityPart; 样例: { input: Record<string, [string, string]>; 真值: Record<string, string> }[] };

describe.skipIf(jsonFiles.length === 0)('姿态程序求值器：真 jar 翻出的程序', () => {
  for (const f of jsonFiles) {
    it(`${f} 和 JVM 逐位相同`, () => {
      const fixture = JSON.parse(fs.readFileSync(path.join(dir!, f), 'utf8')) as RealJarSample;
      const solve = poseEvaluator(fixture.program, fixture.root);
      for (const { input: input, 真值: truth } of fixture.样例) {
        const inputs: PoseInput = Object.fromEntries(Object.entries(input).map(([k, [t, v]]) => [k, t === 'f' ? bitsToFloat(v) : t === 'j' ? BigInt(v) : Number(v)]));
        const { partPoses, hidden } = solve(inputs);
        for (const [part, expected] of Object.entries(truth)) {
          const p = partPoses[part];
          const calc = [...p.offset, ...p.rot, ...p.scale].map(floatToBits).join(' ') + ` ${hidden.includes(part) ? 0 : 1}`;
          expect(calc, `${part}，输入 ${JSON.stringify(input)}`).toBe(expected);
        }
      }
    });
  }
});
