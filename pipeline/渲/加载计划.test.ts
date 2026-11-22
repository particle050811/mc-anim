import { describe, expect, it, vi } from 'vitest';

vi.mock('../世界/版本.ts', () => ({ readTerrainTable: () => ({ note: '', pack: { 普通: { version: 'v' }, 航线: { version: 'v', policies: {} } } }) }));
const { compareWithUsage } = await import('./加载计划.ts');

const plan = (pack: Record<string, Record<string, number>>) => ({ format: 1, work: '甲', segment: '段', planKey: '', frameCount: 2, pack: Object.fromEntries(Object.entries(pack).map(([p, sections]) => [p, { version: 'v', sections }])) });
const usage = (pack: Record<string, string[]>, measuredFrames = '0-1') => ({ work: '甲', segment: '段', measuredFrames, updatedAt: '', pack: Object.fromEntries(Object.entries(pack).map(([p, sections]) => [p, { version: 'v', sections }])) });

describe('计划和出片的地形用量比', () => {
  it('没记全段的帧：比不了，不算不一样', () => {
    expect(compareWithUsage(plan({ 普通: { '0|0|0': 0 } }), usage({ 普通: [] }, '0'))).toHaveProperty('unknown');
    expect(compareWithUsage(plan({}), null)).toHaveProperty('unknown');
  });
  it('普通包要一模一样：多读、少读都报', () => {
    expect(compareWithUsage(plan({ 普通: { '0|0|0': 0 } }), usage({ 普通: ['0|0|0'] }))).toEqual({ diffs: [] });
    expect((compareWithUsage(plan({ 普通: { '0|0|0': 0 } }), usage({ 普通: ['1|0|0'] })) as { diffs: string[] }).diffs).toHaveLength(1);
  });
  it('航线包页面读的是包里有的祖先：祖先链对得上就算一样，读到计划之外的（子块、别处）才报', () => {
    expect(compareWithUsage(plan({ 航线: { '0|2|3': 0, '0|3|3': 1 } }), usage({ 航线: ['1|1|1'] }))).toEqual({ diffs: [] });
    expect((compareWithUsage(plan({ 航线: { '1|1|1': 0 } }), usage({ 航线: ['0|2|3'] })) as { diffs: string[] }).diffs).toHaveLength(1);
    expect((compareWithUsage(plan({ 航线: { '0|2|3': 0 } }), usage({ 航线: ['1|5|5'] })) as { diffs: string[] }).diffs).toHaveLength(1);
  });
});
