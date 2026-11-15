import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { missingLocalTerrain } from './渲.ts';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-本机地形-'));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('缺的本机地形', () => {
  it('没写的段不管；写了的，包在就不跳，不在就报包名', () => {
    const segDir = path.join(root, '段');
    const terrainDir = path.join(root, 'terrain');
    fs.mkdirSync(segDir);
    expect(missingLocalTerrain({ 目录: segDir }, terrainDir)).toBeNull();
    fs.writeFileSync(path.join(segDir, '本机地形.txt'), '某包\n');
    expect(missingLocalTerrain({ 目录: segDir }, terrainDir)).toBe('某包');
    fs.mkdirSync(path.join(terrainDir, '某包'), { recursive: true });
    expect(missingLocalTerrain({ 目录: segDir }, terrainDir)).toBeNull();
  });
});
