import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { overworldMix, twilightMix } from './光照配比.ts';
import { 档位配比, 灯光档位表 } from './灯光档位.ts';

// 光照配比.ts 的 presets 没导出，灯光档位.ts 抄了一份：这里按源文件逐个核对，那边改了数这里就红
const 源 = readFileSync(path.join(import.meta.dirname, '光照配比.ts'), 'utf8');
const 源档位 = () => {
  const 块 = 源.slice(源.indexOf('const presets'), 源.indexOf('};', 源.indexOf('const presets')));
  const out: Record<string, Record<string, number>> = {};
  for (const m of 块.matchAll(/^\s*([一-鿿]+): \{([^}]*)\},/gm)) {
    out[m[1]!] = Object.fromEntries([...m[2]!.matchAll(/([一-鿿]+): ([\d.]+)/g)].map((x) => [x[1]!, Number(x[2])]));
  }
  return out;
};

describe('灯光档位', () => {
  it('六档和 光照配比.ts 的 presets 一字不差', () => {
    const 源表 = 源档位();
    expect(Object.keys(源表).sort()).toEqual(['中档', '柔档', '柔档提亮', '强档', '硬档', '黄昏'].sort());
    for (const [名, mix] of Object.entries(源表)) expect(灯光档位表[名 as keyof typeof 灯光档位表]).toEqual(mix);
  });
  it('暮色、主世界就是那边导出的那份', () => {
    expect(灯光档位表.暮色).toBe(twilightMix);
    expect(灯光档位表.主世界).toBe(overworldMix);
  });
  it('倍不写或为 1 时原样返回；写了四项一起乘', () => {
    expect(档位配比({ 档位: '暮色' })).toBe(twilightMix);
    expect(档位配比({ 档位: '主世界', 倍: 1 })).toBe(overworldMix);
    expect(档位配比({ 档位: '柔档', 倍: 2 })).toEqual({ 直射: 8.6, 天光: 3.3, 环境光: 0.64, 自发光: 0.4 });
  });
});
