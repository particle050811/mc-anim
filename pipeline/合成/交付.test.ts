// 交付自足：有未拉响度的 FLAC 就够（剪辑包用户 11-06 定不要了），gc 按它解钉。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const 数据根 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-交付测试-'));
process.env.ANIM_DATA = 数据根;
const { 未拉响度文件 } = await import('./交付.ts');
const { 交付自足 } = await import('../缓存/回收.ts');

afterAll(() => fs.rmSync(数据根, { recursive: true, force: true }));

describe('交付', () => {
  it('自足：有未拉响度的 FLAC 就够', () => {
    const dir = path.join(数据根, '交付', '作品甲', '自足');
    fs.mkdirSync(dir, { recursive: true });
    expect(交付自足(dir)).toBe(false);
    fs.writeFileSync(path.join(dir, 未拉响度文件), '');
    expect(交付自足(dir)).toBe(true);
  });
});
