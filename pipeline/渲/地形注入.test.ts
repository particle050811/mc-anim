// 试看参数（engine/core/试看.ts）里要多读的地形包：still、bench、试看的 film 都从这里取
import { describe, expect, it } from 'vitest';
import { trialTerrain } from './地形注入.ts';

describe('试看参数的「地形」', () => {
  it('读中文键「地形」；写成 terrain 的报错，不悄悄不生效', () => {
    const saved = process.env.REMOTION_ANIM_TRIAL;
    try {
      process.env.REMOTION_ANIM_TRIAL = '{"暮色远景": {"雾远": 6000}, "地形": ["暮色放大-1752-远景"]}';
      expect(trialTerrain()).toEqual(['暮色放大-1752-远景']);
      process.env.REMOTION_ANIM_TRIAL = '{"terrain": ["暮色放大-1752-远景"]}';
      expect(() => trialTerrain()).toThrow(/「地形」/);
      delete process.env.REMOTION_ANIM_TRIAL;
      expect(trialTerrain()).toEqual([]);
    } finally {
      if (saved === undefined) delete process.env.REMOTION_ANIM_TRIAL;
      else process.env.REMOTION_ANIM_TRIAL = saved;
    }
  });
});
