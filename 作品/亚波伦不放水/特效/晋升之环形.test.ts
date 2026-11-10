// 晋升之环的形：原版的转速和摆法照游戏的数；候选的几何都在写明的外径里、各层按秒转、法线和三角的绕向一致（反了受光会翻）。
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { 环体 } from './晋升之环几何.ts';
import { 候选们, 原版环, 原版转角, 戴法, type 候选名 } from './晋升之环形.ts';

describe('原版贴片', () => {
  it('每秒 18 度，从正面看顺时针', () => {
    expect(原版转角(0)).toBeCloseTo(0);
    expect(原版转角(1)).toBe(-18);
    expect(原版转角(20)).toBe(-360);
  });
  it('史蒂夫戴原版就是游戏的数：头的转轴上方 12 像素、往后 5 像素、前倾 45 度、16 像素见方', () => {
    expect(戴法.史蒂夫.原版).toEqual({ 位: [0, 12, -5], 前倾度: 45, 倍: 1 });
    expect(原版环.边长).toBe(16);
  });
});

describe('候选', () => {
  for (const 名 of Object.keys(候选们) as 候选名[]) {
    const 体 = 环体(名);
    it(`${名}：转到任何时刻都不超出外径，也不比外径小一截`, () => {
      const [m, v] = [new THREE.Matrix4(), new THREE.Vector3()];
      for (const 秒 of [0, 0.7, 3.3]) {
        let 最远 = 0;
        for (const 层 of 体.层们) {
          层.位姿(秒, m);
          for (const { geo } of 层.件们) {
            const p = geo.getAttribute('position');
            for (let i = 0; i < p.count; i += 7) 最远 = Math.max(最远, v.fromBufferAttribute(p, i).applyMatrix4(m).length());
          }
        }
        expect(最远).toBeLessThanOrEqual(候选们[名].外径 + 1e-6);
        expect(最远).toBeGreaterThan(候选们[名].外径 - 0.6);
      }
    });
    it(`${名}：会转`, () => {
      const 变 = 体.层们.some((层) => !层.位姿(0, new THREE.Matrix4()).equals(层.位姿(1, new THREE.Matrix4())));
      expect(变).toBe(true);
    });
    it(`${名}：受光的网格法线和三角绕向一致`, () => {
      const [a, b, c, n, f] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
      for (const 层 of 体.层们)
        for (const { 类, geo } of 层.件们) {
          if (类 === '光' || 类 === '芒') continue;
          const [p, nor] = [geo.getAttribute('position'), geo.getAttribute('normal')];
          let 反 = 0;
          for (let i = 0; i < p.count; i += 3) {
            a.fromBufferAttribute(p, i);
            b.fromBufferAttribute(p, i + 1);
            c.fromBufferAttribute(p, i + 2);
            f.crossVectors(b.sub(a), c.sub(a));
            if (f.lengthSq() < 1e-14) continue;
            n.fromBufferAttribute(nor, i).add(c.fromBufferAttribute(nor, i + 1)).add(b.fromBufferAttribute(nor, i + 2));
            if (f.dot(n) < 0) 反++;
          }
          expect(反 / (p.count / 3)).toBeLessThan(0.002);
        }
    });
  }
});
