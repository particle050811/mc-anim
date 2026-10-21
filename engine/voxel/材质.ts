// 体素世界的材质：把 lib/体素/网格.ts 建出来的面组画出来。贴图是 lib/真实方块图集.ts 的原版贴图图集（多级纹理照 Voxy MipGen）。
// 材质、灯和导出网格（lib/方块网格.tsx）一样（用户 10-01：程序填充颜色必须和导出网格一致）：MeshStandardMaterial、粗糙度 0.95、贴图 × 染色 × 同一套灯，加自身颜色 × 自发光系数打底（见 lib/光照配比.ts）。
//
// 接口：
//   `voxelMaterial`(类)：实心 / 镂空 / 实心树叶 / 水 / 花草 五种材质（共用一份）
//   `faceGroupMesh`(面组, 类, 原点, 格)：一组面 → three 网格（一格 格 米）；`挑朝向`(网格, 看得见) 每帧只画朝着镜头的几组朝向
//   `shadowMesh`(网格)：同一批顶点、只进阴影图的网格；`背光朝向`(光向) 是它要画的几组
// 顶点里带：位置（以格为单位 × 64 的整数）、uv（× 16，以格为单位）、贴图号（+ 4096 × 乘染色 + 8192 × 随机转）和叠加贴图号、染色 rgb（sRGB 字节）。
//
// 照 Voxy 做的（quads.frag）：
// - 合并出来的大面按格平铺：uv 以格为单位取 fract，多级纹理级别按没取 fract 的 uv 的导数算（textureGrad）。
// - 镂空：按第 0 级贴图的透明度丢像素，颜色用多级纹理的（远处叶子洞照样在，颜色不发暗）。
// - 面朝向亮度不烤（Voxy 烤，这里照 Photon 交给灯算，见 lib/体素/网格.ts）。粗级实心树叶用图集的实心版（见 lib/真实方块图集.ts）。
// 高光随贴图（用户 10-09）：很暗的方块（黑暗森林林冠，线性反照率 0.001～0.017）漫反射近乎 0，高光（F0 0.04）不乘贴图就是一片没花纹的平面；
// 所以高光乘贴图明暗（该点亮度 ÷ 整张贴图平均亮度），整片平均亮度不变。
// 台阶并色（用户 10-10，远山摩尔纹）：远处台阶顶面白、侧面棕，缩到一两个像素高时交替取样拍出同心弧纹，Voxy、DH 都不处理。
// 一格在画布上约 6 个像素以下开始、约 2 个混满（`fwidth(vW)`）：顶面侧面往「两面各一半」混、侧面法线往上混、贴图往 1×1 平均色取，整片平均色不变。
// 屏幕 AO 按它减弱用户不要（「去 ao 不行 远处糊成一团」），只做 `farAo` 的按距离减弱；只把侧面混成顶面试过，积雪山变灰白，和近处对不上。
import * as THREE from 'three';
// 屏幕 AO 第 1 遍时置 1（lib/体素/屏幕AO.tsx），所有体素材质共用
export const aoPassUniform = { value: 0 };
// 远处的屏幕 AO 按离镜头距离（米）减弱：起 米以内全留，到 满 米减到只留 留，中间 smoothstep。远处台阶内角每级压一道暗线会叠成摩尔纹，但全去掉用户不要（「去 ao 不行 远处糊成一团」）。
// 留五成（三成时中景冰刺发平）；用户要「按距离来算 然后平滑过渡」。300、900 米：6-2-5 的 24 mm 镜头、2K 下一格 1 米在约 285 米处 6 个像素、约 850 米处 2 个像素，取整对上
export const farAo = { start: 300, full: 900, keep: 0.5 };
// 第 d 米处 AO 留几成（着色器里同一个式子）
export const farAoKeep = (distM: number) => {
  const t = Math.min(1, Math.max(0, (distM - farAo.start) / (farAo.full - farAo.start)));
  return 1 - (1 - farAo.keep) * t * t * (3 - 2 * t);
};
import type { V3 } from '../model/parts.tsx';
import { selfLight } from '../light/光照配比.ts';
import { shadowFrustums } from '../light/级联阴影.ts';
import { blockAtlas, blockAtlasGlsl } from './真实方块图集.ts';
import { posScale, groupCount, skirtGroupStart, type FaceGroup } from './网格.ts';
import { patchWaterShader } from './水面.ts';
import { patchLeafShader, tintedLeafExpr } from '../light/树叶透光.ts';

