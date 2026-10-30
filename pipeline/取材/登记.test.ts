import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { encode } from 'fast-png';
import { describe, expect, it } from 'vitest';
import { 读资产表 } from '../资产/资产表.ts';
import { 读资产锁 } from '../资产/资产锁.ts';
import { SPDX合法 } from '../检查/规则/资产.ts';
import { 像素sha, 像素一致 } from './像素.ts';
import { 改许可, 条目文本, 登记产物, 算补许可, 追加条目 } from './登记.ts';
import { 合取, 继承许可, 许可表, 读jar许可 } from './许可.ts';
import { 按文件展开产物, 填, 解析清单, 读清单 } from './清单.ts';

const jar文本 = `
[["Mojang"."资源索引"]]
"id" = "索引"
"根" = "mc资源"
"到" = "indexes/5.json"
"旧sha256前缀" = ["aaaaaaaaaaaa"]
"许可" = { "代码" = "LicenseRef-Minecraft-EULA", "资源" = "LicenseRef-Minecraft-EULA" }
[["模组"]]
"id" = "机械"
"到" = "mods/c.jar"
"sha256" = "${'c'.repeat(64)}"
"许可" = { "代码" = "MIT", "资源" = "LicenseRef-All-Rights-Reserved" }
[["模组"]]
"id" = "暮色"
"到" = "mods/t.jar"
"sha256" = "${'d'.repeat(64)}"
"许可" = { "代码" = "LGPL-2.1-only", "资源" = "LicenseRef-待核-CC-BY-NC-SA", "声音" = "LicenseRef-All-Rights-Reserved" }
[["模组"]]
"id" = "旧写法"
"到" = "mods/o.jar"
"sha256" = "${'e'.repeat(64)}"
"许可" = "OSI"
`;
const 清单文本 = `
[["取材"]]
"名称" = "图"
"需要" = ["机械", "暮色"]
"公开版" = "提取"
"步骤" = [["python", "x.py"]]
["取材"."产物"]
"贴图/图/*" = "out/*.png"
[["取材"]]
"名称" = "实体"
"需要" = ["暮色"]
"公开版" = "提取"
"许可部分" = ["资源", "代码"]
"步骤" = [["python", "x.py"]]
`;
const q = 解析清单(清单文本, jar文本);
const 表 = 许可表(q.jars.values());

describe('许可按 jar 继承', () => {
  it('结构化字段；旧的一句话写法当成没定', () => {
    expect(q.jars.get('机械')?.许可).toEqual({ 代码: 'MIT', 资源: 'LicenseRef-All-Rights-Reserved' });
    expect(q.jars.get('旧写法')?.许可).toEqual({ 原文: 'OSI' });
    expect(() => 读jar许可({ 美术: 'MIT' })).toThrow('美术');
  });

  it('按类别取部分（音效取声音，没写声音退回资源），几个 jar 用 AND 合起来、去重', () => {
    expect(继承许可(`提取:x@${'c'.repeat(12)}`, ['声音'], 表)).toEqual({ 许可: 'LicenseRef-All-Rights-Reserved', 缺: [] });
    expect(继承许可(`提取:x@${'c'.repeat(12)}+${'d'.repeat(12)}`, ['声音'], 表).许可).toBe('LicenseRef-All-Rights-Reserved');
    expect(继承许可(`提取:x@aaaaaaaaaaaa+${'c'.repeat(12)}`, ['资源'], 表).许可).toBe('LicenseRef-Minecraft-EULA AND LicenseRef-All-Rights-Reserved');
  });

  it('有一个 jar 的那部分待核或不认识，就不给许可、说清卡在哪', () => {
    const r = 继承许可(`提取:x@${'c'.repeat(12)}+${'d'.repeat(12)}`, ['资源'], 表);
    expect(r.许可).toBeUndefined();
    expect(r.缺).toEqual(['暮色 的资源许可 LicenseRef-待核-CC-BY-NC-SA']);
    expect(继承许可(`提取:x@${'f'.repeat(12)}`, ['资源'], 表).缺[0]).toContain('不是 jars.toml');
    expect(继承许可(`提取:x@${'e'.repeat(12)}`, ['资源'], 表).缺[0]).toContain('原文：OSI');
    expect(继承许可('手工:画的', ['资源'], 表).缺.length).toBe(1);
  });

  it('合取：带 OR 的加括号，结果是合法 SPDX', () => {
    const x = 合取(['MIT', 'OFL-1.1 OR GPL-2.0-or-later', 'MIT']);
    expect(x).toBe('MIT AND (OFL-1.1 OR GPL-2.0-or-later)');
    expect(SPDX合法(x)).toBe(true);
  });

  it('补许可只碰 待定 且 提取来的；配方的 许可部分 优先于类别', () => {
    const 条 = (id: string, 来源: string, 许可 = 'LicenseRef-待定') => ({ id, 类别: id.split('/')[0]!, 来源, 许可, 可见性: '提取' as const, 表: 'x.toml', 侧: '共用' as const });
    const r = 算补许可(q, [
      条('音效/a', `提取:图@${'c'.repeat(12)}`),
      条('模型/b', `提取:实体@${'d'.repeat(12)}`),
      条('贴图/c', '手工:画的'),
      条('贴图/d', `提取:图@${'c'.repeat(12)}`, 'MIT'),
    ]);
    expect(r.能补.map((x) => [x.e.id, x.许可])).toEqual([['音效/a', 'LicenseRef-All-Rights-Reserved']]);
    expect(r.仍待定.map((x) => x.e.id)).toEqual(['模型/b']);
  });
});

