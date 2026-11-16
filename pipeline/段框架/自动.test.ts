import { describe, expect, it } from 'vitest';
import { checkSelectedSegCues } from './自动.ts';

describe('查所选段cues', () => {
  it('所选的段生成失败就停；没选的只提醒', () => {
    const printed: string[] = [];
    const r = { written: [], failed: new Map([['核对-甲', '缺字节'], ['2-乙', '台词没配音']]) };
    expect(() => checkSelectedSegCues(r, [{ key: '2-乙' }], (x) => printed.push(x))).toThrow(/2-乙：台词没配音/);
    expect(printed).toEqual(['!! 核对-甲 的 anim cues 没跑通（这次没选它，先不管）：缺字节']);
    expect(() => checkSelectedSegCues(r, [{ key: '2-丙' }], () => {})).not.toThrow();
  });
});
