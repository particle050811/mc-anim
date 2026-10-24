// 窗外的归隐之地：结构四周铺一片樱花林（归隐之地是固定群系 cherry_grove，见 参数.ts 的 归隐之地）。网格只导出了结构本身（模板 21×26），
// 外面原本是空的，从东窗、西窗看出去只有天，所以这里补：一大块草地（草方块顶按 cherry_grove 染色）、地上的粉红色花簇、一圈樱花树。
// 樱花树照原版 1.20.1 的形状简化搭（CherryTrunkPlacer 主干 7 格上下、一两根斜出的枝；CherryFoliagePlacer 半径 4、高 5 的树冠，
// 底层边上有缺口、往下挂一两格叶子），用种子定死，每帧一样。方块都是受光的标准材质（套进三渲二平涂照样换成平涂），树叶镂空。
// 坐标同网格本地（Z 朝上）；结构占 x 0～21、y −26～0，地面顶在 z 0。
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { rng } from '@engine/model/parts.tsx';
import { png } from '@engine/model/贴图.ts';
import { 归隐之地, 樱花林 } from './参数.ts';
import logUri from 'asset:贴图/场景/樱花林/cherry_log';
import logTopUri from 'asset:贴图/场景/樱花林/cherry_log_top';
import leavesUri from 'asset:贴图/场景/樱花林/cherry_leaves';
import grassUri from 'asset:贴图/场景/樱花林/grass_block_top';
import petalsUri from 'asset:贴图/场景/樱花林/pink_petals';

type 格 = [number, number, number];

/** 方块贴图：最近邻放大；远处按多级纹理缩（同 方块网格.tsx，免得出摩尔纹）。平铺的地面要重复 */
const 贴图 = (uri: string, 平铺 = 1) => {
  const p = png(uri);
  const t = new THREE.DataTexture(p.px, p.w, p.h, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.generateMipmaps = true;
  if (平铺 !== 1) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(平铺, 平铺);
  }
  t.needsUpdate = true;
  return t;
};

/** 一棵樱花树的方块：根在 (x, y, 0)，主干高 高（不给按随机 6～7）。r 是这棵树自己的随机数 */
const 樱花树 = (x: number, y: number, r: () => number, 定高?: number): { 木: 格[]; 叶: 格[] } => {
  const 木: 格[] = [];
  const 叶 = new Map<string, 格>();
  const 放叶 = (p: 格) => 叶.set(p.join(','), p);
  const 高 = 定高 ?? 6 + Math.floor(r() * 2);
  for (let z = 0; z < 高; z++) 木.push([x, y, z]);
  // 树冠挂在主干顶上，再加一两根枝：从主干 高−3 处斜出 2～3 格、往上 2 格，枝头也挂一团
  const 冠心: 格[] = [[x, y, 高]];
  const 枝数 = r() < 0.5 ? 1 : 2;
  const 方向们: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const 起向 = Math.floor(r() * 4);
  for (let b = 0; b < 枝数; b++) {
    const [dx, dy] = 方向们[(起向 + b * 2) % 4]!;
    const 长 = 2 + Math.floor(r() * 2);
    let [cx, cy, cz] = [x, y, 高 - 3];
    for (let i = 1; i <= 长; i++) {
      cx += dx;
      cy += dy;
      if (i > 1) cz += 1;
      木.push([cx, cy, cz]);
    }
    木.push([cx, cy, cz + 1]);
    冠心.push([cx, cy, cz + 2]);
  }
  // 树冠：以冠心为准往下 1 层、往上 3 层，半径 4、4、4、3、2；去掉四角，底层边上 1/4 的格子空着，边上 1/6 往下挂 1 格（再 1/3 挂 2 格）
  const 半径 = [4, 4, 4, 3, 2];
  for (const [ox, oy, oz] of 冠心)
    半径.forEach((rad, i) => {
      const z = oz - 1 + i;
      for (let dx = -rad; dx <= rad; dx++)
        for (let dy = -rad; dy <= rad; dy++) {
          const 边 = Math.abs(dx) === rad || Math.abs(dy) === rad;
          if (Math.abs(dx) === rad && Math.abs(dy) === rad) continue;
          if (Math.abs(dx) + Math.abs(dy) > rad + 2) continue;
          if (边 && i === 0 && r() < 0.25) continue;
          放叶([ox + dx, oy + dy, z]);
          if (边 && i === 0 && r() < 1 / 6) {
            放叶([ox + dx, oy + dy, z - 1]);
            if (r() < 1 / 3) 放叶([ox + dx, oy + dy, z - 2]);
          }
        }
    });
  for (const p of 木) 叶.delete(p.join(','));
  return { 木, 叶: [...叶.values()] };
};