const VERT_HEAD = `
attribute vec4 tex;
attribute vec4 col;
varying vec2 vBUv; varying vec2 vTex; varying vec4 vCol; varying vec3 vW; varying vec3 vUpV; varying float vTop;`;
const FRAG_HEAD = `
uniform sampler2D blockAtlas;
uniform float selfLight;
varying vec2 vBUv; varying vec2 vTex; varying vec4 vCol; varying vec3 vW; varying vec3 vUpV; varying float vTop;
float specMask;
float stepK;
float farK;
uniform float aoPass;
${blockAtlasGlsl()}`;
// 镂空：按第 0 级的透明度丢像素（Voxy quads.frag）；随机转：草方块、泥土这类方块的顶面按这一格在世界里的位置转 0/90/180/270°
const fragMap = (cutout: boolean) => `
  {
    float fl = floor(vTex.x / 4096.0 + 0.001);
    float layer = vTex.x - fl * 4096.0;
    bool tinted = mod(fl, 2.0) > 0.5;
    vec2 uv = vBUv;
    vec2 tc = uv * 16.0;
    float lod = clamp(log2(max(max(length(dFdx(tc)), length(dFdy(tc))), 1e-6)), 0.0, 4.0);
    // 台阶并色的远处系数（见文件头）：一格在画布上约 6 个像素以下开始、约 2 个像素混满；贴图往 1×1 的平均色取
    farK = vTop < 65000.0 ? smoothstep(0.16, 0.5, length(fwidth(vW))) : 0.0;
    lod = mix(lod, 4.0, farK);
    vec2 f = fract(uv);
    if (fl > 1.5) {
      vec2 cell = floor(vW.xz);
      float h = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
      vec2 c = f - 0.5;
      c = h < 0.25 ? c : h < 0.5 ? vec2(-c.y, c.x) : h < 0.75 ? -c : vec2(c.y, -c.x);
      f = clamp(c + 0.5, 0.0, 0.9999);
    }
    vec2 auv = atlasUv(layer, f);
    vec4 t = textureLod(blockAtlas, auv, lod);
    // 高光按贴图花纹压（见 高光随贴图）：这一点的亮度 ÷ 整张贴图的平均亮度（多级纹理第 4 级 1×1 就是平均），平均下来还是 1
    {
      const vec3 Y = vec3(0.2126, 0.7152, 0.0722);
      float la = dot(textureLod(blockAtlas, auv, 4.0).rgb, Y);
      specMask = la > 1e-4 ? clamp(dot(t.rgb, Y) / la, 0.0, 2.5) : 1.0;
    }
    ${cutout ? 'if (textureLod(blockAtlas, auv, 0.0).a < 0.5) discard;\n    t.a = 1.0;' : ''}
    vec3 tint = pow(vCol.rgb, vec3(2.2));
    if (tinted) t.rgb *= tint;
    if (vTex.y < 65000.0) {
      vec2 ouv = atlasUv(vTex.y, f);
      vec4 o = textureLod(blockAtlas, ouv, lod);
      t.rgb = mix(t.rgb, o.rgb * tint, mix(step(0.5, textureLod(blockAtlas, ouv, 0.0).a), o.a, farK));
    }
    // 台阶并色（见文件头）：一格在画面上小了，顶面、侧面都往两面各一半的颜色混
    {
      vec3 gn = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
      float k = farK;
      stepK = k * (1.0 - abs(dot(gn, vUpV)));
      if (k > 0.0) {
        float tf = floor(vTop / 4096.0 + 0.001);
        vec4 tt = textureLod(blockAtlas, atlasUv(vTop - tf * 4096.0, f), lod);
        if (tf > 0.5) tt.rgb *= tint;
        t.rgb = mix(t.rgb, tt.rgb, 0.5 * k);
      }
    }
    diffuseColor.rgb *= t.rgb;
    diffuseColor.a *= t.a;
  }`;

