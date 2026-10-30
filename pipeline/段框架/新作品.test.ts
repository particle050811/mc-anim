// anim new work / new seg 的模板：在临时目录起作品、加段，生成的 段.ts 能执行，清单尾部和两部作品的一样。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { 段定义 } from '../../engine/段/段定义.ts';
import { 代码根 } from '../环境/路径.ts';
import { 声音地址文本, 声音表文本, 新鲜执行 } from './生成.ts';
import { 注册模板, 清单加一段, 新作品, 新段 } from './新作品.ts';

let 临时: string;
beforeEach(() => {
  临时 = fs.mkdtempSync(path.join(os.tmpdir(), '段框架-新作品-'));
});
afterEach(() => fs.rmSync(临时, { recursive: true, force: true }));

const 读 = (...p: string[]) => fs.readFileSync(path.join(...p), 'utf8');

describe('新作品', () => {
  it('注册.tsx 和两部作品的一字不差', () => {
    expect(注册模板).toBe(读(代码根(), '作品', '应力转动', '注册.tsx'));
    expect(注册模板).toBe(读(代码根(), '作品', '把回忆拼好给你', '注册.tsx'));
  });

  it('起一部：文件齐、起步段能执行（2 秒 48 帧、没有声音）、清单能用', async () => {
    const 写了 = 新作品(临时, '试作');
    const 根 = path.join(临时, '作品', '试作');
    expect(写了.map((f) => path.relative(根, f)).sort()).toEqual(
      ['index.ts', '注册.tsx', '清单.ts', '核对/起步/段.ts', '核对/起步/画面.tsx', '核对/起步/声音表.生成.ts', '核对/起步/声音地址.生成.ts'].sort(),
    );
    expect(读(根, '核对/起步/声音表.生成.ts')).toBe(声音表文本({ 资产: {}, 台词: {} }));
    expect(读(根, '核对/起步/声音地址.生成.ts')).toBe(声音地址文本([], {}));
    const 段 = (await 新鲜执行(path.join(根, '核对/起步/段.ts'), 代码根())).default as 段定义;
    expect([段.帧数, 段.fps, 段.宽, 段.高, 段.声音]).toEqual([48, 24, 1280, 720, undefined]);
    const 清单 = await 新鲜执行(path.join(根, '清单.ts'), 代码根());
    expect((清单.段目录 as (k: string) => string)('核对-起步')).toBe('核对/起步');
    expect(() => 新作品(临时, '试作')).toThrow(/已经有了/);
    expect(() => 新作品(临时, '../外面')).toThrow(/只能用/);
  });
});

describe('新段', () => {
  it('正片段：建场时间线、段目录，排进清单；同场第二段共用时间线', async () => {
    新作品(临时, '试作');
    const 根 = path.join(临时, '作品', '试作');
    新段(根, '1-开门', { 场: '1-门口' });
    新段(根, '1-进门', { 场: '1-门口', 起: '结束', 止: '结束' });
    expect(fs.existsSync(path.join(根, '场/1-门口/时间线.ts'))).toBe(true);
    expect(读(根, '清单.ts')).toMatch(/\{ 键: '核对-起步', 章: '核对' \},\n  \{ 键: '1-开门', 章: 1 \},\n  \{ 键: '1-进门', 章: 1 \},\n\];/);
    const 段 = (await 新鲜执行(path.join(根, '段/1-开门/段.ts'), 代码根())).default as 段定义 & { 场窗口: unknown };
    expect([段.帧数, 段.场窗口]).toEqual([72, { 起帧: 0, 止帧: 72 }]);
    // 段键只在目录名和清单里
    expect(读(根, '段/1-开门/段.ts')).not.toContain('1-开门');
    expect(读(根, '段/1-开门/画面.tsx')).not.toContain('1-开门');
  });

  it('老场（只有定义段写的老段、没有场时间线）：用 接老段 摆上老段，新段接在最后一个老段后面，老段文件不动', async () => {
    新作品(临时, '试作');
    const 根 = path.join(临时, '作品', '试作');
    const 老文本 = (帧数: number) => `import { 定义段 } from '@engine/段/段定义.ts';\nexport default 定义段({ 场: '1-老场', 帧数: ${帧数}, fps: 24, 宽: 1280, 高: 720, 地形: [] });\n`;
    for (const [k, n] of [['1-老一', 30], ['1-老二', 18]] as const) {
      fs.mkdirSync(path.join(根, '段', k), { recursive: true });
      fs.writeFileSync(path.join(根, '段', k, '段.ts'), 老文本(n));
    }
    const 格式 = { fps: 24, 宽: 1280, 高: 720 };
    const 写了 = 新段(根, '1-新', { 场: '1-老场', 老段: [{ 键: '1-老一', 帧数: 30, ...格式 }, { 键: '1-老二', 帧数: 18, ...格式 }] });
    expect(写了.map((f) => path.relative(根, f))).toContain('场/1-老场/时间线.ts');
    expect(读(根, '场/1-老场/时间线.ts')).toMatch(/export default 接老段\(/);
    expect(读(根, '场/1-老场/时间线.ts')).not.toMatch(/import .*段\.ts/);
    const 段 = (await 新鲜执行(path.join(根, '段/1-新/段.ts'), 代码根())).default as 段定义 & { 场窗口: unknown };
    expect([段.场, 段.帧数, 段.场窗口]).toEqual(['1-老场', 72, { 起帧: 48, 止帧: 120 }]);
    expect(读(根, '段/1-老一/段.ts')).toBe(老文本(30));
    // 同场再加一段：认得 接老段 做的时间线
    新段(根, '1-再新', { 场: '1-老场', 起: '结束', 止: '结束' });
  });

  it('参数不对、老写法的时间线：报错不写', () => {
    新作品(临时, '试作');
    const 根 = path.join(临时, '作品', '试作');
    expect(() => 新段(根, '开门', {})).toThrow(/段键/);
    expect(() => 新段(根, '1-开门', {})).toThrow(/--场/);
    fs.mkdirSync(path.join(根, '场/1-老'), { recursive: true });
    fs.writeFileSync(path.join(根, '场/1-老/时间线.ts'), 'export const 事件 = {};\n');
    expect(() => 新段(根, '1-开门', { 场: '1-老' })).toThrow(/定义场时间线/);
    expect(fs.existsSync(path.join(根, '段/1-开门'))).toBe(false);
    新段(根, '核对-试声', {});
    expect(() => 新段(根, '核对-试声', {})).toThrow(/已经有了/);
  });

  it('清单加一段：找不到数组、重复键报错', () => {
    expect(() => 清单加一段('const x = 1;', '1-a', 1)).toThrow(/找不到/);
    expect(() => 清单加一段("export const 清单 = [\n  { 键: '1-a', 章: 1 },\n];", '1-a', 1)).toThrow(/已经有/);
  });
});
