// 试看参数（engine/core/试看.ts）里要多读的地形包：still、bench、试看的 film 都从这里取；页面读裁过的包还是完整包（docs/世界.md「裁级」）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const root = fs.mkdtempSync(path.join(os.tmpdir(), '地形注入-'));
vi.mock('../环境/配置.ts', async (orig) => ({ ...(await orig<typeof import('../环境/配置.ts')>()), terrainRoot: () => root }));
vi.mock('../指纹/指纹.ts', async (orig) => ({
  ...(await orig<typeof import('../指纹/指纹.ts')>()),
  readTerrainEntries: () => ({ 裁过: { version: 'full1', trimmed: { version: 'trim1' } }, 没裁: { version: 'only1' } }),
}));
const { trialTerrain, terrainOnlyEnv, trialReadsFullTerrain } = await import('./地形注入.ts');
const read = (versions: Record<string, string>, mode: '正式' | '完整' | '完整优先') => JSON.parse(Object.values(terrainOnlyEnv(versions, mode))[0]!);

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

describe('读哪一版地形包', () => {
  it('正式读裁过的；完整读完整包，本机没有就说去哪取；完整优先没有就退回裁过的；没裁过的照旧', () => {
    expect(read({ 裁过: 'full1', 没裁: 'only1' }, '正式')).toEqual({ 裁过: 'trim1', 没裁: 'only1' });
    // 段签记的完整包版本和登记的不一样（表在批次中途改了）：照段签读那一版
    expect(read({ 裁过: 'full0' }, '正式')).toEqual({ 裁过: 'full0' });
    expect(() => read({ 裁过: 'full1' }, '完整')).toThrow(/anim assets pull --full/);
    expect(read({ 裁过: 'full1' }, '完整优先')).toEqual({ 裁过: 'trim1' });
    fs.mkdirSync(path.join(root, '裁过', 'full1'), { recursive: true });
    expect(read({ 裁过: 'full1' }, '完整')).toEqual({ 裁过: 'full1' });
    expect(read({ 裁过: 'full1' }, '完整优先')).toEqual({ 裁过: 'full1' });
  });

  it('会挑到正式画面不用的区段的试看读完整包', () => {
    expect(trialReadsFullTerrain({})).toBe(false);
    expect(trialReadsFullTerrain({ 加载视点: {} } as never)).toBe(true);
    expect(trialReadsFullTerrain({ 关: ['航线定级'] } as never)).toBe(true);
    expect(trialReadsFullTerrain({ 关: ['不存在的项'] } as never)).toBe(false);
  });
});
