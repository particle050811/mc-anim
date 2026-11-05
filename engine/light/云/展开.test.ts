// 默认三层 + 精确档要和 engine/light/大气/云.ts 写死的数一样（PC_CU_R 900、PC_AC_R 3200、PC_CI_R 6000，积云厚 1200、高低差 2400，步数 160/80/480）：
// 回忆这几段换到云组件时逐像素不变靠的就是这个
import { describe, expect, it } from 'vitest';
import { 展开 } from './展开.ts';

describe('云组件展开', () => {
  it('默认三层、精确档同 大气/云.ts', () => {
    const e = 展开({ 质量: '精确' }, -230);
    expect(e.层们.map((l) => [l.算法, l.R, l.T])).toEqual([
      ['Photon积云', 900, 1200],
      ['Photon高积云', 3200, 480],
      ['Photon卷云', 6000, 1500],
    ]);
    const cu = e.层们[0]!;
    expect([cu.BH, cu.壳BH, cu.平滑]).toEqual([2400, 2400, false]);
    expect(cu.步).toMatchObject({ 主H: 160, 主Z: 80, 最多: 480, 光: 6, 散射: 8 });
    expect(e.层们[1]!.步).toMatchObject({ 主H: 48, 主Z: 24, 最多: 48, 光: 4 });
  });

  it('层按云底从低到高排，没做的算法报错', () => {
    const e = 展开({ 层: [{ 算法: 'Photon卷云', 底高: 2000 }, { 算法: 'Photon积云', 底高: 70 }] }, 0);
    expect(e.层们.map((l) => l.算法)).toEqual(['Photon积云', 'Photon卷云']);
    expect(() => 展开({ 层: [{ 算法: '叠片', 底高: 100 }] }, 0)).toThrow(/还没做/);
  });
});
