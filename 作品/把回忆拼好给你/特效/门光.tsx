// 门光：门外的暖光从门洞灌进屋里，画成 2D 化的几样东西叠在场景上（05 画风原则 2：不用真实光照），不碰场景的材质，换成三渲二平涂照样叠：
// - 地块：门洞顺着光的方向投到地上的那块亮区，两档平涂（外圈一档、往里缩一圈再亮一档）。按 每格像素 量化成像素格（默认 16，和方块贴图一格 16 像素对齐），边是一格一格的台阶，不抗锯齿。
//   落到台面（地毯）上的部分抬到台面顶上；可以挖掉一个站在门口的人投下的影子（`人影`）。
// - 光带：几条从门洞上沿顺着光斜插到地上的半透明平涂长条。
// - 浮尘：光带里飘着的小方块，一个贴图像素大。
// 坐标：场景坐标（Z 朝上：x 东、y 北、z 上，单位格），放进 rotation [−π/2, 0, 0] 的 group。门洞是一个竖直的长方形：底边从 a 到 b，高从 底 到 顶。
// 都是不受光照、不过色调映射的平涂（MeshBasicMaterial），混合方式可选：加（往亮里加）、盖（普通透明叠）。
// 材质都打上 userData.平涂：三渲二的 <平涂> 见到就原样放过、不克隆（克隆了以后每帧按 亮 改的是原材质，网格上挂的那份冻在第一帧）。
// 正交镜头（三渲二的正交像素机位）也能用：浮尘按视体高算像素大小；光带朝哪转用 朝 给（正交没有眼睛的位置）。
import { useFrame, useThree } from '@react-three/fiber';
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { rng, type V3 } from '@engine/model/parts.tsx';

export type 门洞 = { a: [number, number]; b: [number, number]; 底: number; 顶: number };
export type 台面 = { 框: [number, number, number, number]; 高: number };
export type 混合 = '加' | '盖';

export type 门光参数 = {
  /** 光从哪个方向来（度，水平方位）：0 = 从正北来、−90 = 从正西来，正 = 往东偏 */
  方位: number;
  /** 光的仰角（度）：越低地块拖得越长 */
  仰角: number;
  地块: {
    外色: string;
    内色: string;
    /** 两档各自的不透明度（盖）或强度（加，乘在颜色上） */
    外: number;
    内: number;
    /** 内档比外档往里缩多少（格，门洞四边各缩这么多再投下去） */
    内缩: number;
    每格像素: number;
    混合: 混合;
  };
  光带: {
    色: string;
    混合: 混合;
    /** u：沿门洞底边从 a（0）到 b（1）的位置；宽：格；强：同地块；起、止：沿光带从门洞上沿（0）到落地（1）画哪一截 */
    条们: readonly { u: number; 宽: number; 强: number; 起: number; 止: number }[];
  };
  /** 起：沿光从门洞（0）到落地（1）从哪儿起撒，贴着门洞（镜头）的太大 */
  浮尘: { 数: number; 色: string; 强: number; 种子: number; 大小: number; 漂速: number; 起: number };
};

/** 站在门口挡光的人（史蒂夫那样的方块人）：脚底在地上哪一点、多高；影子按原版玩家模型的剪影（正面看：两腿、身子、两臂、头） */
export type 人影 = { 脚: [number, number]; 高: number };

const rad = (d: number) => (d * Math.PI) / 180;

/** 光走的方向（单位向量，从门外往屋里、往下） */
export const 光向 = (方位: number, 仰角: number): V3 => {
  const [a, e] = [rad(方位), rad(仰角)];
  return [-Math.sin(a) * Math.cos(e), -Math.cos(a) * Math.cos(e), -Math.sin(e)];
};

/** 点 p 顺着光 d 落到高 h 的平面上 */
const 落地 = (p: V3, d: V3, h: number): [number, number] => {
  const t = (p[2] - h) / -d[2];
  return [p[0] + d[0] * t, p[1] + d[1] * t];
};

