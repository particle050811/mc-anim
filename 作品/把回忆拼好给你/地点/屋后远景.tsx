// 门口这个机位屋后的远景（用户 10-24「而且怎么超平坦背景 合理吗？」）：小木屋四周地形.ts 铺的那片地（起伏的平原、西北边坡上的樱花林、橡树，同第 6、7 句），
// 头顶可以加一层原版云（原版云.ts，第 7 句光柱打散的那层），用一台透视相机画，夹在侧剖面的天（2D）和正交那一层（屋子、人）中间；正交那一层盖住的地方看不见。
// 透视相机挂在正交镜头上：眼睛在取景中心正南 视距 格，视距 处一格正好是 每格 个像素（和正交那一层的剖面同大），越远越小；
//   视距 6 时竖直视角约 50°（同第 1 句 场/2-新世界/参数.ts 落定的视角）。眼睛离地 眼高（原版玩家眼睛的高度），地平线放在屋前那条草地（四排，斜投影里往上升 4 × 顶面 ÷ N 格）上面一点。
// 雾照原版 1.20.1（12 区块：柱形，172.8～192 格 smoothstep，同 场/2-新世界/参数.ts 的 地形雾；地点不许引场，数照抄），
//   混进去的颜色取这一像素背后那一行天的颜色（地点/天空.tsx 的渐变，一个贴图像素一行，同一套算法、同一个取整），淡完就和天一样、看不出边。云也吃这层雾。
// 平涂、不描边、不抗锯齿（三渲二画布）。几十万个面的网格一个渲染页面只建一次；材质、雾的统一量每个画布一份。
import { useThree } from '@react-three/fiber';
import type React from 'react';
import { useMemo } from 'react';
import * as THREE from 'three';
import { assembleBuffers, type PlacedBlock } from '@engine/model/方块拼搭.tsx';
import { ToonCanvas } from '@engine/三渲二/画布.tsx';
import { filmScale } from '@engine/三渲二/像素.ts';
import { blockAtlas } from '@engine/voxel/真实方块图集.ts';
import { cabinSkyCloud, type CloudCell } from './原版云.ts';
import { VanillaBlockCloud, makeCloudMaterials, type RGB } from '@engine/light/云/原版方块云.tsx';
import type { SideFraming } from './侧剖面.tsx';
import { skyBrightness } from './天体.ts';
import type { SkyColors as SkyColorType } from './天空.tsx';
import { SurroundBlocks, behindHouseRange } from './小木屋四周地形.ts';
import { gridOrigin } from './门口小木屋.tsx';

/** 透视相机离剖面（y = 0）多远（格）：越小远处缩得越快。6 时 N = 16 下屋后 30 格的樱花树约 300 成片像素高、100 格外的山坡一格约 14 像素
 *  （Agent 暂定，按第 1 句的视角取；先试过 20，屋后的林子大得像一堵墙，盖满半个画面） */
export const farViewDistance = 6;
/** 眼睛离远景地面多高（格）：原版玩家站着眼睛 1.62 格 */
export const eyeHeight = 1.62;
/** 地平线比屋前草地的后沿高几格（Agent 暂定：N = 16 时 80 成片像素，一条窄窄的远处草地，再上面是坡和林子） */
export const horizonToGrass = 0.3125;
/** 原版 12 区块的地形雾（照 场/2-新世界/参数.ts 的 地形雾：起 = 192 − 19.2、止 = 192） */
export const farFog = { start: 172.8, end: 192 };
/** 屋前草地几排（门口小木屋.tsx 的 j 0～3） */
const grassRowCount = 4;

/** 地平线在成片画面上离画面中心往下几格 */
export const horizonBelowCenter = (framing: SideFraming, topDepth: number) => framing.center[1] - (grassRowCount * topDepth) / (framing.pxPerCell / 16) - horizonToGrass;

type FogUniforms = Record<string, { value: number | THREE.Vector3 }>;

