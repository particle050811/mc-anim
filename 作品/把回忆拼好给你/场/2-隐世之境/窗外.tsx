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
import { 归隐之地, 樱花林, 远山 } from './参数.ts';
import { 樱花树, type 格 } from './樱花树.ts';
import { 原版雾色, 地形, 地形雾起止, 坡上的树, 坡上的花, 结构占地, type 面们 } from './远山.ts';
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
const 地面缺口: readonly (readonly [number, number, number, number])[] = [
  [11, -17, 16, -16],
  [2, -16, 3, -15],
  [0, -26, 1, -24],
];

/** 占地里去掉缺口剩下的格子，按行并成长方形 */
const 占地铺面 = () => {
  const [x0, y0, x1, y1] = 结构占地;
  const 缺 = (x: number, y: number) => 地面缺口.some(([a, b, c, d]) => x >= a && x < c && y >= b && y < d);
  const out: [number, number, number, number][] = [];
  for (let y = y0; y < y1; y++) {
    let 起: number | null = null;
    for (let x = x0; x <= x1; x++) {
      const 铺 = x < x1 && !缺(x, y);
      if (铺 && 起 === null) 起 = x;
      if (!铺 && 起 !== null) {
        out.push([起, y, x, y + 1]);
        起 = null;
      }
    }
  }
  return out;
};

