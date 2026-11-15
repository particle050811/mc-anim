import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { overworldMix, twilightMix } from './光照配比.ts';
import { tierMix, lightTierTable } from './灯光档位.ts';
import { tierNames } from './环境.ts';

// 光照配比.ts 的 presets 没导出，灯光档位.ts 抄了一份：这里按源文件逐个核对，那边改了数这里就红
const sourceText = readFileSync(path.join(import.meta.dirname, '光照配比.ts'), 'utf8');
const sourceTiers = () => {
  const presetsSource = sourceText.slice(sourceText.indexOf('const presets'), sourceText.indexOf('};', sourceText.indexOf('const presets')));
  const out: Record<string, Record<string, number>> = {};
  for (const m of presetsSource.matchAll(/^\s*([一-鿿]+): \{([^}]*)\},/gm)) {
    out[m[1]!] = Object.fromEntries([...m[2]!.matchAll(/([A-Za-z]+): ([\d.]+)/g)].map((x) => [x[1]!, Number(x[2])]));
  }
  return out;
};

describe('灯光档位', () => {
  it('六档和 光照配比.ts 的 presets 一字不差', () => {
    const sourceTable = sourceTiers();
    expect(Object.keys(sourceTable).sort()).toEqual(['中档', '柔档', '柔档提亮', '强档', '硬档', '黄昏'].sort());
    for (const [lightTierName, mix] of Object.entries(sourceTable)) expect(lightTierTable[lightTierName as keyof typeof lightTierTable]).toEqual(mix);
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
