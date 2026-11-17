// 试看 分级色调 的 定级（分级色调.ts 的 forceLevel）：在挑好的名单上把碰到框的区段换成指定级，同一处还是只画一级、不漏
import { describe, expect, it } from 'vitest';
import { forceLevel } from './分级色调.ts';
import { sectionBounds, sectionKey, type SectionId } from './区段.ts';

const keys = (list: SectionId[]) => list.map(sectionKey).sort();
const area = (list: SectionId[]) => list.reduce((sum, q) => sum + sectionBounds(q)[2] ** 2, 0);

describe('forceLevel', () => {
  it('比指定级粗的往下拆，不碰框的子块留在拆到的那一级', () => {
    // 一块第 2 级（256 米见方），框在它西南角：拆出 3 块第 1 级，西南那块再拆成 4 块第 0 级
    const list: SectionId[] = [{ L: 2, i: 0, j: 0 }];
    const out = forceLevel(list, 0, [[10, 10, 20, 20]]);
    expect(keys(out)).toEqual(['0|0|0', '0|0|1', '0|1|0', '0|1|1', '1|0|1', '1|1|0', '1|1|1']);
    expect(area(out)).toBe(area(list));
  });

  it('比指定级细的并回祖先，祖先整块换；祖先不碰框的不动', () => {
    const fine: SectionId[] = [0, 1].flatMap((j) => [0, 1].map((i) => ({ L: 0, i, j })));
    const far: SectionId[] = [0, 1].flatMap((j) => [4, 5].map((i) => ({ L: 0, i, j })));
    const list = [...fine, { L: 1, i: 1, j: 0 }, ...far];
    const out = forceLevel(list, 1, [[10, 10, 20, 20]]);
    expect(keys(out)).toEqual(['0|4|0', '0|4|1', '0|5|0', '0|5|1', '1|0|0', '1|1|0']);
    expect(area(out)).toBe(area(list));
  });

  it('坐标是负的也并到对的祖先；没有区段碰框时名单不变', () => {
    // 第 0 级 (−1, −1) 是 [−64, 0)²，它的第 1 级祖先是 (−1, −1) = [−128, 0)²
    expect(keys(forceLevel([{ L: 0, i: -1, j: -1 }], 1, [[-10, -10, -5, -5]]))).toEqual(['1|-1|-1']);
    const list: SectionId[] = [{ L: 3, i: 2, j: 2 }, { L: 0, i: 40, j: 40 }];
    expect(forceLevel(list, 1, [[10, 10, 20, 20]])).toEqual(list);
  });
});
