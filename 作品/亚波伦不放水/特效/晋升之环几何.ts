// 晋升之环三个自制候选的几何（只引 three，不引资产）：全部是顺滑的真几何（车削的棱环、圆管、绞丝、珠粒、切面宝石、倒角的挤出件），
// 纹样也是真几何，没有贴图。风格依据见 精工材质.ts 文件头。名字、外径、转速在 晋升之环形.ts。
// 环坐标：环面在 XY 平面，+Z 朝正面的观众，单位是戴的人的模型像素。零件按材质类并成网格，颜色写进顶点色（线性值）。
// 正反两面做成一样的（从背后看也是完整的环）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { candidateSpecs, type CandidateName } from './晋升之环形.ts';
import type { MaterialClass } from './精工材质.ts';

type P2 = readonly [number, number];
const radPerDeg = Math.PI / 180;
const ringTau = Math.PI * 2;

// 金（抛光）、槽底和背阴处的暗金；宝石四色取原贴图的红、橙、品红、黄绿（提了饱和度，受光后落回原色附近）；光是偏暖的白金，不用纯白
const colorPalette = { gold: '#e8b04a', paleGold: '#f2c870', darkGold: '#8a5424', red: '#c8141e', orange: '#e06410', magenta: '#b8106a', yellowGreen: '#94c820', 光: '#ffe9b0', lightGold: '#ffcf78' } as const;
// 光芒、光框用的颜色（不受光，直接是画面上的颜色）
const spikeColors = { red: '#ff4050', orange: '#ff9030', magenta: '#f03090', yellowGreen: '#d0f060' } as const;

export type RingPiece = { type: MaterialClass; geo: THREE.BufferGeometry };
/** 一层：几个网格加这一刻的摆法（写进 出 并返回） */
export type RingLayer = { parts: RingPiece[]; poseAt: (sec: number, out: THREE.Matrix4) => THREE.Matrix4 };
export type HaloBand = { radius: number; width: number; 色: string; strength: number };
export type RingBody = { layers: RingLayer[]; haloBands: HaloBand[]; /** 晕片的半边长 */ haloHalfSize: number };

