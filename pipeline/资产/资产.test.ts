import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { esbuild资产插件 } from './esbuild插件.ts';
import { 登记入库 } from './命令.ts';
import { 读两侧资产表, 读资产表 } from './资产表.ts';
import { id合法, 入库, 写资产锁, 解析资产, 读作品资产锁, 读资产锁, 字节路径, type 锁条目 } from './资产锁.ts';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'anim-资产-'));

describe('资产锁', () => {
  it('一件一个文件：字段排序、缩进 2、末尾换行（和 Python sort_keys 一致）；读回来键按 id 排', () => {
    const d = path.join(tmp(), '资产锁');
    写资产锁({ 'b/乙': { 库: 'store', 后缀: '.png', 大小: 1, sha256: 'b'.repeat(64) }, 'b/甲/深': { sha256: 'a'.repeat(64), 大小: 2, 库: '私有', 后缀: '.wav' }, 'b-c/丙': { sha256: 'c'.repeat(64), 大小: 3, 库: 'store', 后缀: '.png' } }, d);
    const f = path.join(d, 'b', '甲', '深.json');
    const text = fs.readFileSync(f, 'utf8');
    expect(text).toBe(JSON.stringify({ sha256: 'a'.repeat(64), 后缀: '.wav', 大小: 2, 库: '私有' }, null, 2) + '\n');
    // 按 id 的码位排：'-' U+002D 在 '/' U+002F 前面（按文件路径排就会反过来）；乙 U+4E59 在 甲 U+7532 前面
    expect(Object.keys(读资产锁(d))).toEqual(['b-c/丙', 'b/乙', 'b/甲/深']);
    const py = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['-c', 'import json,sys; d=json.load(open(sys.argv[1],encoding="utf-8")); sys.stdout.buffer.write((json.dumps(d,sort_keys=True,ensure_ascii=False,indent=2)+"\\n").encode())', f], { encoding: 'utf8' });
    if (py.status === 0) expect(py.stdout).toBe(text);
  });

  it('写锁只动变了的文件：没变的不重写，删掉的连空目录一起删；整份一个文件的旧格式在就报错', () => {
    const 根 = tmp();
    const d = path.join(根, '资产锁');
    const 条 = (c: string) => ({ sha256: c.repeat(64), 大小: 1, 库: 'store' as const, 后缀: '.png' });
    写资产锁({ '贴图/甲': 条('a'), '贴图/深/乙': 条('b') }, d);
    const 甲 = path.join(d, '贴图', '甲.json');
    fs.utimesSync(甲, 0, 0);
    写资产锁({ '贴图/甲': 条('a'), '音效/丙': 条('c') }, d);
    expect(fs.statSync(甲).mtimeMs).toBe(0);
    expect(fs.existsSync(path.join(d, '贴图', '深'))).toBe(false);
    expect(Object.keys(读资产锁(d))).toEqual(['贴图/甲', '音效/丙']);
    fs.writeFileSync(`${d}.json`, '{}');
    expect(() => 读资产锁(d)).toThrow(/旧资产锁/);
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
    expect(() => 解析资产('核对/没有', {}, 根)).toThrow(/anim assets add 核对\/没有/);
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
      ['[["资产"]]', 'id = "贴图/甲"', '"类别" = "贴图"', '"来源" = "手工:画的"', '"许可" = "MIT"', '"可见性" = "公开"', '', '[["资产"]]', 'id = "贴图/乙"', '"类别" = "贴图"', '"来源" = "随便"', '"许可" = "MIT"', '"可见性" = "半公开"', '', '[["资产"]]', 'id = "贴图/丙"', '"类别" = "贴图"', '"来源" = "提取:网格图集@多个jar"', '"许可" = "MIT"', '"可见性" = "提取"', '', '[["资产"]]', 'id = "贴图/丁"', '"类别" = "贴图"', '"来源" = "提取:网格图集@0bdc89263616+56b71336d2b4"', '"许可" = "MIT"', '"可见性" = "提取"'].join('\n'),
    );
    fs.writeFileSync(path.join(d, '音效.toml'), ['[["资产"]]', 'id = "贴图/甲"', '"类别" = "音效"', '"来源" = "提取:原版音效@0123456789ab"', '"许可" = "MIT"', '"可见性" = "提取"'].join('\n'));
    const { 条目, 问题 } = 读资产表(d);
    expect(条目.get('贴图/甲')?.表).toBe('音效.toml');
    expect(问题).toEqual([
      '贴图.toml 的「贴图/乙」：可见性只能是 公开、提取、发布、私有',
      '贴图.toml 的「贴图/乙」：来源要写成 提取:<配方>@<jar sha256 前 12 位>[+…] / 手工:<说明> / 派生:<输入 sha>+<参数>',
      '贴图.toml 的「贴图/丙」：来源要写成 提取:<配方>@<jar sha256 前 12 位>[+…] / 手工:<说明> / 派生:<输入 sha>+<参数>',
      '音效.toml 的「贴图/甲」：id 和 贴图.toml 里的重复',
    ]);
  });

  it('仓库里的资产表没有问题、资产锁里的都登记了', () => {
    const { 条目, 问题 } = 读资产表();
    expect(问题).toEqual([]);
    for (const id of Object.keys(读资产锁())) expect(条目.has(id)).toBe(true);
  });
});