/** 门洞上沿底边 u（0～1）、高 z 的那一点 */
const 洞上 = (洞: 门洞, u: number, z: number): V3 => [洞.a[0] + (洞.b[0] - 洞.a[0]) * u, 洞.a[1] + (洞.b[1] - 洞.a[1]) * u, z];

/** 门洞（四边各往里缩 缩 格）投到高 h 的平面上的四边形 */
const 投影 = (洞: 门洞, d: V3, h: number, 缩: number): [number, number][] => {
  const 宽 = Math.hypot(洞.b[0] - 洞.a[0], 洞.b[1] - 洞.a[1]);
  const [u0, u1, z0, z1] = [缩 / 宽, 1 - 缩 / 宽, Math.max(洞.底 + 缩, h), 洞.顶 - 缩];
  return [落地(洞上(洞, u0, z0), d, h), 落地(洞上(洞, u1, z0), d, h), 落地(洞上(洞, u1, z1), d, h), 落地(洞上(洞, u0, z1), d, h)];
};

const 在凸多边形里 = (q: [number, number], poly: [number, number][]) => {
  let 符号 = 0;
  for (let i = 0; i < poly.length; i++) {
    const [a, b] = [poly[i]!, poly[(i + 1) % poly.length]!];
    const c = (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]);
    if (c === 0) continue;
    if (符号 === 0) 符号 = Math.sign(c);
    else if (Math.sign(c) !== 符号) return false;
  }
  return true;
};

// 原版玩家模型正面的剪影（像素，脚底为 0、往上量；横向以身体中线为 0）：腿 0～12、身子和手臂 12～24、头 24～32；模型渲染时缩 0.9375
const 剪影: readonly [number, number, number, number][] = [
  [-4, 0, 4, 12],
  [-8, 12, 8, 24],
  [-4, 24, 4, 32],
];
const 剪影高 = 32;

/** 地上 q 点在不在 人 的影子里：倒推到人身上的 横、高（格），再看在不在剪影里 */
const 在人影里 = (q: [number, number], 人: 人影, d: V3, h: number) => {
  const 水平 = Math.hypot(d[0], d[1]);
  const [fx, fy] = [d[0] / 水平, d[1] / 水平]; // 影子往哪拖
  const [rx, ry] = [fy, -fx];
  const [dx, dy] = [q[0] - 人.脚[0], q[1] - 人.脚[1]];
  const 沿 = dx * fx + dy * fy;
  if (沿 < 0) return false;
  const 高 = h + (沿 * -d[2]) / 水平;
  const 像素 = 剪影高 / 人.高;
  const [u, v] = [(dx * rx + dy * ry) * 像素, 高 * 像素];
  return 剪影.some(([a, b, c, e]) => u >= a && u < c && v >= b && v < e);
};

const 颜色 = (hex: string) => new THREE.Color(hex);

/** 按 亮（0～1，推门那一下光跟着门缝变亮）设材质的颜色、不透明度：加 = 颜色 × 强 × 亮，盖 = 不透明度 强 × 亮 */
const 调亮 = (m: THREE.MeshBasicMaterial | THREE.PointsMaterial, 混: 混合, 色: string, 强: number, 亮: number) => {
  if (混 === '加') m.color.set(色).multiplyScalar(强 * 亮);
  else m.opacity = 强 * 亮;
};

const 已平涂 = <M extends THREE.Material>(m: M): M => {
  m.userData.平涂 = true;
  return m;
};

const 材质 = (混: 混合, 色: string, 强: number, map?: THREE.Texture) =>
  已平涂(new THREE.MeshBasicMaterial({
    color: 混 === '加' ? 颜色(色).multiplyScalar(强) : 颜色(色),
    opacity: 混 === '加' ? 1 : 强,
    map: map ?? null,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    blending: 混 === '加' ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: THREE.DoubleSide,
    // 贴在地上、地毯上的平面往镜头偏一点，免得和底下的面打架
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -8,
    fog: false,
  }));

