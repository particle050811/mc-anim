import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { 新建预览目录 } from './预览.ts';

describe('预览目录', () => {
  it('<UTC 月日-时分>-<主题>，同一分钟已有内容就不覆盖', () => {
    const 根 = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-预览-'));
    const ms = Date.UTC(2026, 9, 21, 9, 5);
    const dir = 新建预览目录('冒烟', 根, ms);
    expect(path.basename(dir)).toBe('1021-0905-冒烟');
    expect(新建预览目录('冒烟', 根, ms)).toBe(dir); // 空的可以接着用
    fs.writeFileSync(path.join(dir, 'a.png'), '');
    expect(() => 新建预览目录('冒烟', 根, ms)).toThrow(/不覆盖/);
    expect(() => 新建预览目录('a/b', 根, ms)).toThrow(/不能当文件夹名/);
    fs.rmSync(根, { recursive: true });
  });
});
