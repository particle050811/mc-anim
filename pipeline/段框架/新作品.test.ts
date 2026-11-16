// anim new work / new seg 的模板：在临时目录起作品、加段，生成的 段.ts 能执行，清单尾部和两部作品的一样。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SegmentDef } from '../../engine/段/段定义.ts';
import { codeRoot } from '../环境/路径.ts';
import { soundUrlText, soundTableText, freshExec } from './生成.ts';
import { registryTemplate, addSegToManifest, newWork, newSegment } from './新作品.ts';
import { missingRegistryDirs, registeredDirs } from './注册目录.ts';
import { usesContinueOldSeg } from './核对.ts';

let tempDir: string;
beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), '段框架-新作品-'));
});
afterEach(() => fs.rmSync(tempDir, { recursive: true, force: true }));

const readText = (...p: string[]) => fs.readFileSync(path.join(...p), 'utf8');

describe('新作品', () => {
  it('注册.tsx 和两部作品的一字不差', () => {
    expect(registryTemplate).toBe(readText(codeRoot(), '作品', '应力转动', '注册.tsx'));
    expect(registryTemplate).toBe(readText(codeRoot(), '作品', '把回忆拼好给你', '注册.tsx'));
  });

  it('起一部：文件齐、起步段能执行（2 秒、没有声音）、清单能用', async () => {
    const written = newWork(tempDir, '试作');
    const workRoot = path.join(tempDir, '作品', '试作');
    expect(written.map((f) => path.relative(workRoot, f)).sort()).toEqual(
      ['index.ts', '注册.tsx', '清单.ts', '段/说明.md', '核对/起步/段.ts', '核对/起步/画面.tsx', '核对/起步/声音表.生成.ts', '核对/起步/声音地址.生成.ts'].sort(),
    );
    expect(readText(workRoot, '核对/起步/声音表.生成.ts')).toBe(soundTableText({ asset: {}, lines: {} }));
    expect(readText(workRoot, '核对/起步/声音地址.生成.ts')).toBe(soundUrlText([], {}));
    const seg = (await freshExec(path.join(workRoot, '核对/起步/段.ts'), codeRoot())).default as SegmentDef;
    expect([seg.sec, seg.width, seg.height, seg.sound]).toEqual([2, 1280, 720, undefined]);
    const manifestModule = await freshExec(path.join(workRoot, '清单.ts'), codeRoot());
    expect((manifestModule.segDir as (k: string) => string)('核对-起步')).toBe('核对/起步');
    // 还没有正片段时 段/ 也在（注册.tsx 的 webpackContext('./段') 要它），占位文件不会被注册.tsx 的正则当成段
    expect(registeredDirs(registryTemplate)).toEqual(['段', '核对']);
    expect(missingRegistryDirs(workRoot)).toEqual([]);
    expect(registryTemplate).not.toMatch(/说明/);
    fs.rmSync(path.join(workRoot, '段'), { recursive: true });
    expect(missingRegistryDirs(workRoot)).toEqual(['段']);
    expect(() => newWork(tempDir, '试作')).toThrow(/已经有了/);
    expect(() => newWork(tempDir, '../外面')).toThrow(/只能用/);
  });
});