type 地块层 = { 高: number; 宽: number; 长: number; 原点: [number, number]; 贴图: THREE.DataTexture };

// 把地块按 每格像素 画进贴图：两档的颜色直接写进贴图（材质色取白），地面、每块台面各一张
const 画地块 = (p: 门光参数, 洞: 门洞, 台面们: readonly 台面[], 人: 人影 | undefined): 地块层[] => {
  const d = 光向(p.方位, p.仰角);
  const 高们 = [0, ...台面们.map((t) => t.高)];
  const 外们 = 高们.map((h) => 投影(洞, d, h, 0));
  // 门缝比两倍内缩还窄（推门那一下）就只有外档
  const 有内 = Math.hypot(洞.b[0] - 洞.a[0], 洞.b[1] - 洞.a[1]) > 2 * p.地块.内缩 && 洞.顶 - 洞.底 > 2 * p.地块.内缩;
  const 内们 = 有内 ? 高们.map((h) => 投影(洞, d, h, p.地块.内缩)) : [];
  const 全 = 外们.flat();
  const n = p.地块.每格像素;
  const 原点: [number, number] = [Math.floor(Math.min(...全.map((q) => q[0])) * n) / n, Math.floor(Math.min(...全.map((q) => q[1])) * n) / n];
  const 宽 = Math.ceil((Math.max(...全.map((q) => q[0])) - 原点[0]) * n);
  const 长 = Math.ceil((Math.max(...全.map((q) => q[1])) - 原点[1]) * n);
  const [外, 内] = [颜色(p.地块.外色), 颜色(p.地块.内色)];
  const 加 = p.地块.混合 === '加';
  const 写 = (px: Uint8Array, i: number, c: THREE.Color, 强: number) => {
    // 加：颜色乘强度、alpha 满；盖：颜色原样、alpha = 强度。贴图是 sRGB 的
    const s = c.clone().convertLinearToSRGB();
    const k = 加 ? 强 : 1;
    px.set([Math.round(Math.min(1, s.r * k) * 255), Math.round(Math.min(1, s.g * k) * 255), Math.round(Math.min(1, s.b * k) * 255), Math.round((加 ? 1 : 强) * 255)], i * 4);
  };
  // 第 0 层是地面（台面框外），后面每层是一块台面（框里）
  return 高们.map((h, li) => {
    const px = new Uint8Array(宽 * 长 * 4);
    for (let j = 0; j < 长; j++)
      for (let i = 0; i < 宽; i++) {
        const q: [number, number] = [原点[0] + (i + 0.5) / n, 原点[1] + (j + 0.5) / n];
        const 台 = 台面们.findIndex(({ 框: [x0, y0, x1, y1] }) => q[0] > x0 && q[0] < x1 && q[1] > y0 && q[1] < y1);
        if (台 + 1 !== li) continue;
        if (!在凸多边形里(q, 外们[li]!)) continue;
        if (人 && 在人影里(q, 人, d, h)) continue;
        if (有内 && 在凸多边形里(q, 内们[li]!)) 写(px, j * 宽 + i, 内, p.地块.内);
        else 写(px, j * 宽 + i, 外, p.地块.外);
      }
    const t = new THREE.DataTexture(px, 宽, 长, THREE.RGBAFormat);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    return { 高: h, 宽: 宽 / n, 长: 长 / n, 原点, 贴图: t };
  });
};