const toLinear = (hex: string, brightness = 1): [number, number, number] => {
  const c = new THREE.Color(hex);
  return [c.r * brightness, c.g * brightness, c.b * brightness];
};
const paint = (g: THREE.BufferGeometry, hex: string, brightness = 1) => {
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  const c = toLinear(hex, brightness);
  for (let i = 0; i < n; i++) col.set(c, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
};

class GeoBin {
  private buckets = new Map<MaterialClass, THREE.BufferGeometry[]>();
  /** 色 不给：geo 自带顶点色 */
  加(matKind: MaterialClass, geo: THREE.BufferGeometry, hex?: string, m?: THREE.Matrix4, brightness = 1): this {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (m) g.applyMatrix4(m);
    if (hex) paint(g, hex, brightness);
    const colList = this.buckets.get(matKind) ?? [];
    colList.push(g);
    this.buckets.set(matKind, colList);
    return this;
  }
  出(): RingPiece[] {
    return [...this.buckets].map(([matKind, gs]) => ({ type: matKind, geo: mergeGeometries(gs)! }));
  }
}

const translate = (x: number, y: number, z = 0) => new THREE.Matrix4().makeTranslation(x, y, z);
const rotateZ = (angle: number) => new THREE.Matrix4().makeRotationZ(angle);
/** 先在原点摆好的零件挪到环上：半径 r、角 a（弧度）处，零件的 +X 朝外、+Y 沿切线 */
const onRing = (r: number, a: number, z = 0) => rotateZ(a).multiply(translate(r, 0, z));
/** 正反两面各放一份（绕 Y 翻半圈） */
const twoFaces = (m: THREE.Matrix4) => [m, new THREE.Matrix4().makeRotationY(Math.PI).multiply(m)];

/** 切面：每个三角一个法线（宝石、晶体的平面） */
const cutFace = (geo: THREE.BufferGeometry) => {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('normal');
  g.computeVertexNormals();
  return g;
};

/**
 * 棱环：截面（[半径, z] 的闭合多边形）绕 Z 轴车一圈。截面每条边一条带，带内沿圈平滑，带和带之间是硬棱（金工的倒角、槽靠这个）。
 * 色(边) 给每条边的颜色
 */
const edgedRing = (profile: readonly P2[], edgeColorAt: (edgeT: number) => string, segCount = 256): THREE.BufferGeometry => {
  let area = 0;
  for (let i = 0; i < profile.length; i++) {
    const [p, q] = [profile[i]!, profile[(i + 1) % profile.length]!];
    area += p[0] * q[1] - q[0] * p[1];
  }
  const sign = area > 0 ? 1 : -1;
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  for (let i = 0; i < profile.length; i++) {
    const [p, q] = [profile[i]!, profile[(i + 1) % profile.length]!];
    const [dr, dz] = [q[0] - p[0], q[1] - p[1]];
    const vecLength = Math.hypot(dr, dz);
    const [nr, nz] = [(sign * dz) / vecLength, (-sign * dr) / vecLength];
    const c = toLinear(edgeColorAt(i));
    // 绕向：面朝法线那边是正面。逆时针的截面里 p→q 再沿圈走是反的，按 号 定
    for (let k = 0; k < segCount; k++) {
      const [a0, a1] = [(k / segCount) * ringTau, ((k + 1) / segCount) * ringTau];
      const ringPoint = (s: P2, a: number) => [s[0] * Math.cos(a), s[0] * Math.sin(a), s[1]];
      const [A, B, C, D] = [ringPoint(p, a0), ringPoint(q, a0), ringPoint(q, a1), ringPoint(p, a1)];
      const triangles = sign > 0 ? [A, C, B, A, D, C] : [A, B, C, A, C, D];
      const angles = sign > 0 ? [a0, a1, a0, a0, a1, a1] : [a0, a0, a1, a0, a1, a1];
      triangles.forEach((v, j) => {
        pos.push(v[0]!, v[1]!, v[2]!);
        nor.push(nr * Math.cos(angles[j]!), nr * Math.sin(angles[j]!), nz);
        col.push(c[0], c[1], c[2]);
      });
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
};

/** 圆管环（环面在 XY 平面） */
const torus = (R: number, r: number, ringSegments = 256, tubeSegments = 20) => new THREE.TorusGeometry(R, r, tubeSegments, ringSegments);
const sphere = (r: number, segCount = 16) => new THREE.SphereGeometry(r, segCount, Math.max(8, Math.round(segCount * 0.6)));

class ParamCurve extends THREE.Curve<THREE.Vector3> {
  private f: (t: number, target: THREE.Vector3) => void;
  constructor(f: (t: number, target: THREE.Vector3) => void) {
    super();
    this.f = f;
  }
  override getPoint(t: number, target = new THREE.Vector3()) {
    this.f(t, target);
    return target;
  }
}
/** 沿闭合的参数线（t 0～1）做圆管 */
const closedTube = (f: (t: number, out: THREE.Vector3) => void, r: number, tubeSegs: number, tubeSegments = 10) => new THREE.TubeGeometry(new ParamCurve(f), tubeSegs, r, tubeSegments, true);
/** 沿一串点的平滑曲线做圆管（两头不封，头上另放小球盖住） */
const tubeGeometry = (points: readonly (readonly [number, number, number?])[], r: number, tubeSegs = 48, tubeSegments = 10) =>
  new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2] ?? 0)), false, 'centripetal'), tubeSegs, r, tubeSegments, false);

/** 绞丝环：股 根圆丝绕着半径 R 的圆互相缠 缠数 圈（金工的绞丝边） */
const twistWire = (bin: GeoBin, R: number, radiusOffset: number, wireThick: number, wrapCount: number, strands = 2, z = 0, hex: string = colorPalette.gold) => {
  for (let s = 0; s < strands; s++) {
    const phase = (s / strands) * ringTau;
    bin.加(
      '金',
      closedTube(
        (t, out) => {
          const [a, b] = [t * ringTau, t * ringTau * wrapCount + phase];
          const r = R + radiusOffset * Math.cos(b);
          out.set(r * Math.cos(a), r * Math.sin(a), z + radiusOffset * Math.sin(b));
        },
        wireThick,
        wrapCount * 14,
        8,
      ),
      hex,
    );
  }
};
/** 珠粒圈：n 颗小球排在半径 R 的圆上（金工的联珠） */
const beadRing = (bin: GeoBin, matKind: MaterialClass, R: number, beadRadius: number, n: number, z = 0, hex: string = colorPalette.gold, startAngle = 0) => {
  for (let i = 0; i < n; i++) bin.加(matKind, sphere(beadRadius, 12), hex, onRing(R, startAngle + (i / n) * ringTau, z));
};