/** 樱花林：在结构四周的环里按种子撒树（离结构至少 留空 格、彼此至少 间距 格），树下撒花簇 */
const 布林 = () => {
  const { 种子, 定点, 树数, 内框, 外半径, 间距, 花簇数 } = 樱花林;
  const r = rng(种子);
  const 根们: [number, number, number?][] = 定点.map(([x, y, 高]) => [x, y, 高]);
  const [x0, y0, x1, y1] = 内框;
  const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2];
  for (let tries = 0; 根们.length < 定点.length + 树数 && tries < 树数 * 200; tries++) {
    const [x, y] = [Math.round(cx + (r() * 2 - 1) * 外半径), Math.round(cy + (r() * 2 - 1) * 外半径)];
    if (x > x0 && x < x1 && y > y0 && y < y1) continue;
    if (根们.some(([a, b]) => Math.hypot(a - x, b - y) < 间距)) continue;
    根们.push([x, y]);
  }
  const 木: 格[] = [];
  const 叶: 格[] = [];
  for (const [x, y, 高] of 根们) {
    const t = 樱花树(x, y, rng(种子 * 1009 + x * 131 + y * 7), 高);
    木.push(...t.木);
    叶.push(...t.叶);
  }
  const 花: [number, number, number][] = [];
  for (let i = 0; i < 花簇数; i++) {
    const [x, y] = [Math.floor(cx + (r() * 2 - 1) * 外半径), Math.floor(cy + (r() * 2 - 1) * 外半径)];
    if (x >= x0 - 1 && x <= x1 && y >= y0 - 1 && y <= y1) continue;
    花.push([x, y, Math.floor(r() * 4)]);
  }
  return { 木, 叶, 花 };
};

const 摆 = (mesh: THREE.InstancedMesh, 格们: 格[]) => {
  const m = new THREE.Matrix4();
  格们.forEach(([x, y, z], i) => mesh.setMatrixAt(i, m.makeTranslation(x + 0.5, y + 0.5, z + 0.5)));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
};

export const 窗外樱花林: React.FC = () => {
  const 物 = useMemo(() => {
    const { 木, 叶, 花 } = 布林();
    const 方块 = new THREE.BoxGeometry(1, 1, 1);
    // BoxGeometry 六个面的顺序 +x −x +y −y +z −z；Z 朝上，所以后两个是顶、底
    const 木侧 = new THREE.MeshStandardMaterial({ map: 贴图(logUri), roughness: 1 });
    const 木顶 = new THREE.MeshStandardMaterial({ map: 贴图(logTopUri), roughness: 1 });
    const 木网 = 摆(new THREE.InstancedMesh(方块, [木侧, 木侧, 木侧, 木侧, 木顶, 木顶], 木.length), 木);
    const 叶料 = new THREE.MeshStandardMaterial({ map: 贴图(leavesUri), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 });
    const 叶网 = 摆(new THREE.InstancedMesh(方块, 叶料, 叶.length), 叶);
    const 地宽 = 樱花林.地半径 * 2;
    const 地料 = new THREE.MeshStandardMaterial({ map: 贴图(grassUri, 地宽), color: new THREE.Color(归隐之地.草), roughness: 1 });
    const 地 = new THREE.Mesh(new THREE.PlaneGeometry(地宽, 地宽), 地料);
    // 结构自己的地面顶在 z 0，草地压低一点藏在它下面；中心对齐整格，贴图格子和方块格子对上
    地.position.set(樱花林.地中心[0], 樱花林.地中心[1], -0.01);
    const 花料 = new THREE.MeshStandardMaterial({ map: 贴图(petalsUri), alphaTest: 0.5, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
    const 花片 = new THREE.PlaneGeometry(1, 1);
    const 花网 = new THREE.InstancedMesh(花片, 花料, 花.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    花.forEach(([x, y, k], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), (k * Math.PI) / 2);
      花网.setMatrixAt(i, m.compose(new THREE.Vector3(x + 0.5, y + 0.5, 3 / 16 - 0.01), q, new THREE.Vector3(1, 1, 1)));
    });
    花网.instanceMatrix.needsUpdate = true;
    花网.computeBoundingSphere();
    for (const o of [木网, 叶网, 地, 花网]) o.receiveShadow = true;
    木网.castShadow = 叶网.castShadow = true;
    return { 木网, 叶网, 地, 花网, 料们: [木侧, 木顶, 叶料, 地料, 花料], 几何们: [方块, 花片, 地.geometry] };
  }, []);
  useEffect(
    () => () => {
      for (const m of 物.料们) {
        m.map?.dispose();
        m.dispose();
      }
      for (const g of 物.几何们) g.dispose();
    },
    [物],
  );
  return (
    <>
      <primitive object={物.地} />
      <primitive object={物.花网} />
      <primitive object={物.木网} />
      <primitive object={物.叶网} />
    </>
  );
};
