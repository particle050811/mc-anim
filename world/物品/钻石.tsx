// 钻石（6-1-1 丢进花圈水池激活暮色传送门的那颗）。
// 要求：立体的真钻石质感、多边形棱角分明、偏蓝，不要游戏里平面像素风的钻石；外形参照原版钻石物品的轮廓和以前的 AI 素材（正篇/06-古城寻卷/1-暮色森林/1-进入森林/钻石.png）；
// 整颗是椭球体，横截面是圆，从哪个水平方向看轮廓都一样。
//
// 外形：绕竖轴（贴图的上方，模型 +Z）的刻面回转体，单位是贴图像素（原版 item/diamond.png，npm run 取材 -- 钻石）：
// - 竖向轮廓（每个高度的半径）取自贴图：每行不透明像素的半宽。最宽的几行定腰，最上、最下一行定两头的尖，上下两半各拟合一条超椭圆 (r/R)^p + (dz/H)^p = 1（上半更尖，p 小一点），轮廓是凸的；
// - 顶点排成几圈，每圈 `SIDES` 个，沿轮廓按弧长排开（按法线角度排的话，上半尖附近会挤满碎小刻面）；相邻两圈错开半格，之间是一圈三角形刻面（像明亮式切工的冠部和亭部），
//   腰上两圈对齐，之间是一圈竖直的窄长方形（腰棱），顶上和底下各一个尖；
// - 围出来是凸多面体，每个刻面一个平面。几何就是这组平面围出来的形体，着色器也只认这组平面，两边一定对得上。
// 质感（自己写的着色器；three 的 transmission 只折射一次、没有内部全反射，看起来像淡玻璃）：
// - 在模型坐标里做光线追踪：从刻面折射进去，在里面逐个刻面算菲涅耳反射 / 全反射 / 折射出去，追 `BOUNCES` 次。凸多面体求出射面只要对所有平面取最近的交点，不用 BVH；
// - 色散：几个波长各追一遍（折射率差放大 `DISPERSION` 倍），亮区边缘散成彩虹；吸收：在里面走得越远越青蓝；
// - 刻面不单独染色，偏蓝全靠吸收和偏蓝的环境，刻面之间的深浅靠环境里的明暗；
// - 环境是着色器里程序生成的影棚（偏青天光渐变 + 柔边灯箱 + 柔光和暗区 + 后方环形灯），固定在世界坐标里（钻石转动时闪光跟着变），照机位在南边（场景 -Y，6-1-1 的机位都在这边）调的。
//   不拿场景本身当环境：钻石要在明暗分明的环境里才闪，草地和海反射出来是一片灰绿。
// 不受场景灯光影响，也没有泛光（bloom）。
// 大小：`size` 是整颗的宽（格，腰的直径），默认 0.32。原点在中心，竖轴是 +Z。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { png } from '../../engine/model/贴图.ts';
import tex from 'asset:贴图/物品/钻石';

// ---------- 外形 ----------
const SIDES = 16; // 每圈的边数：腰是正 16 边形
// 上半（冠）、下半（亭）各圈顶点在轮廓上的位置：从尖到腰这段弧长的几分之几，从尖往腰数
const CROWN = [0.3, 0.57, 0.82];
const PAVILION = [0.3, 0.57, 0.82];
const GIRDLE = 0.3; // 腰棱半高（像素，整颗高 13）

// ---------- 光学 ----------
const IOR = 2.42;
const DISPERSION = 7; // 真钻石 C 线到 F 线的折射率差约 0.026，太小在画面里看不出彩虹
const BOUNCES = 7;
const ENV_R = 30; // 环境球半径（像素，整颗宽 12）
// 吸收（每像素路程）：红吸收最多、绿其次，越厚越青蓝
const SIGMA: [number, number, number] = [0.028, 0.01, 0.004];
// 色散采样：几个波长的折射率偏移（以真钻石为单位）和它在 RGB 里的份量，各通道份量之和为 1
const SPECTRUM: { dn: number; w: [number, number, number] }[] = [
  // 不采紫光：两头的红和紫同时亮、中间暗时会混出一块块粉紫
  { dn: -0.012, w: [0.45, 0.0, 0.0] }, // 红
  { dn: -0.006, w: [0.4, 0.2, 0.0] }, // 橙黄
  { dn: 0.0, w: [0.15, 0.45, 0.05] }, // 黄绿
  { dn: 0.008, w: [0.0, 0.3, 0.35] }, // 青
  { dn: 0.018, w: [0.0, 0.05, 0.6] }, // 蓝
];

