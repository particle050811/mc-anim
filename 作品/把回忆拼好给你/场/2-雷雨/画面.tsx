// 第 6、7 句这一个镜头的成片画法（段 2-雷雨、2-拨开阴霾、核对-光柱破云 共用）：透视三渲二（平涂、不抗锯齿、不描边），后面一张 2D 画布画天（天.tsx），
// 画里是炸掉一角的门口小木屋和浅坑（弹坑.ts，屋里照原版的光暗下去，光照.ts）、四周起伏的平原和樱花林（地形.ts）、坐在坑沿的她和你、浮在坑里的掉落物、头顶一层原版 fancy 云（engine/light/云/原版方块云.tsx；光影开 Photon 云时换成光影层的云，见 编排.ts 的 光影场）、原版的雨；
// 第 7 句她脚下的魔法阵、往天上冲的光柱、云撕开的洞、从洞里照下来的阳光（平涂的发光区）。整片后期包住天和 3D；歌词浮在最上面、不过后期（同前后两句）。
// 谁在哪、什么颜色全在 编排.ts，这里只按歌曲帧画。干净 = 不画歌词（第 8 句收的照片用）。
import React, { useCallback, useContext, useMemo } from 'react';
import { AbsoluteFill } from 'remotion';
import * as THREE from 'three';
import { srgbToLinear, assembleBuffers, assemblyMeshes, type PlacedBlock } from '@engine/model/方块拼搭.tsx';
import type { V3 } from '@engine/model/parts.tsx';
import { ToonCanvas, shadingScope } from '@engine/三渲二/画布.tsx';
import { shadingDrawsCloud } from '@engine/三渲二/光影/预设.ts';
import { FilmPost } from '@engine/三渲二/整片后期.tsx';
import { blockAtlas } from '@engine/voxel/真实方块图集.ts';
import { MAGICAL_WINE_FOX } from '@库/角色/魔法酒狐.tsx';
import { aspect } from '../../分镜/时间.ts';
import { gridOrigin } from '../../地点/门口小木屋.tsx';
import { RuneLyric, runeLyricDefault } from '../../界面/符文歌词.tsx';
import { mainCutLyricLine } from '../../界面/符文歌词数据.ts';
import { LightPillar, GroundGlow } from './光柱.tsx';
import * as params from './参数.ts';
import { crater } from './弹坑.ts';
import { SurroundBlocks } from './地形.ts';
import { dropItemLayer as DroppedItemGroup } from './掉落物.tsx';
import type { CloudCell } from './云.ts';
import { VanillaBlockCloud, makeCloudMaterials, type CloudMaterials } from '@engine/light/云/原版方块云.tsx';
import { rainAmount } from './声音.ts';
import { computeLight, faceBrightness } from './光照.ts';
import { setFogColor, applyFog, PerspectiveSky } from './天.tsx';
import type { RGB } from './天气.ts';
import { LiYing, You } from './角色.tsx';
import { MagicCircle } from './酒狐件.tsx';
import { Rain } from './雨.tsx';
import {
  eventFrame,
  cloudRemain,
  cloudDrift,
  beamOpacity,
  beamTop,
  frameToTick,
  glowRegionsAt,
  clearSkyAt,
  weatherColors,
  LiYingState,
  YouState,
  dropTick,
  dropItems,
  impactBrightness,
  shadingSceneAt,
  CameraRig,
  songSec,
  holeCenter,
  frameGrade,
  perspectiveRainPlanes,
  isFlashing,
  circleSize,
  circleSpin,
} from './编排.ts';

const width = aspect.宽, height = aspect.高;
const hexToRgb = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as unknown as RGB;

