import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse as parseToml } from 'smol-toml';
import { afterAll, describe, expect, it } from 'vitest';
import { jsonSkeleton, renameJson, renameJsonl } from './改json.ts';
import { renameToml, tomlSkeleton } from './改toml.ts';
import { leftoverKeys, loadKeyTable, parseKeyTable } from './键表.ts';
import { runMigration, verifyRename } from './盘键.ts';

const table = parseKeyTable('测试', ['中文键\t英文键', '版本\tversion', '文件\tfile', '大小\tsize', '说明\tnote', '项\titems', '名\tname', '@map\t项.*.文件', '@map\t包'].join('\n'));

describe('JSON 改键', () => {
  const before = '{\n  "版本": 1.50,\n  "说明": "键 \\"版本\\" 在值里不改",\n  "项": {"甲": {"文件": {"说明": "e\\u4e2d", "名": 2}, "大小": [1e3, {"名": null}]}},\n  "包": {"版本": {"版本": "x"}}\n}\n';
  const r = renameJson(before, table);
  it('只换键记号，值和排版逐字节不动', () => {
    expect(r.text).toBe('{\n  "version": 1.50,\n  "note": "键 \\"版本\\" 在值里不改",\n  "items": {"甲": {"file": {"说明": "e\\u4e2d", "名": 2}, "size": [1e3, {"name": null}]}},\n  "包": {"版本": {"version": "x"}}\n}\n');
    expect(jsonSkeleton(r.text, table)).toBe(jsonSkeleton(before, table));
    expect(verifyRename('json', before, r.text, table)).toEqual([]);
  });
  it('重跑不再改（路径按表翻回中文，键为数据的位置照样认得）', () => {
    expect(renameJson(r.text, table)).toMatchObject({ renamed: 0, text: r.text });
  });
  it('改完撞名报出来', () => {
    expect(renameJson('{"名": 1, "name": 2}', table).collisions).toEqual(['name → name']);
    expect(verifyRename('json', '{"名": 1, "name": 2}', '{"name": 1, "name": 2}', table).length).toBeGreaterThan(0);
  });
  it('JSONL 逐行改，空行和 CRLF 照旧', () => {
    expect(renameJsonl('{"名":1}\r\n\n{"版本":2}\n', table).text).toBe('{"name":1}\r\n\n{"version":2}\n');
  });
  it('表外含汉字的键报出来', () => {
    expect([...leftoverKeys(table, JSON.parse('{"新字段": 1, "包": {"甲": 1}}')).unlisted]).toEqual(['新字段', '包']);
  });
});

describe('TOML 改键', () => {
  // smol-toml 不认中文裸键，仓库里的中文键都带引号；英文裸键照样认
  const before = [
    '# 说明 = 注释里的键不改',
    '"版本" = 3 # 行尾注释',
    '"说明" = """',
    '名 = 多行字符串里也不改',
    '"""',
    "'大小' = '字面'",
    'plain.key = 1',
    '',
    '[["项"]]',
    '"名" = "甲"',
    '"文件" = { "名" = "a", "大小" = [ { "版本" = 1 } ] }',
    '["项"."说明"]',
    '"版本" = 2',
    '',
    '["包"]',
    '"名" = "包名是数据"',
    '["包"."甲"."说明"]',
    '"名" = "x"',
    '',
  ].join('\n');
  const r = renameToml(before, table);
  it('注释、字符串、引号写法、对齐都不动', () => {
    expect(r.text).toBe(
      [
        '# 说明 = 注释里的键不改',
        '"version" = 3 # 行尾注释',
        '"note" = """',
        '名 = 多行字符串里也不改',
        '"""',
        "'size' = '字面'",
        'plain.key = 1',
        '',
        '[["items"]]',
        '"name" = "甲"',
        '"file" = { "name" = "a", "size" = [ { "version" = 1 } ] }',
        '["items"."note"]',
        '"version" = 2',
        '',
        '["包"]',
        '"名" = "包名是数据"',
        '["包"."甲"."note"]',
        '"name" = "x"',
        '',
      ].join('\n'),
    );
    expect(tomlSkeleton(r.text, table)).toBe(tomlSkeleton(before, table));
    expect(verifyRename('toml', before, r.text, table)).toEqual([]);
    expect(parseToml(r.text)).toMatchObject({ items: [{ name: '甲', note: { version: 2 } }] });
  });
  it('重跑不再改', () => {
    expect(renameToml(r.text, table).renamed).toBe(0);
  });
});

describe('整套跑（用真键表，临时仓库和数据根）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), '盘键迁移-'));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
  const repo = path.join(dir, 'repo');
  const data = path.join(dir, 'data');
  const threshold = '# 门槛\n"块8门槛" = 4 # 注\n"响度容差LU" = 0.5\n';
  const audio = '{"时长":1.25,"峰值":-3,"响度":-18}';
  fs.mkdirSync(path.join(repo, 'verify'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'verify', '阈值.toml'), threshold);
  fs.mkdirSync(path.join(data, 'cache', '音频数'), { recursive: true });
  const audioFile = path.join(data, 'cache', '音频数', 'ab.json');
  fs.writeFileSync(audioFile, audio);
  fs.utimesSync(audioFile, new Date('2026-01-01'), new Date('2026-01-02'));
  const roots = { repo, data };
  const run = (dryRun: boolean) => runMigration({ roots, only: ['阈值', '音频数'], dryRun, log: () => {}, stamp: 'T' });
  it('只算不写', () => {
    expect(run(true)).toMatchObject({ written: 0, failed: 0, backup: null });
    expect(fs.readFileSync(audioFile, 'utf8')).toBe(audio);
    expect(fs.existsSync(path.join(data, 'archive'))).toBe(false);
  });
  it('写之前数据根的先打包，修改时间照旧；重跑不写', () => {
    const r = run(false);
    expect(r).toMatchObject({ written: 2, failed: 0 });
    expect(fs.existsSync(path.join(data, 'archive', '盘键迁移-T', '备份.tar'))).toBe(true);
    expect(fs.readFileSync(path.join(repo, 'verify', '阈值.toml'), 'utf8')).toBe('# 门槛\n"block8Threshold" = 4 # 注\n"loudnessTolLu" = 0.5\n');
    expect(JSON.parse(fs.readFileSync(audioFile, 'utf8'))).toEqual({ [loadKeyTable('音频数').forward.get('时长')!]: 1.25, peakDb: -3, loudness: -18 });
    expect(fs.statSync(audioFile).mtime.toISOString()).toBe(new Date('2026-01-02').toISOString());
    expect(run(false)).toMatchObject({ written: 0, failed: 0, backup: null });
  });
});
