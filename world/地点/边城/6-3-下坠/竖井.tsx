// 6-3-6 砸穿：坑、竖井、古城的画法。
//
// 坑和竖井是从片场存档取的整块网格（取材 mod 的 mcai，工具/游戏取材/挖竖井.py，取材清单 的「6-3竖井」；用户 10-05 嫌方形坑不合理，改成不规则坑 + 近圆竖井）：
// - 挖竖井.py 在片场存档（副本）里清掉古城中心往东 10 格 (-710, 240) 那列上面的山，铺城的石半砖和泥土，挖出不规则的坑（坑沿石板翘起、裂纹）和近圆的竖井（井壁有崩落缺口，打穿古城洞顶），
//   一个 batch 挖完，等区块重画，用 mesh 导出，导完 undo。
// - 古城放大 4 倍后（用户 10-13「坑的深度也有点短了」）用：竖井4x.网格.*（挖竖井.py 世界=4x，石半砖 y 135、y -9～137，原点 (-709.5, 125, 240.5)），古城用 古城4x.tsx 的 `Gucheng4x`
//   （块按视锥挑，见下 `AncientCity`），落点 `GUCHENG4X.landingSpot`。
// - 竖井网格范围里 y -9 以上的古城的面全部藏掉（古城洞顶是完整的），由竖井网格那份顶上；竖井4x.坑面.json：每列坑面顶面比城的地面低多少，碎块落点用（`pitSurfaceZAt`）。
// - 用户 10-02：古城不要一片黑，要像夜视看得清。地下用地面那套灯（无投影），方块都是亮的。雾和视距同古城4x（`UnderFog`）。
// - 城的地面（边城轮廓.tsx 的灰板子和下面的 `SlabFloor`）在井心 ±11.5 米挖一个方洞（编排.ts 的 `crater().holeRect`），正好是竖井网格范围。
// 竖井网格放在 z = 0 是按城的地面 z = 10 写的（主世界116.ts 整平到顶面 z 10）；地面高度再变，这里和 6-3-下坠/画面.tsx 摆竖井网格的 z 要一起挪，下面的检查会报出来。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { BlockMesh, BlockMeshInfo } from '../../../../engine/voxel/方块网格.tsx';
import { pngDir, type Png } from '../../../../engine/model/贴图.ts';
import { BORDER_TOWN } from '../../边城轮廓.tsx';
import { borderTownPos } from '../../主世界116.ts';
import shaftRaw from 'asset:网格/竖井4x/头';
import shaftBin from 'asset:网格/竖井4x/顶点';
import shaftAtlas from 'asset:贴图/镜头/6-3-下坠/竖井4x.网格';
import { useThree } from '@react-three/fiber';
import { FOG_4X, G4, Gucheng4x, GUCHENG4X, tilesInView } from '../../古城4x.tsx';
import { shaftLayout as 竖井布局 } from '../../古城4x/布局.ts';
import { ancientCity as 古城接口, ancientCityFloorZ, groundZ, caveCeilingZ, shaftHalfWidth } from './编排.ts';
import pitSurfaceRaw from 'asset:数据/镜头/6-3-下坠/竖井4x.坑面';
import { SlamGround, slamHideBlocks } from '../6-3-6/震地.tsx';

export const pitSurfaceTable = pitSurfaceRaw;

// 竖井那一列挖开的格子原来是什么方块（竖井4x.填块.json）用到的贴图都在这里（取材清单 的「6-3方块贴图」）。幽匿块的贴图是 4 帧竖条动画，只取第一帧（同 模型/特效/方块碎屑.tsx）
export type 方块贴图名 =
  | '平滑石头' | '平滑石台阶侧' | '泥土' | '石头' | '深板岩' | '深板岩顶' | '凝灰岩' | '花岗岩' | '安山岩' | '闪长岩' | '砂砾' | '幽匿块' | '方解石'
  | '煤矿石' | '铜矿石' | '金矿石' | '红石矿石' | '深层铜矿石' | '深层金矿石' | '皓蓝石'
  | '赤陶' | '橙色赤陶' | '黄色赤陶' | '红色赤陶' | '锌矿石' | '银矿石';
