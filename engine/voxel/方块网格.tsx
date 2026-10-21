// 方块网格：渲染取材 mod 的 mesh 动作导出的场景（mcai mesh from=.. to=.. out=..）。
// 面是游戏渲染器实际画出的（遮挡、楼梯、异形方块、群系染色、AO 已算好），含展示框、箱子、告示牌等实体。
// 三个文件：.json（说明）、.bin（gzip 顶点，不内联，免得渲染任何镜头都打包全部场景）、.png（用到贴图的小图集），import 后传给 `BlockMesh`。
// 坐标：导出时减去 origin，这里再从游戏坐标（Y 朝上、南 = +Z）换成参考模型坐标（Z 朝上、南 = -Y），1 = 一格。
import React, { useEffect, useMemo, useState } from 'react';
import { cancelRender, continueRender, delayRender } from 'remotion';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { selfLight } from '../light/光照配比.ts';
import { type Png, png } from '../model/贴图.ts';
import { flattenAtlasColors, flatColorBlocks } from './纯色方块.ts';
import type { V3 } from '../model/parts.tsx';
import { arrangeFaces, type ExtraFaces } from './方块网格补面.ts';
import { patchWaterShader } from './水面.ts';
import { gunzip } from '../core/数据源.ts';
import { patchLeafShader, tintedLeafExpr } from '../light/树叶透光.ts';

export type BlockMeshInfo = {
  dim: string;
  from: number[];
  to: number[];
  origin: number[];
  vertexBytes: number;
  atlas: number[];
  // name：solid 实心 / cutout 镂空（树叶、玻璃）/ translucent 半透明（水、冰）/ plants 没有碰撞体积的方块（花草、蘑菇、火把，按镂空画）
  // doubleSide：两面都画（实体模型里不剔除背面的部分）
  layers: { name: string; doubleSide?: boolean; quads: number; byteOffset: number }[];
  // 方块 id → 方块底面中心的位置（游戏坐标减 origin）
  markers: Record<string, number[][]>;
  // 合并出来的大面用的贴图：[u0, v0, 宽, 高]（图集里 0~1）。顶点的贴图号 n>0 指第 n-1 张，这时 u v 是平铺的格数
  rects?: number[][];
  // 图集里每张贴图的名字和位置（rect 同 rects 的格式）；独立贴图（实体）多一个 crop：从贴图文件上抠下的像素 [x, y, 宽, 高]。较早导出的网格没有
  sprites?: { name: string; atlas?: string; crop?: number[]; rect: number[] }[];
  // 导出来源：实例、存档、维度、mesh 参数、模组版本、资源包。较早导出的网格没有
  取材?: Record<string, unknown>;
};

