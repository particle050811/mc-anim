// 照片墙（照片方案 10-24，用户「把相片都收集到箱子里面感觉太怪异了 应该挂在墙上才对吧」）：小木屋后墙上一排原版荧光物品展示框，照片做成地图画放在里面。
// 只挂后墙（j = 2）朝镜头那面：门所在的西墙在剖面里只是一条线。框在 j = 1 那格里、贴着后墙（y = 2），正面朝南。
// 放了地图的框：地图铺满一格（ItemFrameRenderer 画地图时一格 128 个地图像素、不画地图底纸），框换成 template_item_frame_map 那种藏在地图后面的薄框，
//   正面只看得见地图；荧光框里的东西按满亮画（不受光照、夜里也亮），所以地图用不受光的材质（平涂不乘面明暗、色调，门口画布压暗也不乘）。
// 空框：template_item_frame.json 的形状（背板 10×10 离墙半个像素，四条木框 12×12 一圈离墙一个像素），照常受光；游戏里空荧光框最低 5 级光，白天看不出差别。
// 放进三渲二画布的场景内容里（Z 朝上，单位格，坐标同 门口小木屋.tsx）。地点/门口小木屋.tsx 的 照片墙 选项用它；格位和哪格放哪张在 照片墙格.ts（纯模块，测试也读）。
import type React from 'react';
import { useMemo } from 'react';
import * as THREE from 'three';
import { png, type Png } from '@engine/model/贴图.ts';
import { mapPixels, type MapSize } from '../特效/地图画.ts';
import type { PhotoSource } from '../特效/照片图.ts';
import { mapWallOffset, photoWallFaceY, type PhotoWallCell } from './照片墙格.ts';
import backPanelUrl from 'asset:贴图/物品/荧光物品展示框/背板';
import woodFrameUrl from 'asset:贴图/物品/荧光物品展示框/木框';

export { photoWallCells, type PhotoWallCell } from './照片墙格.ts';