export const blockPngs = Object.fromEntries(
  Object.entries(pngDir(import.meta.webpackContext('./方块.贴图', { regExp: /\.png$/ }))).map(([k, png]) => [k, png.h > png.w ? { ...png, px: png.px.subarray(0, png.w * png.w * 4), h: png.w } : png]),
) as Record<方块贴图名, Png>;

const texCache = new Map<Png, THREE.DataTexture>();
export const blockTexture = (png: Png, repeat = false) => {
  let t = texCache.get(png);
  if (!t) {
    t = new THREE.DataTexture(png.px, png.w, png.h, THREE.RGBAFormat);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestMipmapLinearFilter;
    t.generateMipmaps = true;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.needsUpdate = true;
    texCache.set(png, t);
  }
  void repeat;
  return t;
};
// 方块材质：贴图 + 0.4 倍自身颜色的自发光打底（同 方块网格.tsx，背光面不至于黑成一团）
const matCache = new Map<Png, THREE.MeshStandardMaterial>();
export const blockMaterial = (png: Png) => {
  let material = matCache.get(png);
  if (!material) {
    const t = blockTexture(png);
    material = new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.4 });
    matCache.set(png, material);
  }
  return material;
};

// ---------- 取材的两个网格 ----------
if (borderTownPos[2] !== 10) throw new Error(`竖井.tsx：坑和竖井网格按城的地面 z 10 写死，现在城的地面是 ${borderTownPos[2]}`);
// 网格原点 y = 城的石半砖 y − 10（石半砖顶面 = 场景 z 10.5 = 地面z）；洞顶、古城地面的深度和 古城4x布局.ts 的 `竖井` 对得上
const SHAFT = shaftRaw as unknown as BlockMeshInfo;
{
  const [ox, oy, oz] = SHAFT.origin;
  if (ox !== 古城接口.shaftColumn[0] + 0.5 || oz !== 古城接口.shaftColumn[1] + 0.5) throw new Error(`竖井.tsx：竖井网格的原点 ${SHAFT.origin} 不在 古城.竖井列 的格心`);
  if (SHAFT.to[1] + 1 - oy < groundZ) throw new Error('竖井.tsx：竖井网格没导到城的地面');
  if (oy !== 竖井布局.城石半砖y - 10 || caveCeilingZ !== 竖井布局.洞顶最下块y - oy || ancientCityFloorZ !== 竖井布局.古城地面方块y + 1 - oy)
    throw new Error(`竖井.tsx：竖井网格原点 y ${oy} 和 古城4x布局.ts 的 竖井（石半砖、洞顶、古城地面）对不上`);
  if ((SHAFT.to[0] - SHAFT.from[0] + 1) / 2 !== shaftHalfWidth || (SHAFT.to[2] - SHAFT.from[2] + 1) / 2 !== shaftHalfWidth || pitSurfaceTable.半宽 + 0.5 !== shaftHalfWidth)
    throw new Error('竖井.tsx：竖井网格、坑面表、城的地面挖的洞 三者的范围对不上');
}
export const ShaftWalls: React.FC = () => <BlockMesh info={SHAFT} bin={shaftBin} atlas={shaftAtlas} />;
// 地下（竖井、古城）的雾：照古城4x 的满视距 `FOG_4X`（全片通用规矩，用户 10-19：远处不露底），画面底色也用它的雾色。地面以上照旧用飞行的雾。
export const UnderFog: React.FC = () => <fog attach="fog" args={[FOG_4X.color, FOG_4X.near, FOG_4X.far]} />;
export const UNDER_BACKGROUND = FOG_4X.color;
// 竖井网格范围里、最低那层（y -9）的底面往上，古城的面都藏掉（游戏 (x, y, z) → 古城场景 (x + 720, 240 − z, y + 50)，`G4` 和老 `G` 同一套）；y -9 平面上朝上的面（范围角上 3 列小洞穴的底）也藏，在岩体里看不到
const CITY_HIDE = (() => {
  const [fromCorner, t] = [SHAFT.from, SHAFT.to];
  const hideMin = G4(fromCorner[0], fromCorner[1], t[2] + 1);
  const hideMax = G4(t[0] + 1, t[1] + 1, fromCorner[2]);
  return [[hideMin[0], hideMin[1], hideMin[2] - 0.1, hideMax[0], hideMax[1], hideMax[2]]];
})();
// 落点周围砸地震飞的方块是真挪走的（../6-3-6/震地.tsx）：网格里藏掉那几格，由 `SlamGround` 画（砸地前在原位）；slamSec = 砸地后的物理秒数，不给 = 早已落定
// 古城：古城4x（夜视效果），按视锥挑块（视距 512 格，同 6-4 的 `AncientCity4xCanvas`）。中心 = 井心（场景坐标），落点对准竖井那一列。
// 补洞的 中顶 和竖井网格在井北沿（游戏 z 246～251、y 5～24）重叠，重叠那截由上面的 `CITY_HIDE` 藏掉、竖井网格顶上，井外那部分照画。
export const AncientCity: React.FC<{ center: number[]; slamSec?: number }> = ({ center: center, slamSec }) => {
  const offset = [center[0] - GUCHENG4X.landingPos[0], center[1] - GUCHENG4X.landingPos[1], ancientCityFloorZ];
  // 古城局部的相机：画面相机挪回古城原点（场景 (x, y, z) → three (x, z, −y)）
  const { camera } = useThree();
  const local = camera.clone() as THREE.PerspectiveCamera;
  local.position.sub(new THREE.Vector3(offset[0], offset[2], -offset[1]));
  local.updateMatrixWorld();
  const inView = tilesInView(local).join();
  const parts = useMemo(() => inView.split(',').filter(Boolean), [inView]);
  return (
    <group position={offset as [number, number, number]}>
      <Gucheng4x parts={parts} hide={CITY_HIDE} hideBlocks={slamHideBlocks} />
      <SlamGround sec={slamSec} />
    </group>
  );
};

