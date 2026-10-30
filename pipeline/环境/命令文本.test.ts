// 照抄用的命令行文本：Windows 实机 extract --只打印 原来按 POSIX 打单引号，cmd 里照抄会把单引号原样传进去。
import { describe, expect, it } from 'vitest';
import { 命令行文本, 引参数 } from './命令文本.ts';
import { 显示 } from '../取材/提取.ts';

/** CommandLineToArgvW 的拆法（MSVC 运行时同款），拿来验 Windows 的引法拆回去还是原参数 */
const 拆windows = (行: string): string[] => {
  const 出: string[] = [];
  let 当前 = '';
  let 有 = false;
  let 引号里 = false;
  for (let i = 0; i < 行.length; i++) {
    const c = 行[i]!;
    if (c === '\\') {
      let n = 0;
      while (行[i] === '\\') n++, i++;
      if (行[i] === '"') {
        当前 += '\\'.repeat(n >> 1);
        if (n % 2) 当前 += '"';
        else 引号里 = !引号里;
        有 = true;
      } else {
        当前 += '\\'.repeat(n);
        i--;
      }
      有 = true;
    } else if (c === '"') {
      引号里 = !引号里;
      有 = true;
    } else if (/\s/.test(c) && !引号里) {
      if (有) 出.push(当前);
      当前 = '';
      有 = false;
    } else {
      当前 += c;
      有 = true;
    }
  }
  if (有) 出.push(当前);
  return 出;
};

describe('命令行文本', () => {
  const 例 = ['uv', 'run', 'D:/mc-anim/sourcing/extract/导出模型.py', 'assets/minecraft/textures/particle/explosion_*.png', 'C:\\Program Files\\Java\\', 'a"b', 'x&y', '', 'a b\\'];

  it('Windows：双引号，通配符不引；按 CommandLineToArgvW 拆回去和原参数一样', () => {
    expect(引参数('assets/minecraft/textures/particle/explosion_*.png', 'windows')).toBe('assets/minecraft/textures/particle/explosion_*.png');
    expect(引参数('C:\\Program Files\\Java\\', 'windows')).toBe('"C:\\Program Files\\Java\\\\"');
    expect(引参数('', 'windows')).toBe('""');
    expect(命令行文本(例, 'windows')).not.toContain("'");
    expect(拆windows(命令行文本(例, 'windows'))).toEqual(例);
  });

  it('POSIX：照旧单引号', () => {
    expect(命令行文本(['a', "it's", 'x_*.png'], 'posix')).toBe(`a 'it'\\''s' 'x_*.png'`);
  });

  it('extract 的步骤：取输出的参数 POSIX 写 $(…)，Windows 写 [… 的输出]', () => {
    const 步 = ['java', { 输出: ['find', 'a b'] }, 'x_*.png'];
    expect(显示(步, 'posix')).toBe(`java $(find 'a b') 'x_*.png'`);
    expect(显示(步, 'windows')).toBe('java [find "a b" 的输出] x_*.png');
  });
});