/** 给材质补原版柱形雾，雾色取这一像素背后那一行天的颜色（颜色编码之后、sRGB 数值上混，平涂的明暗、色调都在雾前面算好） */
const applyFog = <M extends THREE.Material>(m: M, u: FogUniforms): M => {
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMcFogW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvMcFogW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        [
          '#include <common>',
          'varying vec3 vMcFogW;',
          'uniform float mcFogStart, mcFogEnd, mcTop, mcBufH, mcPx, mcGround, mcRowPx, mcGrad;',
          'uniform vec3 mcHorizon, mcZenith;',
        ].join('\n'),
      )
      .replace(
        '#include <colorspace_fragment>',
        [
          '#include <colorspace_fragment>',
          'float mcD = length( vMcFogW.xz - cameraPosition.xz );',
          'float mcV = mcD <= mcFogStart ? 0.0 : ( mcD < mcFogEnd ? smoothstep( mcFogStart, mcFogEnd, mcD ) : 1.0 );',
          // 这一像素在整个画面上离顶边几个成片像素 → 天的第几行（从地面线往上数，一行一个贴图像素）→ 那一行的天色（同 天空.tsx：sqrt 渐变、取整）
          'float mcRow = mcTop + ( mcBufH - gl_FragCoord.y ) * mcPx;',
          'float mcZ = ( floor( ( mcGround - mcRow ) / mcRowPx ) + 0.5 ) / 16.0;',
          'vec3 mcSky = floor( mix( mcHorizon, mcZenith, sqrt( clamp( mcZ / mcGrad, 0.0, 1.0 ) ) ) + 0.5 ) / 255.0;',
          'gl_FragColor.rgb = mix( gl_FragColor.rgb, mcSky, mcV );',
        ].join('\n'),
      );
  };
  m.customProgramCacheKey = () => '屋后远景雾';
  return m;
};

