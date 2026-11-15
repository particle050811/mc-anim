import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { rasterCompatible, rasterDepthMacro, toggleRasterMacro, reverseCompare, reverseCoeffs, toReverseProjection } from './光栅深度.ts';

const depthOf = (projection: THREE.Matrix4, viewDepth: number, x = 0, y = 0) => {
  const clipPos = new THREE.Vector4(x, y, -viewDepth, 1).applyMatrix4(projection);
  return { z: clipPos.z / clipPos.w, x: clipPos.x / clipPos.w, y: clipPos.y / clipPos.w, w: clipPos.w };
};

describe('光栅深度', () => {
  it('反向投影：近处 1、远处 0，中间等于 a ÷ 纵深 − b，x、y、w 不变', () => {
    for (const [near, far] of [[0.05, 20000], [0.1, 1000], [1, 64]] as const) {
      const camera = new THREE.PerspectiveCamera(50, 16 / 9, near, far);
      camera.setViewOffset(3840, 2160, 100, 50, 1920, 1080); // 偏心投影也只动 z 行
      camera.updateProjectionMatrix();
      const originalProjection = camera.projectionMatrix.clone();
      const reversedProjection = toReverseProjection(camera.projectionMatrix.clone(), near, far);
      const { a, b } = reverseCoeffs(near, far);
      expect(depthOf(reversedProjection, near).z).toBeCloseTo(1, 6);
      expect(depthOf(reversedProjection, far).z).toBeCloseTo(0, 9);
      for (const viewDepth of [near * 2, 3, far / 3]) {
        const nextDepth = depthOf(reversedProjection, viewDepth, 1.5, -0.7);
        const prevDepth = depthOf(originalProjection, viewDepth, 1.5, -0.7);
        expect(nextDepth.z).toBeCloseTo(a / viewDepth - b, 9);
        expect(a / (nextDepth.z + b)).toBeCloseTo(viewDepth, 6);
        expect([nextDepth.x, nextDepth.y, nextDepth.w]).toEqual([prevDepth.x, prevDepth.y, prevDepth.w]);
      }
    }
  });

  it('深度比较成对反过来', () => {
    expect(reverseCompare[THREE.LessEqualDepth]).toBe(THREE.GreaterEqualDepth);
    expect(reverseCompare[THREE.LessDepth]).toBe(THREE.GreaterDepth);
    for (const depthFunc of [THREE.NeverDepth, THREE.AlwaysDepth, THREE.LessDepth, THREE.LessEqualDepth, THREE.EqualDepth, THREE.GreaterEqualDepth, THREE.GreaterDepth, THREE.NotEqualDepth]) expect(reverseCompare[reverseCompare[depthFunc]!]).toBe(depthFunc);
  });

  it('宏只在状态变了才让材质重选程序，摘掉以后和没挂过一样', () => {
    const builtinMaterial = new THREE.MeshLambertMaterial();
    const standard = new THREE.MeshStandardMaterial();
    const origMacros = { ...standard.defines };
    for (const material of [builtinMaterial, standard]) {
      toggleRasterMacro(material, false);
      expect(material.version).toBe(0);
      toggleRasterMacro(material, true);
      toggleRasterMacro(material, true);
      expect(material.version).toBe(1);
      expect(Object.hasOwn(material.defines!, rasterDepthMacro)).toBe(true);
      toggleRasterMacro(material, false);
      expect(material.version).toBe(2);
    }
    expect(builtinMaterial.defines).toEqual({});
    expect(standard.defines).toEqual(origMacros);
  });

  it('对数深度片段带宏时不写片元深度', () => {
    const logDepthChunk = THREE.ShaderChunk.logdepthbuf_fragment;
    expect(logDepthChunk.startsWith(`#ifndef ${rasterDepthMacro}`)).toBe(true);
    expect(logDepthChunk.trimEnd().endsWith('#endif')).toBe(true);
    expect(logDepthChunk).toContain('gl_FragDepth');
  });

  it('哪些材质认：内置的、接了标准对数深度的自写着色器、明标的；透射和自己定深度的不认', () => {
    const vertexShaderSource = 'void main() {\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n  #include <logdepthbuf_vertex>\n}';
    const fragmentSource = 'void main() {\n  #include <logdepthbuf_fragment>\n  gl_FragColor = vec4(1.0);\n}';
    expect(rasterCompatible(new THREE.MeshStandardMaterial())).toBe(true);
    expect(rasterCompatible(new THREE.MeshPhysicalMaterial({ transmission: 0.5 }))).toBe(false);
    expect(rasterCompatible(new THREE.ShaderMaterial({ vertexShader: vertexShaderSource, fragmentShader: fragmentSource }))).toBe(true);
    // 没接对数深度的（穹顶、发光件）
    expect(rasterCompatible(new THREE.ShaderMaterial({ vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: 'void main() { gl_FragColor = vec4(1.0); }' }))).toBe(false);
    // 自己写片元深度、自己改裁剪 z 的
    expect(rasterCompatible(new THREE.ShaderMaterial({ vertexShader: vertexShaderSource, fragmentShader: fragmentSource.replace('gl_FragColor', 'gl_FragDepth = 0.5;\n  gl_FragColor') }))).toBe(false);
    expect(rasterCompatible(new THREE.ShaderMaterial({ vertexShader: vertexShaderSource.replace('#include', 'gl_Position.z = gl_Position.w;\n  #include'), fragmentShader: fragmentSource }))).toBe(false);
    // 不做深度测试的不受影响；明标的照标的算
    expect(rasterCompatible(new THREE.ShaderMaterial({ depthTest: false }))).toBe(true);
    expect(rasterCompatible(new THREE.ShaderMaterial({ userData: { rasterDepth: true } }))).toBe(true);
    expect(rasterCompatible(new THREE.MeshBasicMaterial({ userData: { rasterDepth: false } }))).toBe(false);
    // 着色器换了重新判
    const replacement = new THREE.ShaderMaterial({ vertexShader: vertexShaderSource, fragmentShader: fragmentSource });
    expect(rasterCompatible(replacement)).toBe(true);
    replacement.fragmentShader = 'void main() { gl_FragColor = vec4(1.0); }';
    expect(rasterCompatible(replacement)).toBe(false);
  });
});
