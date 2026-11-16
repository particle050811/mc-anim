import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { base, runRule, makeRepo } from './测试夹具.ts';
import { parseLanding, parseMemoryRefs } from './规则/规矩.ts';

const ruleTable = (placement: string, exceptionsText: string) => ({
  '作品/应力转动/规矩.toml': [
    '[["rule"]]',
    'id = "打击停顿"',
    '"defaultValue" = 1',
    '"level" = "参考"',
    '"quotes" = []',
    '"appliesTo" = "打中"',
    '"provenance" = ["测试"]',
    `"placement" = ${placement}`,
    `"exceptions" = ${exceptionsText}`,
  ].join('\n'),
});
const pictureSource = (callName: string) => ({
  '作品/应力转动/段/7-甲/画面.tsx': `import { exception } from '@engine/core/例外.ts';\nexport const 停 = ${callName};\nexport default () => null;\n`,
});

describe('规矩', () => {
  it('合规样例放行：代码例外和表一一对应、值相同；旧项目里的落点和没搬的段只算待迁移', async () => {
    const root = makeRepo(
      base(),
      ruleTable(
        '["engine/core/例外.ts exception", "旧:src/lib/anim.ts HIT_STOP_FRAMES", "待迁移:sourcing/worlds/（M10 建）"]',
        '[{ "segment" = "7-甲", "value" = 3, "cause" = "看过的版本", "provenance" = "用户 10-21" }, { "segment" = "6-斩娜迦", "value" = 2, "cause" = "看过的版本", "provenance" = "用户 10-21" }]',
      ),
      pictureSource("exception('打击停顿', 3, { segment: '7-甲', cause: '看过的版本' })"),
    );
    const { violations, report } = await runRule('rules', root);
    expect(violations).toEqual([]);
    expect(report.pendingMigration.map((q) => q.text)).toEqual([
      '规矩「打击停顿」 的落点 旧:src/lib/anim.ts HIT_STOP_FRAMES',
      '规矩「打击停顿」 的落点 待迁移:sourcing/worlds/（M10 建）',
      '规矩「打击停顿」对 段 6-斩娜迦 的例外（段 6-斩娜迦 还没搬）',
    ]);
  });

  it('代码例外没登记、登记了代码里没有、值不一致、规矩不存在、写错地方、落点不在都拦', async () => {
    const root = makeRepo(
      base(),
      ruleTable(
        '["engine/core/例外.ts exception、没有的符号", "engine/core/不存在.ts", "engine/core 例外", "src/lib/anim.ts"]',
        '[{ "segment" = "7-甲", "value" = 2, "cause" = "看过的版本", "provenance" = "用户" }, { "scene" = "7-场一", "value" = 1, "cause" = "整场", "provenance" = "用户" }]',
      ),
      pictureSource("[exception('打击停顿', 3, { segment: '7-甲', cause: 'x' }), exception('没有这条', 1, { segment: '7-甲', cause: 'x' }), exception('打击停顿', 4, { segment: '7-乙', cause: 'x' })]"),
      { '库/角色/甲.ts': "import { exception } from '../../engine/core/例外.ts';\nexport const 甲 = exception('打击停顿', 5, { segment: '7-甲', cause: '共用代码开口子' });\n" },
    );
    const v = (await runRule('rules', root)).violations.join('\n');
    expect(v).toMatch(/画面.tsx:2 规矩「打击停顿」对 段 7-甲 的例外：代码里的值是 3，表里登记的是 2/);
    expect(v).toMatch(/例外用的规矩「没有这条」不在 作品\/应力转动\/规矩.toml 里/);
    expect(v).toMatch(/作品\/应力转动\/段\/7-甲\/ 里的例外要写 segment: '7-甲'/);
    expect(v).toMatch(/库\/角色\/甲.ts:2 例外 只写在 作品\/应力转动\/段\/ 或 作品\/应力转动\/场\//);
    expect(v).toMatch(/规矩「打击停顿」登记了对 场 7-场一 的例外，代码里却没有/);
    expect(v).toMatch(/落点 engine\/core\/例外.ts 里找不到符号 没有的符号/);
    expect(v).toMatch(/落点 engine\/core\/不存在.ts 不存在/);
    expect(v).toMatch(/落点 engine\/core 是目录，写了符号就要落到具体文件/);
    expect(v).toMatch(/落点「src\/lib\/anim.ts」要写成 <路径> \[符号、符号…\]/);
  });

  it('搬家 R2-A 暂放在 作品/应力转动/地点/<地点>/<旧目录>/ 的剧情编排里可以写例外，别的共用代码照拦', async () => {
    const root = makeRepo(
      base(),
      ruleTable('[]', '[{ "segment" = "7-甲", "value" = 2, "cause" = "看过的版本", "provenance" = "用户 10-21" }]'),
      { '作品/应力转动/地点/边城/6-3-6/落地.ts': "import { exception } from '@engine/core/例外.ts';\nexport const 停 = exception('打击停顿', 2, { segment: '7-甲', cause: '看过的版本' });\n" },
      { '库/边城轮廓.ts': "import { exception } from '../../engine/core/例外.ts';\nexport const 停 = exception('打击停顿', 2, { segment: '7-甲', cause: '看过的版本' });\n" },
    );
    const v = (await runRule('rules', root)).violations;
    expect(v.join('\n')).toMatch(/库\/边城轮廓.ts:2 例外 只写在 作品\/应力转动\/段\/ 或 作品\/应力转动\/场\//);
    expect(v.filter((x) => x.includes('6-3-6'))).toEqual([]);
  });

  it('场里被几段借用的代码，段 写成数组：每段各登记一条，少登记的拦；段目录里不许写数组', async () => {
    const root = makeRepo(
      base(),
      ruleTable('[]', '[{ "segment" = "7-甲", "value" = 2, "cause" = "x", "provenance" = "y" }, { "segment" = "7-乙", "value" = 2, "cause" = "x", "provenance" = "y" }]'),
      { '作品/应力转动/场/7-场一/画面.tsx': "import { exception } from '@engine/core/例外.ts';\nexport const 停 = exception('打击停顿', 2, { segment: ['7-甲', '7-乙', '7-丙'], cause: '借用' });\n" },
      pictureSource("exception('打击停顿', 2, { segment: ['7-甲'], cause: 'x' })"),
    );
    const v = (await runRule('rules', root)).violations.join('\n');
    expect(v).toMatch(/作品\/应力转动\/场\/7-场一\/画面.tsx:2 规矩「打击停顿」对 段 7-丙 的例外没在 作品\/应力转动\/规矩.toml 登记/);
    expect(v).not.toMatch(/对 段 7-乙 的例外没在/);
    expect(v).toMatch(/作品\/应力转动\/段\/7-甲\/画面.tsx:2 作品\/应力转动\/段\/7-甲\/ 里的例外要写 segment: '7-甲'/);
  });

  it('代码例外没登记就拦', async () => {
    const root = makeRepo(base(), pictureSource("exception('打击停顿', 3, { segment: '7-甲', cause: '看过的版本' })"));
    expect((await runRule('rules', root)).violations.join('\n')).toMatch(/规矩「打击停顿」对 段 7-甲 的例外没在 作品\/应力转动\/规矩.toml 登记/);
  });

  it('改名导入、命名空间导入、转出、把 例外 当值传都拦，x.例外(...) 也算例外调用', async () => {
    const root = makeRepo(base(), {
      '作品/应力转动/段/7-甲/画面.tsx': [
        "import { exception as 豁免 } from '@engine/core/例外.ts';",
        "import * as 核 from '@engine/core/例外';",
        "export const a = 豁免('打击停顿', 6, { segment: '7-甲', cause: 'x' });",
        "export const b = 核.exception('打击停顿', 7, { segment: '7-甲', cause: 'x' });",
        'export default () => null;',
        '',
      ].join('\n'),
      '作品/应力转动/段/7-甲/别名.ts': "import { exception } from '@engine/core/例外.ts';\nexport const 豁免 = exception;\nexport { exception as 开口 };\n",
      '库/转出.ts': "export * from '../engine/core/例外.ts';\n",
    });
    const v = (await runRule('rules', root)).violations.join('\n');
    expect(v).toMatch(/画面.tsx:1 不许给 exception 改名导入/);
    expect(v).toMatch(/画面.tsx:2 不许用命名空间导入 engine\/core\/例外.ts/);
    expect(v).toMatch(/画面.tsx:4 规矩「打击停顿」对 段 7-甲 的例外没在 作品\/应力转动\/规矩.toml 登记/);
    expect(v).toMatch(/别名.ts:2 exception 只能直接调用/);
    expect(v).toMatch(/别名.ts:3 不许转出 exception/);
    expect(v).toMatch(/库\/转出.ts:1 不许转出 engine\/core\/例外.ts/);
  });

  it('出处里 M/ 引用的记忆要在、行号不超出；记忆目录不在本机就跳过', async () => {
    const makeRuleTable = (source: string, exceptionSource: string) => ({
      '作品/应力转动/规矩.toml': [
        '[["rule"]]',
        'id = "打击停顿"',
        '"defaultValue" = 1',
        '"level" = "参考"',
        '"quotes" = []',
        '"appliesTo" = "打中"',
        `"provenance" = ${source}`,
        '"placement" = []',
        `"exceptions" = [{ "segment" = "6-斩娜迦", "value" = 2, "cause" = "看过的版本", "provenance" = "${exceptionSource}" }]`,
      ].join('\n'),
    });
    const memoryDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'anim-记忆-')));
    try {
      fs.mkdirSync(path.join(memoryDir, '..', path.basename(memoryDir) + '-旁'), { recursive: true });
      fs.writeFileSync(path.join(memoryDir, '..', path.basename(memoryDir) + '-旁', '合并.md'), '一\n');
      fs.writeFileSync(path.join(memoryDir, 'fight.md'), '一\n二\n三\n');
      const sidePath = `M/../${path.basename(memoryDir)}-旁/合并.md`;
      const cleanResult = await runRule('rules', makeRepo(base(), makeRuleTable(`["用户 10-18", "M/fight.md", "M/fight.md:3", "${sidePath}"]`, 'M/fight.md；7d077904')), { memoryRoot: memoryDir });
      expect(cleanResult.violations).toEqual([]);
      expect(cleanResult.report.skipped).toEqual([]);

      const violationText = (await runRule('rules', makeRepo(base(), makeRuleTable('["M/fight.md:9", "M/删了.md"]', 'M/改名了.md')), { memoryRoot: memoryDir })).violations.join('\n');
      expect(violationText).toMatch(/规矩「打击停顿」的出处 M\/fight.md:9 超出文件行数/);
      expect(violationText).toMatch(/规矩「打击停顿」的出处 M\/删了.md 在记忆目录里找不到/);
      expect(violationText).toMatch(/规矩「打击停顿」的出处 M\/改名了.md 在记忆目录里找不到/);

      const absentMemoryResult = await runRule('rules', makeRepo(base(), makeRuleTable('["M/删了.md"]', 'M/改名了.md')), { memoryRoot: path.join(memoryDir, '没有这个目录') });
      expect(absentMemoryResult.violations).toEqual([]);
      expect(absentMemoryResult.report.skipped.join('\n')).toMatch(/出处的记忆引用（2 处）：记忆目录 .*没有这个目录 不在本机/);
    } finally {
      fs.rmSync(memoryDir, { recursive: true, force: true });
      fs.rmSync(path.join(memoryDir, '..', path.basename(memoryDir) + '-旁'), { recursive: true, force: true });
    }
  });

  it('记忆引用的写法', () => {
    expect(parseMemoryRefs('M/manju-adaptation.md:18「可写」')).toEqual([{ path: 'manju-adaptation.md', 行: 18 }]);
    expect(parseMemoryRefs('M/a.md、M/../image-flow/b-c.md')).toEqual([{ path: 'a.md' }, { path: '../image-flow/b-c.md' }]);
    expect(parseMemoryRefs('CLAUDE.md 元规则 1；ANIM/x.md；docs/M/x.md')).toEqual([]);
  });

  it('落点格式', () => {
    expect(parseLanding('engine/core/例外.ts 例外、例外依据')).toEqual({ path: 'engine/core/例外.ts', symbols: ['例外', '例外依据'] });
    expect(parseLanding('库/角色/跑步.ts（照旧 跑步.ts） runPoseAt')).toEqual({ path: '库/角色/跑步.ts', symbols: ['runPoseAt'] });
    expect(parseLanding('rules/')).toEqual({ path: 'rules', symbols: [] });
    expect(parseLanding('旧:src/lib/anim.ts X')).toEqual({ pendingMigration: true });
    expect('错' in parseLanding('参考模型库/src/x.ts')).toBe(true);
  });
});
