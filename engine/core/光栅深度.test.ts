import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { 光栅兼容, 光栅深度宏, 切光栅宏, 反向比较, 反向系数, 换成反向投影 } from './光栅深度.ts';

const 深度 = (投影: THREE.Matrix4, 纵深: number, x = 0, y = 0) => {
  const 点 = new THREE.Vector4(x, y, -纵深, 1).applyMatrix4(投影);
  return { z: 点.z / 点.w, x: 点.x / 点.w, y: 点.y / 点.w, w: 点.w };
};

describe('光栅深度', () => {
  it('反向投影：近处 1、远处 0，中间等于 a ÷ 纵深 − b，x、y、w 不变', () => {
    for (const [近, 远] of [[0.05, 20000], [0.1, 1000], [1, 64]] as const) {
      const 机 = new THREE.PerspectiveCamera(50, 16 / 9, 近, 远);
      机.setViewOffset(3840, 2160, 100, 50, 1920, 1080); // 偏心投影也只动 z 行
      机.updateProjectionMatrix();
      const 原 = 机.projectionMatrix.clone();
      const 反 = 换成反向投影(机.projectionMatrix.clone(), 近, 远);
      const { a, b } = 反向系数(近, 远);
      expect(深度(反, 近).z).toBeCloseTo(1, 6);
      expect(深度(反, 远).z).toBeCloseTo(0, 9);
      for (const 纵深 of [近 * 2, 3, 远 / 3]) {
        const 新 = 深度(反, 纵深, 1.5, -0.7);
        const 旧 = 深度(原, 纵深, 1.5, -0.7);
        expect(新.z).toBeCloseTo(a / 纵深 - b, 9);
        expect(a / (新.z + b)).toBeCloseTo(纵深, 6);
        expect([新.x, 新.y, 新.w]).toEqual([旧.x, 旧.y, 旧.w]);
      }
    }
  });

  it('深度比较成对反过来', () => {
    expect(反向比较[THREE.LessEqualDepth]).toBe(THREE.GreaterEqualDepth);
    expect(反向比较[THREE.LessDepth]).toBe(THREE.GreaterDepth);
    for (const 比 of [THREE.NeverDepth, THREE.AlwaysDepth, THREE.LessDepth, THREE.LessEqualDepth, THREE.EqualDepth, THREE.GreaterEqualDepth, THREE.GreaterDepth, THREE.NotEqualDepth]) expect(反向比较[反向比较[比]!]).toBe(比);
  });

  it('宏只在状态变了才让材质重选程序，摘掉以后和没挂过一样', () => {
    const 内置 = new THREE.MeshLambertMaterial();
    const 标准 = new THREE.MeshStandardMaterial();
    const 原宏 = { ...标准.defines };
    for (const 材质 of [内置, 标准]) {
      切光栅宏(材质, false);
      expect(材质.version).toBe(0);
      切光栅宏(材质, true);
      切光栅宏(材质, true);
      expect(材质.version).toBe(1);
      expect(Object.hasOwn(材质.defines!, 光栅深度宏)).toBe(true);
      切光栅宏(材质, false);
      expect(材质.version).toBe(2);
    }
    expect(内置.defines).toEqual({});
    expect(标准.defines).toEqual(原宏);
  });

  it('对数深度片段带宏时不写片元深度', () => {
    const 段 = THREE.ShaderChunk.logdepthbuf_fragment;
    expect(段.startsWith(`#ifndef ${光栅深度宏}`)).toBe(true);
    expect(段.trimEnd().endsWith('#endif')).toBe(true);
    expect(段).toContain('gl_FragDepth');
  });

  it('哪些材质认：内置的、接了标准对数深度的自写着色器、明标的；透射和自己定深度的不认', () => {
    const 顶点 = 'void main() {\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n  #include <logdepthbuf_vertex>\n}';
    const 片元 = 'void main() {\n  #include <logdepthbuf_fragment>\n  gl_FragColor = vec4(1.0);\n}';
    expect(光栅兼容(new THREE.MeshStandardMaterial())).toBe(true);
    expect(光栅兼容(new THREE.MeshPhysicalMaterial({ transmission: 0.5 }))).toBe(false);
    expect(光栅兼容(new THREE.ShaderMaterial({ vertexShader: 顶点, fragmentShader: 片元 }))).toBe(true);
    // 没接对数深度的（穹顶、发光件）
    expect(光栅兼容(new THREE.ShaderMaterial({ vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: 'void main() { gl_FragColor = vec4(1.0); }' }))).toBe(false);
    // 自己写片元深度、自己改裁剪 z 的
    expect(光栅兼容(new THREE.ShaderMaterial({ vertexShader: 顶点, fragmentShader: 片元.replace('gl_FragColor', 'gl_FragDepth = 0.5;\n  gl_FragColor') }))).toBe(false);
    expect(光栅兼容(new THREE.ShaderMaterial({ vertexShader: 顶点.replace('#include', 'gl_Position.z = gl_Position.w;\n  #include'), fragmentShader: 片元 }))).toBe(false);
    // 不做深度测试的不受影响；明标的照标的算
    expect(光栅兼容(new THREE.ShaderMaterial({ depthTest: false }))).toBe(true);
    expect(光栅兼容(new THREE.ShaderMaterial({ userData: { 光栅深度: true } }))).toBe(true);
    expect(光栅兼容(new THREE.MeshBasicMaterial({ userData: { 光栅深度: false } }))).toBe(false);
    // 着色器换了重新判
    const 换 = new THREE.ShaderMaterial({ vertexShader: 顶点, fragmentShader: 片元 });
    expect(光栅兼容(换)).toBe(true);
    换.fragmentShader = 'void main() { gl_FragColor = vec4(1.0); }';
    expect(光栅兼容(换)).toBe(false);
  });
});
