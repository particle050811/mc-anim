// 默认三层 + 精确档要和 engine/light/大气/云.ts 写死的数一样（PC_CU_R 900、PC_AC_R 3200、PC_CI_R 6000，积云厚 1200、高低差 2400，步数 160/80/480）：
// 回忆这几段换到云组件时逐像素不变靠的就是这个
import { describe, expect, it } from 'vitest';
import { expandCloud } from './展开.ts';

describe('云组件展开', () => {
  it('默认三层、精确档同 大气/云.ts', () => {
    const e = expandCloud({ quality: '精确' }, -230);
    expect(e.layers.map((l) => [l.algorithm, l.R, l.T])).toEqual([
      ['Photon积云', 900, 1200],
      ['Photon高积云', 3200, 480],
      ['Photon卷云', 6000, 1500],
    ]);
    const cu = e.layers[0]!;
    expect([cu.BH, cu.shellHeight, cu.smooth]).toEqual([2400, 2400, false]);
    expect(cu.step).toMatchObject({ mainHeight: 160, mainDepth: 80, 最多: 480, 光: 6, scatterSteps: 8 });
    expect(e.layers[1]!.step).toMatchObject({ mainHeight: 48, mainDepth: 24, 最多: 48, 光: 4 });
  });

  it('层按云底从低到高排，没做的算法报错', () => {
    const e = expandCloud({ layers: [{ algorithm: 'Photon卷云', bottomHeight: 2000 }, { algorithm: 'Photon积云', bottomHeight: 70 }] }, 0);
    expect(e.layers.map((l) => l.algorithm)).toEqual(['Photon积云', 'Photon卷云']);
    expect(() => expandCloud({ layers: [{ algorithm: '叠片', bottomHeight: 100 }] }, 0)).toThrow(/还没做/);
  });
});
