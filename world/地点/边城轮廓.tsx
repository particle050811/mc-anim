// 边城：6-2-6 从两千米高空远远看到、6-3 一镜到底从高空落进城里的那座边城。坐标：原点在城中心地面，Z 朝上，北 = +Y；城门朝北（6-2-6 从北边飞来）。
// 按原文一格一格搭（用户 10-02 要有原版方块贴图的方块城，边城/布局.ts）：石砖城墙、方形塔楼、北门门楼和翻牌显示器、石半砖街道、院子和公园的树、
// 中央广场（集市摊位、传送石碑——Waystones 模组没有，用石砖柱子代替）。贴图是 1.20.1 客户端 jar 原样（npm run 取材 -- 边城贴图）。
// 房子用殖民地建筑蓝图（用户 10-05 要建得好看些，边城/蓝图.ts，npm run 取材 -- 边城蓝图），城墙、塔楼、城门照殖民地要塞样式加了细节（边城/布局.ts）。
// 画法见 边城/渲染.ts 和 边城/蓝图.ts。占地、城墙高度、墙垛和城门位置不变（见 边城/布局.ts 文件头），悬停点、竖井口、卫兵站位照旧。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { BORDER_TOWN, innerBounds, buildTown } from './边城/布局.ts';
import { mergeToCuboids, blockIndex, cuboidMesh } from './边城/渲染.ts';
import type { Cuboid } from './边城/体素.ts';
import { mergeHouses, houseMesh } from './边城/蓝图.ts';
import { PoolWater } from './边城/水池.tsx';

export { BORDER_TOWN };

// 城（地面以外的全部）：第一次用到时搭一次，之后各帧、各处共用同一份几何（每处一个 InstancedMesh 对象）。
// 两个网格：城墙、街道、广场这些自己搭的方块（渲染.ts）；殖民地蓝图的房子（蓝图.ts，每种方块六面各一张贴图、能转向）。另有北墙下落水池的水面（边城/水池.tsx）。
// 渲染量要求：一帧不超过原来的 3 倍（量法见 工具/测帧.py：取 12 帧、并发 1，主目录 main 和 worktree 交替量）。
let townSrc: { town: THREE.InstancedMesh; houses: THREE.InstancedMesh } | null = null;
const townMeshes = () => {
  if (!townSrc) {
    const { v: grid, g: houseGrid } = buildTown();
    townSrc = { town: cuboidMesh(mergeToCuboids(grid)), houses: houseMesh(mergeHouses(houseGrid)) };
  }
  return townSrc;
};

// 地面：一层石半砖（平滑石台阶，顶面 z = 0.5），铺满城墙里面和城门洞。
// 洞：地面上挖掉的一块 [x0, y0, x1, y1]（城的局部坐标）。6-3-6 李樱一锤砸穿地面，坑和竖井由镜头自己画，这里把那一块地面留空；不给就是整块
const floorCuboids = (holeRect?: number[]): Cuboid[] => {
  const slab = blockIndex('平滑石台阶');
  const out: Cuboid[] = [];
  const rect = (x0: number, y0: number, x1: number, y1: number) => {
    if (x1 > x0 && y1 > y0) out.push([x0, y0, 0, x1 - x0, y1 - y0, 0.5, slab]);
  };
  const innerX = innerBounds.x;
  const innerY = innerBounds.y;
  rect(-12, innerY, 12, innerY + 8); // 城门洞
  if (!holeRect) rect(-innerX, -innerY, innerX, innerY);
  else {
    const [hx0, hy0, hx1, hy1] = holeRect;
    rect(-innerX, -innerY, innerX, hy0); // 南
    rect(-innerX, hy1, innerX, innerY); // 北
    rect(-innerX, hy0, hx0, hy1); // 西
    rect(hx1, hy0, innerX, hy1); // 东
  }
  return out;
};
const floorCache = new Map<string, THREE.InstancedMesh>();
const floorMesh = (holeRect?: number[]) => {
  const key = holeRect ? holeRect.join(',') : '';
  let mesh = floorCache.get(key);
  if (!mesh) floorCache.set(key, (mesh = cuboidMesh(floorCuboids(holeRect))));
  return mesh;
};
// 同一份几何在一个场景里可能挂两次（每个 <primitive> 要自己的对象），所以每处新建一个 InstancedMesh，共用几何、材质和实例矩阵
const shareMesh = (src: THREE.InstancedMesh) => {
  const mesh = new THREE.InstancedMesh(src.geometry, src.material as THREE.Material, src.count);
  mesh.instanceMatrix = src.instanceMatrix;
  mesh.boundingBox = src.boundingBox;
  mesh.boundingSphere = src.boundingSphere;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

export const BorderTown: React.FC<{ holeRect?: number[] }> = ({ holeRect: holeRect }) => {
  const key = holeRect ? holeRect.join(',') : '';
  const town = useMemo(() => shareMesh(townMeshes().town), []);
  const houses = useMemo(() => shareMesh(townMeshes().houses), []);
  const floor = useMemo(() => shareMesh(floorMesh(holeRect)), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <group>
      <primitive object={town} />
      <primitive object={houses} />
      <primitive object={floor} />
      <PoolWater />
    </group>
  );
};
