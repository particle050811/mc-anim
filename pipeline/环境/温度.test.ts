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
const 产物 = () => path.join(dir, 'data', 'cache', 'temperature', `die-${process.arch}-${createHash('sha256').update('探针源码').digest('hex')}`);
const 编译失败 = () => 跑.mockImplementation((cmd, args) => {
  if (cmd === 'swiftc') { fs.writeFileSync(args!.at(-1)!, '半成品'); throw new Error('没有编译器'); }
  return cmd === 'notifyutil' ? 'com.apple.system.thermalpressurelevel 2' : '70.3';
});
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
  for (const [cmd, args, opts] of 跑.mock.calls) {
    expect(Array.isArray(args)).toBe(true);
    expect(opts).not.toHaveProperty('shell', true);
    expect(opts).toHaveProperty('timeout', cmd === 'swiftc' ? 20_000 : 1000);
    if (cmd === 'swiftc') expect(opts).toHaveProperty('killSignal', 'SIGINT');
  }
  vi.resetModules();
  expect((await import('./温度.ts')).读温度().芯片最高温).toBe(82.5);
  expect(跑.mock.calls.filter(([cmd]) => cmd === 'swiftc')).toHaveLength(1);
  fs.appendFileSync(path.join(dir, 'pipeline', '环境', '温度.swift'), '改版');
  vi.resetModules();
  (await import('./温度.ts')).读温度();
  expect(跑.mock.calls.filter(([cmd]) => cmd === 'swiftc')).toHaveLength(2);
});

it('编不出来不重编、不留半成品，仍独立读取发热等级', async () => {
  编译失败();
  const { 读温度, 读温度并行 } = await import('./温度.ts');
  expect(读温度()).toEqual({ 芯片最高温: null, 发热等级: 2 });
  expect(await 读温度并行()).toEqual({ 芯片最高温: null, 发热等级: 2 });
  expect(跑.mock.calls.filter(([cmd]) => cmd === 'swiftc')).toHaveLength(1);
  expect(fs.readdirSync(path.join(dir, 'data', 'cache', 'temperature'))).toEqual([`${path.basename(产物())}.失败`]);
});

it('编译失败后放好产物，同进程立即读到芯温且不重算路径', async () => {
  编译失败();
  const { 读温度, 读温度并行 } = await import('./温度.ts');
  expect(读温度().芯片最高温).toBeNull();
  fs.writeFileSync(产物(), '另一进程编好的产物');
  fs.rmSync(path.join(dir, 'pipeline', '环境', '温度.swift'));
  expect(读温度()).toEqual({ 芯片最高温: 70.3, 发热等级: 2 });
  expect(await 读温度并行()).toEqual({ 芯片最高温: 70.3, 发热等级: 2 });
  expect(跑.mock.calls.filter(([cmd]) => cmd === 'swiftc')).toHaveLength(1);
});

it('失败标记未满 1 小时，新进程也不调 swiftc，超过 1 小时再试', async () => {
  编译失败();
  expect((await import('./温度.ts')).读温度().芯片最高温).toBeNull();
  expect(fs.existsSync(`${产物()}.失败`)).toBe(true);
  vi.resetModules();
  expect(await (await import('./温度.ts')).读温度并行()).toEqual({ 芯片最高温: null, 发热等级: 2 });
  expect(跑.mock.calls.filter(([cmd]) => cmd === 'swiftc')).toHaveLength(1);
  const 过期 = new Date(Date.now() - 3600_001);
  fs.utimesSync(`${产物()}.失败`, 过期, 过期);
  vi.resetModules();
  跑.mockImplementation((cmd, args) => {
    if (cmd === 'swiftc') { fs.writeFileSync(args!.at(-1)!, '探针产物'); return ''; }
    return cmd === 'notifyutil' ? 'com.apple.system.thermalpressurelevel 0' : '70.3';
  });
  expect((await import('./温度.ts')).读温度()).toEqual({ 芯片最高温: 70.3, 发热等级: 0 });
  expect(跑.mock.calls.filter(([cmd]) => cmd === 'swiftc')).toHaveLength(2);
});

it('冷却期间产物出现，新进程也忽略失败标记并直接读取', async () => {
  编译失败();
  (await import('./温度.ts')).读温度();
  fs.writeFileSync(产物(), '另一进程编好的产物');
  vi.resetModules();
  expect(await (await import('./温度.ts')).读温度并行()).toEqual({ 芯片最高温: 70.3, 发热等级: 2 });
  expect(fs.existsSync(`${产物()}.失败`)).toBe(true);
  expect(跑.mock.calls.filter(([cmd]) => cmd === 'swiftc')).toHaveLength(1);
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

it('后台只读现成探针：缺缓存不编译，也不妨碍随后正常读取时编译', async () => {
  const { 读现成温度, 读温度并行 } = await import('./温度.ts');
  expect(await 读现成温度()).toEqual({ 芯片最高温: null, 发热等级: 0 });
  expect(跑.mock.calls.map(([cmd]) => cmd)).toEqual(['notifyutil']);
  expect(await 读温度并行()).toEqual({ 芯片最高温: 82.5, 发热等级: 0 });
  expect(跑.mock.calls.filter(([cmd]) => cmd === 'swiftc')).toHaveLength(1);
  跑.mockClear();
  expect(await 读现成温度()).toEqual({ 芯片最高温: 82.5, 发热等级: 0 });
  expect(跑.mock.calls.some(([cmd]) => cmd === 'swiftc')).toBe(false);
});
