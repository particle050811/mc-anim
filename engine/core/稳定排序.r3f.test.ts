// 真的走一遍 R3F 的调和：钉住 还原声明次序 依赖的两件事（重建挂到末尾、实例表不动），升 R3F 时这里先报
import { act, createRoot, extend } from '@react-three/fiber';
import { createElement as 元素, createRef } from 'react';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { 还原声明次序 } from './稳定排序.ts';

extend(THREE as never);
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const 假画布 = { style: {}, width: 100, height: 100, addEventListener() {}, removeEventListener() {}, parentElement: null } as unknown as HTMLCanvasElement;
const 假渲染器 = { render() {}, setPixelRatio() {}, setSize() {}, dispose() {}, xr: { addEventListener() {}, removeEventListener() {} }, shadowMap: {}, domElement: 假画布 } as unknown as THREE.WebGLRenderer;

describe('还原声明次序（真 R3F）', () => {
  it('<primitive> 换对象后物体到了末尾，还原后回到 JSX 的先后', async () => {
    const [甲1, 甲2, 乙, 丙] = [new THREE.Mesh(), new THREE.Mesh(), new THREE.Mesh(), new THREE.Mesh()];
    const 父引用 = createRef<THREE.Group>();
    const 树 = (甲: THREE.Object3D) => 元素('group', { ref: 父引用 }, 元素('primitive', { object: 甲 }), 元素('primitive', { object: 乙 }), 元素('primitive', { object: 丙 }));
    const 根 = createRoot(假画布);
    await 根.configure({ gl: () => 假渲染器, frameloop: 'never', events: undefined, size: { width: 100, height: 100, top: 0, left: 0 } });
    await act(async () => 根.render(树(甲1)));
    expect(父引用.current!.children).toEqual([甲1, 乙, 丙]);
    await act(async () => 根.render(树(甲2)));
    expect(父引用.current!.children).toEqual([乙, 丙, 甲2]);
    还原声明次序(父引用.current!);
    expect(父引用.current!.children).toEqual([甲2, 乙, 丙]);
    await act(async () => 根.unmount());
  });
});