describe('新段', () => {
  it('正片段：建场时间线、段目录，排进清单；同场第二段共用时间线', async () => {
    newWork(tempDir, '试作');
    const workRoot = path.join(tempDir, '作品', '试作');
    newSegment(workRoot, '1-开门', { scene: '1-门口' });
    newSegment(workRoot, '1-进门', { scene: '1-门口', start: '结束', end: '结束' });
    expect(fs.existsSync(path.join(workRoot, '场/1-门口/时间线.ts'))).toBe(true);
    expect(readText(workRoot, '清单.ts')).toMatch(/\{ 键: '核对-起步', 章: '核对' \},\n  \{ 键: '1-开门', 章: 1 \},\n  \{ 键: '1-进门', 章: 1 \},\n\];/);
    const seg = (await freshExec(path.join(workRoot, '段/1-开门/段.ts'), codeRoot())).default as SegmentDef & { sceneWindow: unknown };
    expect([seg.sec, seg.sceneWindow]).toEqual([3, { startSec: 0, endSec: 3 }]);
    // 段键只在目录名和清单里
    expect(readText(workRoot, '段/1-开门/段.ts')).not.toContain('1-开门');
    expect(readText(workRoot, '段/1-开门/画面.tsx')).not.toContain('1-开门');
  });

  it('老场（只有 defineSeg 写的老段、没有场时间线）：用 continueOldSeg 摆上老段，新段接在最后一个老段后面，老段文件不动', async () => {
    newWork(tempDir, '试作');
    const workRoot = path.join(tempDir, '作品', '试作');
    const legacySegText = (durSec: number) => `import { defineSeg } from '@engine/段/段定义.ts';\nexport default defineSeg({ scene: '1-老场', sec: ${durSec}, width: 1280, height: 720, terrain: [] });\n`;
    for (const [k, n] of [['1-老一', 1.25], ['1-老二', 0.75]] as const) {
      fs.mkdirSync(path.join(workRoot, '段', k), { recursive: true });
      fs.writeFileSync(path.join(workRoot, '段', k, '段.ts'), legacySegText(n));
    }
    const frameSize = { width: 1280, height: 720 };
    const written = newSegment(workRoot, '1-新', { scene: '1-老场', legacySegs: [{ key: '1-老一', sec: 1.25, ...frameSize }, { key: '1-老二', sec: 0.75, ...frameSize }] });
    expect(written.map((f) => path.relative(workRoot, f))).toContain('场/1-老场/时间线.ts');
    expect(readText(workRoot, '场/1-老场/时间线.ts')).toMatch(/export default continueOldSeg\(/);
    expect(usesContinueOldSeg(readText(workRoot, '场/1-老场/时间线.ts'))).toBe(true); // anim check 认得出这条线，才会核抄的段长
    expect(readText(workRoot, '场/1-老场/时间线.ts')).not.toMatch(/import .*段\.ts/);
    const seg = (await freshExec(path.join(workRoot, '段/1-新/段.ts'), codeRoot())).default as SegmentDef & { sceneWindow: unknown };
    expect([seg.scene, seg.sec, seg.sceneWindow]).toEqual(['1-老场', 3, { startSec: 2, endSec: 5 }]);
    expect(readText(workRoot, '段/1-老一/段.ts')).toBe(legacySegText(1.25));
    // 同场再加一段：认得 continueOldSeg 做的时间线
    newSegment(workRoot, '1-再新', { scene: '1-老场', start: '结束', end: '结束' });
  });

  it('参数不对、老写法的时间线：报错不写', () => {
    newWork(tempDir, '试作');
    const workRoot = path.join(tempDir, '作品', '试作');
    expect(() => newSegment(workRoot, '开门', {})).toThrow(/段键/);
    expect(() => newSegment(workRoot, '1-开门', {})).toThrow(/--scene/);
    fs.mkdirSync(path.join(workRoot, '场/1-老'), { recursive: true });
    fs.writeFileSync(path.join(workRoot, '场/1-老/时间线.ts'), 'export const events = {};\n');
    expect(() => newSegment(workRoot, '1-开门', { scene: '1-老' })).toThrow(/defineSceneTimeline/);
    expect(fs.existsSync(path.join(workRoot, '段/1-开门'))).toBe(false);
    newSegment(workRoot, '核对-试声', {});
    expect(() => newSegment(workRoot, '核对-试声', {})).toThrow(/已经有了/);
  });

  it('清单加一段：找不到数组、重复键报错', () => {
    expect(() => addSegToManifest('const x = 1;', '1-a', 1)).toThrow(/找不到/);
    expect(() => addSegToManifest("export const manifest = [\n  { key: '1-a', 章: 1 },\n];", '1-a', 1)).toThrow(/已经有/);
  });
});
