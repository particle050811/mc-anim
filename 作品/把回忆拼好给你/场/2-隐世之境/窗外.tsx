// 窗外的归隐之地：结构四周一圈樱花林、再往外起伏成山（远山.ts），远处照原版淡进雾里，天照原版近地平线发白。
// 网格只导出了结构本身（模板 21×26），外面原本是空的，所以这里补：草地（草方块顶按 cherry_grove 染色，坡的侧面是草方块侧面、再往下露泥土）、
// 地上的粉红色花簇、樱花树（樱花树.ts）。远山、雾、天色照用户 10-24「超平坦背景 合理吗？」（主会话推广到看得见地平线的透视镜头；归隐之地是噪声地形，见 参数.ts 的 远山）。
// 结构占地里的草地铺在 z −0.01（藏在方块顶面底下），结构地面层（模板 y 0）真有的缺口不铺，底下再垫一层压到 z −1.01（地洞底的暗色封底在 z −0.99，垫层在它下面）。
// 地面层别的空格是片场存档导出时掉下去的混凝土粉末（结构手放在 y 200 的半空，有重力的方块落走了），游戏里不会掉，照铺。
// 方块都是受光的标准材质（套进三渲二平涂照样换成平涂），树叶镂空。雾补在每个材质算完颜色以后（平涂、背景褪色都在它前面），所以雾色不褪色、和天对得上；
// 天是一个包住全场的大球（ShaderMaterial，平涂、褪色都不碰它）。坐标同网格本地（Z 朝上）；结构占 x 0～21、y −26～0，地面顶在 z 0。
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { rng } from '@engine/model/parts.tsx';
import { png } from '@engine/model/贴图.ts';
import { hiddenLandPalette, cherryGrove, farHills } from './参数.ts';
import { cherryTree, type CellPos } from './樱花树.ts';
import { vanillaFogColor, terrain, terrainFogRange, buildSlopeTrees, buildSlopeFlowers, structFootprint, type FaceBuffers } from './远山.ts';
import logUri from 'asset:贴图/场景/樱花林/cherry_log';
import logTopUri from 'asset:贴图/场景/樱花林/cherry_log_top';
import leavesUri from 'asset:贴图/场景/樱花林/cherry_leaves';
import grassUri from 'asset:贴图/场景/樱花林/grass_block_top';
import petalsUri from 'asset:贴图/场景/樱花林/pink_petals';
import grassSideUri from 'asset:贴图/场景/樱花林远山/grass_block_side';
import grassSideOverlayUri from 'asset:贴图/场景/樱花林远山/grass_block_side_overlay';
import dirtUri from 'asset:贴图/方块/泥土';

/** 结构地面层真有的缺口（hidden_retreat_1.nbt 的 y 0 层，换成场景坐标 [x0, y0, x1, y1]）：南头楼梯口（模板 (11, 0, 16) 的橡木楼梯和 (12..15, 0, 16) 的空气，
 *  就是 主厅.地洞 加楼梯那一格）、两块下半砖（(2, 0, 15)、(0, 0, 24)，顶面在 z −0.5）、西南角 (0, 0, 25) 一格空气 */
const groundGaps: readonly (readonly [number, number, number, number])[] = [
  [11, -17, 16, -16],
  [2, -16, 3, -15],
  [0, -26, 1, -24],
];

/** 占地里去掉缺口剩下的格子，按行并成长方形 */
const footprintPaving = () => {
  const [x0, y0, x1, y1] = structFootprint;
  const isMissing = (x: number, y: number) => groundGaps.some(([a, b, c, d]) => x >= a && x < c && y >= b && y < d);
  const out: [number, number, number, number][] = [];
  for (let y = y0; y < y1; y++) {
    let startIndex: number | null = null;
    for (let x = x0; x <= x1; x++) {
      const paved = x < x1 && !isMissing(x, y);
      if (paved && startIndex === null) startIndex = x;
      if (!paved && startIndex !== null) {
        out.push([startIndex, y, x, y + 1]);
        startIndex = null;
      }
    }
  }
  return out;
};

