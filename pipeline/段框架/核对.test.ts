import { describe, expect, it } from 'vitest';
import { checkLegacySegStartSec } from './核对.ts';

describe('核老段起秒', () => {
  const segKeys = ['7-甲', '7-乙', '7-丙'];
  it('首尾相接、中间跳过一截都放行', () => {
    expect(checkLegacySegStartSec([{ key: '7-甲', startSec: 0, sec: 10 }, { key: '7-乙', startSec: 10, sec: 5 }, { key: '7-丙', startSec: 30, sec: 5 }], segKeys)).toEqual([]);
  });
  it('重叠要报', () => {
    expect(checkLegacySegStartSec([{ key: '7-甲', startSec: 0, sec: 10 }, { key: '7-乙', startSec: 9, sec: 5 }], segKeys)).toEqual(['老段 7-乙 起在第 9 秒，和 7-甲（止于第 10 秒）重叠']);
  });
  it('顺序和清单不一样要报', () => {
    expect(checkLegacySegStartSec([{ key: '7-乙', startSec: 0, sec: 10 }, { key: '7-甲', startSec: 10, sec: 5 }], segKeys)[0]).toMatch(/顺序和清单不一样/);
  });
});
