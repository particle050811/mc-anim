import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { esbuild资产插件 } from './esbuild插件.ts';
import { 读资产表 } from './资产表.ts';
import { id合法, 入库, 写资产锁, 解析资产, 读资产锁, 字节路径 } from './资产锁.ts';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sr-资产-'));

describe('资产锁', () => {
  it('写出来键排序、条目字段也排序、缩进 2、末尾换行（和 Python sort_keys 一致）', () => {
    const d = tmp();
    const f = path.join(d, '锁.json');
    写资产锁({ 乙: { 库: 'store', 后缀: '.png', 大小: 1, sha256: 'b'.repeat(64) }, 甲: { sha256: 'a'.repeat(64), 大小: 2, 库: '私有', 后缀: '.wav' } }, f);
    const text = fs.readFileSync(f, 'utf8');
    expect(text).toBe(
      JSON.stringify({ 乙: { sha256: 'b'.repeat(64), 后缀: '.png', 大小: 1, 库: 'store' }, 甲: { sha256: 'a'.repeat(64), 后缀: '.wav', 大小: 2, 库: '私有' } }, null, 2) + '\n',
    );
    // 按码位排：乙 U+4E59 在 甲 U+7532 前面
    expect(Object.keys(读资产锁(f))).toEqual(['乙', '甲']);
    const py = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['-c', 'import json,sys; d=json.load(open(sys.argv[1],encoding="utf-8")); sys.stdout.buffer.write((json.dumps(d,sort_keys=True,ensure_ascii=False,indent=2)+"\\n").encode())', f], { encoding: 'utf8' });
    if (py.status === 0) expect(py.stdout).toBe(text);
  });

  it('入库按 sha 放、同 sha 不重复写；查不到的 id 报出该跑的命令', () => {
    const 根 = tmp();
    const 源 = path.join(根, 'x.PNG');
    fs.writeFileSync(源, 'abc');
    const e = 入库(源, 'store', 根);
    expect(e).toMatchObject({ 大小: 3, 库: 'store', 后缀: '.png', sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' });
    expect(fs.readFileSync(字节路径(e, 根), 'utf8')).toBe('abc');
    expect(入库(源, 'store', 根)).toEqual(e);
    expect(解析资产('核对/x', { '核对/x': e }, 根).文件).toBe(字节路径(e, 根));
    expect(() => 解析资产('核对/没有', {}, 根)).toThrow(/sr assets add 核对\/没有/);
    expect(() => 解析资产('核对/x', { '核对/x': { ...e, sha256: 'f'.repeat(64) } }, 根)).toThrow(/字节不在/);
  });

  it('id 规则', () => {
    expect(id合法('贴图/实体/九胡')).toBe(true);
    expect(id合法('九胡')).toBe(false);
    expect(id合法('贴图/有 空格')).toBe(false);
    expect(id合法('贴图/a:b')).toBe(false);
  });
});

describe('资产表', () => {
  it('中文键要加引号；缺字段、取值不对、来源格式不对、重复 id 都报出来', () => {
    const d = tmp();
    fs.writeFileSync(
      path.join(d, '贴图.toml'),
      ['[["资产"]]', 'id = "贴图/甲"', '"类别" = "贴图"', '"来源" = "手工:画的"', '"许可" = "MIT"', '"可见性" = "公开"', '', '[["资产"]]', 'id = "贴图/乙"', '"类别" = "贴图"', '"来源" = "随便"', '"许可" = "MIT"', '"可见性" = "半公开"'].join('\n'),
    );
    fs.writeFileSync(path.join(d, '音效.toml'), ['[["资产"]]', 'id = "贴图/甲"', '"类别" = "音效"', '"来源" = "提取:原版音效@0123456789ab"', '"许可" = "MIT"', '"可见性" = "提取"'].join('\n'));
    const { 条目, 问题 } = 读资产表(d);
    expect(条目.get('贴图/甲')?.表).toBe('音效.toml');
    expect(问题).toEqual([
      '贴图.toml 的「贴图/乙」：可见性只能是 公开、提取、发布、私有',
      '贴图.toml 的「贴图/乙」：来源要写成 提取:<配方>@<jar sha> / 手工:<说明> / 派生:<输入 sha>+<参数>',
      '音效.toml 的「贴图/甲」：id 和 贴图.toml 里的重复',
    ]);
  });

  it('仓库里的资产表没有问题、资产锁里的都登记了', () => {
    const { 条目, 问题 } = 读资产表();
    expect(问题).toEqual([]);
    for (const id of Object.keys(读资产锁())) expect(条目.has(id)).toBe(true);
  });
});

describe('esbuild 的 asset: 解析', () => {
  it('记下用到的 id 和 sha；锁里没有就构建失败', async () => {
    const d = tmp();
    fs.writeFileSync(path.join(d, 'a.ts'), "import x from 'asset:核对/甲'; console.log(x);");
    const 记录 = new Map<string, string>();
    const 锁 = { '核对/甲': { sha256: 'a'.repeat(64), 大小: 1, 库: 'store' as const, 后缀: '.png' } };
    await build({ entryPoints: [path.join(d, 'a.ts')], bundle: true, write: false, logLevel: 'silent', plugins: [esbuild资产插件(锁, 记录)] });
    expect([...记录]).toEqual([['核对/甲', 'a'.repeat(64)]]);
    fs.writeFileSync(path.join(d, 'b.ts'), "import x from 'asset:核对/乙'; console.log(x);");
    await expect(build({ entryPoints: [path.join(d, 'b.ts')], bundle: true, write: false, logLevel: 'silent', plugins: [esbuild资产插件(锁, 记录)] })).rejects.toThrow(
      /资产锁里没有「核对\/乙」.*sr assets add/,
    );
  });
});
