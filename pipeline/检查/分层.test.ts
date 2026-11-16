import { describe, expect, it } from 'vitest';
import { base, runRule, makeRepo } from './测试夹具.ts';
import { pipelineSlot } from './规则/分层.ts';

describe('分层', () => {
  it('合规样例放行：上层引下层、同层不同目录单向引、pipeline 引 engine 的类型', async () => {
    const root = makeRepo(base(), {
      'pipeline/环境/路径.ts': 'export const root = 1;\n',
      'pipeline/闸/闸.ts': "import { root } from '../环境/路径.ts';\nexport const gate = root;\n",
      'pipeline/取材/许可.ts': "export type License = string;\n",
      'pipeline/世界/世界.ts': "import type { License } from '../取材/许可.ts';\nexport const world = (l: License) => l;\n",
      'pipeline/检查/读.ts': "import type { SegDef } from '../../engine/段/段定义.ts';\nexport const read = (x: SegDef) => x;\n",
      'pipeline/闸/命令.ts': "import { gate } from './闸.ts';\nimport { world } from '../世界/世界.ts';\nexport const cmds = [gate, world];\n",
    });
    expect((await runRule('layers', root)).violations).toEqual([]);
  });

  it('pipeline 下层引上层报错，只引类型也算', async () => {
    const root = makeRepo(base(), {
      'pipeline/环境/路径.ts': "import type { Gate } from '../闸/闸.ts';\nexport const root = (g: Gate) => g;\n",
      'pipeline/闸/闸.ts': 'export type Gate = number;\n',
    });
    const { violations } = await runRule('layers', root);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/pipeline\/环境\/路径\.ts .*基础 层不能引 闸 层.*只引类型也算/);
  });

  it('pipeline 新目录、散文件没登记报错', async () => {
    const root = makeRepo(base(), { 'pipeline/新东西/甲.ts': 'export const a = 1;\n', 'pipeline/读.ts': 'export const b = 1;\n' });
    const { violations } = await runRule('layers', root);
    expect(violations.join('\n')).toMatch(/pipeline\/新东西\/ 不在 pipeline 分层表里/);
    expect(violations.join('\n')).toMatch(/pipeline\/读\.ts 不在 pipeline 分层表里/);
  });

  it('只靠类型绕成的环也报（engine 内部、作品内部）', async () => {
    const root = makeRepo(base(), {
      'engine/model/甲.ts': "import type { B } from '../voxel/乙.ts';\nexport type A = { b?: B };\n",
      'engine/voxel/乙.ts': "import type { A } from '../model/甲.ts';\nexport type B = { a?: A };\n",
      '作品/应力转动/场/7-场一/丙.ts': "import { d } from './丁.ts';\nexport const c = () => d;\n",
      '作品/应力转动/场/7-场一/丁.ts': "export { c } from './丙.ts';\nexport const d = 1;\n",
    });
    const text = (await runRule('layers', root)).violations.join('\n');
    expect(text).toMatch(/循环引用：engine\/model\/甲\.ts ↔ engine\/voxel\/乙\.ts.*（类型）/);
    expect(text).toMatch(/循环引用：作品\/应力转动\/场\/7-场一\/丁\.ts ↔ 作品\/应力转动\/场\/7-场一\/丙\.ts/);
  });

  it('pipeline 同层目录之间成环报错', async () => {
    const root = makeRepo(base(), {
      'pipeline/取材/甲.ts': "import { b } from '../世界/乙.ts';\nexport const a = () => b;\n",
      'pipeline/取材/丙.ts': 'export const c = 1;\n',
      'pipeline/世界/乙.ts': "import { c } from '../取材/丙.ts';\nexport const b = c;\n",
    });
    const text = (await runRule('layers', root)).violations.join('\n');
    expect(text).toMatch(/pipeline 模块之间成环：pipeline\/世界\/ ↔ pipeline\/取材\//);
    expect(text).not.toMatch(/循环引用/); // 文件之间没成环
  });

  it('engine/core 引别的 engine 子目录报错', async () => {
    const root = makeRepo(base(), {
      'engine/core/甲.ts': "import type { SegDef } from '../段/段定义.ts';\nexport const a = (x: SegDef) => x;\n",
    });
    expect((await runRule('layers', root)).violations.join('\n')).toMatch(/engine\/core 是最底层.*engine\/core\/甲\.ts:1 → engine\/段\/段定义\.ts/);
  });

  it('已知例外的边没了报例外过期', async () => {
    const root = makeRepo(base(), { 'engine/core/拼段.tsx': 'export const a = 1;\n', 'engine/段/时间.tsx': 'export const b = 1;\n' });
    expect((await runRule('layers', root)).violations.join('\n')).toMatch(/例外过期：engine\/core\/拼段\.tsx 已经不引 engine\/段\/时间\.tsx/);
  });

  it('只引类型的边也守渲染分层：engine 引作品的类型报错', async () => {
    const root = makeRepo(base(), {
      'engine/段/甲.ts': "import type { X } from '../../作品/应力转动/场/7-场一/乙.ts';\nexport const a = (x: X) => x;\n",
      '作品/应力转动/场/7-场一/乙.ts': 'export type X = number;\n',
    });
    expect((await runRule('layers', root)).violations.join('\n')).toMatch(/只引类型也算：分层方向反了：engine 不能引用/);
  });

  it('命令.ts 是入口层，cli/命令.ts 不是', () => {
    expect(pipelineSlot('pipeline/闸/命令.ts')?.layer).toBe('入口');
    expect(pipelineSlot('pipeline/cli/命令.ts')?.layer).toBe('记录');
    expect(pipelineSlot('pipeline/资产/webpack.ts')?.layer).toBe('渲');
    expect(pipelineSlot('pipeline/资产/表.ts')?.layer).toBe('资产');
    expect(pipelineSlot('engine/core/数学.ts')).toBeNull();
  });
});