/** 圆明亮切的宝石：腰在 z = 0、半径 R，冠高 冠（台面朝 +Z），亭深 亭；边 条腰棱 */
const roundGem = (R: number, crown: number, pavilion: number, segments = 10) => {
  const g = new THREE.LatheGeometry([new THREE.Vector2(0, -pavilion), new THREE.Vector2(R, 0), new THREE.Vector2(R * 0.82, crown * 0.55), new THREE.Vector2(R * 0.56, crown), new THREE.Vector2(0, crown)], segments);
  g.rotateX(Math.PI / 2);
  return cutFace(g);
};
/** 阶梯切的方宝石：腰是边长 2R 的正方形，冠分两级台阶 */
const squareGem = (R: number, crown: number, pavilion: number) => {
  const k = Math.SQRT2;
  const g = new THREE.LatheGeometry([new THREE.Vector2(0, -pavilion), new THREE.Vector2(R * k, 0), new THREE.Vector2(R * k * 0.8, crown * 0.5), new THREE.Vector2(R * k * 0.55, crown), new THREE.Vector2(0, crown)], 4);
  g.rotateY(Math.PI / 4);
  g.rotateX(Math.PI / 2);
  return cutFace(g);
};
/** 双尖晶体：六棱柱两头收尖，长轴沿 X */
const crystalGeometry = (R: number, length: number, tipHeight: number) => {
  const h = length / 2;
  const g = new THREE.LatheGeometry([new THREE.Vector2(0, -h), new THREE.Vector2(R * 0.55, -h + tipHeight * 0.45), new THREE.Vector2(R, -h + tipHeight), new THREE.Vector2(R, h - tipHeight), new THREE.Vector2(R * 0.55, h - tipHeight * 0.45), new THREE.Vector2(0, h)], 6);
  g.rotateZ(-Math.PI / 2);
  return cutFace(g);
};
/** 圆包镶：宝石外面一圈金的小棱环（内径 R，立在 z 0～高），宝石坐在里面 */
const bezel = (R: number, wallThick: number, height: number) =>
  edgedRing(
    [
      [R, 0],
      [R + wallThick, 0],
      [R + wallThick, height * 0.7],
      [R + wallThick * 0.5, height],
      [R, height * 0.85],
    ],
    () => colorPalette.gold,
    40,
  );

const roundedSquare = (halfSize: number, cornerRadius: number, cornerSegs = 6): THREE.Vector2[] => {
  const points: THREE.Vector2[] = [];
  for (const [cx, cy, a0] of [[halfSize - cornerRadius, halfSize - cornerRadius, 0], [-halfSize + cornerRadius, halfSize - cornerRadius, 90], [-halfSize + cornerRadius, -halfSize + cornerRadius, 180], [halfSize - cornerRadius, -halfSize + cornerRadius, 270]] as const)
    for (let i = 0; i <= cornerSegs; i++) {
      const a = (a0 + (90 * i) / cornerSegs) * radPerDeg;
      points.push(new THREE.Vector2(cx + cornerRadius * Math.cos(a), cy + cornerRadius * Math.sin(a)));
    }
  return points;
};
/** 倒了圆角的板（中心在原点，z 从 −厚/2 到 +厚/2），洞 可挖一个同心的圆角方洞 */
const squarePlate = (halfSize: number, cornerRadius: number, thickness: number, bevel: number, hole?: { halfSize: number; angle: number }) => {
  const squareShape = new THREE.Shape(roundedSquare(halfSize, cornerRadius));
  if (hole) squareShape.holes.push(new THREE.Path(roundedSquare(hole.halfSize, hole.angle).reverse()));
  const g = new THREE.ExtrudeGeometry(squareShape, { depth: thickness - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 3, curveSegments: 6 });
  g.translate(0, 0, -thickness / 2 + bevel);
  return g;
};