/** 方块贴图：最近邻放大；远处按多级纹理缩（同 方块网格.tsx，免得出摩尔纹）。地面、坡面按场景坐标取 uv，要重复 */
const makeTexture = (px: Uint8Array, w: number, h: number, repeat = false) => {
  const t = new THREE.DataTexture(px, w, h, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.generateMipmaps = true;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
};
const loadImgTexture = (uri: string, repeat = false) => {
  const p = png(uri);
  return makeTexture(p.px, p.w, p.h, repeat);
};

/** 颜色的 sRGB 数值（0～1，不换成线性）：着色器里、贴图像素上按 sRGB 数值乘、混（同游戏） */
const srgbColor = (hex: string) => {
  const c = new THREE.Color().setStyle(hex, THREE.LinearSRGBColorSpace);
  return new THREE.Vector3(c.r, c.g, c.b);
};

/** 草方块侧面：原版先画 grass_block_side，再把灰的草边（overlay）按草色染了盖上去（草边不透明的像素整个盖住） */
const grassSideTexture = () => {
  const [bottomTex, overlay] = [png(grassSideUri), png(grassSideOverlayUri)];
  const tint = srgbColor(hiddenLandPalette.grassColor).toArray();
  const px = new Uint8Array(bottomTex.px);
  for (let i = 0; i < px.length; i += 4)
    if (overlay.px[i + 3]! > 0) for (let c = 0; c < 3; c++) px[i + c] = Math.round(overlay.px[i + c]! * tint[c]!);
  return makeTexture(px, bottomTex.w, bottomTex.h, true);
};

/** 樱花林：在结构四周的环里按种子撒树（离结构至少 留空 格、彼此至少 间距 格），树下撒花簇 */
const buildGrove = () => {
  const { 种子: seed, fixedPoints, treeCount, innerBox, outerRadius, spacing, flowerClusterCount } = cherryGrove;
  const r = rng(seed);
  const roots: [number, number, number?][] = fixedPoints.map(([x, y, rootHeight]) => [x, y, rootHeight]);
  const [x0, y0, x1, y1] = innerBox;
  const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2];
  for (let tries = 0; roots.length < fixedPoints.length + treeCount && tries < treeCount * 200; tries++) {
    const [x, y] = [Math.round(cx + (r() * 2 - 1) * outerRadius), Math.round(cy + (r() * 2 - 1) * outerRadius)];
    if (x > x0 && x < x1 && y > y0 && y < y1) continue;
    if (roots.some(([a, b]) => Math.hypot(a - x, b - y) < spacing)) continue;
    roots.push([x, y]);
  }
  const logs: CellPos[] = [];
  const leaves: CellPos[] = [];
  for (const [x, y, rootHeight] of roots) {
    const t = cherryTree(x, y, rng(seed * 1009 + x * 131 + y * 7), rootHeight);
    logs.push(...t.logs);
    leaves.push(...t.leaves);
  }
  const flowers: [number, number, number][] = [];
  for (let i = 0; i < flowerClusterCount; i++) {
    const [x, y] = [Math.floor(cx + (r() * 2 - 1) * outerRadius), Math.floor(cy + (r() * 2 - 1) * outerRadius)];
    if (x >= x0 - 1 && x <= x1 && y >= y0 - 1 && y <= y1) continue;
    flowers.push([x, y, Math.floor(r() * 4)]);
  }
  return { logs, leaves, 花: flowers };
};

/** 几块水平的长方形 [x0, y0, x1, y1]（高 z）拼成一个几何，uv 就是场景 x、y：贴图每格一张、和方块格子对齐（RepeatWrapping） */
const planeGeometry = (rects: readonly (readonly [number, number, number, number])[], z: number) => {
  const f: FaceBuffers = { 位: [], uv: [], 法: [], 序: [] };
  rects.forEach(([x0, y0, x1, y1], i) => {
    f.位.push(x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z);
    f.uv.push(x0, y0, x1, y0, x1, y1, x0, y1);
    f.法.push(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1);
    f.序.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  });
  return buildFaceGeometry(f);
};

const buildFaceGeometry = (f: FaceBuffers) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(f.位, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(f.法, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(f.uv, 2));
  g.setIndex(f.序);
  return g;
};

const placeInstances = (mesh: THREE.InstancedMesh, cells: CellPos[]) => {
  const m = new THREE.Matrix4();
  cells.forEach(([x, y, z], i) => mesh.setMatrixAt(i, m.makeTranslation(x + 0.5, y + 0.5, z + 0.5)));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
};

// ---------- 原版的雾和天（远山.ts 的 原版雾色、地形雾起止、天雾） ----------
const fogUniforms = {
  mcFogColor: { value: new THREE.Vector3(...vanillaFogColor(hiddenLandPalette.天, hiddenLandPalette.fog, farHills.viewDistance)) },
  mcFogRange: { value: new THREE.Vector2(...terrainFogRange(farHills.viewDistance)) },
};