const 一条 = (id: string, 可见性 = '公开') => ['[["资产"]]', `id = "${id}"`, `"类别" = "${id.split('/')[0]}"`, '"来源" = "手工:测试"', '"许可" = "MIT"', `"可见性" = "${可见性}"`].join('\n');

/** 一个临时的共用侧（资产表目录、资产锁）、一部作品（作品根下 资产表/、资产锁/）和数据根 */
const 两侧 = (共用条: string[], 作品条: string[]) => {
  const d = tmp();
  const 共用表目录 = path.join(d, 'registry');
  const 作品根 = path.join(d, '作品', '示例');
  fs.mkdirSync(共用表目录, { recursive: true });
  fs.mkdirSync(path.join(作品根, '资产表'), { recursive: true });
  fs.writeFileSync(path.join(共用表目录, '贴图.toml'), 共用条.join('\n\n'));
  fs.writeFileSync(path.join(作品根, '资产表', '配乐.toml'), 作品条.join('\n\n'));
  const 共用锁 = path.join(d, '资产锁');
  写资产锁({ '贴图/共用甲': { sha256: 'a'.repeat(64), 大小: 1, 库: 'store', 后缀: '.png' } }, 共用锁);
  const 源 = path.join(d, '曲.m4a');
  fs.writeFileSync(源, '曲子');
  return { 共用表目录, 作品根, 共用锁, 数据根: path.join(d, '数据'), 源 };
};

