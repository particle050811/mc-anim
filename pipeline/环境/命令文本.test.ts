// 照抄用的命令行文本：Windows 实机 extract --print-only 原来按 POSIX 打单引号，cmd 里照抄会把单引号原样传进去。
import { describe, expect, it } from 'vitest';
import { commandLineText, quoteArg } from './命令文本.ts';
import { displayCommand } from '../取材/提取.ts';

/** CommandLineToArgvW 的拆法（MSVC 运行时同款），拿来验 Windows 的引法拆回去还是原参数 */
const splitWindows = (line: string): string[] => {
  const args: string[] = [];
  let out = '';
  let sawWindows = false;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === '\\') {
      let n = 0;
      while (line[i] === '\\') n++, i++;
      if (line[i] === '"') {
        out += '\\'.repeat(n >> 1);
        if (n % 2) out += '"';
        else inQuotes = !inQuotes;
        sawWindows = true;
      } else {
        out += '\\'.repeat(n);
        i--;
      }
      sawWindows = true;
    } else if (c === '"') {
      inQuotes = !inQuotes;
      sawWindows = true;
    } else if (/\s/.test(c) && !inQuotes) {
      if (sawWindows) args.push(out);
      out = '';
      sawWindows = false;
    } else {
      out += c;
      sawWindows = true;
    }
  }
  if (sawWindows) args.push(out);
  return args;
};

describe('命令行文本', () => {
  const exampleArgs = ['uv', 'run', 'D:/mc-anim/sourcing/extract/导出模型.py', 'assets/minecraft/textures/particle/explosion_*.png', 'C:\\Program Files\\Java\\', 'a"b', 'x&y', '', 'a b\\'];

  it('Windows：双引号，通配符不引；按 CommandLineToArgvW 拆回去和原参数一样', () => {
    expect(quoteArg('assets/minecraft/textures/particle/explosion_*.png', 'windows')).toBe('assets/minecraft/textures/particle/explosion_*.png');
    expect(quoteArg('C:\\Program Files\\Java\\', 'windows')).toBe('"C:\\Program Files\\Java\\\\"');
    expect(quoteArg('', 'windows')).toBe('""');
    expect(commandLineText(exampleArgs, 'windows')).not.toContain("'");
    expect(splitWindows(commandLineText(exampleArgs, 'windows'))).toEqual(exampleArgs);
  });

  it('POSIX：照旧单引号', () => {
    expect(commandLineText(['a', "it's", 'x_*.png'], 'posix')).toBe(`a 'it'\\''s' 'x_*.png'`);
  });

  it('extract 的步骤：取输出的参数 POSIX 写 $(…)，Windows 写 [… 的输出]', () => {
    const argv = ['java', { output: ['find', 'a b'] }, 'x_*.png'];
    expect(displayCommand(argv, 'posix')).toBe(`java $(find 'a b') 'x_*.png'`);
    expect(displayCommand(argv, 'windows')).toBe('java [find "a b" 的输出] x_*.png');
  });
});