// ---------- 环境（three 的世界坐标：Y 朝上，正面机位在 +Z）----------
// 灯箱：中心方向、半宽、半高（中心方向切平面上的长度）、亮度、边缘柔和程度（占尺寸的比例）。
// 灯箱边缘硬了会满眼锐利的碎片
type Light = { dir: [number, number, number]; w: number; h: number; i: number; e: number };
const LIGHTS: Light[] = [
  { dir: [0.35, -0.3, -0.89], w: 0.45, h: 0.3, i: 3.5, e: 0.7 }, // 右下后方主光：透过整颗看到的主要是后方
  { dir: [-0.45, 0.42, 0.79], w: 0.32, h: 0.42, i: 4, e: 0.3 }, // 左上前方：正对机位的刻面反射出白面
  { dir: [0.62, 0.22, 0.75], w: 0.07, h: 0.55, i: 3.5, e: 0.5 }, // 右前竖条
  { dir: [0.55, 0.1, -0.83], w: 0.09, h: 0.65, i: 3.5, e: 0.5 }, // 右后竖条
  { dir: [0.05, 0.98, 0.2], w: 0.7, h: 0.1, i: 3, e: 0.4 }, // 顶上横条
  { dir: [-0.9, -0.05, 0.1], w: 0.12, h: 0.4, i: 3, e: 0.4 }, // 左侧
  { dir: [0.95, 0.25, 0.0], w: 0.25, h: 0.12, i: 3, e: 0.4 }, // 右侧
  { dir: [0.1, 0.35, -0.93], w: 0.1, h: 0.1, i: 5, e: 0.7 }, // 正后方小灯
  { dir: [-0.2, -0.25, -0.95], w: 0.22, h: 0.06, i: 3, e: 0.5 }, // 后下横条
  { dir: [0.3, -0.35, 0.89], w: 0.18, h: 0.08, i: 2.5, e: 0.5 }, // 前下横条
  // 几根细灯管：透过刻面看到的是一道道亮线，色散后成彩虹条
  { dir: [-0.2, 0.15, -0.97], w: 0.03, h: 0.8, i: 4, e: 0.8 },
  { dir: [0.35, -0.05, -0.94], w: 0.6, h: 0.03, i: 3.5, e: 0.8 },
  { dir: [-0.7, 0.2, 0.68], w: 0.04, h: 0.7, i: 3.5, e: 0.8 },
  // 几个很小很亮的点光：刻面偶尔正好对上，就是一个白亮的闪点
  { dir: [-0.15, -0.1, -0.98], w: 0.025, h: 0.025, i: 14, e: 0.5 },
  { dir: [0.4, 0.3, -0.87], w: 0.025, h: 0.025, i: 14, e: 0.5 },
  { dir: [-0.5, 0.05, -0.86], w: 0.025, h: 0.025, i: 14, e: 0.5 },
  { dir: [0.2, 0.55, 0.81], w: 0.025, h: 0.025, i: 14, e: 0.5 },
];
// 柔光（加亮）和暗区（压暗）：中心方向、集中程度、强度
type Lobe = { dir: [number, number, number]; k: number; i: number };
const GLOWS: Lobe[] = [
  { dir: [0.3, -0.3, -0.9], k: 10, i: 2.5 },
  { dir: [-0.5, 0.6, 0.62], k: 6, i: 1.5 },
];
// 环形灯：和正后方的夹角（度）、宽度（余弦差）、亮度
const RING: [number, number, number] = [48, 0.06, 2.5];
// 暗区让刻面之间有深浅：整颗像一个凸透镜，透过去看到的是后方很大一片环境，后方没有暗的地方的话满眼一片发白
const SHADES: Lobe[] = [
  { dir: [0.75, -0.1, -0.65], k: 5, i: 0.8 },
  { dir: [-0.3, -0.6, -0.74], k: 4, i: 0.7 },
  { dir: [0.5, -0.3, 0.8], k: 4, i: 0.7 },
  { dir: [-0.45, 0.45, -0.77], k: 9, i: 0.75 },
  { dir: [0.55, 0.5, -0.67], k: 9, i: 0.75 },
  { dir: [-0.7, -0.2, -0.68], k: 9, i: 0.7 },
];