describe('资产表文本改动', () => {
  const 原 = `# 头注释\n\n[["资产"]]\nid = "贴图/甲"\n"类别" = "贴图"\n"来源" = "手工:x"\n"许可" = "LicenseRef-待定"\n"可见性" = "提取"\n"旧路径" = "a/b.png"\n\n[["资产"]]\nid = "贴图/甲乙"\n"类别" = "贴图"\n"来源" = "手工:x"\n"许可" = "LicenseRef-待定"\n"可见性" = "提取"\n`;

  it('改许可只换那一条的许可行，别的不动', () => {
    const 新 = 改许可(原, '贴图/甲', 'MIT');
    expect(新).toBe(原.replace('"许可" = "LicenseRef-待定"', '"许可" = "MIT"'));
    expect(() => 改许可(原, '贴图/没有', 'MIT')).toThrow('没有');
  });

  it('追加的条目读得回来', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), '登记-'));
    fs.writeFileSync(path.join(dir, '贴图.toml'), 追加条目(原, [{ id: '贴图/丙', 类别: '贴图', 来源: '提取:图@cccccccccccc', 许可: 'MIT', 可见性: '提取', 说明: '说"明"' }]));
    const r = 读资产表(dir);
    expect(r.问题).toEqual([]);
    expect(r.条目.get('贴图/丙')?.说明).toBe('说"明"');
    expect(r.条目.size).toBe(3);
    expect(条目文本({ id: 'a/b', 类别: 'a', 来源: '手工:x', 许可: 'MIT', 可见性: '公开' })).not.toContain('说明');
    fs.rmSync(dir, { recursive: true });
  });
});

