import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { newPreviewDir, isDraft } from './预览.ts';

describe('预览目录', () => {
  it('<UTC 月日-时分>-<主题>，同一分钟已有内容就不覆盖', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-预览-'));
    const ms = Date.UTC(2026, 9, 21, 9, 5);
    const dir = newPreviewDir('冒烟', root, ms);
    expect(path.basename(dir)).toBe('1021-0905-冒烟');
    expect(newPreviewDir('冒烟', root, ms)).toBe(`${dir}-2`);
    fs.writeFileSync(path.join(dir, 'a.png'), '原图');
    expect(newPreviewDir('冒烟', root, ms)).toBe(`${dir}-3`);
    expect(fs.readFileSync(path.join(dir, 'a.png'), 'utf8')).toBe('原图');
    expect(() => newPreviewDir('a/b', root, ms)).toThrow(/不能当文件夹名/);
    fs.rmSync(root, { recursive: true });
  });

  it('主题以「工作-」开头的算中间稿', () => {
    expect(isDraft('工作-门口哈气')).toBe(true);
    expect(isDraft('门口哈气')).toBe(false);
    expect(isDraft('样片-工作-')).toBe(false);
  });
});
