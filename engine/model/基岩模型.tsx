// 基岩版模型（Bedrock geometry JSON）渲染：Blockbench / GeckoLib / YSM / 车万女仆这些模组的模型都是这个格式。
// 数据由取材配方（旧项目 工具/游戏取材/导出模型.py）从 jar 里照抄出来（骨骼、cube 数值不动），模型 json 和贴图 png 各登记成一个资产。
//
// 坐标换算（都在这个文件里做，导出的 JSON 保持文件原样）：
// - 文件里的单位是像素（16 像素 = 1 格），Y 朝上，模型正面朝 -Z。
// - 文件的 X 轴和渲染用的右手系是反的：读进来时 pivot.x 取负、cube 的 origin.x 变成 -(origin.x + size.x)，
//   旋转角 [x, y, z] 变成欧拉角 (-x, -y, z)、顺序 ZYX（和 Blockbench 读基岩模型的做法一样）。
//   换完以后：+X 是角色的右手边，-Z 是正面。文件里名字带 Right 的骨骼 pivot.x 是负数，就是这个原因。
// - 动画（BonePose）用基岩动画文件的约定：rot 和骨骼自带的 rotation 相加（不是相乘），pos 的 x 同样取负。
//   所以 pose 里的数值可以直接照抄 .animation.json。rot.x 正 = 低头 / 手脚往后摆，rot.y 正 = 往右转。
// - 最外层再转到场景坐标：Z 朝上，正面朝 +Y，右手在 +X，原点 = 模型文件的原点（脚底）。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { type EntityTexture, entityTexture } from './贴图方盒.tsx';

type N3 = [number, number, number];
type FaceName = 'north' | 'south' | 'east' | 'west' | 'up' | 'down';
type FaceUV = { uv: [number, number]; uv_size: [number, number] };

export type BedrockCube = {
  origin: N3;
  size: N3;
  uv: [number, number] | Partial<Record<FaceName, FaceUV>>; // 数组 = box UV（展开图左上角）；对象 = 逐面 UV，没写的面不画
  inflate?: number; // 几何体每个方向外扩，贴图不变
  pivot?: N3;
  rotation?: N3;
  mirror?: boolean; // box UV 左右镜像
};
export type BedrockBone = { name: string; parent?: string; pivot: N3; rotation?: N3; mirror?: boolean; cubes?: BedrockCube[] };
// texture：贴图像素。导出的 JSON 里只有尺寸，组件里用 png() 读贴图资产再填进来
export type BedrockModel = { texW: number; texH: number; bones: BedrockBone[]; texture: EntityTexture };

// 一根骨骼的动画量，数值约定同基岩动画文件；scale 为 0 可以把这根骨骼连同子骨骼藏起来
export type BonePose = { rot?: number[]; pos?: number[]; scale?: number | number[] };

const degToRad = Math.PI / 180;
const euler = (r: number[]) => new THREE.Euler(-r[0] * degToRad, -r[1] * degToRad, r[2] * degToRad, 'ZYX');

