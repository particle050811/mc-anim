import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { 不透明先后, 成组排, 排材质, 排在后面, 刷新包围球, 还原声明次序, 透明先后 } from './稳定排序.ts';

const 项 = (名: string, 改: Partial<{ groupOrder: number; renderOrder: number; materialVariant: number; z: number }> = {}) => ({ 名, groupOrder: 0, renderOrder: 0, materialVariant: 0, z: 0.5, ...改 });
const 名们 = (xs: { 名: string }[]) => xs.map((x) => x.名).join('');

describe('稳定排序', () => {
  it('不透明由近到远，透明由远到近，组和 renderOrder 优先', () => {
    const a = 项('a', { z: 0.2 });
    const b = 项('b', { z: 0.8 });
    const c = 项('c', { z: 0.9, renderOrder: -1 });
    const d = 项('d', { z: 0.1, groupOrder: 1 });
    expect(名们([d, b, a, c].sort(不透明先后))).toBe('cabd');
    expect(名们([d, a, b, c].sort(透明先后))).toBe('cbad');
  });

  it('距离完全相同留在推入的先后（场景遍历），不看任何编号', () => {
    const 甲 = { ...项('甲'), id: 9 };
    const 乙 = { ...项('乙'), id: 3 };
    expect(名们([甲, 乙].sort(不透明先后))).toBe('甲乙');
    expect(名们([乙, 甲].sort(不透明先后))).toBe('乙甲');
    expect(名们([甲, 乙].sort(透明先后))).toBe('甲乙');
    expect(名们([乙, 甲].sort(透明先后))).toBe('乙甲');
  });

  it('不透明先比材质：按这一遍场景里第一次见到的先后，和材质创建的先后无关', () => {
    const 先建 = new THREE.MeshBasicMaterial();
    const 后建 = new THREE.MeshBasicMaterial();
    const 场 = new THREE.Scene();
    场.add(new THREE.Mesh(undefined, 后建), new THREE.Mesh(undefined, 先建));
    排材质(场);
    const 近 = { ...项('近', { z: 0.1 }), material: 先建 };
    const 远 = { ...项('远', { z: 0.9 }), material: 后建 };
    expect(名们([近, 远].sort(不透明先后))).toBe('远近');
    场.children.reverse();
    排材质(场);
    expect(名们([近, 远].sort(不透明先后))).toBe('近远');
  });

  it('成组的材质相对先后固定，第一次见到整组占位', () => {
    const 组 = {};
    const [零, 一] = [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()];
    成组排(零, 组, 0, 2);
    成组排(一, 组, 1, 2);
    const 别的 = new THREE.MeshBasicMaterial();
    const 场 = new THREE.Scene();
    场.add(new THREE.Mesh(undefined, 一), new THREE.Mesh(undefined, 别的), new THREE.Mesh(undefined, 零));
    排材质(场);
    const 项们 = [{ ...项('别'), material: 别的 }, { ...项('一'), material: 一 }, { ...项('零'), material: 零 }];
    expect(名们(项们.sort(不透明先后))).toBe('零一别');
  });

  it('排在后面的材质在所有普通材质之后，不管场景里谁先出现', () => {
    const 网格材质 = new THREE.MeshBasicMaterial();
    排在后面(网格材质);
    const 手摆 = new THREE.MeshBasicMaterial();
    const 场 = new THREE.Scene();
    场.add(new THREE.Mesh(undefined, 网格材质), new THREE.Mesh(undefined, 手摆));
    排材质(场);
    const 项们 = [{ ...项('网', { z: 0.1 }), material: 网格材质 }, { ...项('手', { z: 0.9 }), material: 手摆 }];
    expect(名们(项们.sort(不透明先后))).toBe('手网');
  });

  it('真的 three 排序路径上装得上：场景渲染前换掉渲染器的两个排序', () => {
    const 收 = { 不透明: null as unknown, 透明: null as unknown };
    const 假渲染器 = {
      setOpaqueSort: (f: unknown) => (收.不透明 = f),
      setTransparentSort: (f: unknown) => (收.透明 = f),
    } as unknown as THREE.WebGLRenderer;
    const 场 = new THREE.Scene();
    (场.onBeforeRender as unknown as (r: THREE.WebGLRenderer) => void)(假渲染器);
    expect(收.不透明).toBe(不透明先后);
    expect(收.透明).toBe(透明先后);
  });
  it('每帧改实例或顶点的物体，包围球跟当前这一帧走；内容没变的不动', () => {
    const 盒 = new THREE.BoxGeometry(1, 1, 1);
    const 实例 = new THREE.InstancedMesh(盒, new THREE.MeshBasicMaterial(), 2);
    实例.setMatrixAt(0, new THREE.Matrix4().makeTranslation(10, 0, 0));
    实例.setMatrixAt(1, new THREE.Matrix4().makeTranslation(12, 0, 0));
    刷新包围球(实例);
    实例.computeBoundingSphere();
    const 旧球 = 实例.boundingSphere!;
    刷新包围球(实例);
    expect(实例.boundingSphere).toBe(旧球);
    实例.setMatrixAt(0, new THREE.Matrix4().makeTranslation(-50, 0, 0));
    实例.instanceMatrix.needsUpdate = true;
    刷新包围球(实例);
    expect(实例.boundingSphere).toBeNull();
    实例.computeBoundingSphere();
    实例.count = 1;
    刷新包围球(实例);
    expect(实例.boundingSphere).toBeNull();

    const 手写 = new THREE.BufferGeometry();
    手写.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    手写.boundingSphere = new THREE.Sphere(new THREE.Vector3(1, 2, 3), 4);
    const 网格 = new THREE.Mesh(手写);
    刷新包围球(网格);
    刷新包围球(网格);
    expect(手写.boundingSphere?.radius).toBe(4);
    手写.getAttribute('position').needsUpdate = true;
    刷新包围球(网格);
    expect(手写.boundingSphere).toBeNull();
    expect(() => 刷新包围球(new THREE.Group())).not.toThrow();
  });
  it('重建挪到末尾的子节点按实例表还原，不归 R3F 管的留在原位', () => {
    const 父 = new THREE.Group();
    const [甲, 手动, 乙, 丙] = [new THREE.Mesh(), new THREE.Mesh(), new THREE.Mesh(), new THREE.Mesh()];
    父.add(手动, 乙, 丙, 甲); // 甲 本来声明在最前，重建后到了末尾
    const 带实例 = 父 as THREE.Group & { __r3f?: unknown };
    带实例.__r3f = { children: [{ object: 甲 }, { object: new THREE.MeshBasicMaterial() }, { object: 乙 }, { object: 丙 }] };
    还原声明次序(父);
    expect(父.children).toEqual([手动, 甲, 乙, 丙]);
    还原声明次序(父);
    expect(父.children).toEqual([手动, 甲, 乙, 丙]);
  });
  it('几千个声明节点不反复从头查位置，手动节点仍留在原位', () => {
    const 父 = new THREE.Group();
    const 子们 = Array.from({ length: 2000 }, () => new THREE.Object3D());
    const 手动 = new THREE.Object3D();
    父.add(手动, ...子们);
    (父 as THREE.Group & { __r3f?: unknown }).__r3f = { children: 子们.map((object) => ({ object })) };
    let 读次数 = 0;
    父.children = new Proxy(父.children, {
      get: (数组, 键, 接收者) => {
        if (typeof 键 === 'string' && /^\d+$/.test(键)) 读次数++;
        return Reflect.get(数组, 键, 接收者);
      },
    });
    还原声明次序(父);
    expect(读次数).toBeLessThan(子们.length * 5);
    父.remove(子们[0]);
    父.add(子们[0]);
    读次数 = 0;
    还原声明次序(父);
    expect(读次数).toBeLessThan(子们.length * 5);
    expect(父.children).toEqual([手动, ...子们]);
  });

});