/** 地上的门形亮块。台面们：地上抬高的平面（地毯），亮块落在框里的部分画在台面顶上 */
export const 门光地块: React.FC<{ 参数: 门光参数; 洞: 门洞; 台面们?: readonly 台面[]; 人影?: 人影; 亮?: number }> = ({ 参数, 洞, 台面们 = [], 人影: 人, 亮 = 1 }) => {
  const 层们 = useMemo(() => 画地块(参数, 洞, 台面们, 人), [参数, 洞, 台面们, 人]);
  const 材质们 = useMemo(() => 层们.map((l) => 材质(参数.地块.混合, '#ffffff', 1, l.贴图)), [层们, 参数.地块.混合]);
  useEffect(
    () => () => {
      for (const l of 层们) l.贴图.dispose();
      for (const m of 材质们) m.dispose();
    },
    [层们, 材质们],
  );
  for (const m of 材质们) 调亮(m, 参数.地块.混合, '#ffffff', 1, 亮);
  return (
    <>
      {层们.map((l, i) => (
        <mesh key={i} position={[l.原点[0] + l.宽 / 2, l.原点[1] + l.长 / 2, l.高 + 0.002]} material={材质们[i]} renderOrder={5}>
          <planeGeometry args={[l.宽, l.长]} />
        </mesh>
      ))}
    </>
  );
};

/** 空气里的光带：每条是一张顺着光、正对镜头那边转的长条，从门洞上沿（沿门宽 u 处）斜插到地上。
 *  朝：从场景指向镜头的方向（正交镜头用，比如镜头朝北看就是 [0, −1, 0]）；不给就朝 眼 转 */