// 一根骨骼上所有 cube 合成一个几何体，顶点以骨骼 pivot 为原点
const boneGeometry = (bone: BedrockBone, texW: number, texH: number): THREE.BufferGeometry | null => {
  if (!bone.cubes?.length) return null;
  const pos: number[] = [];
  const nor: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  const bp = new THREE.Vector3(-bone.pivot[0], bone.pivot[1], bone.pivot[2]);

  for (const cube of bone.cubes) {
    const inf = cube.inflate ?? 0;
    const [sx, sy, sz] = cube.size;
    const x0 = -(cube.origin[0] + sx) - inf;
    const x1 = -cube.origin[0] + inf;
    const y0 = cube.origin[1] - inf;
    const y1 = cube.origin[1] + sy + inf;
    const z0 = cube.origin[2] - inf;
    const z1 = cube.origin[2] + sz + inf;
    const cubeRot = new THREE.Matrix4();
    if (cube.rotation) {
      const cp = cube.pivot ?? [0, 0, 0];
      cubeRot.makeTranslation(-cp[0], cp[1], cp[2])
        .multiply(new THREE.Matrix4().makeRotationFromEuler(euler(cube.rotation)))
        .multiply(new THREE.Matrix4().makeTranslation(cp[0], -cp[1], -cp[2]));
    }

    // 每个面的贴图矩形 [u1, v1, u2, v2]：(u1, v1) 贴到面的左上角，(u2, v2) 贴到右下角（从外面看）
    const rects: Partial<Record<FaceName, number[]>> = {};
    if (Array.isArray(cube.uv)) {
      // box UV：和玩家皮肤同一套展开。第一行 顶、底；第二行 右侧面(+X)、正面、左侧面、背面。贴图尺寸取 cube 尺寸的整数部分
      const [uvX, uvY] = cube.uv;
      const [width, height, depth] = [Math.floor(sx + 1e-6), Math.floor(sy + 1e-6), Math.floor(sz + 1e-6)];
      rects.east = [uvX, uvY + depth, uvX + depth, uvY + depth + height];
      rects.north = [uvX + depth, uvY + depth, uvX + depth + width, uvY + depth + height];
      rects.west = [uvX + depth + width, uvY + depth, uvX + depth + width + depth, uvY + depth + height];
      rects.south = [uvX + depth + width + depth, uvY + depth, uvX + depth + width + depth + width, uvY + depth + height];
      rects.up = [uvX + depth + width, uvY + depth, uvX + depth, uvY];
      rects.down = [uvX + depth + width + width, uvY, uvX + depth + width, uvY + depth];
      if (cube.mirror ?? bone.mirror) {
        [rects.east, rects.west] = [rects.west, rects.east];
        for (const k of Object.keys(rects) as FaceName[]) {
          const rect = rects[k]!;
          rects[k] = [rect[2], rect[1], rect[0], rect[3]];
        }
      }
    } else {
      for (const k of Object.keys(cube.uv) as FaceName[]) {
        const faceUv = cube.uv[k]!;
        const rect = [faceUv.uv[0], faceUv.uv[1], faceUv.uv[0] + faceUv.uv_size[0], faceUv.uv[1] + faceUv.uv_size[1]];
        rects[k] = k === 'up' || k === 'down' ? [rect[2], rect[3], rect[0], rect[1]] : rect; // 顶面、底面的矩形要转 180°
      }
    }

    // 每个面四个角：左上、右上、右下、左下（从外面看）。侧面都是上边朝 +Y；顶面上边是正面(-Z)，底面上边是背面(+Z)，左边都是 -X
    const corners: Record<FaceName, N3[]> = {
      north: [[x1, y1, z0], [x0, y1, z0], [x0, y0, z0], [x1, y0, z0]],
      south: [[x0, y1, z1], [x1, y1, z1], [x1, y0, z1], [x0, y0, z1]],
      east: [[x1, y1, z1], [x1, y1, z0], [x1, y0, z0], [x1, y0, z1]],
      west: [[x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [x0, y0, z0]],
      up: [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]],
      down: [[x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0]],
    };
    // 厚度为 0 的片：两面重合会闪，只留一面（材质是双面的）
    const skip = new Set<FaceName>();
    if (x1 - x0 < 1e-6) skip.add('west');
    if (y1 - y0 < 1e-6) skip.add('down');
    if (z1 - z0 < 1e-6) skip.add('south');

    for (const k of Object.keys(rects) as FaceName[]) {
      if (skip.has(k)) continue;
      const rect = rects[k]!;
      const quadPts = corners[k].map((p) => new THREE.Vector3(...p).applyMatrix4(cubeRot).sub(bp));
      const normal = new THREE.Vector3().subVectors(quadPts[3], quadPts[0]).cross(new THREE.Vector3().subVectors(quadPts[1], quadPts[0]));
      if (normal.lengthSq() < 1e-12) continue;
      normal.normalize();
      const baseIdx = pos.length / 3;
      quadPts.forEach((pt) => { pos.push(pt.x, pt.y, pt.z); nor.push(normal.x, normal.y, normal.z); });
      const [ua, va, ub, vb] = [rect[0] / texW, rect[1] / texH, rect[2] / texW, rect[3] / texH];
      uvs.push(ua, va, ub, va, ub, vb, ua, vb);
      idx.push(baseIdx, baseIdx + 3, baseIdx + 2, baseIdx, baseIdx + 2, baseIdx + 1);
    }
  }
  if (!idx.length) return null;
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(idx);
  return geom;
};

