import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let dir: string;
const 平台 = process.platform;
vi.mock('./配置.ts', () => ({ 数据路径: (...p: string[]) => path.join(dir, 'data', ...p) }));
vi.mock('./路径.ts', () => ({ 代码根: () => dir }));
vi.mock('node:child_process', () => {
  const run = vi.fn();
  return { execFileSync: run, execFile: (cmd: string, args: string[], opts: unknown, cb: (err: unknown, out: string) => void) => {
    try { cb(null, run(cmd, args, opts)); } catch (e) { cb(e, ''); }
  } };
});
const 跑 = vi.mocked(execFileSync);
beforeEach(() => {
  vi.resetModules();
  跑.mockReset();
  Object.defineProperty(process, 'platform', { value: 'darwin' });
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-temperature-'));
  fs.mkdirSync(path.join(dir, 'pipeline', '环境'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'pipeline', '环境', '温度.swift'), '探针源码');
  跑.mockImplementation((cmd, args) => {
    if (cmd === 'swiftc') { fs.writeFileSync(args!.at(-1)!, '探针产物'); return ''; }
    return cmd === 'notifyutil' ? 'com.apple.system.thermalpressurelevel 0\n' : '82.456';
  });
});
afterEach(() => {
  Object.defineProperty(process, 'platform', { value: 平台 });
  fs.rmSync(dir, { recursive: true, force: true });
});

it('源码 sha 命名缓存；首次编译、以后复用，参数数组不开 shell', async () => {
  const { 读温度, 读温度并行 } = await import('./温度.ts');
  expect(读温度()).toEqual({ 芯片最高温: 82.5, 发热等级: 0 });
  expect(await 读温度并行()).toEqual({ 芯片最高温: 82.5, 发热等级: 0 });
  const sha = createHash('sha256').update('探针源码').digest('hex');
  const files = fs.readdirSync(path.join(dir, 'data', 'cache', 'temperature'));
  expect(files).toEqual([`die-${process.arch}-${sha}`]);
  expect(files[0]).not.toMatch(/[<>:"/\\|?*]/);
  expect(跑.mock.calls.filter(([cmd]) => cmd === 'swiftc')).toHaveLength(1);
  expect(跑.mock.calls.find(([cmd]) => cmd === 'notifyutil')?.[1]).toEqual(['-g', 'com.apple.system.thermalpressurelevel']);
  for (const [, args, opts] of 跑.mock.calls) { expect(Array.isArray(args)).toBe(true); expect(opts).not.toHaveProperty('shell', true); }
  vi.resetModules();
  expect((await import('./温度.ts')).读温度().芯片最高温).toBe(82.5);
  expect(跑.mock.calls.filter(([cmd]) => cmd === 'swiftc')).toHaveLength(1);
  fs.appendFileSync(path.join(dir, 'pipeline', '环境', '温度.swift'), '改版');
  vi.resetModules();
  (await import('./温度.ts')).读温度();
  expect(跑.mock.calls.filter(([cmd]) => cmd === 'swiftc')).toHaveLength(2);
});

it('编不出来不重编、不留半成品，仍独立读取发热等级', async () => {
  跑.mockImplementation((cmd, args) => {
    if (cmd === 'swiftc') { fs.writeFileSync(args!.at(-1)!, '半成品'); throw new Error('没有编译器'); }
    return 'com.apple.system.thermalpressurelevel 2';
  });
  const { 读温度, 读温度并行 } = await import('./温度.ts');
  expect(读温度()).toEqual({ 芯片最高温: null, 发热等级: 2 });
  expect(await 读温度并行()).toEqual({ 芯片最高温: null, 发热等级: 2 });
  expect(跑.mock.calls.filter(([cmd]) => cmd === 'swiftc')).toHaveLength(1);
  expect(fs.readdirSync(path.join(dir, 'data', 'cache', 'temperature'))).toEqual([]);
});

it.each(['', 'null', 'NaN', 'Infinity', '-1', '150', '0'])('坏读数 %s 是 null，不是假装正常', async (值) => {
  const { 读温度, 读温度并行 } = await import('./温度.ts');
  读温度();
  跑.mockReturnValue(值);
  const 期望 = { 芯片最高温: null, 发热等级: 值 === '0' ? 0 : null };
  expect(读温度()).toEqual(期望);
  expect(await 读温度并行()).toEqual(期望);
});

it('读取超时、权限不足都退化为 null', async () => {
  const { 读温度, 读温度并行 } = await import('./温度.ts');
  读温度();
  跑.mockImplementation(() => { throw new Error('读不到'); });
  expect(读温度()).toEqual({ 芯片最高温: null, 发热等级: null });
  expect(await 读温度并行()).toEqual({ 芯片最高温: null, 发热等级: null });
});

it.each(['win32', 'linux'])('%s 不读文件、不起子进程', async 平台 => {
  Object.defineProperty(process, 'platform', { value: 平台 });
  const { 读温度, 读温度并行 } = await import('./温度.ts');
  expect(读温度()).toEqual({ 芯片最高温: null, 发热等级: null });
  expect(await 读温度并行()).toEqual({ 芯片最高温: null, 发热等级: null });
  expect(跑).not.toHaveBeenCalled();
  expect(fs.existsSync(path.join(dir, 'data'))).toBe(false);
});