export const 门光光带: React.FC<{ 参数: 门光参数; 洞: 门洞; 眼: V3; 朝?: V3; 亮?: number }> = ({ 参数, 洞, 眼, 朝, 亮 = 1 }) => {
  const d = 光向(参数.方位, 参数.仰角);
  const 带们 = useMemo(() => {
    const dv = new THREE.Vector3(...d);
    const 洞宽 = Math.hypot(洞.b[0] - 洞.a[0], 洞.b[1] - 洞.a[1]);
    return 参数.光带.条们.map(({ u, 宽: 条宽, 强, 起, 止 }) => {
      // 门缝窄的时候光带不比门缝宽
      const 宽 = Math.min(条宽, 洞宽);
      const 顶 = new THREE.Vector3(...洞上(洞, u, 洞.顶));
      const 长 = 洞.顶 / -d[2];
      const [a, b] = [顶.clone().addScaledVector(dv, 长 * 起), 顶.clone().addScaledVector(dv, 长 * 止)];
      const 中 = a.clone().add(b).multiplyScalar(0.5);
      // 带面含光的方向，法向取朝镜头那边（去掉沿光的分量）
      const 向眼 = 朝 ? new THREE.Vector3(...朝) : new THREE.Vector3(...眼).sub(中);
      const 法 = 向眼.addScaledVector(dv, -向眼.dot(dv)).normalize();
      const 横 = new THREE.Vector3().crossVectors(dv, 法).normalize().multiplyScalar(宽 / 2);
      const pos = new Float32Array([
        ...a.clone().sub(横).toArray(), ...a.clone().add(横).toArray(), ...b.clone().add(横).toArray(), ...b.clone().sub(横).toArray(),
      ]);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setIndex([0, 1, 2, 0, 2, 3]);
      return { g, m: 材质(参数.光带.混合, 参数.光带.色, 强), 强 };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [参数, 洞, 眼[0], 眼[1], 眼[2], 朝?.[0], 朝?.[1], 朝?.[2]]);
  useEffect(
    () => () => {
      for (const { g, m } of 带们) {
        g.dispose();
        m.dispose();
      }
    },
    [带们],
  );
  for (const { m, 强 } of 带们) 调亮(m, 参数.光带.混合, 参数.光带.色, 强, 亮);
  return (
    <>
      {带们.map(({ g, m }, i) => (
        <mesh key={i} geometry={g} material={m} renderOrder={6} />
      ))}
    </>
  );
};

/** 光带里的浮尘：门洞上撒一些点（种子定死），每粒顺着光往屋里走一段；按 秒 在门洞截面里慢慢往下飘、落到底再回到顶上。
 *  大小是格（一个贴图像素 = 1/16），点精灵是正对镜头的方块 */
export const 门光浮尘: React.FC<{ 参数: 门光参数; 洞: 门洞; 秒: number; 亮?: number }> = ({ 参数, 洞, 秒, 亮 = 1 }) => {
  const { 数, 色, 强, 种子, 大小, 漂速, 起: 撒起 } = 参数.浮尘;
  const d = 光向(参数.方位, 参数.仰角);
  const 页高 = useThree((s) => s.size.height);
  const 粒们 = useMemo(() => {
    const r = rng(种子);
    return Array.from({ length: 数 }, () => [r(), r(), r()] as const);
  }, [数, 种子]);
  const 几何 = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(数 * 3), 3));
    return g;
  }, [数]);
  const 料 = useMemo(
    () =>
      已平涂(
        new THREE.PointsMaterial({
          color: 颜色(色).multiplyScalar(强),
          sizeAttenuation: true,
          transparent: true,
          depthWrite: false,
          toneMapped: false,
          fog: false,
          blending: THREE.AdditiveBlending,
        }),
      ),
    [色, 强],
  );
  // 点的大小在画之前按当时的相机算（机位组件在渲染时才设好相机）：
  // 透视：three 按 size × 画面半高 ÷ 深度 算像素、没乘视角，size 取 大小 ÷ tan(半视角) 才是 大小 格；
  // 正交：three 不按深度缩，size 就是页面像素，= 大小 × 页面高 × zoom ÷ 视体高
  useFrame(({ camera }) => {
    const c = camera as THREE.PerspectiveCamera & THREE.OrthographicCamera;
    料.size = c.isOrthographicCamera ? (大小 * 页高 * c.zoom) / (c.top - c.bottom) : 大小 / Math.tan(rad(c.fov / 2));
  });
  useEffect(
    () => () => {
      几何.dispose();
      料.dispose();
    },
    [几何, 料],
  );
  调亮(料, '加', 色, 强, 亮);
  const pos = 几何.getAttribute('position') as THREE.BufferAttribute;
  const 门高 = 洞.顶 - 洞.底;
  粒们.forEach(([u, v, w], i) => {
    const 竖 = (((v - (秒 * 漂速) / 门高) % 1) + 1) % 1;
    const 起 = 洞上(洞, u, 洞.底 + 门高 * 竖);
    const 走 = ((起[2] - 洞.底) / -d[2]) * (撒起 + (1 - 撒起) * w);
    pos.setXYZ(i, 起[0] + d[0] * 走, 起[1] + d[1] * 走, 起[2] + d[2] * 走);
  });
  pos.needsUpdate = true;
  return <points geometry={几何} material={料} renderOrder={7} />;
};

/** 三样一起：地块、光带、浮尘。亮：0～1 一起乘（推门时跟着门开大）。光带：镜头站在门洞里时光带从头顶掠过、只看得见落地那截楔形，关掉。
 *  朝：见 门光光带（正交镜头给） */
export const 门光: React.FC<{ 参数: 门光参数; 洞: 门洞; 眼: V3; 朝?: V3; 秒?: number; 台面们?: readonly 台面[]; 人影?: 人影; 亮?: number; 光带?: boolean }> = ({
  参数,
  洞,
  眼,
  朝,
  秒 = 0,
  台面们,
  人影: 人,
  亮 = 1,
  光带 = true,
}) => (
  <>
    <门光地块 参数={参数} 洞={洞} 台面们={台面们} 人影={人} 亮={亮} />
    {光带 && <门光光带 参数={参数} 洞={洞} 眼={眼} 朝={朝} 亮={亮} />}
    {参数.浮尘.数 > 0 && <门光浮尘 参数={参数} 洞={洞} 秒={秒} 亮={亮} />}
  </>
);
