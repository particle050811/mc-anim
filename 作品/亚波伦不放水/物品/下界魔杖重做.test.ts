// 重做的下界魔杖拿在手上：握点、杖轴要和原版落在同一处（斜举这些手摆的姿势才不用跟着改）
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { 手持杖矩阵 } from './下界魔杖.tsx';
import { 手持重做杖矩阵, 杖点, 魔杖款们, type 魔杖款名 } from './下界魔杖重做.tsx';

// 这组只算位置，模型给空的、贴图给一张 1×1 透明 PNG
vi.mock('asset:模型/物品/下界魔杖', () => ({ default: { textures: [], parts: {} } }));
const 图 = vi.hoisted(() => () => ({ default: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==' }));
vi.mock('asset:贴图/物品/下界魔杖', 图);
vi.mock('asset:贴图/物品/下界魔杖重做', 图);

const 点 = (m: THREE.Matrix4, p: readonly number[]) => new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(m).toArray();

describe('下界魔杖重做', () => {
  // 原版物品空间里的握点：杖轴在模型像素 x = 7.5、z = 8.5，握在 y = 15（display 平移 [0, −7, 1]）
  const 原握 = 点(手持杖矩阵(), [-0.5 / 16, 7 / 16, 0.5 / 16]);
  const 原上 = 点(手持杖矩阵(), [-0.5 / 16, 23 / 16, 0.5 / 16]);
  for (const 款 of Object.keys(魔杖款们) as 魔杖款名[])
    it(`${款}：握点和原版重合，杖轴同向`, () => {
      const m = 手持重做杖矩阵(款);
      const { 握, 尖, 芯, 尾 } = 杖点(款);
      点(m, 握).forEach((v, i) => expect(v).toBeCloseTo(原握[i]!, 9));
      // 握点往杖头走 1 格，和原版往杖头走 1 格到同一点
      点(m, [握[0], 握[1] + 1, 握[2]]).forEach((v, i) => expect(v).toBeCloseTo(原上[i]!, 9));
      expect(尾[1]).toBeLessThan(握[1]);
      expect(握[1]).toBeLessThan(芯[1]);
      expect(芯[1]).toBeLessThan(尖[1]);
    });

  it('每一款的方盒都不超出全长，芯是不受光的料', () => {
    for (const k of Object.values(魔杖款们)) {
      for (const 盒 of k.盒们) if (!盒.转?.length) expect(Math.max(盒.a[1], 盒.b[1])).toBeLessThanOrEqual(k.全长);
      expect(k.盒们.some((盒) => 盒.料 === '芯' || 盒.料 === '熔核')).toBe(true);
    }
  });
});
