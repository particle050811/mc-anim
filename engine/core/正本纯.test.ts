// 纯的正本闭包里没有 react、three、remotion：段.ts、时间线.ts、末态.ts（pipeline 在 Node 里直接执行的纯模块）和它们引的编排也能 import。
// 要 three 的部分单放在 three换算.ts；往这几个文件里加 three 的 import，这里就挂。
import path from 'node:path';
import { build } from 'esbuild';
import { expect, it } from 'vitest';

const 根 = path.resolve(import.meta.dirname, '../..');
const 纯的 = ['engine/core/数学.ts', 'engine/core/坐标.ts', 'engine/core/机位.ts', '库/角色/骨骼表.ts', '库/角色/史蒂夫挥手.ts', '库/原版物理.ts'];
const 禁包 = /^(react|react-dom|three|remotion)(\/|$)|^@remotion\//;

it.each(纯的)('%s 的闭包里没有 react、three、remotion', async (文件) => {
  const r = await build({ absWorkingDir: 根, entryPoints: [文件], bundle: true, write: false, metafile: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent' });
  const 外部 = Object.values(r.metafile.outputs).flatMap((o) => o.imports.filter((i) => i.external).map((i) => i.path));
  expect(外部.filter((p) => 禁包.test(p))).toEqual([]);
});
