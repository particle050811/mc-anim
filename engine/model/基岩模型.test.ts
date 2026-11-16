// 基岩模型（基岩模型.tsx）的坐标换算：只测导出的 bonePivot 和 BedrockModelView，不动它。
// BedrockModelView 是 React 组件：这里不起渲染器，借 React 的 hooks 调度口子直接调它拿元素树，按 <group> 的 position、rotation、scale
// 自己拼成 three 的 Object3D 树，再算各骨骼原点、各方盒顶点在场景里的位置。示例模型各方盒顶点的场景坐标和 uv 存在 金样/基岩模型.json。
import React from 'react';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BedrockModelView, bonePivot, type BedrockModel, type BonePose } from './基岩模型.tsx';

/** 取到 1e−9 格：three 的 cos(π/2) 这类 1e−16 的零头不进比较和金样 */
const roundDecimals = (x: number) => Math.round(x * 1e9) / 1e9 + 0;
const bedrockModel: BedrockModel = {
  texW: 64,
  texH: 64,
  texture: { w: 1, h: 1, px: new Uint8Array(4) } as never,
  bones: [
    { name: 'body', pivot: [0, 24, 0], cubes: [{ origin: [-4, 12, -2], size: [8, 12, 4], uv: [16, 16] }] },
    { name: 'head', parent: 'body', pivot: [0, 24, 0], cubes: [{ origin: [-4, 24, -4], size: [8, 8, 8], uv: [0, 0] }, { origin: [-1, 26, -6], size: [2, 2, 2], uv: { north: { uv: [24, 0], uv_size: [2, 2] }, up: { uv: [26, 0], uv_size: [2, 2] } } }] },
    { name: 'RightArm', parent: 'body', pivot: [-5, 22, 0], rotation: [0, 0, 10], cubes: [{ origin: [-8, 12, -2], size: [4, 12, 4], uv: [40, 16] }] },
    { name: 'LeftArm', parent: 'body', pivot: [5, 22, 0], mirror: true, cubes: [{ origin: [4, 12, -2], size: [4, 12, 4], uv: [40, 16] }] },
    { name: 'hand', parent: 'RightArm', pivot: [-6, 12, 0], cubes: [{ origin: [-7, 10, -1], size: [2, 2, 0], uv: [0, 32], rotation: [0, 45, 0], pivot: [-6, 11, 0] } as never] },
  ],
};

type ElementTree = React.ReactElement<Record<string, unknown>> | null | undefined | false | ElementTree[];
/** 不起渲染器调函数组件：React 19 的 hooks 调度器放一个只有 useMemo 的，调完放回去 */
const invokeComponent = <P,>(component: React.FC<P>, props: P): ElementTree => {
  const internals = (React as unknown as Record<string, { H: unknown }>).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE!;
  const savedH = internals.H;
  internals.H = { useMemo: (f: () => unknown) => f() };
  try {
    return component(props) as ElementTree;
  } finally {
    internals.H = savedH;
  }
};
/** 元素树 → three 对象树；骨骼的 group 按 key 记名 */
const assemble = (e: ElementTree, parent: THREE.Object3D, boneMap: Map<string, THREE.Object3D>) => {
  if (!e) return;
  if (Array.isArray(e)) return e.forEach((x) => assemble(x, parent, boneMap));
  const p = e.props;
  if (e.type === 'group') {
    const g = new THREE.Group();
    if (p.position) g.position.fromArray(p.position as number[]);
    if (p.rotation instanceof THREE.Euler) g.rotation.copy(p.rotation);
    else if (p.rotation) g.rotation.fromArray(p.rotation as [number, number, number]);
    if (typeof p.scale === 'number') g.scale.setScalar(p.scale);
    else if (p.scale) g.scale.fromArray(p.scale as number[]);
    if (e.key) boneMap.set(e.key, g);
    parent.add(g);
    assemble(p.children as ElementTree, g, boneMap);
  } else if (e.type === 'mesh') parent.add(new THREE.Mesh(p.geometry as THREE.BufferGeometry));
  else throw new Error(`没想到的元素 ${String(e.type)}`);
};
const makeModel = (pose: Record<string, BonePose> = {}, scale?: number) => {
  const root = new THREE.Group();
  const boneMap = new Map<string, THREE.Object3D>();
  assemble(invokeComponent(BedrockModelView, { model: bedrockModel, pose, scale }), root, boneMap);
  root.updateMatrixWorld(true);
  // BedrockModelView 最外层已经转到场景坐标（Z 朝上），拼出来的世界坐标就是场景坐标
  const toScene = (v: THREE.Vector3) => [v.x, v.y, v.z].map(roundDecimals);
  const boneOrigin = (boneName: string) => toScene(new THREE.Vector3().setFromMatrixPosition(boneMap.get(boneName)!.matrixWorld));
  const boneVertices = (boneName: string) => {
    const m = boneMap.get(boneName)!.children.find((c): c is THREE.Mesh => c instanceof THREE.Mesh)!;
    const a = m.geometry.getAttribute('position');
    return Array.from({ length: a.count }, (_, i) => toScene(new THREE.Vector3().fromBufferAttribute(a, i).applyMatrix4(m.matrixWorld)));
  };
  return { bone: boneMap, origin: boneOrigin, 顶点: boneVertices };
};
const boundingBox = (points: number[][]) => [0, 1, 2].map((i) => [Math.min(...points.map((p) => p[i]!)), Math.max(...points.map((p) => p[i]!))]);