// 半边轮廓：腰的半径 R，从腰到尖的高 H，超椭圆指数 p
type Half = { H: number; p: number };

// 竖向轮廓：贴图每行不透明像素的半宽（行中心的高度上），最宽的几行的中间是腰，最上、最下一行的外沿是尖。
// 上下两半各取让各行半宽误差平方和最小的 p
const profile = () => {
  const img = png(tex);
  const texSize = img.w;
  const rows: { z: number; h: number }[] = [];
  for (let j = 0; j < texSize; j++) {
    let [minX, maxX] = [texSize, -1];
    for (let i = 0; i < texSize; i++) if (img.px[(j * texSize + i) * 4 + 3] > 0) [minX, maxX] = [Math.min(minX, i), Math.max(maxX, i)];
    if (maxX >= minX) rows.push({ z: -j - 0.5, h: (maxX - minX + 1) / 2 });
  }
  const radius = Math.max(...rows.map((r) => r.h));
  const widest = rows.filter((r) => r.h === radius);
  const waist = widest.reduce((s, r) => s + r.z, 0) / widest.length;
  const [top, bottom] = [rows[0].z + 0.5, rows[rows.length - 1].z - 0.5];
  const fit = (height: number, side: number): Half => {
    let [best, bp] = [Infinity, 2];
    for (let exp = 1.2; exp <= 3; exp += 0.01) {
      let err = 0;
      for (const row of rows) {
        const dz = (row.z - waist) * side;
        if (dz > 0) err += (radius * Math.max(0, 1 - (dz / height) ** exp) ** (1 / exp) - row.h) ** 2;
      }
      if (err < best) [best, bp] = [err, exp];
    }
    return { H: height, p: bp };
  };
  // 原点放在上下两个尖的正中
  return { R: radius, waist: waist - (top + bottom) / 2, crown: fit(top - waist, 1), pavilion: fit(waist - bottom, -1) };
};

