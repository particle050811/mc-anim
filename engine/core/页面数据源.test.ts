// 页面源只转发：方法就是 数据源.ts 的那几个函数（请求、并发队列、loadOnce 的表都是同一份）；不在页面里直接报错，不悄悄退回。
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./数据源.ts', () => ({
  canFetchSync: false,
  dataUrl: vi.fn(),
  fetchGunzip: vi.fn(),
  fetchJson: vi.fn(),
  fetchJsonIfAny: vi.fn(),
  fetchRange: vi.fn(),
  fetchTextSync: vi.fn(),
  gunzip: vi.fn(),
  loadOnce: vi.fn(),
}));
const raw = await import('./数据源.ts');
const { pageDataSource } = await import('./页面数据源.ts');

afterEach(() => vi.unstubAllGlobals());

describe('pageDataSource', () => {
  it('Node 里（没有 window）报错，要显式传数据源', () => {
    expect(() => pageDataSource()).toThrow(/Node 里要显式传数据源/);
  });

  it('页面上：方法原样是 数据源.ts 的函数', () => {
    vi.stubGlobal('window', {});
    const src = pageDataSource();
    expect(src.kind).toBe('page');
    expect(src.json).toBe(raw.fetchJson);
    expect(src.jsonIfAny).toBe(raw.fetchJsonIfAny);
    expect(src.gunzip).toBe(raw.fetchGunzip);
    expect(src.range).toBe(raw.fetchRange);
    expect(src.textSync).toBe(raw.fetchTextSync);
    expect(src.once).toBe(raw.loadOnce);
    expect(src.url).toBe(raw.dataUrl);
    expect(src.canReadSync).toBe(raw.canFetchSync);
  });
});
