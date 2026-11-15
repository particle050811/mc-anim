import { describe, expect, it } from 'vitest';
import { manifestTools } from './清单工具.ts';

describe('清单工具：作品 清单.ts 尾部的通用部分', () => {
  const manifest = [
    { 键: '核对-冒烟', 章: '核对' as const },
    { 键: '6-进入森林', 章: 6, 集: 1 },
    { 键: '6-斩娜迦', 章: 6 },
    { 键: '7-黑暗降临', 章: 7 },
  ];
  const { segDir, segmentName, segmentCode } = manifestTools(manifest);
  it('段目录、段名、编号', () => {
    expect(segDir('核对-冒烟')).toBe('核对/冒烟');
    expect(segDir('6-斩娜迦')).toBe('段/6-斩娜迦');
    expect(segmentName(manifest[1]!)).toBe('进入森林');
    expect(segmentName(manifest[0]!)).toBe('冒烟');
    expect([segmentCode('6-进入森林'), segmentCode('6-斩娜迦'), segmentCode('7-黑暗降临'), segmentCode('核对-冒烟'), segmentCode('没有')]).toEqual(['6-01', '6-02', '7-01', null, null]);
  });
});
