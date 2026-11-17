// 航线定级的试看参数用到时才取：直接 import 世界.tsx，不 mock、不重载模块，换环境变量就是换一组试看。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { trialEnvName } from '../core/试看.ts';
import { resolveRouteLod, type RouteLod } from './世界.tsx';

const lod: RouteLod = { lookSec: 2, hold: true, thresholdScale: 2, floorScale: 0.5 };
const setTrial = (table: object) => vi.stubEnv(trialEnvName, JSON.stringify(table));
const noScale = () => {
  throw new Error('试看没给门槛、下限时不该换算输出像素');
};

afterEach(() => vi.unstubAllEnvs());

describe('resolveRouteLod', () => {
  it('没开试看：照镜头登记的 lod，门槛、下限按画质门槛的倍数', () => {
    expect(resolveRouteLod(lod, 0.75, noScale)).toEqual({ splitCssPixels: 1.5, floorCssPixels: 0.375, lookSec: 2, hold: true, gridHz: 16 });
  });

  it('镜头没登记航线：只有画质门槛，不往后看', () => {
    expect(resolveRouteLod(undefined, 0.75, noScale)).toEqual({ splitCssPixels: 0.75, floorCssPixels: 0, lookSec: 0, hold: false, gridHz: 16 });
  });

  it('试看逐项盖：门槛、下限按输出像素给、除以倍数；没给的项照 lod', () => {
    setTrial({ '航线定级': { '门槛': 4.5, '秒': '整段', '格': 64 } });
    expect(resolveRouteLod(lod, 0.75, () => 3)).toEqual({ splitCssPixels: 1.5, floorCssPixels: 0.375, lookSec: Infinity, hold: true, gridHz: 64 });
    setTrial({ '航线定级': { '下限': 1.5, '留细': false, '秒': 1 } });
    expect(resolveRouteLod(lod, 0.75, () => 3)).toEqual({ splitCssPixels: 1.5, floorCssPixels: 0.5, lookSec: 1, hold: false, gridHz: 16 });
  });

  it('试看「关」掉航线定级：当没登记，同一模块换回不开试看又照 lod', () => {
    setTrial({ '关': ['航线定级'] });
    expect(resolveRouteLod(lod, 0.75, noScale)).toEqual(resolveRouteLod(undefined, 0.75, noScale));
    vi.unstubAllEnvs();
    expect(resolveRouteLod(lod, 0.75, noScale).lookSec).toBe(2);
  });
});
