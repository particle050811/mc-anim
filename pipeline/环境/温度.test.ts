import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let dir: string;
const osPlatform = process.platform;
vi.mock('./配置.ts', () => ({ dataPath: (...p: string[]) => path.join(dir, 'data', ...p) }));
vi.mock('./路径.ts', () => ({ codeRoot: () => dir }));
vi.mock('node:child_process', () => {
  const run = vi.fn();
  return { execFileSync: run, execFile: (cmd: string, args: string[], opts: unknown, cb: (err: unknown, out: string) => void) => {
    try { cb(null, run(cmd, args, opts)); } catch (e) { cb(e, ''); }
  } };
});
const execMock = vi.mocked(execFileSync);
const artifactPath = () => path.join(dir, 'data', 'cache', 'temperature', `die-${process.arch}-${createHash('sha256').update('探针源码').digest('hex')}`);
const failCompile = () => execMock.mockImplementation((cmd, args) => {
  if (cmd === 'swiftc') { fs.writeFileSync(args!.at(-1)!, '半成品'); throw new Error('没有编译器'); }
  return cmd === 'notifyutil' ? 'com.apple.system.thermalpressurelevel 2' : '70.3';
});
beforeEach(() => {
  vi.resetModules();
  execMock.mockReset();
  Object.defineProperty(process, 'platform', { value: 'darwin' });
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-temperature-'));
  fs.mkdirSync(path.join(dir, 'pipeline', '环境'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'pipeline', '环境', '温度.swift'), '探针源码');
  execMock.mockImplementation((cmd, args) => {
    if (cmd === 'swiftc') { fs.writeFileSync(args!.at(-1)!, '探针产物'); return ''; }
    return cmd === 'notifyutil' ? 'com.apple.system.thermalpressurelevel 0\n' : '82.456';
  });
});
afterEach(() => {
  Object.defineProperty(process, 'platform', { value: osPlatform });
  fs.rmSync(dir, { recursive: true, force: true });
});

