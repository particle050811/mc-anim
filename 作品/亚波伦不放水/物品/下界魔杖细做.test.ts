// 细做的下界魔杖：拿在手上握点、杖轴要和原版落在同一处（斜举这些手摆的姿势才不用跟着改）；网格要是能看的（没有坏数、法线朝外、不超出全长太多）
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { 手持杖矩阵 } from './下界魔杖.tsx';
import { 手持细做杖矩阵, 杖点, 细做款们, 细做面数, 车削, type 细做款名 } from './下界魔杖细做.tsx';

// 这组只算位置，模型给空的、贴图给一张 1×1 透明 PNG
vi.mock('asset:模型/物品/下界魔杖', () => ({ default: { textures: [], parts: {} } }));
vi.mock('asset:贴图/物品/下界魔杖', () => ({ default: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==' }));

const 点 = (m: THREE.Matrix4, p: readonly number[]) => new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(m).toArray();
const 款们 = Object.keys(细做款们) as 细做款名[];

describe('下界魔杖细做', () => {
  // 原版物品空间里的握点：杖轴在模型像素 x = 7.5、z = 8.5，握在 y = 15（display 平移 [0, −7, 1]）
  const 原握 = 点(手持杖矩阵(), [-0.5 / 16, 7 / 16, 0.5 / 16]);
  const 原上 = 点(手持杖矩阵(), [-0.5 / 16, 23 / 16, 0.5 / 16]);
  for (const 款 of 款们)
    it(`${款}：握点和原版重合，杖轴同向，自转不挪握点`, () => {
      const { 握, 尖, 芯, 尾 } = 杖点(款);
      for (const m of [手持细做杖矩阵(款), 手持细做杖矩阵(款, 135)]) {
        点(m, 握).forEach((v, i) => expect(v).toBeCloseTo(原握[i]!, 9));
        // 握点往杖头走 1 格，和原版往杖头走 1 格到同一点
        点(m, [握[0], 握[1] + 1, 握[2]]).forEach((v, i) => expect(v).toBeCloseTo(原上[i]!, 9));
      }
      expect(尾[1]).toBeLessThan(握[1]);
      expect(握[1]).toBeLessThan(芯[1]);
      expect(芯[1]).toBeLessThan(尖[1]);
    });

  it('全长是她身高（约 45.7 杖像素）的 0.9～1.2 倍，三款都是上万面的顺滑网格', () => {
    for (const 款 of 款们) {
      const 倍 = 细做款们[款].全长 / 45.7;
      expect(倍).toBeGreaterThanOrEqual(0.9);
      expect(倍).toBeLessThanOrEqual(1.2);
      expect(细做面数(款)).toBeGreaterThan(10000);
    }
  });

  it('车削：没有坏数，法线是单位长、朝外', () => {
    const g = 车削([[0.001, 0], [1, 0.5], [1, 2], [0.001, 2.5]]);
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      const [x, y, z, nx, ny, nz] = [p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i)];
      for (const v of [x, y, z, nx, ny, nz]) expect(Number.isFinite(v)).toBe(true);
      expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 4);
      // 侧面的点法线不朝里
      if (Math.hypot(x, z) > 0.5) expect(nx * x + nz * z).toBeGreaterThan(-1e-6);
    }
  });
});
