import { describe, expect, it } from 'vitest';
import { overworldMix, twilightMix } from './光照配比.ts';
import { tierMix, lightTierTable } from './灯光档位.ts';
import { tierNames } from './环境.ts';

describe('灯光档位', () => {
  it('黄昏档 × 光倍 2 就是暮色那份（光照配比.ts 的 duskMix 和这里的 黄昏 要一样）', () => {
    expect(tierMix({ tier: '黄昏', intensity: 2 })).toEqual(twilightMix);
  });
  it('环境.ts 的 档位名们（定义环境 拿它查档位名）和表一一对应', () => {
    expect([...tierNames].sort()).toEqual(Object.keys(lightTierTable).sort());
  });
  it('暮色、主世界就是那边导出的那份', () => {
    expect(lightTierTable.暮色).toBe(twilightMix);
    expect(lightTierTable.主世界).toBe(overworldMix);
  });
  it('倍不写或为 1 时原样返回；写了四项一起乘', () => {
    expect(tierMix({ tier: '暮色' })).toBe(twilightMix);
    expect(tierMix({ tier: '主世界', intensity: 1 })).toBe(overworldMix);
    expect(tierMix({ tier: '柔档', intensity: 2 })).toEqual({ direct: 8.6, skylight: 3.3, ambient: 0.64, selfLight: 0.4 });
  });
  it('表里没有的灯写 配比，同样乘倍', () => {
    const lightMix = { direct: 3, skylight: 1, ambient: 0.2, selfLight: 0.1 };
    expect(tierMix({ lightMix })).toBe(lightMix);
    expect(tierMix({ lightMix, intensity: 2 })).toEqual({ direct: 6, skylight: 2, ambient: 0.4, selfLight: 0.2 });
  });
});
