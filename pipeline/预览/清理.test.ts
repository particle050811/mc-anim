import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { 夹时间, 是文字, 执行清理, 规划草稿清理, 规划预览清理, 解析引用 } from './清理.ts';

const 天 = 24 * 3600 * 1000;
const 写 = (p: string, 字节 = 10) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, Buffer.alloc(字节));
};

describe('预览清理', () => {
  it('夹名的月日时分按 UTC 算，跨年取去年', () => {
    const 现在 = Date.UTC(2026, 10, 2, 14, 0);
    expect(夹时间('1102-1408-换歌', 现在)).toBe(Date.UTC(2026, 10, 2, 14, 8));
    expect(夹时间('1230-0100-年末', Date.UTC(2027, 0, 2))).toBe(Date.UTC(2026, 11, 30, 1, 0));
    expect(夹时间('换歌', 现在)).toBeNull();
    expect(夹时间('1340-0000-坏', 现在)).toBeNull();
  });

  it('文字按后缀和大小认', () => {
    expect(是文字('00-说明.md', 3000)).toBe(true);
    expect(是文字('报告.html', 3 * 1024 * 1024)).toBe(false);
    expect(是文字('01-成片.mp4', 10)).toBe(false);
  });

  it('引用按完整路径取，中文标点、通配符处截断，只到夹的不算', () => {
    const r = 解析引用('预览/1023-1635-正片三版/01-课表-原样.png，\n预览/1102-1143-verify比法\n预览/监守者/剖面*.png\n预览/a/b.png。');
    expect([...r].sort()).toEqual(['1023-1635-正片三版/01-课表-原样.png', 'a/b.png', '监守者/剖面']);
  });

  it('过时的夹文字挪进归档、媒体删；新的不动；归档里的只删媒体；引用的照留', () => {
    const 根 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-预览清理-'));
    const 预览 = path.join(根, '预览');
    const 归档 = path.join(根, 'archive');
    const 现在 = Date.UTC(2026, 10, 2, 14, 0);
    写(path.join(预览, '1025-0249-成片/00-说明.md'));
    写(path.join(预览, '1025-0249-成片/01-成片.mp4'), 1000);
    写(path.join(预览, '1023-1635-课表/01-课表-原样.png'));
    写(path.join(预览, '1102-1408-换歌/05-成片.mp4'));
    写(path.join(归档, '1022-0805-数据/00-说明.md'));
    写(path.join(归档, '1022-0805-数据/02-图.png'), 50);
    写(path.join(归档, '1024-0101-只有图/a.png'));
    写(path.join(归档, '1025-0249-成片/00-说明.md')); // 归档里已有同名的，不覆盖

    const 引用 = new Set(['1023-1635-课表/01-课表-原样.png']);
    const 计划 = 规划预览清理({ 预览根: 预览, 归档根: 归档, 现在, 天数: 3, 引用 });
    expect(计划.map((x) => x.名).sort()).toEqual(['1022-0805-数据', '1023-1635-课表', '1024-0101-只有图', '1025-0249-成片']);
    const r = 执行清理(计划, []);

    expect(r).toMatchObject({ 归档夹: 2, 删文件: 3, 删字节: 1060 });
    expect(fs.readdirSync(预览)).toEqual(['1102-1408-换歌']);
    expect(fs.readdirSync(path.join(归档, '1025-0249-成片')).sort()).toEqual(['00-说明-2.md', '00-说明.md']);
    expect(fs.existsSync(path.join(归档, '1023-1635-课表/01-课表-原样.png'))).toBe(true);
    expect(fs.readdirSync(path.join(归档, '1022-0805-数据'))).toEqual(['00-说明.md']);
    expect(fs.existsSync(path.join(归档, '1024-0101-只有图'))).toBe(false);
    // 再清一遍没事做
    expect(规划预览清理({ 预览根: 预览, 归档根: 归档, 现在, 天数: 3, 引用 })).toEqual([]);
    fs.rmSync(根, { recursive: true });
  });

  it('草稿只删按日期起名、超过天数没动的', () => {
    const 根 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-草稿清理-'));
    const 旧 = Date.now() - 20 * 天;
    for (const 名 of ['1001-0000-工作-旧', '配音', '1101-0000-工作-新']) 写(path.join(根, 名, 'a.png'));
    for (const 名 of ['1001-0000-工作-旧', '配音']) {
      fs.utimesSync(path.join(根, 名, 'a.png'), 旧 / 1000, 旧 / 1000);
      fs.utimesSync(path.join(根, 名), 旧 / 1000, 旧 / 1000);
    }
    expect(规划草稿清理(根, Date.now(), 14).map((d) => d.名)).toEqual(['1001-0000-工作-旧']);
    fs.rmSync(根, { recursive: true });
  });
});