// ---------- 四周的地：自己建网格（补原版柱形雾）；屋子和坑离镜头不到五十格、雾够不着，不补 ----------
type MatKind = '实心' | '镂空';
let groundMaterials: Record<MatKind, THREE.Material> | null = null;
const groundMaterial = (c: MatKind) => {
  if (!groundMaterials) {
    const common = { map: blockAtlas().original, vertexColors: true, roughness: 1, metalness: 0 };
    groundMaterials = {
      实心: applyFog(new THREE.MeshStandardMaterial(common)),
      镂空: applyFog(new THREE.MeshStandardMaterial({ ...common, alphaTest: 0.5, side: THREE.DoubleSide })),
    };
  }
  return groundMaterials[c];
};
const buildMeshes = (blocks: readonly PlacedBlock[], biome: string, name: string): THREE.Mesh[] => {
  const buffers = assembleBuffers(blocks, { 原点: gridOrigin, 群系: biome });
  if (buffers.半透明.idx.length || buffers.发光.idx.length) throw new Error('四周的地里不该有半透明、发光的方块');
  const out: THREE.Mesh[] = [];
  for (const c of ['实心', '镂空'] as const) {
    const b = buffers[c];
    if (!b.idx.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
    g.setIndex(b.idx);
    const mesh = new THREE.Mesh(g, groundMaterial(c));
    mesh.name = `雷雨四周-${name}-${c}`;
    mesh.frustumCulled = false;
    out.push(mesh);
  }
  return out;
};
// 一个渲染页面只建一次
let surroundMeshCache: THREE.Mesh[] | null = null;
const surroundMeshes = () => {
  if (!surroundMeshCache) {
    const m = SurroundBlocks();
    surroundMeshCache = [...buildMeshes(m.plains, params.biome, '平原'), ...buildMeshes(m.cherryGrove, 'minecraft:cherry_grove', '樱花林')];
  }
  return surroundMeshCache;
};
const Surroundings: React.FC = () => {
  const meshes = useMemo(surroundMeshes, []);
  return (
    <group>
      {meshes.map((m) => (
        <primitive key={m.name} object={m} />
      ))}
    </group>
  );
};

// ---------- 屋子和坑：方块拼搭的网格，每个面再乘原版的光（光照.ts：屋里比屋外暗，缺口看得出是个洞） ----------
let houseMeshCache: THREE.Mesh[] | null = null;
const houseMeshes = () => {
  if (!houseMeshCache) {
    const remainingBlocks = crater().remainingBlocks;
    const lightTable = computeLight(remainingBlocks);
    houseMeshCache = assemblyMeshes(remainingBlocks, { 原点: gridOrigin, 群系: params.biome });
    for (const m of houseMeshCache) {
      const g = m.geometry;
      const pos = g.getAttribute('position') as THREE.BufferAttribute;
      const nor = g.getAttribute('normal') as THREE.BufferAttribute;
      const col = g.getAttribute('color') as THREE.BufferAttribute;
      // 拼搭网格 每个面四个顶点连着放
      for (let q = 0; q < pos.count; q += 4) {
        const faceCenter = [0, 1, 2].map((c) => (pos.getComponent(q, c) + pos.getComponent(q + 1, c) + pos.getComponent(q + 2, c) + pos.getComponent(q + 3, c)) / 4);
        const brightness = srgbToLinear(faceBrightness(lightTable, faceCenter, [nor.getX(q), nor.getY(q), nor.getZ(q)]));
        for (let v = q; v < q + 4; v++) col.setXYZ(v, col.getX(v) * brightness, col.getY(v) * brightness, col.getZ(v) * brightness);
      }
      m.name = `雷雨屋子-${m.name}`;
    }
  }
  return houseMeshCache;
};
const House: React.FC = () => {
  const meshes = useMemo(houseMeshes, []);
  return (
    <group>
      {meshes.map((m) => (
        <primitive key={m.name} object={m} />
      ))}
    </group>
  );
};

// ---------- 场景内容（Z 朝上） ----------
// 原版云吃地形雾（补雾），两遍材质整段共用一份
let cloudMaterialsCache: CloudMaterials | undefined;
const getCloudMaterials = () => (cloudMaterialsCache ??= makeCloudMaterials(applyFog));
const hitColor = hexToRgb(params.lightPillar.色);
/** 光柱底：她举着的两只手上面（头顶往上 离头 格） */
const beamBottom: V3 = [params.standPos.liYingPos[0], params.standPos.liYingPos[1], params.standPos.liYingPos[2] + MAGICAL_WINE_FOX.headTop + params.lightPillar.headGap];

/** 画云 = 画原版方块云（光影开了云时云在光影层画，这里不画） */
const Scene: React.FC<{ 帧: number; 眼: V3; cloudColor: RGB; drawClouds: boolean }> = ({ 帧: frame, 眼: eye, cloudColor, drawClouds }) => {
  const sec = songSec(frame);
  const center = holeCenter();
  const remain = useCallback((c: CloudCell) => cloudRemain(c, frame), [frame]);
  const strike = useMemo(() => ({ 心: center, brightness: impactBrightness(frame), 色: hitColor, radius: params.impactCloud.radius }), [frame, center[0], center[1]]);
  const circleSizeNow = circleSize(frame);
  const fallingItems = useMemo(dropItems, []);
  const rainPlanes = useMemo(() => perspectiveRainPlanes(eye), [eye[0], eye[1], eye[2]]);
  return (
    <>
      <Surroundings />
      <House />
      <DroppedItemGroup 们={fallingItems} 刻={dropTick(frame)} />
      <LiYing liYingState={LiYingState(frame)} 秒={sec} />
      <You youState={YouState(frame)} 秒={sec} />
      <MagicCircle 心={[center[0], center[1], 0]} 转={circleSpin(frame)} 大小={circleSizeNow} />
      <GroundGlow 心={[center[0], center[1], 0.01]} 大小={circleSizeNow} />
      <LightPillar bottom={beamBottom} topY={beamTop(frame, beamBottom[2])} alpha={beamOpacity(frame)} 帧={frame} />
      {drawClouds && <VanillaBlockCloud offset={params.cloudOffset} extent={params.cloudExtent} bottomHeight={params.cloudBottomHeight} materials={getCloudMaterials()} remain={remain} drift={cloudDrift(frame)} 色={cloudColor} strike={strike} />}
      <Rain 片们={rainPlanes} 刻={frameToTick(frame)} 色={isFlashing(frame) ? params.rainColor.flash : params.rainColor.normal} rainAmount={rainAmount(frame)} />
    </>
  );
};

// ---------- 整个镜头 ----------
/** 全片 15 句的符文歌词行（歌曲帧） */
const lyricLines = Array.from({ length: 15 }, (_, i) => mainCutLyricLine(i + 1, 0));

export type StormPictureProps = {
  /** 歌曲帧 */
  帧: number;
  /** 不画歌词 */
  clean?: boolean;
  /** 整片后期（照片底片关：贴进第 8 句以后跟着那一句的后期走） */
  withPost?: boolean;
};

export const StormPicture: React.FC<StormPictureProps> = ({ 帧: frame, clean = false, withPost = true }) => {
  const rig = CameraRig(frame);
  const colors = weatherColors(frame);
  const tone = frameGrade(frame);
  // 光影开了云时天、云都在光影层画（画布不透明），2D 天、原版云不画
  const photonCloud = shadingDrawsCloud(useContext(shadingScope).shading);
  // 雾色是几个材质共用的统一量，画这一帧之前设
  setFogColor(colors.fog);
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <FilmPost grade={withPost ? tone.postTone.grade : null} 种子={frame}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: width, height: height, overflow: 'hidden' }}>
          {!photonCloud && <PerspectiveSky cameraRig={rig} 宽={width} 高={height} 天={colors.天} fog={colors.fog} clearSky={colors.clearSky} clearFog={colors.clearFog} clearAt={clearSkyAt(frame)} />}
          <ToonCanvas 宽={width} 高={height} cameraRig={rig} tint={tone.tint} glowRegions={glowRegionsAt(frame)} shadingScene={shadingSceneAt(frame)} style={{ position: 'absolute', left: 0, top: 0 }}>
            <Scene 帧={frame} 眼={rig.眼} cloudColor={colors.cloudColor} drawClouds={!photonCloud} />
          </ToonCanvas>
        </div>
      </FilmPost>
      {!clean && <RuneLyric lines={lyricLines} 样式={{ ...runeLyricDefault, outlineColor: tone.postTone.outlineColor }} 帧={frame} />}
    </AbsoluteFill>
  );
};

/** 第 8 句照片墙的第四张照片「光柱破云」的底片：照片-光柱破云 那一帧，不带歌词 */
export const BeamBreakCloudPicture: React.FC<{ withPost?: boolean }> = ({ withPost = false }) => <StormPicture 帧={eventFrame('照片-光柱破云')} clean withPost={withPost} />;
