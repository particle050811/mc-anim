import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { codeRoot } from '../环境/路径.ts';
import { RunRecord } from '../运行记录/记录.ts';
import { UsageError } from './参数.ts';
import type { Command } from './命令.ts';
import { takeDebugArgs, isExpectedError, wantsHelp, firstFrameFile, runCommandLine } from './路由.ts';

describe('全局参数', () => {
  it('--调试 在哪都取走，-- 之后的原样留给命令', () => {
    expect(takeDebugArgs(['stale', '--调试', '6'])).toEqual({ debug: true, rest: ['stale', '6'] });
    expect(takeDebugArgs(['mcai', '--', '--调试'])).toEqual({ debug: false, rest: ['mcai', '--', '--调试'] });
    expect(takeDebugArgs([])).toEqual({ debug: false, rest: [] });
  });
});

describe('预期内的错', () => {
  const root = codeRoot();
  const fakeStack = (file: string) => `Error: x\n    at 某函数 (${file}:3:9)\n    at async 别的 (node:internal/x:1:1)`;

  it('调用栈第一帧的文件：file:// 地址（中文路径百分号编码）和普通路径都认', () => {
    const f = path.join(root, 'pipeline', '清单', '清单.ts');
    expect(firstFrameFile(fakeStack(pathToFileURL(f).href))).toBe(f);
    expect(firstFrameFile(`Error: x\n    at ${f}:1:2`)).toBe(f);
    expect(firstFrameFile('Error: 没有帧')).toBeNull();
  });

  it('我们自己 throw 的 Error、用法错、esbuild 构建失败算预期内；内置错误类型、库里抛的、非 Error 不算', () => {
    expect(isExpectedError(new Error('业务错'))).toBe(true);
    expect(isExpectedError(new UsageError('少参数'))).toBe(true);
    expect(isExpectedError(Object.assign(new Error('Build failed'), { errors: [], warnings: [] }))).toBe(true);
    expect(isExpectedError(new TypeError('x is undefined'))).toBe(false);
    expect(isExpectedError('字符串')).toBe(false);
    const fromLibrary = new Error('库里的');
    fromLibrary.stack = fakeStack(pathToFileURL(path.join(root, 'node_modules', 'x', 'index.js')).href);
    expect(isExpectedError(fromLibrary)).toBe(false);
    const outsideRepo = new Error('仓库外');
    outsideRepo.stack = fakeStack('/别处/a.ts');
    expect(isExpectedError(outsideRepo)).toBe(false);
    // fs 报的 ENOENT 第一帧在 node:fs：不管 cwd 在哪都不算
    const builtinModuleError = new Error("ENOENT: no such file or directory, open 'x'");
    builtinModuleError.stack = `Error: ENOENT\n    at Object.readFileSync (node:fs:441:20)\n    at 读 (${pathToFileURL(path.join(root, 'pipeline', 'a.ts')).href}:1:1)`;
    expect(firstFrameFile(builtinModuleError.stack)).toBe('node:fs');
    expect(isExpectedError(builtinModuleError)).toBe(false);
  });
});