type Built = {
  roots: string[];
  children: Map<string, string[]>;
  bones: Map<string, BedrockBone>;
  geo: Map<string, THREE.BufferGeometry>;
  mat: THREE.Material;
};
const cache = new WeakMap<BedrockModel, Built>();
const build = (model: BedrockModel): Built => {
  let built = cache.get(model);
  if (built) return built;
  const bones = new Map(model.bones.map((x) => [x.name, x]));
  const children = new Map<string, string[]>();
  const roots: string[] = [];
  const geo = new Map<string, THREE.BufferGeometry>();
  for (const bone of model.bones) {
    if (bone.parent && bones.has(bone.parent)) children.set(bone.parent, [...(children.get(bone.parent) ?? []), bone.name]);
    else roots.push(bone.name);
    const geom = boneGeometry(bone, model.texW, model.texH);
    if (geom) geo.set(bone.name, geom);
  }
  // 游戏里实体模型是镂空不透明、不剔除背面（entityCutoutNoCull）
  const mat = new THREE.MeshStandardMaterial({ map: entityTexture(model.texture), roughness: 0.9, alphaTest: 0.5, side: THREE.DoubleSide });
  built = { roots, children, bones, geo, mat };
  cache.set(model, built);
  return built;
};

// 模型里某根骨骼 pivot 在场景坐标里的静止位置（格），摆姿态时算挂点、对位用
export const bonePivot = (model: BedrockModel, name: string, scale = 1 / 16): N3 => {
  const pivot = build(model).bones.get(name)!.pivot;
  return [-pivot[0] * scale, -pivot[2] * scale, pivot[1] * scale];
};

export const BedrockModelView: React.FC<{
  model: BedrockModel;
  pose?: Record<string, BonePose>;
  scale?: number; // 一像素是多少格；原版实体是 1/16，YSM 玩家模型还要再乘 ysm.json 的 height_scale（默认 0.7）
  attach?: Record<string, React.ReactNode>; // 挂在某根骨骼上的东西：在该骨骼的坐标系里（原点 = pivot，单位像素，Y 朝上，正面 -Z）
}> = ({ model, pose = {}, scale = 1 / 16, attach }) => {
  const built = useMemo(() => build(model), [model]);
  const renderBone = (name: string, parentPivot: number[]): React.ReactNode => {
    const bone = built.bones.get(name)!;
    const bonePose = pose[name];
    const poseScale = bonePose?.scale ?? 1;
    const sv = typeof poseScale === 'number' ? [poseScale, poseScale, poseScale] : poseScale;
    if (sv[0] === 0 && sv[1] === 0 && sv[2] === 0) return null;
    const restRot = bone.rotation ?? [0, 0, 0];
    const ar = bonePose?.rot ?? [0, 0, 0];
    const ap = bonePose?.pos ?? [0, 0, 0];
    const geom = built.geo.get(name);
    return (
      <group
        key={name}
        position={[-(bone.pivot[0] - parentPivot[0]) - ap[0], bone.pivot[1] - parentPivot[1] + ap[1], bone.pivot[2] - parentPivot[2] + ap[2]]}
        rotation={euler([restRot[0] + ar[0], restRot[1] + ar[1], restRot[2] + ar[2]])}
        scale={sv as N3}
      >
        {geom && <mesh geometry={geom} material={built.mat} castShadow receiveShadow />}
        {attach?.[name]}
        {built.children.get(name)?.map((c) => renderBone(c, bone.pivot))}
      </group>
    );
  };
  return (
    <group rotation={[Math.PI / 2, 0, 0]} scale={scale}>
      {built.roots.map((n) => renderBone(n, [0, 0, 0]))}
    </group>
  );
};