it('源码 sha 命名缓存；首次编译、以后复用，参数数组不开 shell', async () => {
  const { readTemperature, readTempParallel } = await import('./温度.ts');
  expect(readTemperature()).toEqual({ chipMaxTemp: 82.5, thermalLevel: 0 });
  expect(await readTempParallel()).toEqual({ chipMaxTemp: 82.5, thermalLevel: 0 });
  const sha = createHash('sha256').update('探针源码').digest('hex');
  const files = fs.readdirSync(path.join(dir, 'data', 'cache', 'temperature'));
  expect(files).toEqual([`die-${process.arch}-${sha}`]);
  expect(files[0]).not.toMatch(/[<>:"/\\|?*]/);
  expect(execMock.mock.calls.filter(([cmd]) => cmd === 'swiftc')).toHaveLength(1);
  expect(execMock.mock.calls.find(([cmd]) => cmd === 'notifyutil')?.[1]).toEqual(['-g', 'com.apple.system.thermalpressurelevel']);
  for (const [cmd, args, opts] of execMock.mock.calls) {
    expect(Array.isArray(args)).toBe(true);
    expect(opts).not.toHaveProperty('shell', true);
    expect(opts).toHaveProperty('timeout', cmd === 'swiftc' ? 20_000 : 1000);
    if (cmd === 'swiftc') expect(opts).toHaveProperty('killSignal', 'SIGINT');
  }
  vi.resetModules();
  expect((await import('./温度.ts')).readTemperature().chipMaxTemp).toBe(82.5);
  expect(execMock.mock.calls.filter(([cmd]) => cmd === 'swiftc')).toHaveLength(1);
  fs.appendFileSync(path.join(dir, 'pipeline', '环境', '温度.swift'), '改版');
  vi.resetModules();
  (await import('./温度.ts')).readTemperature();
  expect(execMock.mock.calls.filter(([cmd]) => cmd === 'swiftc')).toHaveLength(2);
});

it('编不出来不重编、不留半成品，仍独立读取发热等级', async () => {
  failCompile();
  const { readTemperature, readTempParallel } = await import('./温度.ts');
  expect(readTemperature()).toEqual({ chipMaxTemp: null, thermalLevel: 2 });
  expect(await readTempParallel()).toEqual({ chipMaxTemp: null, thermalLevel: 2 });
  expect(execMock.mock.calls.filter(([cmd]) => cmd === 'swiftc')).toHaveLength(1);
  expect(fs.readdirSync(path.join(dir, 'data', 'cache', 'temperature'))).toEqual([`${path.basename(artifactPath())}.失败`]);
});

it('编译失败后放好产物，同进程立即读到芯温且不重算路径', async () => {
  failCompile();
  const { readTemperature, readTempParallel } = await import('./温度.ts');
  expect(readTemperature().chipMaxTemp).toBeNull();
  fs.writeFileSync(artifactPath(), '另一进程编好的产物');
  fs.rmSync(path.join(dir, 'pipeline', '环境', '温度.swift'));
  expect(readTemperature()).toEqual({ chipMaxTemp: 70.3, thermalLevel: 2 });
  expect(await readTempParallel()).toEqual({ chipMaxTemp: 70.3, thermalLevel: 2 });
  expect(execMock.mock.calls.filter(([cmd]) => cmd === 'swiftc')).toHaveLength(1);
});

it('失败标记未满 1 小时，新进程也不调 swiftc，超过 1 小时再试', async () => {
  failCompile();
  expect((await import('./温度.ts')).readTemperature().chipMaxTemp).toBeNull();
  expect(fs.existsSync(`${artifactPath()}.失败`)).toBe(true);
  vi.resetModules();
  expect(await (await import('./温度.ts')).readTempParallel()).toEqual({ chipMaxTemp: null, thermalLevel: 2 });
  expect(execMock.mock.calls.filter(([cmd]) => cmd === 'swiftc')).toHaveLength(1);
  const staleDate = new Date(Date.now() - 3600_001);
  fs.utimesSync(`${artifactPath()}.失败`, staleDate, staleDate);
  vi.resetModules();
  execMock.mockImplementation((cmd, args) => {
    if (cmd === 'swiftc') { fs.writeFileSync(args!.at(-1)!, '探针产物'); return ''; }
    return cmd === 'notifyutil' ? 'com.apple.system.thermalpressurelevel 0' : '70.3';
  });
  expect((await import('./温度.ts')).readTemperature()).toEqual({ chipMaxTemp: 70.3, thermalLevel: 0 });
  expect(execMock.mock.calls.filter(([cmd]) => cmd === 'swiftc')).toHaveLength(2);
});

it('冷却期间产物出现，新进程也忽略失败标记并直接读取', async () => {
  failCompile();
  (await import('./温度.ts')).readTemperature();
  fs.writeFileSync(artifactPath(), '另一进程编好的产物');
  vi.resetModules();
  expect(await (await import('./温度.ts')).readTempParallel()).toEqual({ chipMaxTemp: 70.3, thermalLevel: 2 });
  expect(fs.existsSync(`${artifactPath()}.失败`)).toBe(true);
  expect(execMock.mock.calls.filter(([cmd]) => cmd === 'swiftc')).toHaveLength(1);
});

it.each(['', 'null', 'NaN', 'Infinity', '-1', '150', '0'])('坏读数 %s 是 null，不是假装正常', async (value) => {
  const { readTemperature, readTempParallel } = await import('./温度.ts');
  readTemperature();
  execMock.mockReturnValue(value);
  const expected = { chipMaxTemp: null, thermalLevel: value === '0' ? 0 : null };
  expect(readTemperature()).toEqual(expected);
  expect(await readTempParallel()).toEqual(expected);
});

it('读取超时、权限不足都退化为 null', async () => {
  const { readTemperature, readTempParallel } = await import('./温度.ts');
  readTemperature();
  execMock.mockImplementation(() => { throw new Error('读不到'); });
  expect(readTemperature()).toEqual({ chipMaxTemp: null, thermalLevel: null });
  expect(await readTempParallel()).toEqual({ chipMaxTemp: null, thermalLevel: null });
});

it.each(['win32', 'linux'])('%s 不读文件、不起子进程', async osPlatform => {
  Object.defineProperty(process, 'platform', { value: osPlatform });
  const { readTemperature, readTempParallel } = await import('./温度.ts');
  expect(readTemperature()).toEqual({ chipMaxTemp: null, thermalLevel: null });
  expect(await readTempParallel()).toEqual({ chipMaxTemp: null, thermalLevel: null });
  expect(execMock).not.toHaveBeenCalled();
  expect(fs.existsSync(path.join(dir, 'data'))).toBe(false);
});
