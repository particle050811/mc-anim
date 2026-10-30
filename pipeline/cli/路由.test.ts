import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { 代码根 } from '../环境/路径.ts';
import { 运行记录 } from '../运行记录/记录.ts';
import { 用法错误 } from './参数.ts';
import type { 命令 } from './命令.ts';
import { 取调试参数, 是预期错误, 要帮助, 首帧文件, 跑命令行 } from './路由.ts';

describe('全局参数', () => {
  it('--调试 在哪都取走，-- 之后的原样留给命令', () => {
    expect(取调试参数(['stale', '--调试', '6'])).toEqual({ 调试: true, 其余: ['stale', '6'] });
    expect(取调试参数(['mcai', '--', '--调试'])).toEqual({ 调试: false, 其余: ['mcai', '--', '--调试'] });
    expect(取调试参数([])).toEqual({ 调试: false, 其余: [] });
  });
});

describe('预期内的错', () => {
  const 根 = 代码根();
  const 栈 = (文件: string) => `Error: x\n    at 某函数 (${文件}:3:9)\n    at async 别的 (node:internal/x:1:1)`;

  it('调用栈第一帧的文件：file:// 地址（中文路径百分号编码）和普通路径都认', () => {
    const f = path.join(根, 'pipeline', '清单', '清单.ts');
    expect(首帧文件(栈(pathToFileURL(f).href))).toBe(f);
    expect(首帧文件(`Error: x\n    at ${f}:1:2`)).toBe(f);
    expect(首帧文件('Error: 没有帧')).toBeNull();
  });

  it('我们自己 throw 的 Error、用法错、esbuild 构建失败算预期内；内置错误类型、库里抛的、非 Error 不算', () => {
    expect(是预期错误(new Error('业务错'))).toBe(true);
    expect(是预期错误(new 用法错误('少参数'))).toBe(true);
    expect(是预期错误(Object.assign(new Error('Build failed'), { errors: [], warnings: [] }))).toBe(true);
    expect(是预期错误(new TypeError('x is undefined'))).toBe(false);
    expect(是预期错误('字符串')).toBe(false);
    const 库里的 = new Error('库里的');
    库里的.stack = 栈(pathToFileURL(path.join(根, 'node_modules', 'x', 'index.js')).href);
    expect(是预期错误(库里的)).toBe(false);
    const 仓库外 = new Error('仓库外');
    仓库外.stack = 栈('/别处/a.ts');
    expect(是预期错误(仓库外)).toBe(false);
    // fs 报的 ENOENT 第一帧在 node:fs：不管 cwd 在哪都不算
    const 内置模块 = new Error("ENOENT: no such file or directory, open 'x'");
    内置模块.stack = `Error: ENOENT\n    at Object.readFileSync (node:fs:441:20)\n    at 读 (${pathToFileURL(path.join(根, 'pipeline', 'a.ts')).href}:1:1)`;
    expect(首帧文件(内置模块.stack)).toBe('node:fs');
    expect(是预期错误(内置模块)).toBe(false);
  });
});

