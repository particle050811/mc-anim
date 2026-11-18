// 地形覆盖（docs/世界.md「裁级」）的收集和保护：页面记录在 renderFrames 返回之后才关页交回（Remotion 在 finally 里关页、不等），也要收到；
// 收不到、或画面里有体素世界从声明的包挑却 0 个区段，报错、不存覆盖（11-17 夜：13 段全空，拿空覆盖裁出只剩 L3 以上的包）。
// 声明了包、画面里没有体素世界的段（7-起疑）覆盖就该空，照存。渲染后端、段产物、地形注入换成假的。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SegInfo } from '../清单/清单.ts';

const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-地形覆盖测试-'));
process.env.ANIM_DATA = dataRoot;

const versions = vi.hoisted((): Record<string, string> => ({ 'pack-a': 'v1' }));
const segs = vi.hoisted(() => [] as SegInfo[]);
vi.mock('../环境/作品.ts', async (actual) => ({ ...(await actual<object>()), workName: () => '测试作品', workRoot: () => path.join(process.env.ANIM_DATA!, '作品') }));
vi.mock('../清单/清单.ts', async (actual) => ({ ...(await actual<object>()), loadAllSegments: async () => segs }));
vi.mock('./段产物.ts', () => ({
  segmentProducts: async (_all: unknown, ss: SegInfo[]) => ss.map((s) => ({ pictureFingerprint: { items: { segment: s.key, terrain: versions } } })),
  segPictureParams: (_all: unknown, ss: SegInfo[]) => ss.map(() => ({ inputProps: {} })),
}));
vi.mock('./渲.ts', () => ({ expectedComposition: (s: SegInfo) => ({ id: s.key, durationInFrames: 3, fps: 60, width: 64, height: 36 }) }));
vi.mock('./地形注入.ts', () => ({ terrainReadVersions: (_k: string, decls: string[]) => Object.fromEntries(decls.map((d) => [d, 'v1'])), segRenderEnv: () => ({}) }));
vi.mock('../资产/资产锁.ts', async (actual) => ({ ...(await actual<object>()), verifySegResourcePacks: () => {} }));

const { measureCovers, coverFile, coverProblems, coverStatus, coverFormat } = await import('./地形覆盖.ts');
const { fakeBackend } = await import('./假后端.ts');
const { terrainCoverEnv } = await import('../../engine/段/地形环境.ts');

const makeSeg = (key: string, terrain: string[]) => ({ key, segment: { terrain } }) as unknown as SegInfo;

type PageRecord = { cover: string | null; first: Record<string, Record<string, number>>; worlds: string[] } | Error;
/** 假浏览器 + 假 renderFrames：照 Remotion 的做法，渲完先返回、过一会儿才关页（关页时交回 record(段键) 给的记录） */
const setup = (record: (segKey: string) => PageRecord) => {
  let current: PageRecord = new Error('还没渲');
  const browser = {
    newPage: async () => ({
      _client: () => ({ send: async () => { if (current instanceof Error) throw current; return { result: { value: JSON.stringify(current) } }; } }),
      close: async () => {},
    }),
  };
  const renderFrames = async (o: { puppeteerInstance: typeof browser; envVariables: Record<string, string> }) => {
    const page = await o.puppeteerInstance.newPage();
    current = record(o.envVariables[terrainCoverEnv]!);
    setTimeout(() => void page.close(), 5);
    return { assetsInfo: {}, frameCount: 3 };
  };
  return fakeBackend({ session: { browser: browser as never, params: { gl: 'angle', scale: 1 } as never }, renderFrames: renderFrames as never }).backend;
};
const quiet = () => {};

beforeEach(() => {
  segs.length = 0;
  fs.rmSync(path.join(dataRoot, 'cache'), { recursive: true, force: true });
});
afterAll(() => fs.rmSync(dataRoot, { recursive: true, force: true }));

