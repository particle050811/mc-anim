// 试看参数（engine/core/试看.ts）里要多读的地形包：still、bench、试看的 film 都从这里取；页面读裁过的包还是完整包（docs/世界.md「裁级」）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { terrainVersionEnv, terrainReadModeEnv } from '../../engine/段/地形环境.ts';
import { pageReadsFullTerrain } from '../../engine/voxel/区段包位置.ts';

const root = fs.mkdtempSync(path.join(os.tmpdir(), '地形注入-'));
vi.mock('../环境/配置.ts', async (orig) => ({ ...(await orig<typeof import('../环境/配置.ts')>()), terrainRoot: () => root }));
vi.mock('../环境/作品.ts', async (orig) => ({ ...(await orig<typeof import('../环境/作品.ts')>()), workName: () => '测试作品' }));
vi.mock('./光体缓存收集.ts', () => ({ lightCacheFiles: () => '[]' }));
vi.mock('../指纹/指纹.ts', async (orig) => ({
  ...(await orig<typeof import('../指纹/指纹.ts')>()),
  readTerrainEntries: () => ({ trimmedPack: { version: 'full1', trimmed: { version: 'trim1' } }, plainPack: { version: 'only1' } }),
}));
const { trialTerrain, terrainOnlyEnv, trialReadsFullTerrain, segRenderEnv, fullTableEnv } = await import('./地形注入.ts');
const read = (versions: Record<string, string>, mode: '正式' | '完整' | '完整优先') => JSON.parse(terrainOnlyEnv(versions, mode)[terrainVersionEnv]!);

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
    expect(read({ trimmedPack: 'full1', plainPack: 'only1' }, '正式')).toEqual({ trimmedPack: 'trim1', plainPack: 'only1' });
    // 段签记的完整包版本和登记的不一样（表在批次中途改了）：照段签读那一版
    expect(read({ trimmedPack: 'full0' }, '正式')).toEqual({ trimmedPack: 'full0' });
    expect(() => read({ trimmedPack: 'full1' }, '完整')).toThrow(/anim assets pull --full/);
    expect(read({ trimmedPack: 'full1' }, '完整优先')).toEqual({ trimmedPack: 'trim1' });
    fs.mkdirSync(path.join(root, 'trimmedPack', 'full1'), { recursive: true });
    expect(read({ trimmedPack: 'full1' }, '完整')).toEqual({ trimmedPack: 'full1' });
    expect(read({ trimmedPack: 'full1' }, '完整优先')).toEqual({ trimmedPack: 'full1' });
  });

  it('同一份包声明：正式读区段，完整试看、覆盖和 Studio 读网格', () => {
    const packs = { plainPack: 'only1' };
    const readsFull = (env: Record<string, string>) => {
      vi.stubEnv(terrainReadModeEnv, env[terrainReadModeEnv]);
      return pageReadsFullTerrain();
    };
    try {
      expect(readsFull(segRenderEnv('甲', packs))).toBe(false);
      expect(readsFull(segRenderEnv('甲', packs, '完整'))).toBe(true);
      expect(readsFull(segRenderEnv('甲', packs, '完整优先'))).toBe(true);
      expect(readsFull(terrainOnlyEnv(packs, '完整'))).toBe(true);
      expect(readsFull(fullTableEnv())).toBe(true);
    } finally { vi.unstubAllEnvs(); }
  });

  it('会挑到正式画面不用的区段的试看读完整包', () => {
    expect(trialReadsFullTerrain({})).toBe(false);
    expect(trialReadsFullTerrain({ '加载视点': {} } as never)).toBe(true);
    expect(trialReadsFullTerrain({ '关': ['航线定级'] } as never)).toBe(true);
    expect(trialReadsFullTerrain({ '关': ['不存在的项'] } as never)).toBe(false);
  });
});