// 一个渲染页面只建一次几何
type DistantMesh = { g: THREE.BufferGeometry; type: '实心' | '镂空'; name: string };
let geometryCache: DistantMesh[] | null = null;
const farGeometry = () => {
  if (geometryCache) return geometryCache;
  const surroundBlocks = SurroundBlocks(behindHouseRange);
  const out: DistantMesh[] = [];
  for (const [blocks, biome] of [
    [surroundBlocks.plains, 'minecraft:plains'],
    [surroundBlocks.cherryGrove, 'minecraft:cherry_grove'],
  ] as [PlacedBlock[], string][]) {
    const buffers = assembleBuffers(blocks, { origin: gridOrigin, biome: biome });
    if (buffers.半透明.idx.length || buffers.发光.idx.length) throw new Error('屋后远景里不该有半透明、发光的方块');
    for (const matKind of ['实心', '镂空'] as const) {
      const b = buffers[matKind];
      if (!b.idx.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      g.setIndex(b.idx);
      out.push({ g, type: matKind, name: `屋后远景-${biome}-${matKind}` });
    }
  }
  return (geometryCache = out);
};

const parseColor = (s: string) => {
  const n = parseInt(s.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a: number[], b: number[], t: number) => new THREE.Vector3(...a.map((v, i) => v + (b[i]! - v) * t));

/** 头顶的原版云（原版云.ts 的 小木屋上空云）：飘 = 往东挪了多少（格），剩 = 每一格还剩多少（云洞），色 = 云顶色（sRGB 数值） */
export type DistantCloud = { drift: number; remain: (c: CloudCell) => number; 色: RGB };

/** 画布里的东西：地形网格、云 + 每帧按画布的像素比更新统一量（预览级、成片级的 dpr 不一样） */
const BehindHouseContent: React.FC<{ u: FogUniforms; clouds?: DistantCloud; fogPageHeight?: number }> = ({ u, clouds, fogPageHeight }) => {
  const dpr = useThree((s) => s.viewport.dpr);
  const pageHeight = useThree((s) => s.size.height);
  u.mcPx!.value = filmScale / dpr;
  u.mcBufH!.value = (fogPageHeight ?? pageHeight) * dpr;
  const [meshes, cloudMaterials] = useMemo(() => {
    const common = { map: blockAtlas().original, vertexColors: true, roughness: 1, metalness: 0 };
    const materials = {
      实心: applyFog(new THREE.MeshStandardMaterial(common), u),
      镂空: applyFog(new THREE.MeshStandardMaterial({ ...common, alphaTest: 0.5, side: THREE.DoubleSide }), u),
    };
    const meshes = farGeometry().map(({ g, type: matKind, name: name }) => {
      const m = new THREE.Mesh(g, materials[matKind]);
      m.name = name;
      m.frustumCulled = false;
      return m;
    });
    return [meshes, makeCloudMaterials((m) => applyFog(m, u))] as const;
  }, [u]);
  return (
    <group>
      {meshes.map((m) => (
        <primitive key={m.name} object={m} />
      ))}
      {clouds && <VanillaBlockCloud offset={cabinSkyCloud.offset} extent={cabinSkyCloud.extent} remain={clouds.remain} drift={clouds.drift} 色={clouds.色} bottomHeight={cabinSkyCloud.bottomHeight} materials={cloudMaterials} />}
    </group>
  );
};

/** 门口画布 的 远景 给对象时的选项 */
export type BackViewOptions = {
  /** 头顶的原版云；不给不画 */
  clouds?: DistantCloud;
};

export type BehindHouseViewProps = BackViewOptions & {
  /** 这一帧正交那一层的取景（天也按它画） */
  framing: SideFraming;
  /** 同一段时间线上上一帧的取景，段首给当前取景；不是上次实际渲染的帧。
   *  @remotion/three 提交后才 setSize，旧机位和雾读取的是上次渲染的高度。显式重现顺序渲染的高度，保留已看过的画面。
   *  不给时保留既有行为：静帧核对里也会切换取景，不在这里顺带改它们（docs/渲染性能.md）。 */
  frontFraming?: SideFraming;
  /** 整块画面的页面尺寸（同 门口画布） */
  width: number;
  height: number;
  /** 正交那一层的斜投影俯角（画风.ts 的 正交顶面） */
  topDepth: number;
  /** 平涂色调（同正交那一层，夜里压暗的也一样） */
  tint: string;
  /** 天色、刻、明暗幅度：同 侧剖面天空，雾淡进去的就是它画的那片天 */
  skyColors: SkyColorType;
  刻: number;
  lightDarkAmp: number;
};

/** 地平线在画面上的位置（成片像素）= 相机画面正中那一行 */
const horizonLineAt = (framing: SideFraming, height: number, topDepth: number) => height * filmScale * 0.5 + horizonBelowCenter(framing, topDepth) * framing.pxPerCell;
/** 画布上下对称地包住地平线：画布半高（页面像素） */
const canvasHalfPageHeight = (framing: SideFraming, height: number, topDepth: number) => {
  const horizonPx = horizonLineAt(framing, height, topDepth);
  return Math.ceil(Math.max(horizonPx, height * filmScale - horizonPx) / filmScale);
};

/** 放在 门口画布 的天和正交画布中间（绝对定位，自己算位置；比画面高的部分由 门口画布 的 overflow 裁掉） */
export const BehindHouseVista: React.FC<BehindHouseViewProps> = ({ framing, frontFraming, clouds, width: width, height: height, topDepth, tint, skyColors, 刻: tick, lightDarkAmp }) => {
  const pxPerCell = framing.pxPerCell;
  const horizonDrop = horizonBelowCenter(framing, topDepth);
  const halfPageHeight = canvasHalfPageHeight(framing, height, topDepth);
  const frontCanvasHeight = frontFraming === undefined ? undefined : canvasHalfPageHeight(frontFraming, height, topDepth) * 2;
  const topPage = horizonLineAt(framing, height, topDepth) / filmScale - halfPageHeight;
  const eye: [number, number, number] = [framing.center[0], -farViewDistance, framing.center[1] - horizonDrop];
  // 地形往下挪：眼睛正好在远景地面上 眼高
  const terrainLow = eye[2] - eyeHeight;
  const fov = (2 * Math.atan((halfPageHeight * filmScale) / (pxPerCell * farViewDistance)) * 180) / Math.PI;
  const bright = 1 - lightDarkAmp * (1 - skyBrightness(tick));
  const u = useMemo<FogUniforms>(
    () => ({
      mcFogStart: { value: farFog.start },
      mcFogEnd: { value: farFog.end },
      mcTop: { value: 0 },
      mcBufH: { value: 0 },
      mcPx: { value: 1 },
      mcGround: { value: 0 },
      mcRowPx: { value: 1 },
      mcGrad: { value: 1 },
      mcHorizon: { value: new THREE.Vector3() },
      mcZenith: { value: new THREE.Vector3() },
    }),
    [],
  );
  u.mcTop!.value = topPage * filmScale;
  u.mcGround!.value = height * filmScale * 0.5 + framing.center[1] * pxPerCell;
  u.mcRowPx!.value = pxPerCell / 16;
  u.mcGrad!.value = skyColors.gradientHeight;
  u.mcHorizon!.value = mix(parseColor(skyColors.nightHorizon), parseColor(skyColors.horizon), bright);
  u.mcZenith!.value = mix(parseColor(skyColors.nightTop), parseColor(skyColors.topColor), bright);
  return (
    <ToonCanvas
      width={width}
      height={halfPageHeight * 2}
      cameraRig={{ kind: '透视', 眼: eye, 看: [eye[0], eye[1] + 1, eye[2]], fov, near: 1, farPlane: farFog.end + farViewDistance + 16, aspectRatio: frontCanvasHeight === undefined ? undefined : width / frontCanvasHeight }}
      tint={tint}
      style={{ position: 'absolute', left: 0, top: topPage }}
    >
      <group position={[0, 0, terrainLow]}>
        <BehindHouseContent u={u} clouds={clouds} fogPageHeight={frontCanvasHeight} />
      </group>
    </ToonCanvas>
  );
};
