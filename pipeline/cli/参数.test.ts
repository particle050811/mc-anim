import { describe, expect, it } from 'vitest';
import { parseArgs } from './参数.ts';

describe('命令行参数', () => {
  it('位置、开关、带值（空格或等号）、多值', () => {
    const r = parseArgs(['6', '--level', '预览', '--rerender', '--to-preview=主题', '7'], { 值: ['--level', '--to-preview'], toggles: ['--rerender'] });
    expect(r.位置).toEqual(['6', '7']);
    expect(r.值).toEqual({ '--level': '预览', '--to-preview': '主题' });
    expect([...r.toggles]).toEqual(['--rerender']);
  });
  it('不认识的选项、缺值、开关带值都报错', () => {
    expect(() => parseArgs(['--乱写'], {})).toThrow(/不认识的选项/);
    expect(() => parseArgs(['--level'], { 值: ['--level'] })).toThrow(/要带值/);
    expect(() => parseArgs(['--level', '--rerender'], { 值: ['--level'], toggles: ['--rerender'] })).toThrow(/要带值/);
    expect(() => parseArgs(['--rerender=1'], { toggles: ['--rerender'] })).toThrow(/不带值/);
  });
});
