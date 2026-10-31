import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { 缺的本机地形 } from './渲.ts';

let 根: string;
beforeEach(() => {
  根 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-本机地形-'));
});
afterEach(() => fs.rmSync(根, { recursive: true, force: true }));

describe('缺的本机地形', () => {
  it('没写的段不管；写了的，包在就不跳，不在就报包名', () => {
    const 段 = path.join(根, '段');
    const 地形 = path.join(根, 'terrain');
    fs.mkdirSync(段);
    expect(缺的本机地形({ 目录: 段 }, 地形)).toBeNull();
    fs.writeFileSync(path.join(段, '本机地形.txt'), '某包\n');
    expect(缺的本机地形({ 目录: 段 }, 地形)).toBe('某包');
    fs.mkdirSync(path.join(地形, '某包'), { recursive: true });
    expect(缺的本机地形({ 目录: 段 }, 地形)).toBeNull();
  });
});
