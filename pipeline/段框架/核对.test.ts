import { describe, expect, it } from 'vitest';
import { checkLegacySegStartSec } from './核对.ts';

describe('核老段起秒', () => {
  const segKeys = ['7-甲', '7-乙', '7-丙'];
  it('首尾相接、中间跳过一截都放行', () => {
    expect(checkLegacySegStartSec([{ 键: '7-甲', startSec: 0, 秒: 10 }, { 键: '7-乙', startSec: 10, 秒: 5 }, { 键: '7-丙', startSec: 30, 秒: 5 }], segKeys)).toEqual([]);
  });
  it('重叠要报', () => {
    expect(checkLegacySegStartSec([{ 键: '7-甲', startSec: 0, 秒: 10 }, { 键: '7-乙', startSec: 9, 秒: 5 }], segKeys)).toEqual(['老段 7-乙 起在第 9 秒，和 7-甲（止于第 10 秒）重叠']);
  });
  it('顺序和清单不一样要报', () => {
    expect(checkLegacySegStartSec([{ 键: '7-乙', startSec: 0, 秒: 10 }, { 键: '7-甲', startSec: 10, 秒: 5 }], segKeys)[0]).toMatch(/顺序和清单不一样/);
  });
});