export type MaterialClass = '实心' | '镂空' | '实心树叶' | '水' | '花草';
const mats = new Map<MaterialClass, THREE.Material>();
export const voxelMaterial = (materialClass: MaterialClass) => {
  let cached = mats.get(materialClass);
  if (cached) return cached;
  const atlas = blockAtlas();
  const mat = new THREE.MeshStandardMaterial({
    roughness: materialClass === '水' ? 0.1 : 0.95,
    metalness: 0,
    flatShading: true,
    emissive: '#ffffff',
    transparent: materialClass === '水',
    depthWrite: materialClass !== '水',
  });
  const tex = materialClass === '实心树叶' ? atlas.solid : atlas.original;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.blockAtlas = { value: tex };
    sh.uniforms.selfLight = selfLight;
    sh.uniforms.aoPass = aoPassUniform;
    // vW：世界坐标里的格（随机转按格算）：网格的 modelMatrix 已经含了缩放（一格 格 米），除回去
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_HEAD}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vBUv = uv / 16.0; vTex = tex.xy; vTop = tex.z; vCol = col; vW = (modelMatrix * vec4(position, 1.0)).xyz / max(length(modelMatrix[0].xyz) * 64.0, 1e-6); vUpV = normalize(normalMatrix * vec3(0.0, 0.0, 1.0));');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
      .replace('#include <map_fragment>', fragMap(materialClass === '镂空' || materialClass === '花草'))
      // 台阶并色：侧面的法线往竖直向上混一半，和顶面的光靠近
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal = normalize(mix(normal, vUpV, stepK));')
      // 水的高光是倒影（粗糙度 0.1），不压
      .replace('#include <aomap_fragment>', materialClass === '水' ? '#include <aomap_fragment>' : '#include <aomap_fragment>\n  reflectedLight.directSpecular *= specMask;\n  reflectedLight.indirectSpecular *= specMask;')
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance = diffuseColor.rgb * selfLight;')
      // 屏幕 AO 第 1 遍（aoPass = 1）：alpha 输出 AO 减掉的比例（见 远处AO），AO 按 1 − alpha 压（lib/体素/屏幕AO.tsx）
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>\n  if (aoPass > 0.5) gl_FragColor.a = smoothstep(${farAo.start.toFixed(1)}, ${farAo.full.toFixed(1)}, length(vViewPosition)) * ${(1 - farAo.keep).toFixed(3)};`);
    // 水：波纹、菲涅尔、天光反射，和导出网格的水同一段（lib/水面.ts）
    if (materialClass === '水') patchWaterShader(sh);
    // 树叶逆光透出暖色，和导出网格的树叶同一段（lib/树叶透光.ts）；镂空里不染色的（玻璃之类）不算
    if (materialClass === '镂空' || materialClass === '实心树叶') patchLeafShader(sh, tintedLeafExpr('vCol'));
  };
  mat.customProgramCacheKey = () => `体素-${materialClass}`;
  // 屏幕空间 AO（lib/体素/屏幕AO.tsx）：方块压暗（同 Voxy 只压 LOD 地形）；花草不挡也不压（游戏平滑光照里花草本来也不挡光）；水半透明，AO 之后再画
  if (materialClass === '花草') mat.userData.屏幕AO = '不挡';
  else if (materialClass !== '水') {
    mat.userData.屏幕AO = '压暗';
    mat.userData.AO按alpha = true;
  } else mat.userData.水面 = true;
  mats.set(materialClass, mat);
  return mat;
};

// 所有网格共用一份四边形索引（0 1 2 0 2 3，每面 +4），按用到的最大面数长；共用同一个 BufferAttribute，显存里只有一份
let sharedQuadIndex: THREE.BufferAttribute | null = null;
const quadIndexFor = (quads: number) => {
  if (!sharedQuadIndex || sharedQuadIndex.count < quads * 6) {
    const quadCount = Math.max(quads, sharedQuadIndex ? (sharedQuadIndex.count / 6) * 2 : 1 << 16);
    const indices = new Uint32Array(quadCount * 6);
    for (let quad = 0; quad < quadCount; quad++) indices.set([quad * 4, quad * 4 + 1, quad * 4 + 2, quad * 4, quad * 4 + 2, quad * 4 + 3], quad * 6);
    sharedQuadIndex = new THREE.BufferAttribute(indices, 1);
  }
  return sharedQuadIndex;
};

// 一组面 → 网格（全部朝向都在里面，每帧用 挑朝向 只画朝着镜头的几组）。原点：体素块原点（世界坐标，米）；格：一格几米；盒子：范围（场景坐标）
export type VoxelMesh = THREE.Mesh & { userData: { 段: number[] } };
export const faceGroupMesh = (group: FaceGroup, materialClass: MaterialClass, origin: number[], cellM: number, box: number[]): VoxelMesh | null => {
  if (!group.n) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(group.pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(group.uv, 2));
  geo.setAttribute('tex', new THREE.BufferAttribute(group.tex, 4));
  geo.setAttribute('col', new THREE.BufferAttribute(group.col, 4, true));
  geo.setIndex(quadIndexFor(group.n));
  geo.setDrawRange(0, group.n * 6);
  // 位置存的是 以格为单位 × 64 的整数：网格缩小 64 / 格 倍；包围球按盒子给（three 自己算会按整数坐标算）
  const k = posScale / cellM;
  const center = [(box[0] + box[3]) / 2 - origin[0], (box[1] + box[4]) / 2 - origin[1], (box[2] + box[5]) / 2 - origin[2]];
  const radius = Math.hypot(box[3] - box[0], box[4] - box[1], box[5] - box[2]) / 2;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(center[0] * k, center[1] * k, center[2] * k), radius * k);
  const mesh = new THREE.Mesh(geo, [voxelMaterial(materialClass)]) as unknown as VoxelMesh;
  mesh.userData.段 = group.段;
  mesh.position.set(origin[0], origin[1], origin[2]);
  mesh.scale.setScalar(1 / k);
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
};

// 只画看得见的几组朝向（看得见[g]：第 g 组朝着镜头）：连续几组并成一段一次绘制。只给了前 7 组（`背光朝向`）时，裙边四组跟着各自朝向走
export const pickDirs = (mesh: VoxelMesh, visible: boolean[]) => {
  const groupStarts = mesh.userData.段;
  const geo = mesh.geometry;
  geo.clearGroups();
  let start = -1;
  for (let k = 0; k <= groupCount; k++) {
    const on = k < groupCount && (k < visible.length ? visible[k] : visible[k - skirtGroupStart]);
    if (on && start < 0) start = groupStarts[k];
    if (!on && start >= 0) {
      if (groupStarts[k] > start) geo.addGroup(start * 6, (groupStarts[k] - start) * 6, 0);
      start = -1;
    }
  }
  mesh.visible = geo.groups.length > 0;
};

// ---------- 投影（暮色主光的地形软投影，见 lib/级联阴影.ts）----------
// 阴影遍按 geometry.groups 画，而 `挑朝向` 把一组都不剩的块整块 visible = false，影子会随镜头转向时有时无。所以另建一个只进阴影图的网格：
// 和画面网格共用同一批 BufferAttribute，面组按光向挑背光的几组（three 阴影遍对正面材质画背面，背光面就是光看过去的「背面」，阴影图存出来那面的深度，受光面不会被自己的影子盖住）。
// 主画面不画它：three 主画面和阴影遍都用 intersectsFrustum 挑物体，只有级联阴影的视锥才放行。
// 花草、水不投影；镂空树叶按实心投影（阴影图用 three 自带深度材质，远处看的是整团树冠的影子）。
const shadowMaterial = new THREE.MeshBasicMaterial();
function shadowOnlyFrustumTest(this: THREE.Mesh, frustum: THREE.Frustum) {
  return shadowFrustums.has(frustum) && frustum.intersectsObject(this);
}
export const shadowMesh = (mesh: VoxelMesh): VoxelMesh => {
  const geo = new THREE.BufferGeometry();
  for (const [k, attr] of Object.entries(mesh.geometry.attributes)) geo.setAttribute(k, attr);
  geo.setIndex(mesh.geometry.index);
  geo.setDrawRange(0, mesh.geometry.drawRange.count);
  geo.boundingSphere = mesh.geometry.boundingSphere;
  const castMesh = new THREE.Mesh(geo, [shadowMaterial]) as unknown as VoxelMesh;
  castMesh.userData.段 = mesh.userData.段;
  castMesh.matrix.copy(mesh.matrix);
  castMesh.matrixAutoUpdate = false;
  castMesh.castShadow = true;
  castMesh.intersectsFrustum = shadowOnlyFrustumTest;
  return castMesh;
};
// 背光的朝向（+x -x +y -y +z -z 不沿轴，裙边跟着各自的朝向，见 挑朝向）：法线和光向（指向光源）点积小于 0 的那几组，不沿轴的面两面都可能背光，都画
export const backlitDirs = (lightDir: V3) => [lightDir[0] < 0, lightDir[0] > 0, lightDir[1] < 0, lightDir[1] > 0, lightDir[2] < 0, lightDir[2] > 0, true];
