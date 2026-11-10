// 晋升之环三个自制候选的几何（只引 three，不引资产）：全部是顺滑的真几何（车削的棱环、圆管、绞丝、珠粒、切面宝石、倒角的挤出件），
// 纹样也是真几何，没有贴图。风格依据见 精工材质.ts 文件头。名字、外径、转速在 晋升之环形.ts。
// 环坐标：环面在 XY 平面，+Z 朝正面的观众，单位是戴的人的模型像素。零件按材质类并成网格，颜色写进顶点色（线性值）。
// 正反两面做成一样的（从背后看也是完整的环）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { 候选们, type 候选名 } from './晋升之环形.ts';
import type { 材质类 } from './精工材质.ts';

type P2 = readonly [number, number];
const 度 = Math.PI / 180;
const 圈 = Math.PI * 2;

// 金（抛光）、槽底和背阴处的暗金；宝石四色取原贴图的红、橙、品红、黄绿（提了饱和度，受光后落回原色附近）；光是偏暖的白金，不用纯白
const 色 = { 金: '#e8b04a', 浅金: '#f2c870', 暗金: '#8a5424', 红: '#c8141e', 橙: '#e06410', 品红: '#b8106a', 黄绿: '#94c820', 光: '#ffe9b0', 光金: '#ffcf78' } as const;
// 光芒、光框用的颜色（不受光，直接是画面上的颜色）
const 芒色 = { 红: '#ff4050', 橙: '#ff9030', 品红: '#f03090', 黄绿: '#d0f060' } as const;

export type 件 = { 类: 材质类; geo: THREE.BufferGeometry };
/** 一层：几个网格加这一刻的摆法（写进 出 并返回） */
export type 环层 = { 件们: 件[]; 位姿: (秒: number, 出: THREE.Matrix4) => THREE.Matrix4 };
export type 晕带 = { 半径: number; 宽: number; 色: string; 强: number };
export type 环体 = { 层们: 环层[]; 晕们: 晕带[]; /** 晕片的半边长 */ 晕半: number };

