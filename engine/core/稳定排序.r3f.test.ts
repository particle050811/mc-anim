// 真的走一遍 R3F 的调和：钉住 还原声明次序 依赖的两件事（重建挂到末尾、实例表不动），升 R3F 时这里先报
import { act, createRoot, extend } from '@react-three/fiber';
import { createElement as element, createRef } from 'react';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { restoreDeclOrder } from './稳定排序.ts';

extend(THREE as never);
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fakeCanvas = { style: {}, width: 100, height: 100, addEventListener() {}, removeEventListener() {}, parentElement: null } as unknown as HTMLCanvasElement;
const fakeRenderer = { render() {}, setPixelRatio() {}, setSize() {}, dispose() {}, xr: { addEventListener() {}, removeEventListener() {} }, shadowMap: {}, domElement: fakeCanvas } as unknown as THREE.WebGLRenderer;

describe('还原声明次序（真 R3F）', () => {
  it('<primitive> 换对象后物体到了末尾，还原后回到 JSX 的先后', async () => {
    const [firstMesh, secondMesh, second, meshThird] = [new THREE.Mesh(), new THREE.Mesh(), new THREE.Mesh(), new THREE.Mesh()];
    const parentRef = createRef<THREE.Group>();
    const renderTree = (child: THREE.Object3D) => element('group', { ref: parentRef }, element('primitive', { object: child }), element('primitive', { object: second }), element('primitive', { object: meshThird }));
    const reactRoot = createRoot(fakeCanvas);
    await reactRoot.configure({ gl: () => fakeRenderer, frameloop: 'never', events: undefined, size: { width: 100, height: 100, top: 0, left: 0 } });
    await act(async () => reactRoot.render(renderTree(firstMesh)));
    expect(parentRef.current!.children).toEqual([firstMesh, second, meshThird]);
    await act(async () => reactRoot.render(renderTree(secondMesh)));
    expect(parentRef.current!.children).toEqual([second, meshThird, secondMesh]);
    restoreDeclOrder(parentRef.current!);
    expect(parentRef.current!.children).toEqual([secondMesh, second, meshThird]);
    await act(async () => reactRoot.unmount());
  });
});
