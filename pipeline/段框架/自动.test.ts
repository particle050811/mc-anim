import { describe, expect, it } from 'vitest';
import { 查所选段cues } from './自动.ts';

describe('查所选段cues', () => {
  it('所选的段生成失败就停；没选的只提醒', () => {
    const 打了: string[] = [];
    const r = { 写了: [], 失败: new Map([['核对-甲', '缺字节'], ['2-乙', '台词没配音']]) };
    expect(() => 查所选段cues(r, [{ 键: '2-乙' }], (x) => 打了.push(x))).toThrow(/2-乙：台词没配音/);
    expect(打了).toEqual(['!! 核对-甲 的 anim cues 没跑通（这次没选它，先不管）：缺字节']);
    expect(() => 查所选段cues(r, [{ 键: '2-丙' }], () => {})).not.toThrow();
  });
});