/** 给材质补上原版地形雾：材质算完颜色（opaque_fragment）以后按柱形距离混雾色，sRGB 数值上混（同游戏）；雾是 0 的片元原样不动 */
const addFog = <M extends THREE.Material>(m: M): M => {
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, fogUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMcFogW;')
      .replace(
        '#include <project_vertex>',
        ['#include <project_vertex>', '{', '\tvec4 mcW = vec4( transformed, 1.0 );', '#ifdef USE_INSTANCING', '\tmcW = instanceMatrix * mcW;', '#endif', '\tvMcFogW = ( modelMatrix * mcW ).xyz;', '}'].join('\n'),
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 mcFogColor;\nuniform vec2 mcFogRange;\nvarying vec3 vMcFogW;')
      .replace(
        '#include <opaque_fragment>',
        [
          '#include <opaque_fragment>',
          '{',
          '\tvec3 mcD = vMcFogW - cameraPosition;',
          '\tfloat mcDist = max( length( mcD.xz ), abs( mcD.y ) );',
          '\tif ( mcDist > mcFogRange.x ) {',
          '\t\tfloat mcF = mcDist < mcFogRange.y ? smoothstep( mcFogRange.x, mcFogRange.y, mcDist ) : 1.0;',
          '\t\tvec3 mcC = sRGBTransferOETF( vec4( gl_FragColor.rgb, 1.0 ) ).rgb;',
          '\t\tgl_FragColor.rgb = sRGBTransferEOTF( vec4( mix( mcC, mcFogColor, mcF ), 1.0 ) ).rgb;',
          '\t}',
          '}',
        ].join('\n'),
      );
  };
  m.customProgramCacheKey = () => '窗外原版雾';
  return m;
};

const zenithVertexShader = ['varying vec3 vMcDir;', 'void main() {', '\tvec4 w = modelMatrix * vec4( position, 1.0 );', '\tvMcDir = w.xyz - cameraPosition;', '\tgl_Position = projectionMatrix * viewMatrix * w;', '}'].join('\n');
// 远山.ts 的 天雾：天盘在上方 16 格、半径 512，雾距从盘心 16 线性插到盘边 512，smoothstep(0, 视距×16)；盘边以下是清屏的雾色
const skyFragmentShader = [
  'uniform vec3 mcSky;',
  'uniform vec3 mcFogColor;',
  'uniform float mcSkyFar;',
  'varying vec3 vMcDir;',
  'void main() {',
  '\tvec3 d = normalize( vMcDir );',
  '\tfloat f = 1.0;',
  '\tif ( d.y > 0.0 ) {',
  '\t\tfloat r = 16.0 * length( d.xz ) / d.y;',
  '\t\tif ( r < 512.0 ) {',
  '\t\t\tfloat D = 16.0 + 496.0 * r / 512.0;',
  '\t\t\tf = D < mcSkyFar ? smoothstep( 0.0, mcSkyFar, D ) : 1.0;',
  '\t\t}',
  '\t}',
  '\tgl_FragColor = vec4( sRGBTransferEOTF( vec4( mix( mcSky, mcFogColor, f ), 1.0 ) ).rgb, 1.0 );',
  '\t#include <colorspace_fragment>',
  '}',
].join('\n');

/** 天：包住全场的大球，颜色只看视线的仰角（镜头在哪都一样），最先画、不写深度 */
const skyDome = () => {
  const skyMaterial = new THREE.ShaderMaterial({
    uniforms: { mcSky: { value: srgbColor(hiddenLandPalette.天) }, mcFogColor: fogUniforms.mcFogColor, mcSkyFar: { value: farHills.viewDistance * 16 } },
    vertexShader: zenithVertexShader,
    fragmentShader: skyFragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  });
  const skySphere = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), skyMaterial);
  skySphere.position.set(10, -13, 0);
  skySphere.renderOrder = -1000;
  skySphere.frustumCulled = false;
  return skySphere;
};