// ---------- 坑面高度（碎块落点用） ----------
// 以井心为原点的场景 x、y 偏移那一格，坑面顶面的场景 z；井口（往下直通古城洞顶）给 null，竖井网格以外按城的地面
export const pitSurfaceZAt = (dx: number, dy: number): number | null => {
  const i = Math.floor(dx + 0.5) + pitSurfaceTable.半宽;
  const j = Math.floor(dy + 0.5) + pitSurfaceTable.半宽;
  const relZ = pitSurfaceTable.高[i]?.[j];
  if (relZ === undefined) return groundZ;
  return relZ === null ? null : groundZ + relZ;
};

// ---------- 城里的石半砖地面（平滑石头贴图，每格一张），可以挖一个方洞 ----------
// 洞：[x0, y0, x1, y1]（城的局部坐标）。地面盖在 边城轮廓.tsx 那块灰板子上面 1 厘米
const floorPlane = (x0: number, y0: number, x1: number, y1: number) => {
  const geo = new THREE.PlaneGeometry(x1 - x0, y1 - y0);
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (x1 - x0) + x0, uv.getY(i) * (y1 - y0) + y0);
  geo.translate((x0 + x1) / 2, (y0 + y1) / 2, 0);
  return geo;
};
export const SlabFloor: React.FC<{ holeRect?: number[] }> = ({ holeRect: holeRect }) => {
  const W2 = BORDER_TOWN.w / 2 - BORDER_TOWN.thick;
  const D2 = BORDER_TOWN.d / 2 - BORDER_TOWN.thick;
  const key = holeRect ? holeRect.join(',') : '';
  const geos = useMemo(() => {
    if (!holeRect) return [floorPlane(-W2, -D2, W2, D2)];
    const [hx0, hy0, hx1, hy1] = holeRect;
    return [floorPlane(-W2, -D2, W2, hy0), floorPlane(-W2, hy1, W2, D2), floorPlane(-W2, hy0, hx0, hy1), floorPlane(hx1, hy0, W2, hy1)];
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const mat = blockMaterial(blockPngs.平滑石头);
  return (
    <group position={[borderTownPos[0], borderTownPos[1], groundZ + 0.01]}>
      {geos.map((g, i) => (
        <mesh key={i} geometry={g} material={mat} receiveShadow />
      ))}
    </group>
  );
};