/** 回字方座（原贴图四角的方块）：圆角金板，面上一圈凸起的回字框，框里坐一颗阶梯切方宝石；正反两面都有。中心在原点，边沿着 X、Y */
const concentricBase = (bin: GeoBin, m: THREE.Matrix4, halfSize: number, thickness: number, gemColor: string) => {
  bin.加('金', squarePlate(halfSize, halfSize * 0.22, thickness, 0.07), colorPalette.gold, m);
  for (const face of twoFaces(new THREE.Matrix4())) {
    const faceMatrix = m.clone().multiply(face);
    // 外框（细）、内框（粗一点，托住宝石）
    bin.加('金', squarePlate(halfSize * 0.9, halfSize * 0.16, 0.12, 0.04, { halfSize: halfSize * 0.78, angle: halfSize * 0.1 }), colorPalette.paleGold, faceMatrix.clone().multiply(translate(0, 0, thickness / 2 + 0.04)));
    bin.加('暗金', new THREE.PlaneGeometry(halfSize * 1.56, halfSize * 1.56), colorPalette.darkGold, faceMatrix.clone().multiply(translate(0, 0, thickness / 2 + 0.005)));
    bin.加('金', squarePlate(halfSize * 0.6, halfSize * 0.1, 0.2, 0.05, { halfSize: halfSize * 0.44, angle: halfSize * 0.05 }), colorPalette.gold, faceMatrix.clone().multiply(translate(0, 0, thickness / 2 + 0.08)));
    bin.加('宝石', squareGem(halfSize * 0.45, 0.24, 0.12), gemColor, faceMatrix.clone().multiply(translate(0, 0, thickness / 2 + 0.1)));
    // 四角各一颗小珠（铆钉）
    for (const [sx, sy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]] as const) bin.加('金', sphere(halfSize * 0.07, 10), colorPalette.paleGold, faceMatrix.clone().multiply(translate(sx * halfSize * 0.69, sy * halfSize * 0.69, thickness / 2 + 0.03)));
  }
};

const rotateAroundCenter = (degPerSec: number, phaseDeg = 0) => (sec: number, out: THREE.Matrix4) => out.makeRotationZ((phaseDeg + degPerSec * sec) * radPerDeg);