describe('基岩模型的坐标换算', () => {
  it('bonePivot：文件 x 取负、场景 y = −文件 z、场景 z = 文件 y，按 1/16 缩', () => {
    expect(bonePivot(bedrockModel, 'RightArm').map(roundDecimals)).toEqual([5 / 16, 0, 22 / 16]);
    expect(bonePivot(bedrockModel, 'body', 1).map(roundDecimals)).toEqual([0, 0, 24]);
  });
  it('静止时骨骼原点（祖先没有自带转角的）就是 bonePivot', () => {
    const { origin: boneOrigin } = makeModel();
    for (const boneName of ['body', 'head', 'RightArm', 'LeftArm']) expect(boneOrigin(boneName)).toEqual(bonePivot(bedrockModel, boneName).map(roundDecimals));
  });
  it('方盒落在场景里：身子居中、脚底在 z = 12/16 起，Right 骨骼在 +X（右手边），正面朝 +Y', () => {
    const { 顶点: vertices } = makeModel();
    expect(boundingBox(vertices('body'))).toEqual([[-0.25, 0.25], [-0.125, 0.125], [0.75, 1.5]]);
    const rightArmBox = boundingBox(vertices('RightArm'));
    expect(rightArmBox[0]![0]).toBeGreaterThan(0.2);
    // 鼻子（文件 z 是负的那一头 = 正面）在场景 +Y
    const nose = boundingBox(vertices('head').slice(-8));
    expect(nose[1]).toEqual([0.25, 0.375]);
  });
  it('姿态：rot.y 正往右转（正面转向 +X），pos.x 正往左（−X），scale 0 不画', () => {
    const posedModel = makeModel({ head: { rot: [0, 90, 0] } });
    const nose = boundingBox(posedModel.顶点('head').slice(-8));
    expect(nose[0]).toEqual([0.25, 0.375]);
    const moved = makeModel({ body: { pos: [1, 0, 0] } });
    expect(moved.origin('body')[0]).toBeCloseTo(-1 / 16, 9);
    expect(makeModel({ LeftArm: { scale: 0 } }).bone.has('LeftArm')).toBe(false);
    expect(makeModel({}, 1).origin('RightArm')).toEqual([5, 0, 22]);
  });
  it('示例模型各方盒顶点的场景坐标、uv（金样）', async () => {
    const { bone: boneMap } = makeModel({ head: { rot: [10, -20, 5], pos: [0, 1, 0] }, RightArm: { rot: [-30, 0, 0], scale: [1, 1.2, 1] } });
    const jsonLines: string[] = [];
    for (const [boneName, g] of boneMap) {
      const m = g.children.find((c): c is THREE.Mesh => c instanceof THREE.Mesh);
      if (!m) continue;
      const a = m.geometry.getAttribute('position');
      const uv = m.geometry.getAttribute('uv');
      const positions = Array.from({ length: a.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(a, i).applyMatrix4(m.matrixWorld)).map((v) => [v.x, v.y, v.z].map(roundDecimals));
      jsonLines.push(JSON.stringify({ bone: boneName, points: positions, uv: Array.from(uv.array, roundDecimals), index: Array.from(m.geometry.index!.array) }));
    }
    await expect(`[\n${jsonLines.join(',\n')}\n]\n`).toMatchFileSnapshot('./金样/基岩模型.json');
  });
});
