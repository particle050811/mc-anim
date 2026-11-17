import { describe, expect, it } from 'vitest';
import { loadAllSegments, matchSelector, selectSegs } from './清单.ts';
import { manifest, segmentCode } from '../../作品/应力转动/清单.ts';
import type { SegInfo } from './清单.ts';

const fakeSeg = (segKey: string, chapter: number, chapterIndex: string, scene: string): SegInfo =>
  ({ key: segKey, 章: chapter, serial: `${chapter}-${chapterIndex}`, segmentName: segKey.slice(String(chapter).length + 1), 目录: '', 画面: '', segmentFile: '', segment: { scene: scene, sec: 1, width: 1, height: 1, terrain: [] } }) as SegInfo;

describe('选择器', () => {
  it('段键、段名、编号、场键、章、章范围全字匹配', () => {
    const s = fakeSeg('7-五万血', 7, '08', '7-黑暗监守');
    const isSelected = (x: string) => matchSelector([s], x).length === 1;
    for (const x of ['7-五万血', '五万血', '7-08', '7-黑暗监守', '7', '6-7', '7-9', '7-8']) expect(isSelected(x)).toBe(true);
    for (const x of ['五万', '6', '8-9', '7-黑暗']) expect(isSelected(x)).toBe(false);
  });

  it('编号先全字匹配，对不上任何段才当章范围', () => {
    const fakeSegments = [fakeSeg('6-进入森林', 6, '01', '6-森林'), fakeSeg('6-走', 6, '02', '6-森林'), fakeSeg('7-五万血', 7, '08', '7-黑暗监守'), fakeSeg('8-开门', 8, '01', '8-门')];
    const selectedSegKeys = (x: string) => matchSelector(fakeSegments, x).map((s) => s.key);
    expect(selectedSegKeys('6-01')).toEqual(['6-进入森林']);
    expect(selectedSegKeys('7-08')).toEqual(['7-五万血']);
    expect(selectedSegKeys('6-7')).toEqual(['6-进入森林', '6-走', '7-五万血']);
    expect(selectedSegKeys('7-8')).toEqual(['7-五万血', '8-开门']);
    expect(selectedSegKeys('6-02')).toEqual(['6-走']);
    expect(selectedSegKeys('6-03')).toEqual([]);
  });

  it('真清单：6-01、7-08 各只选中一段，6-7 仍是章范围', async () => {
    const allSegments = await loadAllSegments();
    expect((await selectSegs(['6-01'])).map((s) => s.key)).toEqual(['6-进入森林']);
    expect(await selectSegs(['7-08'])).toHaveLength(1);
    expect((await selectSegs(['6-7'])).map((s) => s.key)).toEqual(allSegments.filter((s) => s.章 === 6 || s.章 === 7).map((s) => s.key));
    expect((await selectSegs(['7-08', '7-五万血'])).map((s) => s.key)).toEqual(['7-五万血']);
  });

  it('清单里的段都能读到段.ts，核对段在前、没有编号；对不上的选择器报错', async () => {
    const allSegments = await loadAllSegments();
    expect(allSegments.map((s) => s.key)).toEqual(manifest.map((x) => x.key));
    expect(allSegments.slice(0, 2).map((s) => s.key)).toEqual(['核对-冒烟', '核对-角色包']);
    expect(allSegments[0]!.segment).toMatchObject({ sec: 2, width: 1280, height: 720 });
    expect(segmentCode('核对-冒烟')).toBeNull();
    // 选择器「核对」选中清单里全部核对段；不写死名单，加核对段不用回来改这里
    const checkKeys = manifest.map((x) => x.key).filter((k) => k.startsWith('核对-'));
    expect(checkKeys.length).toBeGreaterThan(1);
    expect((await selectSegs(['核对'])).map((s) => s.key)).toEqual(checkKeys);
    await expect(selectSegs(['没有这段'])).rejects.toThrow(/没对上任何段：没有这段/);
  });
});