export const OutsideCherryGrove: React.FC = () => {
  const bundle = useMemo(() => {
    const grove = buildGrove();
    const slopeTrees = buildSlopeTrees();
    const logs = [...grove.logs, ...slopeTrees.logs];
    const leaves = [...grove.leaves, ...slopeTrees.leaves];
    const flowers: [number, number, number, number][] = [...grove.花.map(([x, y, k]): [number, number, number, number] => [x, y, 0, k]), ...buildSlopeFlowers()];
    // BoxGeometry 的四个侧面贴图竖着朝 +y（three 的 Y 朝上），绕 x 转 90° 让它朝 +z，原木的树皮纹才是竖的。
    // 转完六个面的顺序：+x −x 顶 底 南 北
    const blockGeometry = new THREE.BoxGeometry(1, 1, 1).rotateX(Math.PI / 2);
    const woodSide = addFog(new THREE.MeshStandardMaterial({ map: loadImgTexture(logUri), roughness: 1 }));
    const logTopMaterial = addFog(new THREE.MeshStandardMaterial({ map: loadImgTexture(logTopUri), roughness: 1 }));
    const logMesh = placeInstances(new THREE.InstancedMesh(blockGeometry, [woodSide, woodSide, logTopMaterial, logTopMaterial, woodSide, woodSide], logs.length), logs);
    const leafMaterial = addFog(new THREE.MeshStandardMaterial({ map: loadImgTexture(leavesUri), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 }));
    const leafMesh = placeInstances(new THREE.InstancedMesh(blockGeometry, leafMaterial, leaves.length), leaves);
    const groundMaterial = addFog(new THREE.MeshStandardMaterial({ map: loadImgTexture(grassUri, true), color: new THREE.Color(hiddenLandPalette.grassColor), roughness: 1 }));
    const grassSideMaterial = addFog(new THREE.MeshStandardMaterial({ map: grassSideTexture(), roughness: 1 }));
    const dirtMaterial = addFog(new THREE.MeshStandardMaterial({ map: loadImgTexture(dirtUri, true), roughness: 1 }));
    // 占地里去掉缺口的格子，顶面压低 0.01 藏在方块顶面底下；占地里整块再垫在 z −1.01。占地外面是远山的地形（同样压低 0.01）
    const faces = terrain();
    const geometries = { 占地: planeGeometry(footprintPaving(), -0.01), 垫层: planeGeometry([structFootprint], -1.01), 顶: buildFaceGeometry(faces.top), 草侧: buildFaceGeometry(faces.grassSide), 土侧: buildFaceGeometry(faces.dirtSide) };
    const groundParts = [
      new THREE.Mesh(geometries.占地, groundMaterial),
      new THREE.Mesh(geometries.垫层, groundMaterial),
      new THREE.Mesh(geometries.顶, groundMaterial),
      new THREE.Mesh(geometries.草侧, grassSideMaterial),
      new THREE.Mesh(geometries.土侧, dirtMaterial),
    ];
    const petalMaterial = addFog(new THREE.MeshStandardMaterial({ map: loadImgTexture(petalsUri), alphaTest: 0.5, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }));
    const petalPlane = new THREE.PlaneGeometry(1, 1);
    const petalMesh = new THREE.InstancedMesh(petalPlane, petalMaterial, flowers.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    flowers.forEach(([x, y, h, k], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), (k * Math.PI) / 2);
      petalMesh.setMatrixAt(i, m.compose(new THREE.Vector3(x + 0.5, y + 0.5, h + 3 / 16 - 0.01), q, new THREE.Vector3(1, 1, 1)));
    });
    petalMesh.instanceMatrix.needsUpdate = true;
    petalMesh.computeBoundingSphere();
    for (const o of [logMesh, leafMesh, ...groundParts, petalMesh]) o.receiveShadow = true;
    logMesh.castShadow = leafMesh.castShadow = true;
    const sky = skyDome();
    return {
      objects: [sky, ...groundParts, petalMesh, logMesh, leafMesh],
      materials: [woodSide, logTopMaterial, leafMaterial, groundMaterial, grassSideMaterial, dirtMaterial, petalMaterial, sky.material],
      geometries: [blockGeometry, petalPlane, ...Object.values(geometries), sky.geometry],
    };
  }, []);
  useEffect(
    () => () => {
      for (const m of bundle.materials) {
        (m as THREE.MeshStandardMaterial).map?.dispose();
        m.dispose();
      }
      for (const g of bundle.geometries) g.dispose();
    },
    [bundle],
  );
  return (
    <>
      {bundle.objects.map((o) => (
        <primitive key={o.uuid} object={o} />
      ))}
    </>
  );
};