describe('--登记', () => {
  it('锁里没有的产物登记进 <类>.toml、入库、写锁；已登记的不重复登记', () => {
    const 根 = fs.mkdtempSync(path.join(os.tmpdir(), '登记-'));
    const 暂存 = path.join(根, '暂存');
    fs.mkdirSync(path.join(暂存, 'out'), { recursive: true });
    fs.writeFileSync(path.join(暂存, 'out/新.png'), 'PNG新');
    fs.writeFileSync(path.join(暂存, 'out/旧.png'), 'PNG旧');
    const 表目录 = path.join(根, 'registry');
    fs.mkdirSync(表目录);
    const 锁文件 = path.join(根, '资产锁.json');
    fs.writeFileSync(锁文件, '{}\n');
    const 产物 = 按文件展开产物(q.条目.get('图')!.产物, ['out/新.png', 'out/旧.png', 'out/深/x.png', 'other.txt']);
    expect(产物).toEqual([
      ['贴图/图/新', 'out/新.png'],
      ['贴图/图/旧', 'out/旧.png'],
    ]);
    const 已登记 = new Map([['贴图/图/旧', { id: '贴图/图/旧', 类别: '贴图', 来源: '手工:x', 许可: 'MIT', 可见性: '私有' as const, 表: '贴图.toml', 侧: '共用' as const }]]);
    const r = 登记产物(q, q.条目.get('图')!, 暂存, 产物.map(([id, 文件]) => ({ id, 文件 })), {
      作品根: path.join(根, '作品'),
      已登记,
      锁: {},
      jar路径: () => '/没有',
      共用表目录: 表目录,
      共用锁: 锁文件,
      数据根: path.join(根, '数据'),
    });
    expect(r.新登记).toEqual(['贴图/图/新']);
    expect(r.仍待定.map((x) => x.id)).toEqual(['贴图/图/新']); // 暮色的资源待核
    const 表 = 读资产表(表目录);
    expect(表.问题).toEqual([]);
    expect(表.条目.get('贴图/图/新')).toMatchObject({ 来源: `提取:图@${'c'.repeat(12)}+${'d'.repeat(12)}`, 许可: 'LicenseRef-待定', 可见性: '提取' });
    const 锁 = 读资产锁(锁文件);
    expect(Object.keys(锁)).toEqual(['贴图/图/新', '贴图/图/旧']);
    expect(锁['贴图/图/旧']!.库).toBe('私有'); // 照已登记的可见性
    expect(fs.existsSync(path.join(根, '数据', 'store', 锁['贴图/图/新']!.sha256.slice(0, 2), 锁['贴图/图/新']!.sha256))).toBe(true);
    fs.chmodSync(path.join(根, '数据', 'store', 锁['贴图/图/新']!.sha256.slice(0, 2), 锁['贴图/图/新']!.sha256), 0o644);
    fs.rmSync(根, { recursive: true, force: true });
  });

  it('{产物清单} 只在跑条目时有', () => {
    const v = { jar路径: (i: string) => i, prism数据: '', 脚本: '', 作品根: '', python: 'python3', mcai: [] };
    expect(填('--按产物 {产物清单}', { ...v, 产物清单: '/数据/音效.json' })).toBe('--按产物 /数据/音效.json');
    expect(() => 填('{产物清单}', v)).toThrow('产物清单');
  });
});

describe('PNG 像素 sha', () => {
  const 宽 = 3;
  const 高 = 2;
  const rgba = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]);

  it('同样像素、不同编码（RGBA / RGB / 调色板 / 压缩级别）像素 sha 一样；改一个像素就不一样', () => {
    const a = encode({ width: 宽, height: 高, data: rgba, channels: 4, depth: 8 });
    const rgb = new Uint8Array(宽 * 高 * 3).map((_, i) => rgba[Math.floor(i / 3) * 4 + (i % 3)]!);
    const b = encode({ width: 宽, height: 高, data: rgb, channels: 3, depth: 8 }, { zlib: { level: 0 } });
    const c = encode({ width: 宽, height: 高, data: new Uint8Array([0, 1, 2, 0, 1, 2]), channels: 1, depth: 8, palette: [[255, 0, 0], [0, 255, 0], [0, 0, 255]] });
    expect(Buffer.compare(Buffer.from(a), Buffer.from(b))).not.toBe(0);
    expect(像素一致(a, b)).toBe(true);
    expect(像素sha(c)).toBe(像素sha(a));
    const 改 = rgba.slice();
    改[0] = 254;
    expect(像素一致(a, encode({ width: 宽, height: 高, data: 改, channels: 4, depth: 8 }))).toBe(false);
    expect(像素sha(new TextEncoder().encode('不是 png'))).toBeNull();
  });
});

describe('仓库里的 jars.toml', () => {
  it('每个 jar 都写了结构化许可（代码、资源），值是 SPDX', () => {
    for (const j of 读清单().jars.values()) {
      expect(j.许可?.代码, `${j.id} 的代码许可`).toBeTruthy();
      expect(j.许可?.资源, `${j.id} 的资源许可`).toBeTruthy();
      for (const [k, v] of Object.entries(j.许可 ?? {})) if (k !== '原文' && k !== '依据') expect(SPDX合法(v!), `${j.id} ${k} ${v}`).toBe(true);
    }
  });
});