// ── 甲：金属圣环 ──
const buildCandidateA = (): RingBody => {
  const speeds = candidateSpecs.甲.layerSpeeds;
  // 外环：带槽的棱环（两面各一道槽），槽里波纹金丝加珠粒，外沿绞丝，内沿一圈细珠
  const outerBox = new GeoBin();
  const [innerRadius, outerRadius, halfThickness, grooveDepth] = [8.55, 9.95, 0.3, 0.13];
  const profile: P2[] = [
    [innerRadius, -halfThickness + 0.09],
    [innerRadius + 0.09, -halfThickness],
    [innerRadius + 0.3, -halfThickness],
    [innerRadius + 0.37, -halfThickness + grooveDepth],
    [outerRadius - 0.37, -halfThickness + grooveDepth],
    [outerRadius - 0.3, -halfThickness],
    [outerRadius - 0.09, -halfThickness],
    [outerRadius, -halfThickness + 0.09],
    [outerRadius, halfThickness - 0.09],
    [outerRadius - 0.09, halfThickness],
    [outerRadius - 0.3, halfThickness],
    [outerRadius - 0.37, halfThickness - grooveDepth],
    [innerRadius + 0.37, halfThickness - grooveDepth],
    [innerRadius + 0.3, halfThickness],
    [innerRadius + 0.09, halfThickness],
    [innerRadius, halfThickness - 0.09],
  ];
  // 槽底（第 3、11 条边）是暗金，其余抛光
  const grooveFloor = new Set([3, 11]);
  outerBox.加('金', edgedRing(profile, (i) => (grooveFloor.has(i) ? colorPalette.darkGold : colorPalette.gold)));
  const midRadius = (innerRadius + outerRadius) / 2;
  for (const z of [halfThickness - grooveDepth + 0.03, -(halfThickness - grooveDepth + 0.03)]) {
    // 波纹金丝：一圈 32 个波，波谷波峰之间各一颗小珠
    outerBox.加(
      '金',
      closedTube(
        (t, out) => {
          const a = t * ringTau;
          const r = midRadius + 0.2 * Math.sin(a * 32);
          out.set(r * Math.cos(a), r * Math.sin(a), z);
        },
        0.06,
        32 * 20,
        8,
      ),
      colorPalette.paleGold,
    );
    for (let i = 0; i < 64; i++) {
      const a = ((i + 0.5) / 64) * ringTau;
      outerBox.加('金', sphere(0.062, 10), colorPalette.paleGold, onRing(midRadius + (i % 2 ? 0.2 : -0.2), a, z));
    }
  }
  twistWire(outerBox, outerRadius + 0.13, 0.1, 0.1, 72);
  beadRing(outerBox, '金', innerRadius - 0.1, 0.11, 96, 0, colorPalette.paleGold);
  // 四个对角：回字方座加阶梯切方宝石（红、品红相间）；正上下左右：黄绿圆宝石包镶
  for (let k = 0; k < 4; k++) {
    concentricBase(outerBox, onRing(midRadius, (45 + 90 * k) * radPerDeg), 1.08, 0.78, k % 2 ? colorPalette.magenta : colorPalette.red);
    for (const face of twoFaces(new THREE.Matrix4())) {
      const m = onRing(midRadius, 90 * k * radPerDeg).multiply(face).multiply(translate(0, 0, halfThickness - grooveDepth));
      outerBox.加('金', bezel(0.36, 0.1, 0.3), undefined, m);
      outerBox.加('宝石', roundGem(0.36, 0.2, 0.1), colorPalette.yellowGreen, m.clone().multiply(translate(0, 0, 0.2)));
    }
  }
  // 内环：两道细丝之间夹一圈联珠，八颗橙色小圆宝石
  const innerGroup = new GeoBin();
  innerGroup.加('金', torus(6.95, 0.1), colorPalette.gold).加('金', torus(6.35, 0.1), colorPalette.gold);
  for (let i = 0; i < 80; i++) {
    if (i % 10 === 0) {
      for (const face of twoFaces(new THREE.Matrix4())) {
        const m = onRing(6.65, (i / 80) * ringTau).multiply(face);
        innerGroup.加('金', bezel(0.25, 0.08, 0.22), undefined, m.clone().multiply(translate(0, 0, -0.02)));
        innerGroup.加('宝石', roundGem(0.25, 0.15, 0.08), colorPalette.orange, m.clone().multiply(translate(0, 0, 0.1)));
      }
      innerGroup.加('金', sphere(0.2, 12), colorPalette.gold, onRing(6.65, (i / 80) * ringTau));
    } else innerGroup.加('金', sphere(0.15, 12), colorPalette.paleGold, onRing(6.65, (i / 80) * ringTau));
  }
  // 十字：镂空的四臂（两道外撇的边丝、一道中脊、臂端一道弧，臂上一颗品红圆宝石），臂之间四道细尖芒；中心一圈绞丝围一颗黄绿圆宝石
  const crossBox = new GeoBin();
  for (let k = 0; k < 4; k++) {
    const R = rotateZ(90 * k * radPerDeg);
    const [root, tipPos] = [1.75, 5.75];
    for (const s of [1, -1]) {
      crossBox.加('金', tubeGeometry([[root, s * 0.32], [root + 1.2, s * 0.3], [root + 2.6, s * 0.52], [tipPos, s * 1.25]], 0.1), colorPalette.gold, R);
      crossBox.加('金', sphere(0.17, 12), colorPalette.paleGold, R.clone().multiply(translate(tipPos, s * 1.25)));
    }
    crossBox.加('金', tubeGeometry([[tipPos, 1.25], [tipPos + 0.32, 0.62], [tipPos + 0.42, 0], [tipPos + 0.32, -0.62], [tipPos, -1.25]], 0.1), colorPalette.gold, R);
    crossBox.加('金', tubeGeometry([[root, 0], [3.3, 0]], 0.07, 8), colorPalette.paleGold, R).加('金', tubeGeometry([[4.5, 0], [tipPos + 0.42, 0]], 0.07, 8), colorPalette.paleGold, R);
    for (const face of twoFaces(new THREE.Matrix4())) {
      const m = R.clone().multiply(translate(3.9, 0)).multiply(face);
      crossBox.加('金', bezel(0.42, 0.11, 0.26), undefined, m.clone().multiply(translate(0, 0, -0.06)));
      crossBox.加('宝石', roundGem(0.42, 0.24, 0.1), colorPalette.magenta, m.clone().multiply(translate(0, 0, 0.1)));
    }
    crossBox.加('金', torus(0.53, 0.1, 40, 10), colorPalette.gold, R.clone().multiply(translate(3.9, 0)));
    // 细尖芒：从中心圈斜着出去的一根细锥
    const cone = new THREE.ConeGeometry(0.16, 2.9, 16).rotateZ(-Math.PI / 2);
    crossBox.加('金', cone, colorPalette.paleGold, rotateZ((45 + 90 * k) * radPerDeg).multiply(translate(1.7 + 1.45, 0)));
  }
  twistWire(crossBox, 1.62, 0.09, 0.09, 16);
  crossBox.加('金', torus(1.3, 0.08, 96, 10), colorPalette.gold);
  for (const face of twoFaces(new THREE.Matrix4())) {
    crossBox.加('金', bezel(0.95, 0.16, 0.4), undefined, face.clone().multiply(translate(0, 0, -0.1)));
    crossBox.加('宝石', roundGem(0.95, 0.42, 0.12, 12), colorPalette.yellowGreen, face.clone().multiply(translate(0, 0, 0.14)));
  }
  crossBox.加('暗金', new THREE.CylinderGeometry(1.25, 1.25, 0.16, 48).rotateX(Math.PI / 2), colorPalette.darkGold);
  return {
    layers: [
      { parts: outerBox.出(), poseAt: rotateAroundCenter(speeds.outerSpeed) },
      { parts: innerGroup.出(), poseAt: rotateAroundCenter(speeds.innerSpeed, 22.5) },
      { parts: crossBox.出(), poseAt: rotateAroundCenter(speeds.crossSpeed) },
    ],
    haloBands: [{ radius: 9.2, width: 2.6, 色: '#ff9a40', strength: 0.07 }],
    haloHalfSize: 14,
  };
};