describe('跑命令行', () => {
  const 跑 = async (argv: string[], 命令表: Record<string, 命令>, 环境变量: NodeJS.ProcessEnv = {}) => {
    const log: string[] = [];
    const error: string[] = [];
    const 记录们: (运行记录 & { 退出码?: number })[] = [];
    const code = await 跑命令行(argv, {
      命令表,
      环境变量,
      输出: { log: (s) => log.push(s), error: (s) => error.push(s) },
      新记录: (名, args) => {
        const r = new 运行记录(名, args) as 运行记录 & { 退出码?: number };
        r.结束 = (c) => {
          r.退出码 = c;
        };
        记录们.push(r);
        return r;
      },
    });
    return { code, log: log.join('\n'), error: error.join('\n'), 记录们 };
  };
  const 收参数: string[][] = [];
  const 表: Record<string, 命令> = {
    好: { 用法: '好 [x]', 说明: '返回 0', 跑: async (a) => void 收参数.push(a) },
    三: { 用法: '三', 说明: '返回 3', 跑: async () => 3 },
    用法: { 用法: '用法 <x>', 说明: '用法错', 跑: async () => { throw new 用法错误('要给 x'); } },
    业务: { 用法: '业务', 说明: '业务错', 跑: async () => { throw new Error('母版不在'); } },
    坏: { 用法: '坏', 说明: '程序错', 跑: async () => { throw new TypeError('读不了 undefined 的属性'); } },
    只读: { 用法: '只读', 说明: '不写记录', 不记录: true, 跑: async () => {} },
    详: { 用法: '详 <子>', 说明: '有详细帮助', 帮助: () => '  anim 详 甲\n  anim 详 乙', 跑: async () => {} },
    转: { 用法: '转 <参数…>', 说明: '原样转给别的程序', 透传: true, 跑: async (a) => void 收参数.push(a) },
  };

  it('没给命令打帮助退出 1，help 退出 0，不认识的命令退出 1', async () => {
    expect(await 跑([], 表)).toMatchObject({ code: 1, log: expect.stringContaining('anim 好 [x]') });
    expect((await 跑(['help'], 表)).code).toBe(0);
    expect(await 跑(['没有'], 表)).toMatchObject({ code: 1, error: '没有 没有 这个命令' });
  });

  it('子命令带 --help、-h 或 anim help <命令>：打这条命令的帮助、退出 0，不跑命令、不写记录；透传的命令照常收参数', async () => {
    // Windows 实机：anim bench --help 原来报「不认识的选项 --help」退出 2
    const 前 = 收参数.length;
    for (const argv of [['好', '--help'], ['好', 'a', '-h'], ['help', '好']]) {
      expect(await 跑(argv, 表)).toMatchObject({ code: 0, log: '用法：anim 好 [x]\n      返回 0', 记录们: [] });
    }
    expect(收参数.length).toBe(前);
    expect((await 跑(['详', '--help'], 表)).log).toBe('  anim 详 甲\n  anim 详 乙');
    expect((await 跑(['help', '没有'], 表)).log).toContain('anim 好 [x]');
    expect((await 跑(['转', '--help'], 表)).code).toBe(0);
    expect(收参数.at(-1)).toEqual(['--help']);
    expect(要帮助(['server', '--', 'say', '--help'])).toBe(false);
  });

  it('按命令分发，返回值就是退出码（没返回算 0）；--调试 不传给命令；写运行记录', async () => {
    const r = await 跑(['好', '--调试', 'a'], 表);
    expect(r.code).toBe(0);
    expect(收参数.at(-1)).toEqual(['a']);
    expect(r.记录们[0]).toMatchObject({ 命令: '好', 参数: ['a'], 退出码: 0 });
    expect((await 跑(['三'], 表)).code).toBe(3);
    expect((await 跑(['只读'], 表)).记录们[0]!.退出码).toBeUndefined();
  });

  it('--作品 选不出来退出 2，不跑命令', async () => {
    const r = await 跑(['--作品', '没有这部作品', '好'], 表);
    expect(r.code).toBe(2);
    expect(r.记录们).toHaveLength(0);
  });

  it('用法错退出 2 并打用法；业务错只打一行、退出 1；程序错打调用栈', async () => {
    expect(await 跑(['用法'], 表)).toMatchObject({ code: 2, error: '要给 x\n用法：anim 用法 <x>' });
    const 业务 = await 跑(['业务'], 表);
    expect(业务).toMatchObject({ code: 1, error: '✗ 母版不在' });
    expect(业务.记录们[0]!.事件[0]).toMatchObject({ 级别: '错误', 文本: '母版不在', 调用栈: expect.stringContaining('路由.test.ts') });
    expect(业务.记录们[0]!.退出码).toBe(1);
    const 坏 = await 跑(['坏'], 表);
    expect(坏.code).toBe(1);
    expect(坏.error).toMatch(/^TypeError: 读不了 undefined 的属性\n\s+at /);
  });

  it('--调试 或 ANIM_DEBUG=1 时业务错也打调用栈', async () => {
    expect((await 跑(['--调试', '业务'], 表)).error).toMatch(/^Error: 母版不在\n\s+at /);
    expect((await 跑(['业务'], 表, { ANIM_DEBUG: '1' })).error).toMatch(/^Error: 母版不在\n\s+at /);
  });
});