// 半边轮廓上从尖量起、弧长占（尖到离腰 GIRDLE 高处）这段的 t 的点：返回 (半径, 离腰的高度)。
// 超椭圆按角度参数 r = R·cos^(2/p)θ、dz = H·sin^(2/p)θ 密采样，累加弧长后插值
const pointAt = (radius: number, { H: height, p: exp }: Half, t: number): [number, number] => {
  const pts: [number, number][] = [];
  for (let k = 0; k <= 2000; k++) {
    const th = ((1 - k / 2000) * Math.PI) / 2;
    const dz = height * Math.sin(th) ** (2 / exp);
    if (dz < GIRDLE) break;
    pts.push([radius * Math.cos(th) ** (2 / exp), dz]);
  }
  const acc = [0];
  for (let k = 1; k < pts.length; k++) acc.push(acc[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  const targetLen = t * acc[acc.length - 1];
  let k = 1;
  while (k < pts.length - 1 && acc[k] < targetLen) k++;
  const frac = (targetLen - acc[k - 1]) / (acc[k] - acc[k - 1]);
  return [pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * frac, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * frac];
};

// 刻面平面：n·p ≤ d 是钻石里面
type Plane = { n: THREE.Vector3; d: number };

// 一个平面上的凸多边形，被其余平面依次裁掉外侧（Sutherland–Hodgman），剩下的就是这个刻面
const facePolygon = (pl: Plane, all: Plane[]): THREE.Vector3[] => {
  const normal = pl.n;
  const t1 = new THREE.Vector3(Math.abs(normal.x) < 0.9 ? 1 : 0, Math.abs(normal.x) < 0.9 ? 0 : 1, 0).cross(normal).normalize();
  const t2 = new THREE.Vector3().crossVectors(normal, t1); // (t1, t2, n) 右手系：顶点按 n 逆时针
  const center = normal.clone().multiplyScalar(pl.d);
  const halfSize = 60;
  let poly = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([du, dv]) => center.clone().addScaledVector(t1, du * halfSize).addScaledVector(t2, dv * halfSize));
  for (const clipPlane of all) {
    if (clipPlane === pl || !poly.length) continue;
    const side = (p: THREE.Vector3) => clipPlane.d - clipPlane.n.dot(p);
    const inp = poly;
    poly = [];
    for (let j = 0; j < inp.length; j++) {
      const ptA = inp[j];
      const ptB = inp[(j + 1) % inp.length];
      const sa = side(ptA);
      const sb = side(ptB);
      if (sa >= 0) poly.push(ptA);
      if (sa >= 0 !== sb >= 0) poly.push(ptA.clone().lerp(ptB, sa / (sa - sb)));
    }
  }
  return poly;
};

const polyArea = (poly: THREE.Vector3[]) => {
  const sum = new THREE.Vector3();
  for (let k = 1; k + 1 < poly.length; k++) sum.add(new THREE.Vector3().subVectors(poly[k], poly[0]).cross(new THREE.Vector3().subVectors(poly[k + 1], poly[0])));
  return sum.length() / 2;
};

export const diamondGeometry = () => {
  const { R: radius, waist, crown, pavilion } = profile();

  // 顶点圈：半径、高度、方位错开几格（0 或 0.5）。从顶尖往下排，相邻两圈错开半格，腰上两圈对齐
  type Ring = { r: number; z: number; phase: number };
  const rings: Ring[] = [{ r: 0, z: waist + crown.H, phase: 0 }];
  let phase = 0;
  for (const t of CROWN) {
    const [ringR, dz] = pointAt(radius, crown, t);
    rings.push({ r: ringR, z: waist + dz, phase });
    phase = 0.5 - phase;
  }
  const girdleR = (h: Half) => radius * (1 - (GIRDLE / h.H) ** h.p) ** (1 / h.p);
  rings.push({ r: girdleR(crown), z: waist + GIRDLE, phase }, { r: girdleR(pavilion), z: waist - GIRDLE, phase });
  for (const t of [...PAVILION].reverse()) {
    phase = 0.5 - phase;
    const [ringR, dz] = pointAt(radius, pavilion, t);
    rings.push({ r: ringR, z: waist - dz, phase });
  }
  rings.push({ r: 0, z: waist - pavilion.H, phase: 0 });

  const vert = (ring: Ring, i: number) => {
    const angle = ((i + ring.phase) * 2 * Math.PI) / SIDES;
    return new THREE.Vector3(ring.r * Math.cos(angle), ring.r * Math.sin(angle), ring.z);
  };
  // 相邻两圈之间的刻面（顶点列表），再算成平面，法线朝外
  const planes: Plane[] = [];
  const face = (...vs: THREE.Vector3[]) => {
    const normal = new THREE.Vector3().subVectors(vs[1], vs[0]).cross(new THREE.Vector3().subVectors(vs[2], vs[0])).normalize();
    let offset = normal.dot(vs[0]);
    if (offset < 0) {
      normal.negate();
      offset = -offset;
    }
    planes.push({ n: normal, d: offset });
  };
  for (let k = 0; k + 1 < rings.length; k++) {
    const [ringA, ringB] = [rings[k], rings[k + 1]];
    for (let i = 0; i < SIDES; i++) {
      if (ringA.r === 0) face(vert(ringA, 0), vert(ringB, i), vert(ringB, i + 1));
      else if (ringB.r === 0) face(vert(ringA, i), vert(ringA, i + 1), vert(ringB, 0));
      else if (ringA.phase === ringB.phase) face(vert(ringA, i), vert(ringA, i + 1), vert(ringB, i + 1), vert(ringB, i));
      else {
        // a 圈第 i、i+1 个顶点之间夹着 b 圈的第 s 个：一个尖朝下、一个尖朝上的三角形
        const bIdx = ringB.phase > ringA.phase ? i : i + 1;
        face(vert(ringA, i), vert(ringA, i + 1), vert(ringB, bIdx));
        face(vert(ringB, bIdx), vert(ringB, bIdx + 1), vert(ringA, i + 1));
      }
    }
  }

  // 每个平面裁出刻面（参数调得不凸时，这里得到的仍是这组平面围出来的凸多面体，和着色器一致）
  const pos: number[] = [];
  const faceId: number[] = [];
  const kept: Plane[] = [];
  for (const pl of planes) {
    const poly = facePolygon(pl, planes);
    if (poly.length < 3 || polyArea(poly) < 1e-4) continue;
    const id = kept.length;
    kept.push(pl);
    for (let tri = 1; tri + 1 < poly.length; tri++)
      for (const pt of [poly[0], poly[tri], poly[tri + 1]]) {
        pos.push(pt.x, pt.y, pt.z);
        faceId.push(id);
      }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('face', new THREE.Float32BufferAttribute(faceId, 1));

  // 刻面表：每列一个刻面 (法线, d)
  const faceCount = kept.length;
  const data = new Float32Array(faceCount * 4);
  kept.forEach((pl, x) => data.set([pl.n.x, pl.n.y, pl.n.z, pl.d], x * 4));
  const table = new THREE.DataTexture(data, faceCount, 1, THREE.RGBAFormat, THREE.FloatType);
  table.needsUpdate = true;
  return { geo, width: 2 * radius, table, count: faceCount };
};

const fmt = (x: number) => x.toFixed(5);
const v3 = (a: number[]) => `vec3(${a.map(fmt).join(',')})`;
const lobe = (g: Lobe) => `vec4(${v3(new THREE.Vector3(...g.dir).normalize().toArray())},${fmt(g.k)})`;

// 对数深度那几段（logdepthbuf）：6-1-1 海岛那一半的画布开了对数深度，自己写的着色器不接的话写出的深度和别的物体对不上，
// 整颗被身后的池水、地形挡掉；没开对数深度的画布里这几段是空的
const vertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute float face;
  flat varying float vFace;
  varying vec3 vObj;
  flat varying vec3 vCam;
  flat varying mat3 vRot;
  void main() {
    vFace = face;
    vObj = position;
    vCam = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
    mat3 m = mat3(modelMatrix);
    vRot = mat3(normalize(m[0]), normalize(m[1]), normalize(m[2]));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  uniform sampler2D uTable;
  uniform int uCount;
  flat varying float vFace;
  varying vec3 vObj;
  flat varying vec3 vCam;
  flat varying mat3 vRot;

  const int NL = ${LIGHTS.length};
  const vec3 LDIR[NL] = vec3[NL](${LIGHTS.map((l) => v3(new THREE.Vector3(...l.dir).normalize().toArray())).join(',')});
  const vec4 LSIZE[NL] = vec4[NL](${LIGHTS.map((l) => `vec4(${[l.w, l.h, l.i, l.e].map(fmt).join(',')})`).join(',')});
  const int NG = ${GLOWS.length};
  const vec4 GLOW[NG] = vec4[NG](${GLOWS.map(lobe).join(',')});
  const float GLOWI[NG] = float[NG](${GLOWS.map((g) => fmt(g.i)).join(',')});
  const int NSH = ${SHADES.length};
  const vec4 SHADE[NSH] = vec4[NSH](${SHADES.map(lobe).join(',')});
  const float SHADEI[NSH] = float[NSH](${SHADES.map((g) => fmt(g.i)).join(',')});
  const int NS = ${SPECTRUM.length};
  const float SIOR[NS] = float[NS](${SPECTRUM.map((s) => fmt(IOR + s.dn * DISPERSION)).join(',')});
  const vec3 SW[NS] = vec3[NS](${SPECTRUM.map((s) => v3(s.w)).join(',')});
  const vec3 SIGMA = ${v3(SIGMA)};

  // 程序生成的影棚环境（世界坐标，Y 朝上；机位在 +Z 一侧，即场景的南边）
  vec3 env(vec3 d) {
    float y = d.y;
    vec3 col = mix(vec3(0.05, 0.12, 0.16), vec3(0.2, 0.4, 0.6), smoothstep(-0.6, 0.0, y));
    col = mix(col, vec3(0.9, 1.0, 1.05), smoothstep(0.3, 1.0, y));
    for (int k = 0; k < NL; k++) {
      vec3 c = LDIR[k];
      float z = dot(d, c);
      if (z <= 0.0) continue;
      vec3 up = abs(c.y) > 0.95 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
      vec3 rx = normalize(cross(up, c));
      vec3 ry = cross(c, rx);
      vec2 q = vec2(dot(d, rx), dot(d, ry)) / z;
      vec4 s = LSIZE[k];
      float m = (1.0 - smoothstep(s.x * (1.0 - s.w), s.x, abs(q.x))) * (1.0 - smoothstep(s.y * (1.0 - s.w), s.y, abs(q.y)));
      col += m * s.z * vec3(0.96, 1.0, 1.06);
    }
    // 后方一圈环形灯
    col += ${fmt(RING[2])} * exp(-pow((dot(d, vec3(0.0, 0.0, -1.0)) - ${fmt(Math.cos((RING[0] * Math.PI) / 180))}) / ${fmt(RING[1])}, 2.0)) * vec3(0.95, 1.0, 1.05);
    for (int k = 0; k < NG; k++) col += GLOWI[k] * exp((dot(d, GLOW[k].xyz) - 1.0) * GLOW[k].w) * vec3(0.95, 1.0, 1.0);
    // 暗区往深蓝里压，不是压成灰
    for (int k = 0; k < NSH; k++) col = mix(col, col * vec3(0.28, 0.55, 0.78), SHADEI[k] * exp((dot(d, SHADE[k].xyz) - 1.0) * SHADE[k].w));
    return col;
  }

  // 环境放在离钻石 ENV_R 远的球面上，而不是无穷远：无穷远的话一块平刻面射出去的光方向全一样，每面只有一个颜色，
  // 像一块块色卡；放近了同一面里不同位置看到环境的不同地方，刻面里才有渐变和光带
  vec3 envAt(vec3 p, vec3 d) {
    float b = dot(p, d);
    float c = dot(p, p) - ${fmt(ENV_R * ENV_R)};
    float t = -b + sqrt(max(b * b - c, 0.0));
    return env(vRot * normalize(p + d * t));
  }

  float fresnel(float cosi, float etai, float etat) {
    float sint = etai / etat * sqrt(max(0.0, 1.0 - cosi * cosi));
    if (sint >= 1.0) return 1.0;
    float cost = sqrt(max(0.0, 1.0 - sint * sint));
    float rs = (etat * cosi - etai * cost) / (etat * cosi + etai * cost);
    float rp = (etai * cosi - etat * cost) / (etai * cosi + etat * cost);
    return 0.5 * (rs * rs + rp * rp);
  }

  // 从钻石内部 p 点沿 d 方向追光：每碰到一个刻面，折射出去的部分取环境色，反射的部分接着追
  vec3 trace(vec3 p, vec3 d, float ior, int last) {
    vec3 acc = vec3(0.0);
    float w = 1.0;
    float dist = 0.0;
    for (int b = 0; b < ${BOUNCES}; b++) {
      int hit = -1;
      float tMin = 1e4;
      for (int i = 0; i < uCount; i++) {
        if (i == last) continue;
        vec4 pl = texelFetch(uTable, ivec2(i, 0), 0);
        float dn = dot(pl.xyz, d);
        if (dn > 1e-5) {
          float t = (pl.w - dot(pl.xyz, p)) / dn;
          if (t < tMin) { tMin = t; hit = i; }
        }
      }
      if (hit < 0) break;
      tMin = max(tMin, 0.0);
      p += d * tMin;
      dist += tMin;
      vec3 n = texelFetch(uTable, ivec2(hit, 0), 0).xyz;
      vec3 att = exp(-SIGMA * dist);
      vec3 o = refract(d, -n, ior);
      float fr = dot(o, o) > 0.0 ? fresnel(dot(d, n), ior, 1.0) : 1.0;
      if (fr < 1.0) acc += w * (1.0 - fr) * att * envAt(p, o);
      w *= fr;
      d = reflect(d, n);
      last = hit;
    }
    // 追完还剩的能量：当作朝当前方向出去
    acc += w * exp(-SIGMA * dist) * envAt(p, d);
    return acc;
  }

  void main() {
    #include <logdepthbuf_fragment>
    int fi = int(vFace + 0.5);
    vec3 V = normalize(vObj - vCam);
    vec3 n = texelFetch(uTable, ivec2(fi, 0), 0).xyz;
    float cosi = max(-dot(V, n), 0.0);
    float F = fresnel(cosi, 1.0, ${fmt(IOR)});
    vec3 col = F * envAt(vObj, reflect(V, n));
    vec3 tr = vec3(0.0);
    for (int s = 0; s < NS; s++) {
      vec3 d = refract(V, n, 1.0 / SIOR[s]);
      tr += SW[s] * trace(vObj, d, SIOR[s], fi);
    }
    col += (1.0 - F) * tr;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// size：整颗的宽（格）
export const Diamond: React.FC<{ size?: number; position?: [number, number, number]; rotation?: [number, number, number] }> = ({
  size = 0.32,
  position,
  rotation,
}) => {
  const { geo, width, table, count } = useMemo(diamondGeometry, []);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTable: { value: table }, uCount: { value: count } },
        vertexShader,
        fragmentShader,
      }),
    [table, count],
  );
  return (
    <group position={position} rotation={rotation}>
      <mesh geometry={geo} material={mat} scale={size / width} castShadow />
    </group>
  );
};