/** 方块贴图：最近邻放大；远处按多级纹理缩（同 方块网格.tsx，免得出摩尔纹）。地面、坡面按场景坐标取 uv，要重复 */
const 贴图 = (px: Uint8Array, w: number, h: number, 重复 = false) => {
  const t = new THREE.DataTexture(px, w, h, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.generateMipmaps = true;
  if (重复) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
};
const 图 = (uri: string, 重复 = false) => {
  const p = png(uri);
  return 贴图(p.px, p.w, p.h, 重复);
};

/** 颜色的 sRGB 数值（0～1，不换成线性）：着色器里、贴图像素上按 sRGB 数值乘、混（同游戏） */
const sRGB数 = (hex: string) => {
  const c = new THREE.Color().setStyle(hex, THREE.LinearSRGBColorSpace);
  return new THREE.Vector3(c.r, c.g, c.b);
};

/** 草方块侧面：原版先画 grass_block_side，再把灰的草边（overlay）按草色染了盖上去（草边不透明的像素整个盖住） */
const 草侧图 = () => {
  const [底, 边] = [png(grassSideUri), png(grassSideOverlayUri)];
  const 染 = sRGB数(归隐之地.草).toArray();
  const px = new Uint8Array(底.px);
  for (let i = 0; i < px.length; i += 4)
    if (边.px[i + 3]! > 0) for (let c = 0; c < 3; c++) px[i + c] = Math.round(边.px[i + c]! * 染[c]!);
  return 贴图(px, 底.w, 底.h, true);
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

/** 几块水平的长方形 [x0, y0, x1, y1]（高 z）拼成一个几何，uv 就是场景 x、y：贴图每格一张、和方块格子对齐（RepeatWrapping） */
const 平面们 = (矩形们: readonly (readonly [number, number, number, number])[], z: number) => {
  const f: 面们 = { 位: [], uv: [], 法: [], 序: [] };
  矩形们.forEach(([x0, y0, x1, y1], i) => {
    f.位.push(x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z);
    f.uv.push(x0, y0, x1, y0, x1, y1, x0, y1);
    f.法.push(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1);
    f.序.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  });
  return 几何(f);
};

const 几何 = (f: 面们) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(f.位, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(f.法, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(f.uv, 2));
  g.setIndex(f.序);
  return g;
};

const 摆 = (mesh: THREE.InstancedMesh, 格们: 格[]) => {
  const m = new THREE.Matrix4();
  格们.forEach(([x, y, z], i) => mesh.setMatrixAt(i, m.makeTranslation(x + 0.5, y + 0.5, z + 0.5)));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
};

// ---------- 原版的雾和天（远山.ts 的 原版雾色、地形雾起止、天雾） ----------
const 雾统一量 = {
  mcFogColor: { value: new THREE.Vector3(...原版雾色(归隐之地.天, 归隐之地.雾, 远山.视距)) },
  mcFogRange: { value: new THREE.Vector2(...地形雾起止(远山.视距)) },
};

/** 给材质补上原版地形雾：材质算完颜色（opaque_fragment）以后按柱形距离混雾色，sRGB 数值上混（同游戏）；雾是 0 的片元原样不动 */
const 加雾 = <M extends THREE.Material>(m: M): M => {
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, 雾统一量);
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

const 天顶点 = ['varying vec3 vMcDir;', 'void main() {', '\tvec4 w = modelMatrix * vec4( position, 1.0 );', '\tvMcDir = w.xyz - cameraPosition;', '\tgl_Position = projectionMatrix * viewMatrix * w;', '}'].join('\n');
// 远山.ts 的 天雾：天盘在上方 16 格、半径 512，雾距从盘心 16 线性插到盘边 512，smoothstep(0, 视距×16)；盘边以下是清屏的雾色
const 天片元 = [
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
const 天穹 = () => {
  const 料 = new THREE.ShaderMaterial({
    uniforms: { mcSky: { value: sRGB数(归隐之地.天) }, mcFogColor: 雾统一量.mcFogColor, mcSkyFar: { value: 远山.视距 * 16 } },
    vertexShader: 天顶点,
    fragmentShader: 天片元,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  });
  const 球 = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), 料);
  球.position.set(10, -13, 0);
  球.renderOrder = -1000;
  球.frustumCulled = false;
  return 球;
};

export const 窗外樱花林: React.FC = () => {
  const 物 = useMemo(() => {
    const 林 = 布林();
    const 坡树 = 坡上的树();
    const 木 = [...林.木, ...坡树.木];
    const 叶 = [...林.叶, ...坡树.叶];
    const 花: [number, number, number, number][] = [...林.花.map(([x, y, k]): [number, number, number, number] => [x, y, 0, k]), ...坡上的花()];
    // BoxGeometry 的四个侧面贴图竖着朝 +y（three 的 Y 朝上），绕 x 转 90° 让它朝 +z，原木的树皮纹才是竖的。
    // 转完六个面的顺序：+x −x 顶 底 南 北
    const 方块 = new THREE.BoxGeometry(1, 1, 1).rotateX(Math.PI / 2);
    const 木侧 = 加雾(new THREE.MeshStandardMaterial({ map: 图(logUri), roughness: 1 }));
    const 木顶 = 加雾(new THREE.MeshStandardMaterial({ map: 图(logTopUri), roughness: 1 }));
    const 木网 = 摆(new THREE.InstancedMesh(方块, [木侧, 木侧, 木顶, 木顶, 木侧, 木侧], 木.length), 木);
    const 叶料 = 加雾(new THREE.MeshStandardMaterial({ map: 图(leavesUri), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 }));
    const 叶网 = 摆(new THREE.InstancedMesh(方块, 叶料, 叶.length), 叶);
    const 地料 = 加雾(new THREE.MeshStandardMaterial({ map: 图(grassUri, true), color: new THREE.Color(归隐之地.草), roughness: 1 }));
    const 草侧料 = 加雾(new THREE.MeshStandardMaterial({ map: 草侧图(), roughness: 1 }));
    const 土料 = 加雾(new THREE.MeshStandardMaterial({ map: 图(dirtUri, true), roughness: 1 }));
    // 占地里去掉缺口的格子，顶面压低 0.01 藏在方块顶面底下；占地里整块再垫在 z −1.01。占地外面是远山的地形（同样压低 0.01）
    const 面 = 地形();
    const 几何们 = { 占地: 平面们(占地铺面(), -0.01), 垫层: 平面们([结构占地], -1.01), 顶: 几何(面.顶), 草侧: 几何(面.草侧), 土侧: 几何(面.土侧) };
    const 地们 = [
      new THREE.Mesh(几何们.占地, 地料),
      new THREE.Mesh(几何们.垫层, 地料),
      new THREE.Mesh(几何们.顶, 地料),
      new THREE.Mesh(几何们.草侧, 草侧料),
      new THREE.Mesh(几何们.土侧, 土料),
    ];
    const 花料 = 加雾(new THREE.MeshStandardMaterial({ map: 图(petalsUri), alphaTest: 0.5, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }));
    const 花片 = new THREE.PlaneGeometry(1, 1);
    const 花网 = new THREE.InstancedMesh(花片, 花料, 花.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    花.forEach(([x, y, h, k], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), (k * Math.PI) / 2);
      花网.setMatrixAt(i, m.compose(new THREE.Vector3(x + 0.5, y + 0.5, h + 3 / 16 - 0.01), q, new THREE.Vector3(1, 1, 1)));
    });
    花网.instanceMatrix.needsUpdate = true;
    花网.computeBoundingSphere();
    for (const o of [木网, 叶网, ...地们, 花网]) o.receiveShadow = true;
    木网.castShadow = 叶网.castShadow = true;
    const 天 = 天穹();
    return {
      物件: [天, ...地们, 花网, 木网, 叶网],
      料们: [木侧, 木顶, 叶料, 地料, 草侧料, 土料, 花料, 天.material],
      几何们: [方块, 花片, ...Object.values(几何们), 天.geometry],
    };
  }, []);
  useEffect(
    () => () => {
      for (const m of 物.料们) {
        (m as THREE.MeshStandardMaterial).map?.dispose();
        m.dispose();
      }
      for (const g of 物.几何们) g.dispose();
    },
    [物],
  );
  return (
    <>
      {物.物件.map((o) => (
        <primitive key={o.uuid} object={o} />
      ))}
    </>
  );
};
