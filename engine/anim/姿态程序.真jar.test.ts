// 姿态求值器跑真 jar 翻出的程序（监守者、骆驼的关键帧动画）：程序、部件树和 JVM 真值由 py/tests/test_动作翻译真jar.py 写到 ANIM_REAL_POSE_DUMP 目录。
// 那些东西来自 Mojang 的 jar，不进仓库；没设这个环境变量就跳过。
// 跑法：ANIM_REAL_POSE_DUMP=<目录> uv run pytest py/tests/test_动作翻译真jar.py && ANIM_REAL_POSE_DUMP=<目录> npx vitest run engine/anim/姿态程序.真jar.test.ts
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EntityPart } from '../model/实体模型.tsx';
import { 姿态求值器, type 姿态输入, type 姿态程序 } from './姿态程序.ts';

const 目录 = process.env.ANIM_REAL_POSE_DUMP;
const 文件们 = 目录 && fs.existsSync(目录) ? fs.readdirSync(目录).filter((f) => f.endsWith('.json')) : [];

const 位转浮 = (h: string) => {
  const dv = new DataView(new ArrayBuffer(4));
  dv.setUint32(0, parseInt(h, 16));
  return dv.getFloat32(0);
};
const 浮转位 = (x: number) => {
  const dv = new DataView(new ArrayBuffer(4));
  dv.setFloat32(0, x);
  return dv.getUint32(0).toString(16);
};

type 真jar样例 = { 程序: 姿态程序; 根: EntityPart; 样例: { 输入: Record<string, [string, string]>; 真值: Record<string, string> }[] };

describe.skipIf(文件们.length === 0)('姿态程序求值器：真 jar 翻出的程序', () => {
  for (const f of 文件们) {
    it(`${f} 和 JVM 逐位相同`, () => {
      const 夹具 = JSON.parse(fs.readFileSync(path.join(目录!, f), 'utf8')) as 真jar样例;
      const 求 = 姿态求值器(夹具.程序, 夹具.根);
      for (const { 输入, 真值 } of 夹具.样例) {
        const 给: 姿态输入 = Object.fromEntries(Object.entries(输入).map(([k, [t, v]]) => [k, t === 'f' ? 位转浮(v) : t === 'j' ? BigInt(v) : Number(v)]));
        const { 姿态, 隐藏 } = 求(给);
        for (const [部件, 串] of Object.entries(真值)) {
          const p = 姿态[部件];
          const 算 = [...p.offset, ...p.rot, ...p.scale].map(浮转位).join(' ') + ` ${隐藏.includes(部件) ? 0 : 1}`;
          expect(算, `${部件}，输入 ${JSON.stringify(输入)}`).toBe(串);
        }
      }
    });
  }
});
