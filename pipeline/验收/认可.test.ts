import { describe, expect, it } from 'vitest';
import { matchSelector, type SegInfo } from '../清单/清单.ts';
import { findAmbiguous } from './认可.ts';

const makeSegmentInfo = (segKey: string, serial: string, scene: string, chapter: number) => ({ 键: segKey, segmentName: segKey.replace(/^\d+-/, ''), 编号: serial, 章: chapter, 段: { 场: scene } }) as unknown as SegInfo;
const segments = [makeSegmentInfo('7-五万血', '7-08', '7-黑暗监守', 7), makeSegmentInfo('7-黑暗来袭', '7-09', '7-黑暗监守', 7), makeSegmentInfo('8-开门', '8-01', '8-门', 8)];

describe('accept 逐段点名', () => {
  it('段键、段名各点一段放过（同一段点两次也行），只对上一段的章也放过', () => {
    expect(findAmbiguous(['7-五万血', '黑暗来袭', '五万血', '8'], segments, matchSelector)).toEqual([]);
  });

  it('场键、章范围对上多段就挑出来，带上对上的段键', () => {
    expect(findAmbiguous(['7-黑暗监守', '7', '8-开门'], segments, matchSelector)).toEqual([
      { selector: '7-黑暗监守', 段: ['7-五万血', '7-黑暗来袭'] },
      { selector: '7', 段: ['7-五万血', '7-黑暗来袭'] },
    ]);
  });

  it('编号 7-08 只点一段放过；章范围 7-8 对上多段照样拦下', () => {
    expect(findAmbiguous(['7-08'], segments, matchSelector)).toEqual([]);
    expect(findAmbiguous(['7-8'], segments, matchSelector)).toEqual([{ selector: '7-8', 段: ['7-五万血', '7-黑暗来袭', '8-开门'] }]);
  });
});