// 合并出来的大面：贴图要在自己那块图集里平铺，three 自带材质做不到，改片元着色器：贴图号 > 0 的面按 rect + fract(格数) × 大小取图集坐标。
// vLocal 按质心插值（centroid）：开多重采样后，面边上只盖一部分的像素普通插值会把 uv 外推到面外，取到旁边的贴图；镂空层取到透明像素被 alphaTest 丢掉，
// 远看每条方块边一道虚线（用户 10-06 接缝巡检）。质心插值把采样点挪回面里，只影响边上一圈像素
const TILE_VERT = ['attribute vec4 rect;', 'varying vec4 vRect;', 'centroid varying vec2 vLocal;'].join('\n');
// 远处、掠射角的面一个像素盖住好几个贴图像素，只取最近的会出摩尔纹（用户 09-30），所以图集用多级纹理，按每像素盖住多少贴图像素算级别。
// 级别封顶 4：图集里每张贴图 16×16、按 16 对齐，第 4 级每张缩成 1 像素，再往上会混进旁边的贴图。平铺大面要按没取 fract 的格数求导，否则接缝处导数突变出杂点。
const TILE_FRAG = [
  'varying vec4 vRect;',
  'centroid varying vec2 vLocal;',
  'vec4 atlasSample(sampler2D t, vec2 uv) {',
  '  vec2 tc = (vRect.z > 0.0 ? vLocal * vRect.zw : vLocal) * vec2(textureSize(t, 0));',
  '  float rho = max(length(dFdx(tc)), length(dFdy(tc)));',
  '  return textureLod(t, uv, clamp(log2(max(rho, 1e-6)), 0.0, 4.0));',
  '}',
].join('\n');
const TILE_UV = 'vec2 atlasUv = vRect.z > 0.0 ? vRect.xy + fract(vLocal) * vRect.zw : vLocal;';
const tiled = (shader: THREE.WebGLProgramParametersWithUniforms, emissive: boolean) => {
  shader.vertexShader = TILE_VERT + '\n' + shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n\tvRect = rect;\n\tvLocal = uv;');
  shader.fragmentShader = TILE_FRAG + '\n' + shader.fragmentShader.replace('#include <map_fragment>', `${TILE_UV}\n\tdiffuseColor *= atlasSample( map, atlasUv );`);
  if (emissive) {
    // 打底的自发光 = 颜色 × 自发光系数（三类方块材质共用，见 lib/光照配比.ts）；要乘顶点色，否则草和树叶（贴图灰、靠顶点色染绿）暗部发灰
    shader.uniforms.selfLight = selfLight;
    shader.fragmentShader = 'uniform float selfLight;\n' + shader.fragmentShader.replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance *= atlasSample( emissiveMap, atlasUv ).rgb * vColor.rgb * selfLight;');
  }
};

// 取过的 .bin 留着：同一个场景在多个镜头、多帧里复用，块出了视野再进来也直接重建，不重复取
const loaded = new Map<string, Uint8Array>();

const mkTex = (atlas: Png) => {
  const t = new THREE.DataTexture(atlas.px, atlas.w, atlas.h, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  // 图集里贴图挨着贴图：不做线性过滤（相邻贴图的颜色会渗过来）；多级纹理要，级别在着色器里算并封顶（见 TILE_FRAG）
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
};
// 图集纹理一张图集一份，同时挂着的几份网格（块进出视野重挂、换 hide 重建）共用；最后一个用它的网格卸载才释放显存
type AtlasTextures = { base: THREE.DataTexture; plant: THREE.DataTexture; users: number };
const atlasTextures = new Map<string, AtlasTextures>();
const acquireAtlas = (atlas: string) => {
  let entry = atlasTextures.get(atlas);
  if (!entry) {
    const src = png(atlas);
    // 纯色方块时花草层和别的层处理不同（草要抠掉、树叶要补实，光看贴图分不开，见 lib/纯色方块.ts），各用一张
    const base = flatColorBlocks ? mkTex(flattenAtlasColors(src, '其他')) : mkTex(src);
    entry = { base, plant: flatColorBlocks ? mkTex(flattenAtlasColors(src, '花草')) : base, users: 0 };
    atlasTextures.set(atlas, entry);
  }
  entry.users++;
  return entry;
};
const releaseAtlas = (atlas: string) => {
  const entry = atlasTextures.get(atlas)!;
  if (--entry.users > 0) return;
  entry.base.dispose();
  if (entry.plant !== entry.base) entry.plant.dispose();
  atlasTextures.delete(atlas);
};

// 顶点数组传上显存以后丢掉，省内存（同 lib/体素/世界.tsx）。包围球先算好：three 视锥剔除要用，懒算的话那时数组可能已经丢了
function releaseCpuArray(this: THREE.BufferAttribute) {
  (this as unknown as { array: null }).array = null;
}
const disposeMeshes = (meshes: THREE.Mesh[]) => {
  for (const mesh of meshes) {
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
    mesh.customDepthMaterial?.dispose();
  }
};

// 游戏坐标（已减 origin）→ 参考模型坐标
export const fromGame = ([x, y, z]: number[]): V3 => [x, -z, y];

// 顶点色是游戏里乘在贴图上的系数（染色 × 环境光遮蔽），游戏在 sRGB 数值上直接相乘；three 在线性空间里乘，所以先换算
const LIN = new Float32Array(256).map((_, i) => Math.pow(i / 255, 2.2));

// 自发光的半透明方块（暮色传送门）：亮度 11、露天，按贴图原色画不受光照影响。半透明面游戏里按远近逐面排序，这里同网格的面只按导出顺序画；
// 传送门方块底下还有一层水色半透明面，按导出顺序会盖到紫色表面上。所以 glow 盒子里的半透明面单独拿出：最上层（表面）不受光照、和别的半透明物一起按远近排序，下面那层先画。只有给了 glow 的场景受影响
const quadCenter = (view: DataView, at: number, stride: number): V3 => {
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let k = 0; k < 4; k++) {
    cx += view.getFloat32(at + k * stride, true) / 4;
    cy -= view.getFloat32(at + k * stride + 8, true) / 4;
    cz += view.getFloat32(at + k * stride + 4, true) / 4;
  }
  return [cx, cy, cz];
};
const inBox = ([x, y, z]: V3, [x0, y0, z0, x1, y1, z1]: number[]) => x > x0 && x < x1 && y > y0 && y < y1 && z > z0 && z < z1;

