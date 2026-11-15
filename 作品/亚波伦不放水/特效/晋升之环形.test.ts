// 晋升之环的形：原版的转速和摆法照游戏的数；候选的几何都在写明的外径里、各层按秒转、法线和三角的绕向一致（反了受光会翻）。
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { RingBody } from './晋升之环几何.ts';
import { candidateSpecs, vanillaRing, vanillaSpinAngle, wearSpec, type CandidateName } from './晋升之环形.ts';

describe('原版贴片', () => {
  it('每秒 18 度，从正面看顺时针', () => {
    expect(vanillaSpinAngle(0)).toBeCloseTo(0);
    expect(vanillaSpinAngle(1)).toBe(-18);
    expect(vanillaSpinAngle(20)).toBe(-360);
  });
  it('史蒂夫戴原版就是游戏的数：头的转轴上方 12 像素、往后 5 像素、前倾 45 度、16 像素见方', () => {
    expect(wearSpec.史蒂夫.原版).toEqual({ 位: [0, 12, -5], tiltDeg: 45, scale: 1 });
    expect(vanillaRing.sideLength).toBe(16);
  });
});

describe('候选', () => {
  for (const candidateName of Object.keys(candidateSpecs) as CandidateName[]) {
    const ringBody = RingBody(candidateName);
    it(`${candidateName}：转到任何时刻都不超出外径，也不比外径小一截`, () => {
      const [m, v] = [new THREE.Matrix4(), new THREE.Vector3()];
      for (const sec of [0, 0.7, 3.3]) {
        let farthest = 0;
        for (const ringLayer of ringBody.layers) {
          ringLayer.poseAt(sec, m);
          for (const { geo } of ringLayer.parts) {
            const p = geo.getAttribute('position');
            for (let i = 0; i < p.count; i += 7) farthest = Math.max(farthest, v.fromBufferAttribute(p, i).applyMatrix4(m).length());
          }
        }
        expect(farthest).toBeLessThanOrEqual(candidateSpecs[candidateName].outerRadius + 1e-6);
        expect(farthest).toBeGreaterThan(candidateSpecs[candidateName].outerRadius - 0.6);
      }
    });
    it(`${candidateName}：会转`, () => {
      const changed = ringBody.layers.some((ringLayer) => !ringLayer.poseAt(0, new THREE.Matrix4()).equals(ringLayer.poseAt(1, new THREE.Matrix4())));
      expect(changed).toBe(true);
    });
    it(`${candidateName}：受光的网格法线和三角绕向一致`, () => {
      const [a, b, c, n, f] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
      for (const ringLayer of ringBody.layers)
        for (const { 类: matKind, geo } of ringLayer.parts) {
          if (matKind === '光' || matKind === '芒') continue;
          const [p, nor] = [geo.getAttribute('position'), geo.getAttribute('normal')];
          let backFaceCount = 0;
          for (let i = 0; i < p.count; i += 3) {
            a.fromBufferAttribute(p, i);
            b.fromBufferAttribute(p, i + 1);
            c.fromBufferAttribute(p, i + 2);
            f.crossVectors(b.sub(a), c.sub(a));
            if (f.lengthSq() < 1e-14) continue;
            n.fromBufferAttribute(nor, i).add(c.fromBufferAttribute(nor, i + 1)).add(b.fromBufferAttribute(nor, i + 2));
            if (f.dot(n) < 0) backFaceCount++;
          }
          expect(backFaceCount / (p.count / 3)).toBeLessThan(0.002);
        }
    });
  }
});