const 线性 = (hex: string, 倍 = 1): [number, number, number] => {
  const c = new THREE.Color(hex);
  return [c.r * 倍, c.g * 倍, c.b * 倍];
};
const 涂 = (g: THREE.BufferGeometry, hex: string, 倍 = 1) => {
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  const c = 线性(hex, 倍);
  for (let i = 0; i < n; i++) col.set(c, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
};

class 箱 {
  private 堆 = new Map<材质类, THREE.BufferGeometry[]>();
  /** 色 不给：geo 自带顶点色 */
  加(类: 材质类, geo: THREE.BufferGeometry, hex?: string, m?: THREE.Matrix4, 倍 = 1): this {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (m) g.applyMatrix4(m);
    if (hex) 涂(g, hex, 倍);
    const 列 = this.堆.get(类) ?? [];
    列.push(g);
    this.堆.set(类, 列);
    return this;
  }
  出(): 件[] {
    return [...this.堆].map(([类, gs]) => ({ 类, geo: mergeGeometries(gs)! }));
  }
}

const 移 = (x: number, y: number, z = 0) => new THREE.Matrix4().makeTranslation(x, y, z);
const 转Z = (角: number) => new THREE.Matrix4().makeRotationZ(角);
/** 先在原点摆好的零件挪到环上：半径 r、角 a（弧度）处，零件的 +X 朝外、+Y 沿切线 */
const 上环 = (r: number, a: number, z = 0) => 转Z(a).multiply(移(r, 0, z));
/** 正反两面各放一份（绕 Y 翻半圈） */
const 两面 = (m: THREE.Matrix4) => [m, new THREE.Matrix4().makeRotationY(Math.PI).multiply(m)];

/** 切面：每个三角一个法线（宝石、晶体的平面） */
const 切面 = (geo: THREE.BufferGeometry) => {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('normal');
  g.computeVertexNormals();
  return g;
};

/**
 * 棱环：截面（[半径, z] 的闭合多边形）绕 Z 轴车一圈。截面每条边一条带，带内沿圈平滑，带和带之间是硬棱（金工的倒角、槽靠这个）。
 * 色(边) 给每条边的颜色
 */
const 棱环 = (廓: readonly P2[], 边色: (边: number) => string, 段 = 256): THREE.BufferGeometry => {
  let 面积 = 0;
  for (let i = 0; i < 廓.length; i++) {
    const [p, q] = [廓[i]!, 廓[(i + 1) % 廓.length]!];
    面积 += p[0] * q[1] - q[0] * p[1];
  }
  const 号 = 面积 > 0 ? 1 : -1;
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  for (let i = 0; i < 廓.length; i++) {
    const [p, q] = [廓[i]!, 廓[(i + 1) % 廓.length]!];
    const [dr, dz] = [q[0] - p[0], q[1] - p[1]];
    const 长 = Math.hypot(dr, dz);
    const [nr, nz] = [(号 * dz) / 长, (-号 * dr) / 长];
    const c = 线性(边色(i));
    // 绕向：面朝法线那边是正面。逆时针的截面里 p→q 再沿圈走是反的，按 号 定
    for (let k = 0; k < 段; k++) {
      const [a0, a1] = [(k / 段) * 圈, ((k + 1) / 段) * 圈];
      const 点 = (s: P2, a: number) => [s[0] * Math.cos(a), s[0] * Math.sin(a), s[1]];
      const [A, B, C, D] = [点(p, a0), 点(q, a0), 点(q, a1), 点(p, a1)];
      const 三角 = 号 > 0 ? [A, C, B, A, D, C] : [A, B, C, A, C, D];
      const 角们 = 号 > 0 ? [a0, a1, a0, a0, a1, a1] : [a0, a0, a1, a0, a1, a1];
      三角.forEach((v, j) => {
        pos.push(v[0]!, v[1]!, v[2]!);
        nor.push(nr * Math.cos(角们[j]!), nr * Math.sin(角们[j]!), nz);
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
const 圆环 = (R: number, r: number, 环段 = 256, 管段 = 20) => new THREE.TorusGeometry(R, r, 管段, 环段);
const 球 = (r: number, 段 = 16) => new THREE.SphereGeometry(r, 段, Math.max(8, Math.round(段 * 0.6)));

class 参数线 extends THREE.Curve<THREE.Vector3> {
  private f: (t: number, 出: THREE.Vector3) => void;
  constructor(f: (t: number, 出: THREE.Vector3) => void) {
    super();
    this.f = f;
  }
  override getPoint(t: number, 出 = new THREE.Vector3()) {
    this.f(t, 出);
    return 出;
  }
}
/** 沿闭合的参数线（t 0～1）做圆管 */
const 闭管 = (f: (t: number, 出: THREE.Vector3) => void, r: number, 段: number, 管段 = 10) => new THREE.TubeGeometry(new 参数线(f), 段, r, 管段, true);
/** 沿一串点的平滑曲线做圆管（两头不封，头上另放小球盖住） */
const 管 = (点们: readonly (readonly [number, number, number?])[], r: number, 段 = 48, 管段 = 10) =>
  new THREE.TubeGeometry(new THREE.CatmullRomCurve3(点们.map((p) => new THREE.Vector3(p[0], p[1], p[2] ?? 0)), false, 'centripetal'), 段, r, 管段, false);

/** 绞丝环：股 根圆丝绕着半径 R 的圆互相缠 缠数 圈（金工的绞丝边） */
const 绞丝 = (箱: 箱, R: number, 偏: number, 丝粗: number, 缠数: number, 股 = 2, z = 0, hex: string = 色.金) => {
  for (let s = 0; s < 股; s++) {
    const 相 = (s / 股) * 圈;
    箱.加(
      '金',
      闭管(
        (t, 出) => {
          const [a, b] = [t * 圈, t * 圈 * 缠数 + 相];
          const r = R + 偏 * Math.cos(b);
          出.set(r * Math.cos(a), r * Math.sin(a), z + 偏 * Math.sin(b));
        },
        丝粗,
        缠数 * 14,
        8,
      ),
      hex,
    );
  }
};
/** 珠粒圈：n 颗小球排在半径 R 的圆上（金工的联珠） */
const 珠圈 = (箱: 箱, 类: 材质类, R: number, 粒: number, n: number, z = 0, hex: string = 色.金, 起 = 0) => {
  for (let i = 0; i < n; i++) 箱.加(类, 球(粒, 12), hex, 上环(R, 起 + (i / n) * 圈, z));
};

/** 圆明亮切的宝石：腰在 z = 0、半径 R，冠高 冠（台面朝 +Z），亭深 亭；边 条腰棱 */
const 圆钻 = (R: number, 冠: number, 亭: number, 边 = 10) => {
  const g = new THREE.LatheGeometry([new THREE.Vector2(0, -亭), new THREE.Vector2(R, 0), new THREE.Vector2(R * 0.82, 冠 * 0.55), new THREE.Vector2(R * 0.56, 冠), new THREE.Vector2(0, 冠)], 边);
  g.rotateX(Math.PI / 2);
  return 切面(g);
};
/** 阶梯切的方宝石：腰是边长 2R 的正方形，冠分两级台阶 */
const 方钻 = (R: number, 冠: number, 亭: number) => {
  const k = Math.SQRT2;
  const g = new THREE.LatheGeometry([new THREE.Vector2(0, -亭), new THREE.Vector2(R * k, 0), new THREE.Vector2(R * k * 0.8, 冠 * 0.5), new THREE.Vector2(R * k * 0.55, 冠), new THREE.Vector2(0, 冠)], 4);
  g.rotateY(Math.PI / 4);
  g.rotateX(Math.PI / 2);
  return 切面(g);
};
/** 双尖晶体：六棱柱两头收尖，长轴沿 X */
const 晶体 = (R: number, 长: number, 尖: number) => {
  const h = 长 / 2;
  const g = new THREE.LatheGeometry([new THREE.Vector2(0, -h), new THREE.Vector2(R * 0.55, -h + 尖 * 0.45), new THREE.Vector2(R, -h + 尖), new THREE.Vector2(R, h - 尖), new THREE.Vector2(R * 0.55, h - 尖 * 0.45), new THREE.Vector2(0, h)], 6);
  g.rotateZ(-Math.PI / 2);
  return 切面(g);
};
/** 圆包镶：宝石外面一圈金的小棱环（内径 R，立在 z 0～高），宝石坐在里面 */
const 包镶 = (R: number, 壁: number, 高: number) =>
  棱环(
    [
      [R, 0],
      [R + 壁, 0],
      [R + 壁, 高 * 0.7],
      [R + 壁 * 0.5, 高],
      [R, 高 * 0.85],
    ],
    () => 色.金,
    40,
  );

const 圆角方 = (半: number, 角: number, 段 = 6): THREE.Vector2[] => {
  const 出: THREE.Vector2[] = [];
  for (const [cx, cy, a0] of [[半 - 角, 半 - 角, 0], [-半 + 角, 半 - 角, 90], [-半 + 角, -半 + 角, 180], [半 - 角, -半 + 角, 270]] as const)
    for (let i = 0; i <= 段; i++) {
      const a = (a0 + (90 * i) / 段) * 度;
      出.push(new THREE.Vector2(cx + 角 * Math.cos(a), cy + 角 * Math.sin(a)));
    }
  return 出;
};
/** 倒了圆角的板（中心在原点，z 从 −厚/2 到 +厚/2），洞 可挖一个同心的圆角方洞 */
const 方板 = (半: number, 角: number, 厚: number, 倒: number, 洞?: { 半: number; 角: number }) => {
  const 形 = new THREE.Shape(圆角方(半, 角));
  if (洞) 形.holes.push(new THREE.Path(圆角方(洞.半, 洞.角).reverse()));
  const g = new THREE.ExtrudeGeometry(形, { depth: 厚 - 2 * 倒, bevelEnabled: true, bevelThickness: 倒, bevelSize: 倒, bevelOffset: -倒, bevelSegments: 3, curveSegments: 6 });
  g.translate(0, 0, -厚 / 2 + 倒);
  return g;
};

/** 回字方座（原贴图四角的方块）：圆角金板，面上一圈凸起的回字框，框里坐一颗阶梯切方宝石；正反两面都有。中心在原点，边沿着 X、Y */
const 回字座 = (箱: 箱, m: THREE.Matrix4, 半: number, 厚: number, 宝石色: string) => {
  箱.加('金', 方板(半, 半 * 0.22, 厚, 0.07), 色.金, m);
  for (const 面 of 两面(new THREE.Matrix4())) {
    const 上 = m.clone().multiply(面);
    // 外框（细）、内框（粗一点，托住宝石）
    箱.加('金', 方板(半 * 0.9, 半 * 0.16, 0.12, 0.04, { 半: 半 * 0.78, 角: 半 * 0.1 }), 色.浅金, 上.clone().multiply(移(0, 0, 厚 / 2 + 0.04)));
    箱.加('暗金', new THREE.PlaneGeometry(半 * 1.56, 半 * 1.56), 色.暗金, 上.clone().multiply(移(0, 0, 厚 / 2 + 0.005)));
    箱.加('金', 方板(半 * 0.6, 半 * 0.1, 0.2, 0.05, { 半: 半 * 0.44, 角: 半 * 0.05 }), 色.金, 上.clone().multiply(移(0, 0, 厚 / 2 + 0.08)));
    箱.加('宝石', 方钻(半 * 0.45, 0.24, 0.12), 宝石色, 上.clone().multiply(移(0, 0, 厚 / 2 + 0.1)));
    // 四角各一颗小珠（铆钉）
    for (const [sx, sy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]] as const) 箱.加('金', 球(半 * 0.07, 10), 色.浅金, 上.clone().multiply(移(sx * 半 * 0.69, sy * 半 * 0.69, 厚 / 2 + 0.03)));
  }
};

const 绕环心 = (每秒度: number, 相位度 = 0) => (秒: number, 出: THREE.Matrix4) => 出.makeRotationZ((相位度 + 每秒度 * 秒) * 度);

// ── 甲：金属圣环 ──
const 造甲 = (): 环体 => {
  const 速 = 候选们.甲.层速;
  // 外环：带槽的棱环（两面各一道槽），槽里波纹金丝加珠粒，外沿绞丝，内沿一圈细珠
  const 外 = new 箱();
  const [内径, 外径, 半厚, 槽深] = [8.55, 9.95, 0.3, 0.13];
  const 廓: P2[] = [
    [内径, -半厚 + 0.09],
    [内径 + 0.09, -半厚],
    [内径 + 0.3, -半厚],
    [内径 + 0.37, -半厚 + 槽深],
    [外径 - 0.37, -半厚 + 槽深],
    [外径 - 0.3, -半厚],
    [外径 - 0.09, -半厚],
    [外径, -半厚 + 0.09],
    [外径, 半厚 - 0.09],
    [外径 - 0.09, 半厚],
    [外径 - 0.3, 半厚],
    [外径 - 0.37, 半厚 - 槽深],
    [内径 + 0.37, 半厚 - 槽深],
    [内径 + 0.3, 半厚],
    [内径 + 0.09, 半厚],
    [内径, 半厚 - 0.09],
  ];
  // 槽底（第 3、11 条边）是暗金，其余抛光
  const 槽底 = new Set([3, 11]);
  外.加('金', 棱环(廓, (i) => (槽底.has(i) ? 色.暗金 : 色.金)));
  const 中径 = (内径 + 外径) / 2;
  for (const z of [半厚 - 槽深 + 0.03, -(半厚 - 槽深 + 0.03)]) {
    // 波纹金丝：一圈 32 个波，波谷波峰之间各一颗小珠
    外.加(
      '金',
      闭管(
        (t, 出) => {
          const a = t * 圈;
          const r = 中径 + 0.2 * Math.sin(a * 32);
          出.set(r * Math.cos(a), r * Math.sin(a), z);
        },
        0.06,
        32 * 20,
        8,
      ),
      色.浅金,
    );
    for (let i = 0; i < 64; i++) {
      const a = ((i + 0.5) / 64) * 圈;
      外.加('金', 球(0.062, 10), 色.浅金, 上环(中径 + (i % 2 ? 0.2 : -0.2), a, z));
    }
  }
  绞丝(外, 外径 + 0.13, 0.1, 0.1, 72);
  珠圈(外, '金', 内径 - 0.1, 0.11, 96, 0, 色.浅金);
  // 四个对角：回字方座加阶梯切方宝石（红、品红相间）；正上下左右：黄绿圆宝石包镶
  for (let k = 0; k < 4; k++) {
    回字座(外, 上环(中径, (45 + 90 * k) * 度), 1.08, 0.78, k % 2 ? 色.品红 : 色.红);
    for (const 面 of 两面(new THREE.Matrix4())) {
      const m = 上环(中径, 90 * k * 度).multiply(面).multiply(移(0, 0, 半厚 - 槽深));
      外.加('金', 包镶(0.36, 0.1, 0.3), undefined, m);
      外.加('宝石', 圆钻(0.36, 0.2, 0.1), 色.黄绿, m.clone().multiply(移(0, 0, 0.2)));
    }
  }
  // 内环：两道细丝之间夹一圈联珠，八颗橙色小圆宝石
  const 内 = new 箱();
  内.加('金', 圆环(6.95, 0.1), 色.金).加('金', 圆环(6.35, 0.1), 色.金);
  for (let i = 0; i < 80; i++) {
    if (i % 10 === 0) {
      for (const 面 of 两面(new THREE.Matrix4())) {
        const m = 上环(6.65, (i / 80) * 圈).multiply(面);
        内.加('金', 包镶(0.25, 0.08, 0.22), undefined, m.clone().multiply(移(0, 0, -0.02)));
        内.加('宝石', 圆钻(0.25, 0.15, 0.08), 色.橙, m.clone().multiply(移(0, 0, 0.1)));
      }
      内.加('金', 球(0.2, 12), 色.金, 上环(6.65, (i / 80) * 圈));
    } else 内.加('金', 球(0.15, 12), 色.浅金, 上环(6.65, (i / 80) * 圈));
  }
  // 十字：镂空的四臂（两道外撇的边丝、一道中脊、臂端一道弧，臂上一颗品红圆宝石），臂之间四道细尖芒；中心一圈绞丝围一颗黄绿圆宝石
  const 十 = new 箱();
  for (let k = 0; k < 4; k++) {
    const R = 转Z(90 * k * 度);
    const [根, 端] = [1.75, 5.75];
    for (const s of [1, -1]) {
      十.加('金', 管([[根, s * 0.32], [根 + 1.2, s * 0.3], [根 + 2.6, s * 0.52], [端, s * 1.25]], 0.1), 色.金, R);
      十.加('金', 球(0.17, 12), 色.浅金, R.clone().multiply(移(端, s * 1.25)));
    }
    十.加('金', 管([[端, 1.25], [端 + 0.32, 0.62], [端 + 0.42, 0], [端 + 0.32, -0.62], [端, -1.25]], 0.1), 色.金, R);
    十.加('金', 管([[根, 0], [3.3, 0]], 0.07, 8), 色.浅金, R).加('金', 管([[4.5, 0], [端 + 0.42, 0]], 0.07, 8), 色.浅金, R);
    for (const 面 of 两面(new THREE.Matrix4())) {
      const m = R.clone().multiply(移(3.9, 0)).multiply(面);
      十.加('金', 包镶(0.42, 0.11, 0.26), undefined, m.clone().multiply(移(0, 0, -0.06)));
      十.加('宝石', 圆钻(0.42, 0.24, 0.1), 色.品红, m.clone().multiply(移(0, 0, 0.1)));
    }
    十.加('金', 圆环(0.53, 0.1, 40, 10), 色.金, R.clone().multiply(移(3.9, 0)));
    // 细尖芒：从中心圈斜着出去的一根细锥
    const 锥 = new THREE.ConeGeometry(0.16, 2.9, 16).rotateZ(-Math.PI / 2);
    十.加('金', 锥, 色.浅金, 转Z((45 + 90 * k) * 度).multiply(移(1.7 + 1.45, 0)));
  }
  绞丝(十, 1.62, 0.09, 0.09, 16);
  十.加('金', 圆环(1.3, 0.08, 96, 10), 色.金);
  for (const 面 of 两面(new THREE.Matrix4())) {
    十.加('金', 包镶(0.95, 0.16, 0.4), undefined, 面.clone().multiply(移(0, 0, -0.1)));
    十.加('宝石', 圆钻(0.95, 0.42, 0.12, 12), 色.黄绿, 面.clone().multiply(移(0, 0, 0.14)));
  }
  十.加('暗金', new THREE.CylinderGeometry(1.25, 1.25, 0.16, 48).rotateX(Math.PI / 2), 色.暗金);
  return {
    层们: [
      { 件们: 外.出(), 位姿: 绕环心(速.外环) },
      { 件们: 内.出(), 位姿: 绕环心(速.内环, 22.5) },
      { 件们: 十.出(), 位姿: 绕环心(速.十字) },
    ],
    晕们: [{ 半径: 9.2, 宽: 2.6, 色: '#ff9a40', 强: 0.07 }],
    晕半: 14,
  };
};

// ── 乙：光之环 ──
/**
 * 一道光芒（平片，加色，沿 +X）：根在 r0，尖在 r0 + 长，最宽处半宽 w（含两边的柔边）。横向分 14 条，中线最亮、往两边按高斯落到 0，没有硬边；
 * 纵向从 根色 过渡到 尖色，再淡到没有。根后面留一小段淡入
 */
const 芒 = (r0: number, 长: number, w: number, 根色: readonly number[], 尖色: readonly number[]): THREE.BufferGeometry => {
  const pos: number[] = [];
  const col: number[] = [];
  const 纵 = 24;
  const 横 = Array.from({ length: 15 }, (_, i) => (i - 7) / 7);
  const 底 = Math.exp(-5);
  const 横亮 = 横.map((v) => Math.max(0, (Math.exp(-5 * v * v) - 底) / (1 - 底)));
  const 宽 = (u: number) => w * (u < 0 ? 1 + u / 0.06 : (1 - u) ** 1.3);
  const 色在 = (u: number) => {
    const t = Math.max(0, u);
    const k = Math.min(1, t / 0.5);
    const 淡 = (u < 0 ? 1 + u / 0.06 : 1) * (1 - t) ** 1.5;
    return [0, 1, 2].map((i) => (根色[i]! * (1 - k) + 尖色[i]! * k) * 淡);
  };
  const us = [-0.06, ...Array.from({ length: 纵 + 1 }, (_, i) => i / 纵)];
  for (let i = 0; i < us.length - 1; i++) {
    const [u0, u1] = [us[i]!, us[i + 1]!];
    const [x0, x1, w0, w1, c0, c1] = [r0 + u0 * 长, r0 + u1 * 长, 宽(u0), 宽(u1), 色在(u0), 色在(u1)];
    for (let j = 0; j < 横.length - 1; j++) {
      const 顶 = [
        [x0, 横[j]! * w0, c0, 横亮[j]!],
        [x1, 横[j]! * w1, c1, 横亮[j]!],
        [x1, 横[j + 1]! * w1, c1, 横亮[j + 1]!],
        [x0, 横[j]! * w0, c0, 横亮[j]!],
        [x1, 横[j + 1]! * w1, c1, 横亮[j + 1]!],
        [x0, 横[j + 1]! * w0, c0, 横亮[j + 1]!],
      ] as const;
      for (const [x, y, c, k] of 顶) {
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
const 造乙 = (): 环体 => {
  const 速 = 候选们.乙.层速;
  const 主径 = 8.4;
  const 环 = new 箱();
  环.加('光', 圆环(主径, 0.085, 320, 16), 色.光);
  环.加('光', 圆环(主径 + 0.6, 0.032, 320, 10), 色.光金).加('光', 圆环(主径 - 0.6, 0.032, 320, 10), 色.光金);
  // 主环和两道细环之间各一圈小光点（联珠的意思）
  for (let i = 0; i < 96; i++) 环.加('光', 球(0.035, 8), 色.光金, 上环(主径 + (i % 2 ? 0.32 : -0.32), ((i + 0.5) / 96) * 圈));
  // 32 道光芒，一周期 8 道：长、细、短、细、中、细、短、细；正上下左右是长的，对角是中的
  const 白金 = 线性(色.光, 1.1);
  const 表: readonly [长: number, 宽: number, 尖色: string][] = [
    [5.4, 0.3, 芒色.红],
    [0.9, 0.1, 芒色.橙],
    [2.1, 0.17, 芒色.橙],
    [0.9, 0.1, 芒色.橙],
    [3.6, 0.24, 芒色.品红],
    [0.9, 0.1, 芒色.橙],
    [2.1, 0.17, 芒色.橙],
    [0.9, 0.1, 芒色.橙],
  ];
  for (let i = 0; i < 32; i++) {
    const [长, 宽, 尖] = 表[i % 8]!;
    环.加('芒', 芒(主径 + 0.62, 长, 宽, 白金, 线性(尖)), undefined, 转Z((i / 32) * 圈));
  }
  // 四个对角：菱形小光框（原贴图四角的方块）套在主环上，框里一个小光点；对角那道中等的光芒从框尖上出去
  for (let k = 0; k < 4; k++) {
    const m = 上环(主径, (45 + 90 * k) * 度);
    环.加('光', new THREE.TorusGeometry(0.86, 0.04, 8, 4), 芒色.品红, m).加('光', new THREE.TorusGeometry(0.5, 0.028, 8, 4), 色.光金, m).加('光', 球(0.12, 12), 色.光, m);
  }
  // 正上下左右：环上一颗稍大的光点（长光芒的根）
  for (let k = 0; k < 4; k++) 环.加('光', 球(0.17, 14), 色.光, 上环(主径, 90 * k * 度));
  // 十字：四道从中心小圆出去的细长光（白金到黄绿），其间四道短的（到橙）；中心两个小圆环
  const 十 = new 箱();
  for (let k = 0; k < 4; k++) {
    十.加('芒', 芒(1.2, 6.5, 0.2, 白金, 线性(芒色.黄绿)), undefined, 转Z(90 * k * 度));
    十.加('芒', 芒(1.2, 2.8, 0.12, 白金, 线性(芒色.橙)), undefined, 转Z((45 + 90 * k) * 度));
  }
  十.加('光', 圆环(1.15, 0.05, 96, 10), 色.光).加('光', 圆环(0.6, 0.03, 64, 8), 芒色.黄绿);
  return {
    层们: [
      { 件们: 环.出(), 位姿: 绕环心(速.光环) },
      { 件们: 十.出(), 位姿: 绕环心(速.十字) },
    ],
    晕们: [
      { 半径: 主径, 宽: 0.3, 色: '#ffd890', 强: 0.3 },
      { 半径: 主径 + 0.3, 宽: 2.2, 色: '#ff8a40', 强: 0.13 },
      { 半径: 主径 + 2.0, 宽: 3.4, 色: '#d03070', 强: 0.05 },
    ],
    晕半: 20,
  };
};

// ── 丙：星环 ──
const 造丙 = (): 环体 => {
  const 速 = 候选们.丙.层速;
  const 径 = 8.4;
  const 层们: 环层[] = [];
  // 光丝：细亮线，不转（转了也看不出）
  层们.push({ 件们: new 箱().加('光', 圆环(径, 0.05, 320, 12), 色.光).出(), 位姿: (_秒, 出) => 出.identity() });
  const 公转 = (角度: number, 秒: number) => (角度 + 速.整圈 * 秒) * 度;
  const tmp = new THREE.Matrix4();
  // 四颗双尖晶体：长轴沿半径，腰上三道金箍、两头各一个小金珠，绕长轴自转
  const 晶色 = [色.红, 色.黄绿, 色.品红, 色.橙];
  for (let k = 0; k < 4; k++) {
    const b = new 箱();
    b.加('宝石', 晶体(0.78, 4.3, 1.5), 晶色[k]!);
    for (const x of [-0.3, 0.3]) b.加('金', 圆环(0.81, 0.07, 48, 10).rotateY(Math.PI / 2), 色.金, 移(x, 0));
    b.加('金', 圆环(0.86, 0.1, 48, 12).rotateY(Math.PI / 2), 色.浅金);
    for (const s of [1, -1]) b.加('金', 球(0.11, 12), 色.浅金, 移(s * 2.2, 0));
    层们.push({
      件们: b.出(),
      位姿: (秒, 出) => 出.makeRotationZ(公转(90 * k, 秒)).multiply(tmp.makeTranslation(径, 0, 0)).multiply(tmp.makeRotationX((速.晶体自转 * 秒 + k * 37) * 度)),
    });
  }
  // 四块回字金牌：对角上，面朝观众，一个角朝外，绕半径轴慢慢来回摆
  for (let k = 0; k < 4; k++) {
    const b = new 箱();
    回字座(b, 转Z(45 * 度), 1.12, 0.36, [色.品红, 色.红][k % 2]!);
    // 朝里朝外的两个角各一颗小金珠
    for (const s of [1, -1]) b.加('金', 球(0.14, 12), 色.浅金, 移(s * 1.66, 0));
    层们.push({
      件们: b.出(),
      位姿: (秒, 出) => 出.makeRotationZ(公转(45 + 90 * k, 秒)).multiply(tmp.makeTranslation(径, 0, 0)).multiply(tmp.makeRotationX(Math.sin(秒 * 速.金牌摆 + k * 1.3) * 22 * 度)),
    });
  }
  // 八个小链节：金的小圆环里包镶一颗圆宝石（黄绿、橙相间），面朝观众，左右各一颗小金珠压在光丝上；绕半径轴来回摆，和金牌错开
  for (let k = 0; k < 8; k++) {
    const b = new 箱();
    b.加('金', 圆环(0.46, 0.1, 64, 14), 色.金);
    for (const 面 of 两面(new THREE.Matrix4())) b.加('宝石', 圆钻(0.37, 0.3, 0.02, 10), [色.黄绿, 色.橙][k % 2]!, 面.clone().multiply(移(0, 0, 0.0)));
    for (const s of [1, -1]) b.加('金', 球(0.1, 12), 色.浅金, 移(0, s * 0.62));
    层们.push({
      件们: b.出(),
      位姿: (秒, 出) => 出.makeRotationZ(公转(22.5 + 45 * k, 秒)).multiply(tmp.makeTranslation(径, 0, 0)).multiply(tmp.makeRotationX(Math.sin(秒 * 速.链节摆 + k * 2.1) * 14 * 度)),
    });
  }
  return {
    层们,
    晕们: [
      { 半径: 径, 宽: 0.3, 色: '#ffd890', 强: 0.25 },
      { 半径: 径, 宽: 2.0, 色: '#ff9040', 强: 0.06 },
    ],
    晕半: 14,
  };
};

const 造 = { 甲: 造甲, 乙: 造乙, 丙: 造丙 } as const;
const 缓存 = new Map<候选名, 环体>();
/** 一个候选的几何（建一次，全局共用） */
export const 环体 = (款: 候选名): 环体 => {
  let 体 = 缓存.get(款);
  if (!体) 缓存.set(款, (体 = 造[款]()));
  return 体;
};