// 自发光的半透明方块（暮色力场）：模型里 forge_data 亮度 15、shade false，游戏里不受光照、按贴图原色画。受光的话夕阳把紫色照成浅粉、高光一盖更透，
// 后面露天的地方像墙缺了块（6-1-9b 终焉城堡，用户 10-19 指出）。fullbright 盒子里单面的半透明面走不受光照的材质；双面的是盔甲架这类实体，照常受光
type FaceOptions ={ clearPlants?: number[][]; hide?: number[][]; hideBlocks?: number[][]; patchEdges?: boolean | number; glow?: number[][]; fullbright?: number[][] };
const build = (info: BlockMeshInfo, data: Uint8Array, { base: baseTex, plant: plantTex }: AtlasTextures, { clearPlants, hide, hideBlocks, patchEdges, glow, fullbright }: FaceOptions) => {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const stride = info.vertexBytes;
  // 一层里挑出来的这些面（null = 整层）加上另加的面（extra：按方块藏切开的大面、补边补的面）做成一个网格；unlit：不受光照（自发光的传送门表面、力场）
  const makeMesh = (layer: BlockMeshInfo['layers'][number], keep: number[] | null, extra: ExtraFaces | null = null, unlit = false) => {
    const own = keep ? keep.length : layer.quads;
    const quads = own + (extra ? extra.r.length : 0);
    const vertCount = quads * 4;
    const pos = new Float32Array(vertCount * 3);
    const nor = new Float32Array(vertCount * 3);
    const uv = new Float32Array(vertCount * 2);
    // 半透明层带顶点透明度：实体半透明画的（终焉城堡里幽灵似的盔甲架）是 38/255，不读的话画成实心。别的层、整层不透明的不带（不换着色器）
    let cn = 3;
    if (layer.name === 'translucent')
      for (let i = 0; i < own * 4 && cn === 3; i++) if (view.getUint8(layer.byteOffset + (keep ? keep[i >> 2] * 4 + (i & 3) : i) * stride + 23) < 255) cn = 4;
    const col = new Float32Array(vertCount * cn).fill(1);
    const rect = new Float32Array(vertCount * 4);
    const idx = new Uint32Array(quads * 6);
    for (let i = 0; i < own * 4; i++) {
      const at = layer.byteOffset + (keep ? keep[i >> 2] * 4 + (i & 3) : i) * stride;
      pos[i * 3] = view.getFloat32(at, true);
      pos[i * 3 + 1] = -view.getFloat32(at + 8, true);
      pos[i * 3 + 2] = view.getFloat32(at + 4, true);
      uv[i * 2] = view.getFloat32(at + 12, true);
      uv[i * 2 + 1] = view.getFloat32(at + 16, true);
      col[i * cn] = LIN[view.getUint8(at + 20)];
      col[i * cn + 1] = LIN[view.getUint8(at + 21)];
      col[i * cn + 2] = LIN[view.getUint8(at + 22)];
      if (cn === 4) col[i * cn + 3] = view.getUint8(at + 23) / 255;
      // 早期导出的是 24 字节一个顶点、没有贴图号（也没有合并出来的面）
      const rectIdx = stride >= 28 ? view.getUint32(at + 24, true) : 0;
      if (rectIdx > 0) rect.set(info.rects![rectIdx - 1], i * 4);
    }
    // 另加的面：位置是 bin 坐标（游戏坐标减 origin），同样换成参考模型坐标；顶点色是 0～255（切开的大面插值过，不一定是整数）
    if (extra)
      for (let j = 0; j < extra.r.length * 4; j++) {
        const i = own * 4 + j;
        pos[i * 3] = extra.pos[j * 3];
        pos[i * 3 + 1] = -extra.pos[j * 3 + 2];
        pos[i * 3 + 2] = extra.pos[j * 3 + 1];
        uv[i * 2] = extra.uv[j * 2];
        uv[i * 2 + 1] = extra.uv[j * 2 + 1];
        for (let k = 0; k < 3; k++) col[i * cn + k] = Math.pow(extra.col[j * 3 + k] / 255, 2.2);
        const rectIdx = extra.r[j >> 2];
        if (rectIdx > 0) rect.set(info.rects![rectIdx - 1], i * 4);
      }
    const corner = new THREE.Vector3();
    const edgeU = new THREE.Vector3();
    const edgeV = new THREE.Vector3();
    for (let quad = 0; quad < quads; quad++) {
      const firstVert = quad * 4;
      corner.fromArray(pos, firstVert * 3);
      edgeU.fromArray(pos, (firstVert + 1) * 3).sub(corner);
      edgeV.fromArray(pos, (firstVert + 3) * 3).sub(corner);
      edgeU.cross(edgeV).normalize();
      for (let k = 0; k < 4; k++) edgeU.toArray(nor, (firstVert + k) * 3);
      idx.set([firstVert, firstVert + 1, firstVert + 2, firstVert, firstVert + 2, firstVert + 3], quad * 6);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geom.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geom.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geom.setAttribute('color', new THREE.BufferAttribute(col, cn));
    geom.setAttribute('rect', new THREE.BufferAttribute(rect, 4));
    geom.setIndex(new THREE.BufferAttribute(idx, 1));
    geom.computeBoundingSphere();
    for (const attr of [...Object.values(geom.attributes), geom.index!]) (attr as THREE.BufferAttribute).onUpload(releaseCpuArray);
    const translucent = layer.name === 'translucent';
    const tex = layer.name === 'plants' ? plantTex : baseTex;
    if (unlit) {
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        vertexColors: true,
        side: layer.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
        transparent: true,
        depthWrite: false,
      });
      mat.onBeforeCompile = (shader) => tiled(shader, false);
      return new THREE.Mesh(geom, mat);
    }
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      vertexColors: true,
      // 半透明层（水、冰、玻璃）光滑一些：水面的太阳高光照着波纹法线落出碎亮点（lib/水面.ts），同体素世界的水 0.1
      roughness: translucent ? 0.1 : 0.95,
      alphaTest: layer.name === 'cutout' || layer.name === 'plants' ? 0.5 : 0,
      side: layer.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
      transparent: translucent,
      depthWrite: !translucent,
      emissive: '#ffffff',
      emissiveMap: tex,
      // 贴在实心面上的镂空贴花（终焉城堡地面符文）和底下的砖同平面，深度只差浮点误差，符文一帧有一帧没有（用户 10-02）。镂空层往镜头偏一点：
      // 普通深度缓冲用多边形偏移；对数深度缓冲（一镜到底画布开了）在片元着色器写深度，多边形偏移管不到，在那里把距离乘 0.9999
      polygonOffset: layer.name === 'cutout',
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -4,
    });
    if (layer.name === 'cutout') {
      mat.onBeforeCompile = (shader) => {
        tiled(shader, true);
        // 树叶逆光透出暖色（lib/树叶透光.ts，和体素世界的树叶同一段）
        patchLeafShader(shader, tintedLeafExpr('vColor'));
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <logdepthbuf_fragment>',
          [
            '#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )',
            '\tgl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth * 0.9999 ) * logDepthBufFC * 0.5;',
            '#endif',
          ].join('\n'),
        );
      };
      // three 按 onBeforeCompile 的源码区分着色器程序，这里和实心层的写法不同，单独给一个键，免得共用了实心层的程序
      mat.customProgramCacheKey = () => 'blockmesh-cutout-bias';
    } else if (translucent) {
      // 水：波纹、菲涅尔、天光反射（lib/水面.ts，同体素世界）。半透明层里还有冰、玻璃：水的顶点色是群系水色（蓝、饱和），冰玻璃不染色，按饱和度认
      mat.onBeforeCompile = (shader) => {
        tiled(shader, true);
        patchWaterShader(shader, '(max(vColor.r, max(vColor.g, vColor.b)) - min(vColor.r, min(vColor.g, vColor.b))) > 0.25 * max(vColor.r, max(vColor.g, vColor.b))');
      };
      mat.customProgramCacheKey = () => 'blockmesh-water';
      mat.userData.水面 = true;
    } else {
      mat.onBeforeCompile = (shader) => tiled(shader, true);
    }
    // 屏幕 AO 的 压网格 认这个（lib/体素/屏幕AO.tsx），花草层不算（同体素世界的花草：不压）
    if (layer.name !== 'plants') mat.userData.方块网格 = true;
    const mesh = new THREE.Mesh(geom, mat);
    if (mat.alphaTest > 0) {
      // 镂空的面（树叶）投影时也要按平铺取图集，否则合并出来的大面投下的影子是错的
      const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: mat.alphaTest });
      depth.onBeforeCompile = (shader) => tiled(shader, false);
      mesh.customDepthMaterial = depth;
    }
    mesh.castShadow = !translucent;
    mesh.receiveShadow = true;
    return mesh;
  };
  const meshes: THREE.Mesh[] = [];
  // 要清掉花草范围里 plants 层的面、hide 盒子里的面（任何层，按面心）、hideBlocks 盒子里方块的面不要；`patchEdges` 补的面另加（都在 lib/方块网格补面.ts 里算）
  const { keep: keeps, extra } = arrangeFaces(info, view, { clearPlants, hide, hideBlocks, patchEdges });
  info.layers.forEach((layer, li) => {
    let keep = keeps[li];
    const ex = extra[li].r.length ? extra[li] : null;
    // glow 盒子里的半透明面拿出来：每个盒子里最高的那层是自发光表面，其余的垫在下面先画（见上面 quadCenter 前的说明）
    const surface: number[] = [];
    const under: number[] = [];
    if (glow?.length && layer.name === 'translucent') {
      const all = keep ?? Array.from({ length: layer.quads }, (_, q) => q);
      const box = all.map((quad) => {
        const center = quadCenter(view, layer.byteOffset + quad * 4 * stride, stride);
        return { q: quad, z: center[2], b: glow.findIndex((g) => inBox(center, g)) };
      });
      const top = glow.map((_, i) => Math.max(-Infinity, ...box.filter((e) => e.b === i).map((e) => e.z)));
      keep = [];
      for (const entry of box) {
        if (entry.b < 0) keep.push(entry.q);
        else if (entry.z > top[entry.b] - 0.01) surface.push(entry.q);
        else under.push(entry.q);
      }
    }
    // fullbright 盒子里的单面半透明面拿出来，不受光照（见上面 inBox 后的说明）
    if (fullbright?.length && layer.name === 'translucent' && !layer.doubleSide) {
      const all = keep ?? Array.from({ length: layer.quads }, (_, q) => q);
      const inside = (quad: number) => fullbright.some((b) => inBox(quadCenter(view, layer.byteOffset + quad * 4 * stride, stride), b));
      const bright = all.filter(inside);
      keep = all.filter((quad) => !inside(quad));
      if (bright.length) meshes.push(makeMesh(layer, bright, null, true));
    }
    if (!keep || keep.length || ex) meshes.push(makeMesh(layer, keep, ex));
    if (under.length) {
      const underMesh = makeMesh(layer, under);
      underMesh.renderOrder = -1;
      meshes.push(underMesh);
    }
    if (surface.length) meshes.push(makeMesh(layer, surface, null, true));
  });
  return meshes;
};

