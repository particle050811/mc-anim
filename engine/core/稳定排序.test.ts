import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { opaqueOrder, orderInGroup, sortMaterials, placeBehind, refreshBoundingSphere, restoreDeclOrder, transparentOrder } from './稳定排序.ts';

const makeItem = (name: string, overrides: Partial<{ groupOrder: number; renderOrder: number; materialVariant: number; z: number }> = {}) => ({ name: name, groupOrder: 0, renderOrder: 0, materialVariant: 0, z: 0.5, ...overrides });
const namesOf = (xs: { name: string }[]) => xs.map((x) => x.name).join('');

describe('稳定排序', () => {
  it('不透明由近到远，透明由远到近，组和 renderOrder 优先', () => {
    const a = makeItem('a', { z: 0.2 });
    const b = makeItem('b', { z: 0.8 });
    const c = makeItem('c', { z: 0.9, renderOrder: -1 });
    const d = makeItem('d', { z: 0.1, groupOrder: 1 });
    expect(namesOf([d, b, a, c].sort(opaqueOrder))).toBe('cabd');
    expect(namesOf([d, a, b, c].sort(transparentOrder))).toBe('cbad');
  });

  it('距离完全相同留在推入的先后（场景遍历），不看任何编号', () => {
    const first = { ...makeItem('甲'), id: 9 };
    const second = { ...makeItem('乙'), id: 3 };
    expect(namesOf([first, second].sort(opaqueOrder))).toBe('甲乙');
    expect(namesOf([second, first].sort(opaqueOrder))).toBe('乙甲');
    expect(namesOf([first, second].sort(transparentOrder))).toBe('甲乙');
    expect(namesOf([second, first].sort(transparentOrder))).toBe('乙甲');
  });

  it('不透明先比材质：按这一遍场景里第一次见到的先后，和材质创建的先后无关', () => {
    const earlyMat = new THREE.MeshBasicMaterial();
    const lateMat = new THREE.MeshBasicMaterial();
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(undefined, lateMat), new THREE.Mesh(undefined, earlyMat));
    sortMaterials(scene);
    const near = { ...makeItem('近', { z: 0.1 }), material: earlyMat };
    const far = { ...makeItem('远', { z: 0.9 }), material: lateMat };
    expect(namesOf([near, far].sort(opaqueOrder))).toBe('远近');
    scene.children.reverse();
    sortMaterials(scene);
    expect(namesOf([near, far].sort(opaqueOrder))).toBe('近远');
  });

  it('成组的材质相对先后固定，第一次见到整组占位', () => {
    const group = {};
    const [zero, firstMaterial] = [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()];
    orderInGroup(zero, group, 0, 2);
    orderInGroup(firstMaterial, group, 1, 2);
    const otherMat = new THREE.MeshBasicMaterial();
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(undefined, firstMaterial), new THREE.Mesh(undefined, otherMat), new THREE.Mesh(undefined, zero));
    sortMaterials(scene);
    const items = [{ ...makeItem('别'), material: otherMat }, { ...makeItem('一'), material: firstMaterial }, { ...makeItem('零'), material: zero }];
    expect(namesOf(items.sort(opaqueOrder))).toBe('零一别');
  });

  it('排在后面的材质在所有普通材质之后，不管场景里谁先出现', () => {
    const meshMaterial = new THREE.MeshBasicMaterial();
    placeBehind(meshMaterial);
    const handMaterial = new THREE.MeshBasicMaterial();
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(undefined, meshMaterial), new THREE.Mesh(undefined, handMaterial));
    sortMaterials(scene);
    const items = [{ ...makeItem('网', { z: 0.1 }), material: meshMaterial }, { ...makeItem('手', { z: 0.9 }), material: handMaterial }];
    expect(namesOf(items.sort(opaqueOrder))).toBe('手网');
  });

  it('真的 three 排序路径上装得上：场景渲染前换掉渲染器的两个排序', () => {
    const captured = { opaque: null as unknown, transparentSort: null as unknown };
    const fakeRenderer = {
      setOpaqueSort: (f: unknown) => (captured.opaque = f),
      setTransparentSort: (f: unknown) => (captured.transparentSort = f),
    } as unknown as THREE.WebGLRenderer;
    const scene = new THREE.Scene();
    (scene.onBeforeRender as unknown as (r: THREE.WebGLRenderer) => void)(fakeRenderer);
    expect(captured.opaque).toBe(opaqueOrder);
    expect(captured.transparentSort).toBe(transparentOrder);
  });
  it('每帧改实例或顶点的物体，包围球跟当前这一帧走；内容没变的不动', () => {
    const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
    const instanced = new THREE.InstancedMesh(boxGeometry, new THREE.MeshBasicMaterial(), 2);
    instanced.setMatrixAt(0, new THREE.Matrix4().makeTranslation(10, 0, 0));
    instanced.setMatrixAt(1, new THREE.Matrix4().makeTranslation(12, 0, 0));
    refreshBoundingSphere(instanced);
    instanced.computeBoundingSphere();
    const oldSphere = instanced.boundingSphere!;
    refreshBoundingSphere(instanced);
    expect(instanced.boundingSphere).toBe(oldSphere);
    instanced.setMatrixAt(0, new THREE.Matrix4().makeTranslation(-50, 0, 0));
    instanced.instanceMatrix.needsUpdate = true;
    refreshBoundingSphere(instanced);
    expect(instanced.boundingSphere).toBeNull();
    instanced.computeBoundingSphere();
    instanced.count = 1;
    refreshBoundingSphere(instanced);
    expect(instanced.boundingSphere).toBeNull();

    const handGeometry = new THREE.BufferGeometry();
    handGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    handGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(1, 2, 3), 4);
    const mesh = new THREE.Mesh(handGeometry);
    refreshBoundingSphere(mesh);
    refreshBoundingSphere(mesh);
    expect(handGeometry.boundingSphere?.radius).toBe(4);
    handGeometry.getAttribute('position').needsUpdate = true;
    refreshBoundingSphere(mesh);
    expect(handGeometry.boundingSphere).toBeNull();
    expect(() => refreshBoundingSphere(new THREE.Group())).not.toThrow();
  });
  it('重建挪到末尾的子节点按实例表还原，不归 R3F 管的留在原位', () => {
    const parentGroup = new THREE.Group();
    const [meshFirst, manual, second, meshThird] = [new THREE.Mesh(), new THREE.Mesh(), new THREE.Mesh(), new THREE.Mesh()];
    parentGroup.add(manual, second, meshThird, meshFirst); // 甲 本来声明在最前，重建后到了末尾
    const r3fParent = parentGroup as THREE.Group & { __r3f?: unknown };
    r3fParent.__r3f = { children: [{ object: meshFirst }, { object: new THREE.MeshBasicMaterial() }, { object: second }, { object: meshThird }] };
    restoreDeclOrder(parentGroup);
    expect(parentGroup.children).toEqual([manual, meshFirst, second, meshThird]);
    restoreDeclOrder(parentGroup);
    expect(parentGroup.children).toEqual([manual, meshFirst, second, meshThird]);
  });
  it('几千个声明节点不反复从头查位置，手动节点仍留在原位', () => {
    const parentGroup = new THREE.Group();
    const children = Array.from({ length: 2000 }, () => new THREE.Object3D());
    const manual = new THREE.Object3D();
    parentGroup.add(manual, ...children);
    (parentGroup as THREE.Group & { __r3f?: unknown }).__r3f = { children: children.map((object) => ({ object })) };
    let readCount = 0;
    parentGroup.children = new Proxy(parentGroup.children, {
      get: (target, propKey, receiver) => {
        if (typeof propKey === 'string' && /^\d+$/.test(propKey)) readCount++;
        return Reflect.get(target, propKey, receiver);
      },
    });
    restoreDeclOrder(parentGroup);
    expect(readCount).toBeLessThan(children.length * 5);
    parentGroup.remove(children[0]);
    parentGroup.add(children[0]);
    readCount = 0;
    restoreDeclOrder(parentGroup);
    expect(readCount).toBeLessThan(children.length * 5);
    expect(parentGroup.children).toEqual([manual, ...children]);
  });

});
