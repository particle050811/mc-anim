// 台词落点：从段.ts 的声音 cue 算全片帧（字幕不再从各段代码里扒）。
import { describe, expect, it } from 'vitest';
import { cueGain, defineSeg } from '../../engine/段/段定义.ts';
import type { SegInfo } from '../清单/清单.ts';
import { computeLineLandings } from './台词落点.ts';
import { setGlyphLibrary } from './字幕卡.ts';

const makeSeg = (segKey: string, durSec: number, sounds: { sec: number; lines?: string; 接上段?: true; asset?: string; name?: string; 长秒?: number }[]) =>
  ({ key: segKey, segment: { scene: '测试', sec: durSec, width: 1280, height: 720, terrain: [] , sound: sounds } }) as unknown as SegInfo;

// 断屏只要字宽：每个字 9 个界面像素
setGlyphLibrary(new Proxy({}, { get: () => ({ w: 16, h: 16, scale: 0.5, adv: 9, shadow: 0.5, top: 0, rows: [] }) }) as never);

describe('台词落点', () => {
  it('cue 秒是开口：文件头 = 段起帧 +（秒 − 开口秒）× fps；位置取台词表，没写是 下', () => {
    const placements = [
      { segment: makeSeg('甲', 2, [{ sec: 0.5, asset: '音效/钟', name: '钟', 长秒: 1 }]), filmStartFrame: 0 },
      { segment: makeSeg('乙', 2, [{ sec: 0.25, lines: '6-李樱-走' }, { sec: 1, lines: '6-九胡-停' }]), filmStartFrame: 120 },
    ];
    const lineTable = [
      { id: '6-李樱-走', character: '李樱', text: '走吧。', voice: '配音/6-李樱-走', mouthOpen: 0.05 },
      { id: '6-九胡-停', character: '九胡', text: '等等，先别动！', voice: '配音/6-九胡-停', subtitlePosition: '思索上' as const },
    ];
    const r = computeLineLandings(placements, lineTable, (id) => `/库/${id}`, 60);
    expect(r.map((a) => [a.id, a.segment, a.段内帧, Math.round(a.文件头帧 * 1e6) / 1e6, a.file, a.位置])).toEqual([
      ['6-李樱-走', '乙', 15, 132, '/库/配音/6-李樱-走', '下'],
      ['6-九胡-停', '乙', 60, 180, '/库/配音/6-九胡-停', '思索上'],
    ]);
    expect(r[1]!.屏们.map((p) => p.char)).toEqual(['等等，先别动！']);
  });

  it('台词不在表里、没配音都报错', () => {
    const placements = [{ segment: makeSeg('甲', 1, [{ sec: 0.1, lines: '6-李樱-无' }]), filmStartFrame: 0 }];
    expect(() => computeLineLandings(placements, [], (x) => x, 60)).toThrow(/不在 <作品根>\/台词.toml/);
    expect(() => computeLineLandings(placements, [{ id: '6-李樱-无', character: '李樱', text: '嗯' }], (x) => x, 60)).toThrow(/还没配音/);
  });

  it('接上段：同一段里接着放的不另记；跨段的另记一条 接上段，文件头照上一段的开口推，和开口那段换到全片是同一帧', () => {
    const firstSegment = makeSeg('甲', 2, [{ sec: 1.75, lines: '7-刘心忠-不可能' }, { sec: 1.9, lines: '7-刘心忠-不可能', 接上段: true }]);
    const secondSeg = makeSeg('乙', 1, [{ sec: 0, lines: '7-刘心忠-不可能', 接上段: true }]);
    const lineTable = [{ id: '7-刘心忠-不可能', character: '刘心忠', text: '不可能！', voice: '配音/x', mouthOpen: 0.5 }];
    const prevSeg = (segKey: string) => (segKey === '乙' ? firstSegment.segment : undefined);
    const r = computeLineLandings([{ segment: firstSegment, filmStartFrame: 0 }, { segment: secondSeg, filmStartFrame: 120 }], lineTable, (id) => id, 60, prevSeg);
    expect(r.map((a) => [a.segment, a.文件头帧, a.接上段])).toEqual([
      ['甲', 75, undefined],
      ['乙', 75, true],
    ]);
    expect(() => computeLineLandings([{ segment: secondSeg, filmStartFrame: 0 }], lineTable, (id) => id, 60)).toThrow(/标了 接上段/);
  });
});

describe('声音 cue', () => {
  const makeSeg = (sounds: unknown[]) => defineSeg({ scene: '测试', sec: 1, width: 4, height: 4, terrain: [], sound: sounds as never });
  it('秒可带小数、不对齐到帧；资产 cue 要名、长秒，不过段尾；逐格增益个数和长秒对上', () => {
    expect(() => makeSeg([{ sec: 0.1234, lines: '7-甲-说' }, { sec: 0.3, asset: '音效/钟', name: '钟', 长秒: 0.7, 增益: 0.5, fadeOutSec: 0.2 }])).not.toThrow();
    expect(() => makeSeg([{ sec: 0.3, asset: '音效/钟', 长秒: 0.2 }])).toThrow(/要写 名、长秒/);
    expect(() => makeSeg([{ sec: 0.3, asset: '音效/钟', name: '钟', 长秒: 0.8 }])).toThrow(/不超过段尾/);
    expect(() => makeSeg([{ sec: 0.3, asset: '音效/钟', name: '钟', 长秒: 0.5, 增益: { perSec: 24, value: [1] } }])).toThrow(/逐格增益 1 个/);
    expect(() => makeSeg([{ sec: 0.3, asset: '音效/钟', name: '钟', 长秒: 0.2, 档: '很响' }])).toThrow(/档「很响」/);
  });
  it('增益：常数、逐格；常数带淡出秒时最后那截线性往下收', () => {
    const c = { sec: 0, asset: '音效/钟', name: '钟', 长秒: 4, 增益: 0.8, fadeOutSec: 2 };
    expect([0, 1, 2, 3].map((t) => cueGain(c, t))).toEqual([0.8, 0.8, 0.8, 0.4]);
    expect(cueGain({ ...c, 增益: { perSec: 1, value: [1, 0.5, 0.25, 0] }, fadeOutSec: undefined }, 1.5)).toBe(0.375);
  });
});