describe('跑命令行', () => {
  const run = async (argv: string[], commandTable: Record<string, Command>, env: NodeJS.ProcessEnv = {}) => {
    const log: string[] = [];
    const error: string[] = [];
    const records: (RunRecord & { 退出码?: number })[] = [];
    const code = await runCommandLine(argv, {
      commandTable,
      env,
      输出: { log: (s) => log.push(s), error: (s) => error.push(s) },
      newRecord: (commandName, args) => {
        const r = new RunRecord(commandName, args) as RunRecord & { 退出码?: number };
        r.结束 = (c) => {
          r.退出码 = c;
        };
        records.push(r);
        return r;
      },
    });
    return { code, log: log.join('\n'), error: error.join('\n'), records };
  };
  const collectedArgs: string[][] = [];
  const commandTable: Record<string, Command> = {
    好: { 用法: '好 [x]', 说明: '返回 0', 跑: async (a) => void collectedArgs.push(a) },
    三: { 用法: '三', 说明: '返回 3', 跑: async () => 3 },
    用法: { 用法: '用法 <x>', 说明: '用法错', 跑: async () => { throw new UsageError('要给 x'); } },
    业务: { 用法: '业务', 说明: '业务错', 跑: async () => { throw new Error('母版不在'); } },
    坏: { 用法: '坏', 说明: '程序错', 跑: async () => { throw new TypeError('读不了 undefined 的属性'); } },
    只读: { 用法: '只读', 说明: '不写记录', noRecord: true, 跑: async () => {} },
    详: { 用法: '详 <子>', 说明: '有详细帮助', help: () => '  anim 详 甲\n  anim 详 乙', 跑: async () => {} },
    转: { 用法: '转 <参数…>', 说明: '原样转给别的程序', passThrough: true, 跑: async (a) => void collectedArgs.push(a) },
  };

  it('没给命令打帮助退出 1，help 退出 0，不认识的命令退出 1', async () => {
    expect(await run([], commandTable)).toMatchObject({ code: 1, log: expect.stringContaining('anim 好 [x]') });
    expect((await run(['help'], commandTable)).code).toBe(0);
    expect(await run(['没有'], commandTable)).toMatchObject({ code: 1, error: '没有 没有 这个命令' });
  });

  it('子命令带 --help、-h 或 anim help <命令>：打这条命令的帮助、退出 0，不跑命令、不写记录；透传的命令照常收参数', async () => {
    // Windows 实机：anim bench --help 原来报「不认识的选项 --help」退出 2
    const before = collectedArgs.length;
    for (const argv of [['好', '--help'], ['好', 'a', '-h'], ['help', '好']]) {
      expect(await run(argv, commandTable)).toMatchObject({ code: 0, log: '用法：anim 好 [x]\n      返回 0', records: [] });
    }
    expect(collectedArgs.length).toBe(before);
    expect((await run(['详', '--help'], commandTable)).log).toBe('  anim 详 甲\n  anim 详 乙');
    expect((await run(['help', '没有'], commandTable)).log).toContain('anim 好 [x]');
    expect((await run(['转', '--help'], commandTable)).code).toBe(0);
    expect(collectedArgs.at(-1)).toEqual(['--help']);
    expect(wantsHelp(['server', '--', 'say', '--help'])).toBe(false);
  });

  it('按命令分发，返回值就是退出码（没返回算 0）；--调试 不传给命令；写运行记录', async () => {
    const r = await run(['好', '--调试', 'a'], commandTable);
    expect(r.code).toBe(0);
    expect(collectedArgs.at(-1)).toEqual(['a']);
    expect(r.records[0]).toMatchObject({ 命令: '好', 参数: ['a'], 退出码: 0 });
    expect((await run(['三'], commandTable)).code).toBe(3);
    expect((await run(['只读'], commandTable)).records[0]!.退出码).toBeUndefined();
  });

  it('--作品 选不出来退出 2，不跑命令', async () => {
    const r = await run(['--作品', '没有这部作品', '好'], commandTable);
    expect(r.code).toBe(2);
    expect(r.records).toHaveLength(0);
  });

  it('用法错退出 2 并打用法；业务错只打一行、退出 1；程序错打调用栈', async () => {
    expect(await run(['用法'], commandTable)).toMatchObject({ code: 2, error: '要给 x\n用法：anim 用法 <x>' });
    const businessResult = await run(['业务'], commandTable);
    expect(businessResult).toMatchObject({ code: 1, error: '✗ 母版不在' });
    expect(businessResult.records[0]!.事件[0]).toMatchObject({ 级别: '错误', 文本: '母版不在', callStack: expect.stringContaining('路由.test.ts') });
    expect(businessResult.records[0]!.退出码).toBe(1);
    const crashRun = await run(['坏'], commandTable);
    expect(crashRun.code).toBe(1);
    expect(crashRun.error).toMatch(/^TypeError: 读不了 undefined 的属性\n\s+at /);
  });

  it('--调试 或 ANIM_DEBUG=1 时业务错也打调用栈', async () => {
    expect((await run(['--调试', '业务'], commandTable)).error).toMatch(/^Error: 母版不在\n\s+at /);
    expect((await run(['业务'], commandTable, { ANIM_DEBUG: '1' })).error).toMatch(/^Error: 母版不在\n\s+at /);
  });
});
