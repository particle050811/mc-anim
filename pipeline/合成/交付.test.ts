// 交付自足：有未拉响度的 FLAC 就够（剪辑包用户 11-06 定不要了），gc 按它解钉。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-交付测试-'));
process.env.ANIM_DATA = dataRoot;
const { unnormalizedFile } = await import('./交付.ts');
const { deliverySelfContained } = await import('../缓存/回收.ts');

afterAll(() => fs.rmSync(dataRoot, { recursive: true, force: true }));

describe('交付', () => {
  it('自足：有未拉响度的 FLAC 就够', () => {
    const dir = path.join(dataRoot, '交付', '作品甲', '自足');
    fs.mkdirSync(dir, { recursive: true });
    expect(deliverySelfContained(dir)).toBe(false);
    fs.writeFileSync(path.join(dir, unnormalizedFile), '');
    expect(deliverySelfContained(dir)).toBe(true);
  });
});
