import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { unreadableEnvError, unreadableEnvNames } from './环境变量名.ts';
import { codeRoot } from './路径.ts';

const root = codeRoot();
const moduleUrl = (rel: string) => pathToFileURL(path.join(root, ...rel.split('/'))).href;

// zsh 把「时」（e6 97 b6）导出成的名字：e6 83 b7 b6，不是合法 UTF-8
const BROKEN_NAME_OCTAL = '\\346\\203\\267\\266';
/** 带一个指定名字的环境变量起 node。坏名字 Node 自己传不出去（字符串转 UTF-8 时坏字节没了），借 sh 的 printf 和 env 按原字节传 */
const runNode = (nameForPrintf: string, nodeArgs: string[]) =>
  spawnSync('/bin/sh', ['-c', `exec env "$(printf '${nameForPrintf}')=1" "$0" "$@"`, process.execPath, ...nodeArgs], { encoding: 'utf8' });
const listScript = `const m = await import(${JSON.stringify(moduleUrl('pipeline/环境/环境变量名.ts'))}); console.log(JSON.stringify({ names: m.unreadableEnvNames(), value: process.env['临时无损'] ?? null }));`;

describe('读不回来的环境变量名', () => {
  it('报错文本带名字和改法；没有就是 null', () => {
    expect(unreadableEnvNames({ A: '1', '临时无损': '1' })).toEqual([]);
    expect(unreadableEnvError([])).toBeNull();
    const text = unreadableEnvError(['惷\uFFFD', 'A\uFFFDB'])!;
    expect(text).toMatch(/^环境里有 2 个变量的名字读不回来.*「惷\uFFFD」、「A\uFFFDB」/);
    expect(text).toMatch(/zsh/);
    expect(text).toMatch(/env 中文名=值 \.\/anim/);
  });

  // 环境变量名在 Windows 上是 UTF-16，没有 sh，也没有这条来路
  describe.skipIf(process.platform === 'win32')('名字不是合法 UTF-8 的变量（zsh 里「中文名=值 命令」的结果）', () => {
    it('认得出坏名字；合法的中文名不算，照常读得到', () => {
      const broken = runNode(BROKEN_NAME_OCTAL, ['--input-type=module', '-e', listScript]);
      expect(broken.status, broken.stderr).toBe(0);
      expect(JSON.parse(broken.stdout).names).toEqual(['惷\uFFFD']);
      const valid = runNode('临时无损', ['--input-type=module', '-e', listScript]);
      expect(valid.status, valid.stderr).toBe(0);
      expect(JSON.parse(valid.stdout)).toEqual({ names: [], value: '1' });
    });

    it('anim 入口报错退出 2，不段错误（完整路由和 sched 快路径都一样）', () => {
      const main = path.join(root, 'pipeline', 'cli', 'main.ts');
      for (const argv of [['env'], ['help'], ['sched', '--oneline']]) {
        const r = runNode(BROKEN_NAME_OCTAL, [main, ...argv]);
        expect(r.signal, argv.join(' ')).toBeNull();
        expect(r.status, argv.join(' ')).toBe(2);
        expect(r.stderr).toMatch(/^环境里有 1 个变量的名字读不回来/);
        expect(r.stdout).toBe('');
      }
    });

    it('直接 import 别名注册.ts 的脚本抛出同一条错，不段错误', () => {
      const r = runNode(BROKEN_NAME_OCTAL, ['--input-type=module', '-e', `await import(${JSON.stringify(moduleUrl('pipeline/环境/别名注册.ts'))}); console.log('注册了');`]);
      expect(r.signal).toBeNull();
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/环境里有 1 个变量的名字读不回来/);
      expect(r.stdout).toBe('');
    });
  });
});