describe('量覆盖', () => {
  it('页面在 renderFrames 返回后才关、交回记录：照样收到，按段存（带格式、体素世界挑过的包）', async () => {
    segs.push(makeSeg('甲', ['pack-a', 'pack-a-远景']));
    const backend = setup((k) => ({ cover: k, first: { 'pack-a': { '0|1|2': 2, '1|0|0': 0 } }, worlds: ['pack-a'] }));
    const [cover] = await measureCovers(segs, undefined, quiet, backend);
    expect(cover!.pack).toEqual({ 'pack-a': { version: 'v1', sections: { '0|1|2': 2, '1|0|0': 0 } } });
    expect(cover!.worldPacks).toEqual(['pack-a']);
    const saved = JSON.parse(fs.readFileSync(coverFile('测试作品', '甲'), 'utf8'));
    expect(saved.format).toBe(coverFormat);
    expect(saved.pack['pack-a'].sections).toEqual({ '0|1|2': 2, '1|0|0': 0 });
  });

  it('声明了包、画面里没有体素世界（7-起疑 那种）：覆盖就是空的，照存', async () => {
    segs.push(makeSeg('起疑', ['pack-a']));
    const [cover] = await measureCovers(segs, undefined, quiet, setup((k) => ({ cover: k, first: {}, worlds: [] })));
    expect(cover!.pack).toEqual({});
    expect(fs.existsSync(coverFile('测试作品', '起疑'))).toBe(true);
  });

  it('画面里有体素世界从声明的包挑、却 0 个区段：报错，不存', async () => {
    segs.push(makeSeg('甲', ['pack-a']));
    await expect(measureCovers(segs, undefined, quiet, setup((k) => ({ cover: k, first: { 'pack-a': {} }, worlds: ['pack-a'] })))).rejects.toThrow(/甲：画面里有体素世界从 pack-a 挑区段，覆盖却记下 0 个区段/);
    expect(fs.existsSync(coverFile('测试作品', '甲'))).toBe(false);
  });

  it('页面没交回记录（求值出错、页面崩了）：报错，不存', async () => {
    segs.push(makeSeg('甲', ['pack-a']));
    await expect(measureCovers(segs, undefined, quiet, setup(() => new Error('Target closed')))).rejects.toThrow(/甲：1 个页面没交回记录（Target closed）/);
    expect(fs.existsSync(coverFile('测试作品', '甲'))).toBe(false);
  });

  it('交回的记录不是这一段的（页面没带覆盖段名）：报错，不存', async () => {
    segs.push(makeSeg('甲', ['pack-a']));
    await expect(measureCovers(segs, undefined, quiet, setup(() => ({ cover: null, first: {}, worlds: [] })))).rejects.toThrow(/记录是别的段的/);
  });
});

describe('覆盖能不能拿去裁', () => {
  it('只管声明了、画面里又有体素世界挑的包', () => {
    const cover = { segment: '甲', pack: { 'pack-a': { version: 'v1', sections: { '0|0|0': 0 } } }, worldPacks: ['pack-a', 'pack-b', 'pack-c'] };
    expect(coverProblems(cover, ['pack-a', 'pack-c-远景'])).toEqual([]);
    expect(coverProblems(cover, ['pack-a', 'pack-b'])).toEqual(['甲：画面里有体素世界从 pack-b 挑区段，覆盖却记下 0 个区段，量错了']);
    expect(coverProblems({ ...cover, worldPacks: [] }, ['pack-b'])).toEqual([]);
  });

  it('远景区段是烘焙输出：只换成品还能重烘，换输入必须重量', async () => {
    segs.push(makeSeg('甲', ['pack-a']));
    await measureCovers(segs, undefined, quiet, setup(k => ({ cover: k, first: { 'pack-a': { '1|0|0': 0 } }, worlds: [] })));
    try {
      versions['pack-a'] = '成品新版';
      expect((await coverStatus(segs, segs))[0]!.stale).toBe(true);
      expect((await coverStatus(segs, segs, 'pack-a'))[0]!.stale).toBe(false);
      versions['输入'] = '另一版';
      expect((await coverStatus(segs, segs, 'pack-a'))[0]!.stale).toBe(true);
    } finally { versions['pack-a'] = 'v1'; delete versions['输入']; }
  });

  it('旧格式的覆盖（11-17 之前存的，记录全没收到）算旧了要重量，指纹对得上也一样', async () => {
    segs.push(makeSeg('甲', ['pack-a']));
    const backend = setup((k) => ({ cover: k, first: { 'pack-a': { '0|0|0': 0 } }, worlds: ['pack-a'] }));
    await measureCovers(segs, undefined, quiet, backend);
    expect((await coverStatus(segs, segs))[0]!.stale).toBe(false);
    const f = coverFile('测试作品', '甲');
    const { format: _, worldPacks: __, ...old } = JSON.parse(fs.readFileSync(f, 'utf8'));
    fs.writeFileSync(f, JSON.stringify({ ...old, pack: {} }));
    expect((await coverStatus(segs, segs))[0]!.stale).toBe(true);
  });
});