describe('作品资产表', () => {
  it('共用表并上作品资产表：条目记着在哪一侧，两侧都登记的 id 进 重复', () => {
    const t = 两侧([一条('贴图/共用甲'), 一条('配乐/撞名')], [一条('配乐/曲', '私有'), 一条('配乐/撞名')]);
    const { 条目, 重复 } = 读两侧资产表(t.作品根, t.共用表目录);
    expect(条目.get('贴图/共用甲')?.侧).toBe('共用');
    expect(条目.get('配乐/曲')).toMatchObject({ 侧: '作品', 表: '配乐.toml', 可见性: '私有' });
    expect(条目.get('配乐/撞名')?.侧).toBe('共用');
    expect(重复.map((e) => e.id)).toEqual(['配乐/撞名']);
    // 作品没有 资产表/ 就只有共用的
    expect([...读两侧资产表(path.join(t.作品根, '没有'), t.共用表目录).条目.keys()]).toEqual(['贴图/共用甲', '配乐/撞名']);
  });

  it('assets add：作品资产表登记的只写作品的锁，共用锁一个字节不变；共用表登记的写共用锁', () => {
    const t = 两侧([一条('贴图/共用甲'), 一条('贴图/共用乙')], [一条('配乐/曲', '私有')]);
    const 共用甲 = path.join(t.共用锁, '贴图', '共用甲.json');
    const 共用锁原样 = fs.readFileSync(共用甲);
    const r = 登记入库('配乐/曲', t.源, t);
    expect(r.锁文件).toBe(path.join(t.作品根, '资产锁'));
    expect(读资产锁(r.锁文件)).toEqual({ '配乐/曲': r.条目 });
    expect(r.条目.库).toBe('私有');
    expect(fs.existsSync(字节路径(r.条目, t.数据根))).toBe(true);
    expect(fs.readdirSync(t.共用锁, { recursive: true })).toEqual(['贴图', path.join('贴图', '共用甲.json')]);
    expect(fs.readFileSync(共用甲)).toEqual(共用锁原样);

    const 图 = path.join(path.dirname(t.源), '图.png');
    fs.writeFileSync(图, 'png');
    const r2 = 登记入库('贴图/共用乙', 图, t);
    expect(r2.锁文件).toBe(t.共用锁);
    expect(Object.keys(读资产锁(t.共用锁))).toEqual(['贴图/共用乙', '贴图/共用甲']);
    expect(Object.keys(读资产锁(r.锁文件))).toEqual(['配乐/曲']);
  });

  it('assets add：没登记、两侧都登记报错；sha 变了要 --替换；登记换了一侧，锁跟着挪', () => {
    const t = 两侧([一条('贴图/共用甲'), 一条('配乐/撞名')], [一条('配乐/撞名'), 一条('贴图/共用甲')]);
    expect(() => 登记入库('配乐/没有', t.源, t)).toThrow(/资产表里没有「配乐\/没有」.*<作品根>\/资产表/);
    expect(() => 登记入库('配乐/撞名', t.源, t)).toThrow(/在共用表和作品资产表里都登记了/);

    // 贴图/共用甲 原来在共用锁；现在只登记在作品资产表
    fs.writeFileSync(path.join(t.共用表目录, '贴图.toml'), '');
    expect(() => 登记入库('贴图/共用甲', t.源, t)).toThrow(/已有另一份.*--替换/);
    const r = 登记入库('贴图/共用甲', t.源, { ...t, 替换: true });
    expect(r.挪自).toBe(t.共用锁);
    expect(读资产锁(t.共用锁)).toEqual({});
    expect(Object.keys(读资产锁(r.锁文件))).toEqual(['贴图/共用甲']);
  });

  it('打包用的锁：共用锁并上作品锁，同一个 id 两边都有报错', () => {
    const 作品根 = tmp();
    const 共用 = 读资产锁();
    expect(读作品资产锁(作品根)).toEqual(共用);
    写资产锁({ '配乐/只在作品': { sha256: 'c'.repeat(64), 大小: 1, 库: '私有', 后缀: '.m4a' } }, path.join(作品根, '资产锁'));
    expect(读作品资产锁(作品根)['配乐/只在作品']?.库).toBe('私有');
    const 撞 = Object.keys(共用)[0]!;
    写资产锁({ [撞]: 共用[撞]! }, path.join(作品根, '资产锁'));
    expect(() => 读作品资产锁(作品根)).toThrow(/在共用锁和 .* 里都有/);
  });

  it('换用.toml：这部作品里共用 id 换成作品那件的字节；换用 = false 是没换的；右边没登记、写法不对报错', () => {
    const 作品根 = tmp();
    const 共用 = 读资产锁();
    const 原 = Object.keys(共用).find((id) => 共用[id]!.后缀 === '.png')!;
    const 换: 锁条目 = { sha256: 'd'.repeat(64), 大小: 2, 库: '私有', 后缀: '.png' };
    fs.writeFileSync(path.join(作品根, '换用.toml'), `# 说明\n"${原}" = "贴图/附加/甲"  # 行尾注释\n`);
    expect(() => 读作品资产锁(作品根)).toThrow(/贴图\/附加\/甲 不在资产锁里/);
    写资产锁({ '贴图/附加/甲': 换 }, path.join(作品根, '资产锁'));
    expect(读作品资产锁(作品根)[原]).toEqual(换);
    expect(读作品资产锁(作品根, undefined, false)[原]).toEqual(共用[原]);
    fs.writeFileSync(path.join(作品根, '换用.toml'), `${原} = 贴图/附加/甲\n`);
    expect(() => 读作品资产锁(作品根)).toThrow(/认不出/);
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
      /资产锁里没有「核对\/乙」.*anim assets add/,
    );
  });
});