// info：import 的 .json；bin：import 的 .bin（文件地址）；atlas：import 的 .png（data URI）
// clearPlants：这些矩形 [x0, y0, x1, y1]（参考模型坐标）里不画花草（跑位上的草一格高会挡腿）
// hide：这些盒子 [x0, y0, z0, x1, y1, z1] 里的面都不画（如传送门激活后水池水面换成传送门）
// glow：这些盒子里的半透明面按自发光传送门画（见 `quadCenter` 前的说明），框住传送门方块即可
// fullbright：这些盒子里的单面半透明面不受光照（暮色力场，见 `inBox` 后的说明）
// hideBlocks：按方块藏（暮色地标「核心外藏」用）：面属于哪格方块（面心沿法向退 0.01 落的格）在盒子里就藏，合并的大面跨盒边按格切开；孔道、碎块洞的盒子仍放 hide（按面心排）
// patchEdges：补边（暮色地标用，各地标组件默认开）：导出边、hideBlocks 盒子边上缺的朝外面补上，地面往下补裙边（见 lib/方块网格补面.ts）。
//   true = 最多往下 16 格，数字 = 最多往下这么多格。hideBlocks 盒子边当边补，所以挖洞用的盒子不能放 hideBlocks
// 这几个数组各帧要是同一个（换了要重建网格）
export const BlockMesh: React.FC<{
  info: BlockMeshInfo;
  bin: string;
  atlas: string;
  clearPlants?: number[][];
  hide?: number[][];
  hideBlocks?: number[][];
  patchEdges?: boolean | number;
  glow?: number[][];
  fullbright?: number[][];
}> = ({ info, bin, atlas, clearPlants, hide, hideBlocks, patchEdges, glow, fullbright }) => {
  const [data, setData] = useState(() => loaded.get(bin));
  // 还没取到就让 Remotion 先别截这一帧
  const [handle] = useState(() => (loaded.has(bin) ? null : delayRender(`取方块网格 ${bin}`)));
  useEffect(() => {
    if (handle === null) return;
    // bin 是打包进来的文件地址（不在数据根），直接 fetch
    fetch(bin)
      .then((r) => r.arrayBuffer())
      // .bin 是 gzip 压过的（开头两个字节 1f 8b）；没压过的旧文件原样用
      .then((buf) => {
        const head = new Uint8Array(buf, 0, 2);
        return head[0] !== 0x1f || head[1] !== 0x8b ? buf : gunzip(buf);
      })
      .then((buf) => {
        const bytes = new Uint8Array(buf);
        loaded.set(bin, bytes);
        setData(bytes);
      })
      .catch((e) => cancelRender(e));
  }, [bin, handle]);
  const meshes = useMemo(
    () => (data ? build(info, data, acquireAtlas(atlas), { clearPlants, hide, hideBlocks, patchEdges, glow, fullbright }) : null),
    [info, data, atlas, clearPlants, hide, hideBlocks, patchEdges, glow, fullbright],
  );
  // 卸载、重建（块出了视野、换了 hide）时释放这份网格的显存；R3F 不替 primitive 释放
  useEffect(() => {
    if (!meshes) return;
    return () => {
      disposeMeshes(meshes);
      releaseAtlas(atlas);
    };
  }, [meshes, atlas]);
  // Remotion 的画布只在换帧时重画。网格是取回来之后才挂上去的，所以挂上之后要手动再画一次，画完才放行截图
  const advance = useThree((s) => s.advance);
  useEffect(() => {
    if (!meshes || handle === null) return;
    advance(performance.now());
    continueRender(handle);
  }, [meshes, handle, advance]);
  if (!meshes) return null;
  return (
    <group>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </group>
  );
};