// ---------- 贴图、材质 ----------
const makePixelTexture = (px: Uint8Array, w: number, h: number) => {
  const t = new THREE.DataTexture(px, w, h, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  // 第 0 行在 v = 0（图的上边），片的 uv 按这个给
  t.flipY = false;
  t.needsUpdate = true;
  return t;
};

const frameMaterialCache = new Map<string, THREE.MeshStandardMaterial>();
const frameMaterial = (url: string) => {
  let m = frameMaterialCache.get(url);
  if (!m) {
    const p: Png = png(url);
    m = new THREE.MeshStandardMaterial({ map: makePixelTexture(p.px, p.w, p.h), alphaTest: 0.5, roughness: 1 });
    frameMaterialCache.set(url, m);
  }
  return m;
};

const mapMaterialCache = new Map<PhotoSource, Map<MapSize, THREE.MeshBasicMaterial>>();
const mapMaterial = (photo: PhotoSource, sideLength: MapSize) => {
  let materialMap = mapMaterialCache.get(photo);
  if (!materialMap) mapMaterialCache.set(photo, (materialMap = new Map()));
  let m = materialMap.get(sideLength);
  if (!m) materialMap.set(sideLength, (m = new THREE.MeshBasicMaterial({ map: makePixelTexture(mapPixels(photo, sideLength), sideLength, sideLength) })));
  return m;
};

/** 一片朝南的正面：x0～x1、z0～z1（格），在 y；贴图取 [u0, u1] × [v0, v1]（0～1，v 从图的上边往下） */
const planeGeometry = (x0: number, x1: number, z0: number, z1: number, u0: number, v0: number, u1: number, v1: number) => {
  const g = new THREE.BufferGeometry();
  // 四个角：左下、右下、右上、左上（从南边看逆时针，法线朝 −y）
  g.setAttribute('position', new THREE.Float32BufferAttribute([x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z1], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([u0, v1, u1, v1, u1, v0, u0, v0], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
};

// 空框：template_item_frame.json 里朝外那面（模型的 north 面，挂在北墙上转 180° 朝南）。[x0, y0, x1, y1] 是模型像素（y 往上）、离墙几个像素、用哪张贴图；
// north 面的 uv 正好等于从南边看过去的 [左, 上, 右, 下]
const emptyFramePlanes = [
  { box: [3, 3, 13, 13], wallOffset: 0.5, image: 'back' },
  { box: [2, 2, 14, 3], wallOffset: 1, image: 'wood' },
  { box: [2, 13, 14, 14], wallOffset: 1, image: 'wood' },
  { box: [2, 3, 3, 13], wallOffset: 1, image: 'wood' },
  { box: [13, 3, 14, 13], wallOffset: 1, image: 'wood' },
] as const;

const emptyFrameGeometry = emptyFramePlanes.map(({ box: [x0, y0, x1, y1] }) => planeGeometry(x0 / 16 - 0.5, x1 / 16 - 0.5, y0 / 16, y1 / 16, x0 / 16, (16 - y1) / 16, x1 / 16, (16 - y0) / 16));
const fullCellGeometry = planeGeometry(-0.5, 0.5, 0, 1, 0, 0, 1, 1);

/** 一只荧光物品展示框（画 null = 空的） */
export const GlowFrame: React.FC<{ i: number; k: number; photo: PhotoSource | null; sideLength?: MapSize }> = ({ i, k, photo, sideLength = 32 }) => {
  const mapTexture = useMemo(() => (photo ? mapMaterial(photo, sideLength) : null), [photo, sideLength]);
  return (
    <group position={[i, photoWallFaceY, k]}>
      {mapTexture ? (
        <mesh geometry={fullCellGeometry} material={mapTexture} position={[0, -mapWallOffset, 0]} />
      ) : (
        emptyFramePlanes.map((p, n) => <mesh key={n} geometry={emptyFrameGeometry[n]} material={frameMaterial(p.image === 'back' ? backPanelUrl : woodFrameUrl)} position={[0, -p.wallOffset / 16, 0]} />)
      )}
    </group>
  );
};

/** 拿在手里的一张地图画（给 MagicalWineFoxEx 的 手持物.物品：物品空间里中心在原点、1 = 一格、正面朝 +Z、上 = +Y）。
 *  原版第三人称拿着地图画的是地图物品的图标，这里画地图画本身（演绎：手机上要认得出拿走的是哪张照片）；同框里一样满亮 */
const handHeldPlane = (() => {
  const g = new THREE.PlaneGeometry(1, 1);
  // 贴图第 0 行在 v = 0（新贴图 不翻），PlaneGeometry 的 v 朝上，翻过来
  const uv = g.getAttribute('uv');
  for (let n = 0; n < uv.count; n++) uv.setY(n, 1 - uv.getY(n));
  return g;
})();
export const HandHeldMapArt: React.FC<{ photo: PhotoSource; sideLength?: MapSize }> = ({ photo, sideLength = 32 }) => <mesh geometry={handHeldPlane} material={mapMaterial(photo, sideLength)} />;

/** 一张不在框里、也不挂在手上的地图画（场景内容，Z 朝上）：正面朝南、边 格见方，角 = 左下角（场景坐标）。
 *  第 8 句她把照片往空框里放的那几帧用它（从手边挪进框，最后一帧和框里那张重合）；同框里一样满亮 */
export const MapArtCard: React.FC<{ photo: PhotoSource; sideLength?: MapSize; angle: readonly [number, number, number]; side: number }> = ({ photo, sideLength = 32, angle: corner, side }) => (
  <mesh geometry={fullCellGeometry} material={mapMaterial(photo, sideLength)} position={[corner[0] + side / 2, corner[1], corner[2]]} scale={side} />
);

/** 一面照片墙：每格一只荧光框。边长 = 一格几个地图像素（特效/地图画.ts：N 是 4 的倍数给 64，N = 10 给 32） */
export const PhotoWall: React.FC<{ cells: readonly PhotoWallCell[]; sideLength?: MapSize }> = ({ cells, sideLength }) => (
  <>
    {cells.map((g) => (
      <GlowFrame key={`${g.i},${g.k}`} i={g.i} k={g.k} photo={g.photo} sideLength={sideLength} />
    ))}
  </>
);