// ── 乙：光之环 ──
/**
 * 一道光芒（平片，加色，沿 +X）：根在 r0，尖在 r0 + 长，最宽处半宽 w（含两边的柔边）。横向分 14 条，中线最亮、往两边按高斯落到 0，没有硬边；
 * 纵向从 根色 过渡到 尖色，再淡到没有。根后面留一小段淡入
 */
const spike = (r0: number, length: number, w: number, rootColor: readonly number[], tipColor: readonly number[]): THREE.BufferGeometry => {
  const pos: number[] = [];
  const col: number[] = [];
  const vertCount = 24;
  const horizontalSamples = Array.from({ length: 15 }, (_, i) => (i - 7) / 7);
  const bottomFloor = Math.exp(-5);
  const crossBright = horizontalSamples.map((v) => Math.max(0, (Math.exp(-5 * v * v) - bottomFloor) / (1 - bottomFloor)));
  const widthAt = (u: number) => w * (u < 0 ? 1 + u / 0.06 : (1 - u) ** 1.3);
  const colorAt = (u: number) => {
    const t = Math.max(0, u);
    const k = Math.min(1, t / 0.5);
    const fade = (u < 0 ? 1 + u / 0.06 : 1) * (1 - t) ** 1.5;
    return [0, 1, 2].map((i) => (rootColor[i]! * (1 - k) + tipColor[i]! * k) * fade);
  };
  const us = [-0.06, ...Array.from({ length: vertCount + 1 }, (_, i) => i / vertCount)];
  for (let i = 0; i < us.length - 1; i++) {
    const [u0, u1] = [us[i]!, us[i + 1]!];
    const [x0, x1, w0, w1, c0, c1] = [r0 + u0 * length, r0 + u1 * length, widthAt(u0), widthAt(u1), colorAt(u0), colorAt(u1)];
    for (let j = 0; j < horizontalSamples.length - 1; j++) {
      const topPoints = [
        [x0, horizontalSamples[j]! * w0, c0, crossBright[j]!],
        [x1, horizontalSamples[j]! * w1, c1, crossBright[j]!],
        [x1, horizontalSamples[j + 1]! * w1, c1, crossBright[j + 1]!],
        [x0, horizontalSamples[j]! * w0, c0, crossBright[j]!],
        [x1, horizontalSamples[j + 1]! * w1, c1, crossBright[j + 1]!],
        [x0, horizontalSamples[j + 1]! * w0, c0, crossBright[j + 1]!],
      ] as const;
      for (const [x, y, c, k] of topPoints) {
        pos.push(x, y, 0);
        col.push(c[0]! * k, c[1]! * k, c[2]! * k);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
};
const makeVariantSecond = (): RingBody => {
  const speeds = candidateSpecs.乙.layerSpeeds;
  const mainRadius = 8.4;
  const ringBox = new GeoBin();
  ringBox.加('光', torus(mainRadius, 0.085, 320, 16), colorPalette.光);
  ringBox.加('光', torus(mainRadius + 0.6, 0.032, 320, 10), colorPalette.lightGold).加('光', torus(mainRadius - 0.6, 0.032, 320, 10), colorPalette.lightGold);
  // 主环和两道细环之间各一圈小光点（联珠的意思）
  for (let i = 0; i < 96; i++) ringBox.加('光', sphere(0.035, 8), colorPalette.lightGold, onRing(mainRadius + (i % 2 ? 0.32 : -0.32), ((i + 0.5) / 96) * ringTau));
  // 32 道光芒，一周期 8 道：长、细、短、细、中、细、短、细；正上下左右是长的，对角是中的
  const platinum = toLinear(colorPalette.光, 1.1);
  const sizeTable: readonly [length: number, width: number, tipColor: string][] = [
    [5.4, 0.3, spikeColors.red],
    [0.9, 0.1, spikeColors.orange],
    [2.1, 0.17, spikeColors.orange],
    [0.9, 0.1, spikeColors.orange],
    [3.6, 0.24, spikeColors.magenta],
    [0.9, 0.1, spikeColors.orange],
    [2.1, 0.17, spikeColors.orange],
    [0.9, 0.1, spikeColors.orange],
  ];
  for (let i = 0; i < 32; i++) {
    const [length, width, tipRatio] = sizeTable[i % 8]!;
    ringBox.加('芒', spike(mainRadius + 0.62, length, width, platinum, toLinear(tipRatio)), undefined, rotateZ((i / 32) * ringTau));
  }
  // 四个对角：菱形小光框（原贴图四角的方块）套在主环上，框里一个小光点；对角那道中等的光芒从框尖上出去
  for (let k = 0; k < 4; k++) {
    const m = onRing(mainRadius, (45 + 90 * k) * radPerDeg);
    ringBox.加('光', new THREE.TorusGeometry(0.86, 0.04, 8, 4), spikeColors.magenta, m).加('光', new THREE.TorusGeometry(0.5, 0.028, 8, 4), colorPalette.lightGold, m).加('光', sphere(0.12, 12), colorPalette.光, m);
  }
  // 正上下左右：环上一颗稍大的光点（长光芒的根）
  for (let k = 0; k < 4; k++) ringBox.加('光', sphere(0.17, 14), colorPalette.光, onRing(mainRadius, 90 * k * radPerDeg));
  // 十字：四道从中心小圆出去的细长光（白金到黄绿），其间四道短的（到橙）；中心两个小圆环
  const crossBox = new GeoBin();
  for (let k = 0; k < 4; k++) {
    crossBox.加('芒', spike(1.2, 6.5, 0.2, platinum, toLinear(spikeColors.yellowGreen)), undefined, rotateZ(90 * k * radPerDeg));
    crossBox.加('芒', spike(1.2, 2.8, 0.12, platinum, toLinear(spikeColors.orange)), undefined, rotateZ((45 + 90 * k) * radPerDeg));
  }
  crossBox.加('光', torus(1.15, 0.05, 96, 10), colorPalette.光).加('光', torus(0.6, 0.03, 64, 8), spikeColors.yellowGreen);
  return {
    layers: [
      { parts: ringBox.出(), poseAt: rotateAroundCenter(speeds.haloSpeed) },
      { parts: crossBox.出(), poseAt: rotateAroundCenter(speeds.crossSpeed) },
    ],
    haloBands: [
      { radius: mainRadius, width: 0.3, 色: '#ffd890', strength: 0.3 },
      { radius: mainRadius + 0.3, width: 2.2, 色: '#ff8a40', strength: 0.13 },
      { radius: mainRadius + 2.0, width: 3.4, 色: '#d03070', strength: 0.05 },
    ],
    haloHalfSize: 20,
  };
};

// ── 丙：星环 ──
const makeVariantThird = (): RingBody => {
  const speeds = candidateSpecs.丙.layerSpeeds;
  const radius = 8.4;
  const layers: RingLayer[] = [];
  // 光丝：细亮线，不转（转了也看不出）
  layers.push({ parts: new GeoBin().加('光', torus(radius, 0.05, 320, 12), colorPalette.光).出(), poseAt: (sec, out) => out.identity() });
  const orbitAngle = (angleDeg: number, sec: number) => (angleDeg + speeds.fullTurnSpeed * sec) * radPerDeg;
  const tmp = new THREE.Matrix4();
  // 四颗双尖晶体：长轴沿半径，腰上三道金箍、两头各一个小金珠，绕长轴自转
  const crystalColors = [colorPalette.red, colorPalette.yellowGreen, colorPalette.magenta, colorPalette.orange];
  for (let k = 0; k < 4; k++) {
    const b = new GeoBin();
    b.加('宝石', crystalGeometry(0.78, 4.3, 1.5), crystalColors[k]!);
    for (const x of [-0.3, 0.3]) b.加('金', torus(0.81, 0.07, 48, 10).rotateY(Math.PI / 2), colorPalette.gold, translate(x, 0));
    b.加('金', torus(0.86, 0.1, 48, 12).rotateY(Math.PI / 2), colorPalette.paleGold);
    for (const s of [1, -1]) b.加('金', sphere(0.11, 12), colorPalette.paleGold, translate(s * 2.2, 0));
    layers.push({
      parts: b.出(),
      poseAt: (sec, out) => out.makeRotationZ(orbitAngle(90 * k, sec)).multiply(tmp.makeTranslation(radius, 0, 0)).multiply(tmp.makeRotationX((speeds.crystalSpinSpeed * sec + k * 37) * radPerDeg)),
    });
  }
  // 四块回字金牌：对角上，面朝观众，一个角朝外，绕半径轴慢慢来回摆
  for (let k = 0; k < 4; k++) {
    const b = new GeoBin();
    concentricBase(b, rotateZ(45 * radPerDeg), 1.12, 0.36, [colorPalette.magenta, colorPalette.red][k % 2]!);
    // 朝里朝外的两个角各一颗小金珠
    for (const s of [1, -1]) b.加('金', sphere(0.14, 12), colorPalette.paleGold, translate(s * 1.66, 0));
    layers.push({
      parts: b.出(),
      poseAt: (sec, out) => out.makeRotationZ(orbitAngle(45 + 90 * k, sec)).multiply(tmp.makeTranslation(radius, 0, 0)).multiply(tmp.makeRotationX(Math.sin(sec * speeds.medalSwingSpeed + k * 1.3) * 22 * radPerDeg)),
    });
  }
  // 八个小链节：金的小圆环里包镶一颗圆宝石（黄绿、橙相间），面朝观众，左右各一颗小金珠压在光丝上；绕半径轴来回摆，和金牌错开
  for (let k = 0; k < 8; k++) {
    const b = new GeoBin();
    b.加('金', torus(0.46, 0.1, 64, 14), colorPalette.gold);
    for (const face of twoFaces(new THREE.Matrix4())) b.加('宝石', roundGem(0.37, 0.3, 0.02, 10), [colorPalette.yellowGreen, colorPalette.orange][k % 2]!, face.clone().multiply(translate(0, 0, 0.0)));
    for (const s of [1, -1]) b.加('金', sphere(0.1, 12), colorPalette.paleGold, translate(0, s * 0.62));
    layers.push({
      parts: b.出(),
      poseAt: (sec, out) => out.makeRotationZ(orbitAngle(22.5 + 45 * k, sec)).multiply(tmp.makeTranslation(radius, 0, 0)).multiply(tmp.makeRotationX(Math.sin(sec * speeds.chainSwingSpeed + k * 2.1) * 14 * radPerDeg)),
    });
  }
  return {
    layers,
    haloBands: [
      { radius: radius, width: 0.3, 色: '#ffd890', strength: 0.25 },
      { radius: radius, width: 2.0, 色: '#ff9040', strength: 0.06 },
    ],
    haloHalfSize: 14,
  };
};

const makers = { 甲: buildCandidateA, 乙: makeVariantSecond, 丙: makeVariantThird } as const;
const ringBodyCache = new Map<CandidateName, RingBody>();
/** 一个候选的几何（建一次，全局共用） */
export const RingBody = (variant: CandidateName): RingBody => {
  let ringBody = ringBodyCache.get(variant);
  if (!ringBody) ringBodyCache.set(variant, (ringBody = makers[variant]()));
  return ringBody;
};
