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
import { type V3 } from '@engine/model/parts.tsx';
import { rad, mulberry32 } from '@engine/core/数学.ts';

export type DoorOpening = { a: [number, number]; b: [number, number]; bottom: number; topEdge: number };
export type Ledge = { 框: [number, number, number, number]; 高: number };
export type Blend = '加' | '盖';

export type DoorLightParams = {
  /** 光从哪个方向来（度，水平方位）：0 = 从正北来、−90 = 从正西来，正 = 往东偏 */
  azimuthDeg: number;
  /** 光的仰角（度）：越低地块拖得越长 */
  elevationDeg: number;
  ground: {
    outerColor: string;
    innerColor: string;
    /** 两档各自的不透明度（盖）或强度（加，乘在颜色上） */
    outer: number;
    内: number;
    /** 内档比外档往里缩多少（格，门洞四边各缩这么多再投下去） */
    inset: number;
    pixelsPerCell: number;
    混合: Blend;
  };
  lightBand: {
    色: string;
    混合: Blend;
    /** u：沿门洞底边从 a（0）到 b（1）的位置；宽：格；强：同地块；起、止：沿光带从门洞上沿（0）到落地（1）画哪一截 */
    bands: readonly { u: number; 宽: number; 强: number; 起: number; 止: number }[];
  };
  /** 起：沿光从门洞（0）到落地（1）从哪儿起撒，贴着门洞（镜头）的太大 */
  floatDust: { 数: number; 色: string; 强: number; 种子: number; 大小: number; driftSpeed: number; 起: number };
};

/** 站在门口挡光的人（史蒂夫那样的方块人）：脚底在地上哪一点、多高；影子按原版玩家模型的剪影（正面看：两腿、身子、两臂、头） */
export type PersonShadow = { feet: [number, number]; 高: number };
/** 光走的方向（单位向量，从门外往屋里、往下） */
export const lightDir = (azimuthDeg: number, elevationDeg: number): V3 => {
  const [a, e] = [rad(azimuthDeg), rad(elevationDeg)];
  return [-Math.sin(a) * Math.cos(e), -Math.cos(a) * Math.cos(e), -Math.sin(e)];
};

/** 点 p 顺着光 d 落到高 h 的平面上 */
const landPoint = (p: V3, d: V3, h: number): [number, number] => {
  const t = (p[2] - h) / -d[2];
  return [p[0] + d[0] * t, p[1] + d[1] * t];
};

/** 门洞上沿底边 u（0～1）、高 z 的那一点 */
const holePoint = (opening: DoorOpening, u: number, z: number): V3 => [opening.a[0] + (opening.b[0] - opening.a[0]) * u, opening.a[1] + (opening.b[1] - opening.a[1]) * u, z];

/** 门洞（四边各往里缩 缩 格）投到高 h 的平面上的四边形 */
const projectDoorHole = (opening: DoorOpening, d: V3, h: number, inset: number): [number, number][] => {
  const holeEdgeWidth = Math.hypot(opening.b[0] - opening.a[0], opening.b[1] - opening.a[1]);
  const [u0, u1, z0, z1] = [inset / holeEdgeWidth, 1 - inset / holeEdgeWidth, Math.max(opening.bottom + inset, h), opening.topEdge - inset];
  return [landPoint(holePoint(opening, u0, z0), d, h), landPoint(holePoint(opening, u1, z0), d, h), landPoint(holePoint(opening, u1, z1), d, h), landPoint(holePoint(opening, u0, z1), d, h)];
};

const inConvexPoly = (q: [number, number], poly: [number, number][]) => {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const [a, b] = [poly[i]!, poly[(i + 1) % poly.length]!];
    const c = (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]);
    if (c === 0) continue;
    if (sign === 0) sign = Math.sign(c);
    else if (Math.sign(c) !== sign) return false;
  }
  return true;
};

// 原版玩家模型正面的剪影（像素，脚底为 0、往上量；横向以身体中线为 0）：腿 0～12、身子和手臂 12～24、头 24～32；模型渲染时缩 0.9375
const silhouettes: readonly [number, number, number, number][] = [
  [-4, 0, 4, 12],
  [-8, 12, 8, 24],
  [-4, 24, 4, 32],
];
const silhouetteHeight = 32;

/** 地上 q 点在不在 人 的影子里：倒推到人身上的 横、高（格），再看在不在剪影里 */
const inPersonShadow = (q: [number, number], figure: PersonShadow, d: V3, h: number) => {
  const horizLen = Math.hypot(d[0], d[1]);
  const [fx, fy] = [d[0] / horizLen, d[1] / horizLen]; // 影子往哪拖
  const [rx, ry] = [fy, -fx];
  const [dx, dy] = [q[0] - figure.feet[0], q[1] - figure.feet[1]];
  const alongFacing = dx * fx + dy * fy;
  if (alongFacing < 0) return false;
  const height = h + (alongFacing * -d[2]) / horizLen;
  const pixelSize = silhouetteHeight / figure.高;
  const [u, v] = [(dx * rx + dy * ry) * pixelSize, height * pixelSize];
  return silhouettes.some(([a, b, c, e]) => u >= a && u < c && v >= b && v < e);
};

const toColor = (hex: string) => new THREE.Color(hex);

/** 按 亮（0～1，推门那一下光跟着门缝变亮）设材质的颜色、不透明度：加 = 颜色 × 强 × 亮，盖 = 不透明度 强 × 亮 */
const adjustBright = (m: THREE.MeshBasicMaterial | THREE.PointsMaterial, blend: Blend, color: string, strength: number, brightness: number) => {
  if (blend === '加') m.color.set(color).multiplyScalar(strength * brightness);
  else m.opacity = strength * brightness;
};

const flatMaterial = <M extends THREE.Material>(m: M): M => {
  m.userData.平涂 = true;
  return m;
};

const makeMaterial = (blend: Blend, color: string, strength: number, map?: THREE.Texture) =>
  flatMaterial(new THREE.MeshBasicMaterial({
    color: blend === '加' ? toColor(color).multiplyScalar(strength) : toColor(color),
    opacity: blend === '加' ? 1 : strength,
    map: map ?? null,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    blending: blend === '加' ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: THREE.DoubleSide,
    // 贴在地上、地毯上的平面往镜头偏一点，免得和底下的面打架
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -8,
    fog: false,
  }));

type GroundLayer = { 高: number; 宽: number; 长: number; 原点: [number, number]; 贴图: THREE.DataTexture };

// 把地块按 每格像素 画进贴图：两档的颜色直接写进贴图（材质色取白），地面、每块台面各一张
const paintGround = (p: DoorLightParams, opening: DoorOpening, ledges: readonly Ledge[], figure: PersonShadow | undefined): GroundLayer[] => {
  const d = lightDir(p.azimuthDeg, p.elevationDeg);
  const heights = [0, ...ledges.map((t) => t.高)];
  const outerPolys = heights.map((h) => projectDoorHole(opening, d, h, 0));
  // 门缝比两倍内缩还窄（推门那一下）就只有外档
  const hasInner = Math.hypot(opening.b[0] - opening.a[0], opening.b[1] - opening.a[1]) > 2 * p.ground.inset && opening.topEdge - opening.bottom > 2 * p.ground.inset;
  const innerPolys = hasInner ? heights.map((h) => projectDoorHole(opening, d, h, p.ground.inset)) : [];
  const flatOuter = outerPolys.flat();
  const n = p.ground.pixelsPerCell;
  const origin: [number, number] = [Math.floor(Math.min(...flatOuter.map((q) => q[0])) * n) / n, Math.floor(Math.min(...flatOuter.map((q) => q[1])) * n) / n];
  const width = Math.ceil((Math.max(...flatOuter.map((q) => q[0])) - origin[0]) * n);
  const lengthPx = Math.ceil((Math.max(...flatOuter.map((q) => q[1])) - origin[1]) * n);
  const [outerColor, innerColor] = [toColor(p.ground.outerColor), toColor(p.ground.innerColor)];
  const additive = p.ground.混合 === '加';
  const writePixel = (px: Uint8Array, i: number, c: THREE.Color, strength: number) => {
    // 加：颜色乘强度、alpha 满；盖：颜色原样、alpha = 强度。贴图是 sRGB 的
    const s = c.clone().convertLinearToSRGB();
    const k = additive ? strength : 1;
    px.set([Math.round(Math.min(1, s.r * k) * 255), Math.round(Math.min(1, s.g * k) * 255), Math.round(Math.min(1, s.b * k) * 255), Math.round((additive ? 1 : strength) * 255)], i * 4);
  };
  // 第 0 层是地面（台面框外），后面每层是一块台面（框里）
  return heights.map((h, li) => {
    const px = new Uint8Array(width * lengthPx * 4);
    for (let j = 0; j < lengthPx; j++)
      for (let i = 0; i < width; i++) {
        const q: [number, number] = [origin[0] + (i + 0.5) / n, origin[1] + (j + 0.5) / n];
        const ledgeIndex = ledges.findIndex(({ 框: [x0, y0, x1, y1] }) => q[0] > x0 && q[0] < x1 && q[1] > y0 && q[1] < y1);
        if (ledgeIndex + 1 !== li) continue;
        if (!inConvexPoly(q, outerPolys[li]!)) continue;
        if (figure && inPersonShadow(q, figure, d, h)) continue;
        if (hasInner && inConvexPoly(q, innerPolys[li]!)) writePixel(px, j * width + i, innerColor, p.ground.内);
        else writePixel(px, j * width + i, outerColor, p.ground.outer);
      }
    const t = new THREE.DataTexture(px, width, lengthPx, THREE.RGBAFormat);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    return { 高: h, 宽: width / n, 长: lengthPx / n, 原点: origin, 贴图: t };
  });
};

/** 地上的门形亮块。台面们：地上抬高的平面（地毯），亮块落在框里的部分画在台面顶上 */
export const DoorLightGround: React.FC<{ 参数: DoorLightParams; opening: DoorOpening; ledges?: readonly Ledge[]; personShadow?: PersonShadow; brightness?: number }> = ({ 参数: params, opening, ledges = [], personShadow: figure, brightness = 1 }) => {
  const layers = useMemo(() => paintGround(params, opening, ledges, figure), [params, opening, ledges, figure]);
  const layerMaterials = useMemo(() => layers.map((l) => makeMaterial(params.ground.混合, '#ffffff', 1, l.贴图)), [layers, params.ground.混合]);
  useEffect(
    () => () => {
      for (const l of layers) l.贴图.dispose();
      for (const m of layerMaterials) m.dispose();
    },
    [layers, layerMaterials],
  );
  for (const m of layerMaterials) adjustBright(m, params.ground.混合, '#ffffff', 1, brightness);
  return (
    <>
      {layers.map((l, i) => (
        <mesh key={i} position={[l.原点[0] + l.宽 / 2, l.原点[1] + l.长 / 2, l.高 + 0.002]} material={layerMaterials[i]} renderOrder={5}>
          <planeGeometry args={[l.宽, l.长]} />
        </mesh>
      ))}
    </>
  );
};

/** 空气里的光带：每条是一张顺着光、正对镜头那边转的长条，从门洞上沿（沿门宽 u 处）斜插到地上。
 *  朝：从场景指向镜头的方向（正交镜头用，比如镜头朝北看就是 [0, −1, 0]）；不给就朝 眼 转 */
export const DoorLightBand: React.FC<{ 参数: DoorLightParams; opening: DoorOpening; 眼: V3; dir?: V3; brightness?: number }> = ({ 参数: params, opening, 眼: eye, dir, brightness = 1 }) => {
  const d = lightDir(params.azimuthDeg, params.elevationDeg);
  const bands = useMemo(() => {
    const dv = new THREE.Vector3(...d);
    const holeWidth = Math.hypot(opening.b[0] - opening.a[0], opening.b[1] - opening.a[1]);
    return params.lightBand.bands.map(({ u, 宽: stripWidth, 强: bandStrength, 起: start, 止: end }) => {
      // 门缝窄的时候光带不比门缝宽
      const bandWidth = Math.min(stripWidth, holeWidth);
      const topPoint = new THREE.Vector3(...holePoint(opening, u, opening.topEdge));
      const travelLength = opening.topEdge / -d[2];
      const [a, b] = [topPoint.clone().addScaledVector(dv, travelLength * start), topPoint.clone().addScaledVector(dv, travelLength * end)];
      const center = a.clone().add(b).multiplyScalar(0.5);
      // 带面含光的方向，法向取朝镜头那边（去掉沿光的分量）
      const towardEye = dir ? new THREE.Vector3(...dir) : new THREE.Vector3(...eye).sub(center);
      const normal = towardEye.addScaledVector(dv, -towardEye.dot(dv)).normalize();
      const sideAxis = new THREE.Vector3().crossVectors(dv, normal).normalize().multiplyScalar(bandWidth / 2);
      const pos = new Float32Array([
        ...a.clone().sub(sideAxis).toArray(), ...a.clone().add(sideAxis).toArray(), ...b.clone().add(sideAxis).toArray(), ...b.clone().sub(sideAxis).toArray(),
      ]);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setIndex([0, 1, 2, 0, 2, 3]);
      return { g, m: makeMaterial(params.lightBand.混合, params.lightBand.色, bandStrength), 强: bandStrength };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, opening, eye[0], eye[1], eye[2], dir?.[0], dir?.[1], dir?.[2]]);
  useEffect(
    () => () => {
      for (const { g, m } of bands) {
        g.dispose();
        m.dispose();
      }
    },
    [bands],
  );
  for (const { m, 强: bandStrength } of bands) adjustBright(m, params.lightBand.混合, params.lightBand.色, bandStrength, brightness);
  return (
    <>
      {bands.map(({ g, m }, i) => (
        <mesh key={i} geometry={g} material={m} renderOrder={6} />
      ))}
    </>
  );
};

/** 光带里的浮尘：门洞上撒一些点（种子定死），每粒顺着光往屋里走一段；按 秒 在门洞截面里慢慢往下飘、落到底再回到顶上。
 *  大小是格（一个贴图像素 = 1/16），点精灵是正对镜头的方块 */
export const DoorLightDust: React.FC<{ 参数: DoorLightParams; opening: DoorOpening; 秒: number; brightness?: number }> = ({ 参数: params, opening, 秒: sec, brightness = 1 }) => {
  const { 数: count, 色: color, 强: dustStrength, 种子: seed, 大小: size, driftSpeed, 起: scatterStart } = params.floatDust;
  const d = lightDir(params.azimuthDeg, params.elevationDeg);
  const pageHeight = useThree((s) => s.size.height);
  const particles = useMemo(() => {
    const r = mulberry32(seed);
    return Array.from({ length: count }, () => [r(), r(), r()] as const);
  }, [count, seed]);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    return g;
  }, [count]);
  const dustMaterial = useMemo(
    () =>
      flatMaterial(
        new THREE.PointsMaterial({
          color: toColor(color).multiplyScalar(dustStrength),
          sizeAttenuation: true,
          transparent: true,
          depthWrite: false,
          toneMapped: false,
          fog: false,
          blending: THREE.AdditiveBlending,
        }),
      ),
    [color, dustStrength],
  );
  // 点的大小在画之前按当时的相机算（机位组件在渲染时才设好相机）：
  // 透视：three 按 size × 画面半高 ÷ 深度 算像素、没乘视角，size 取 大小 ÷ tan(半视角) 才是 大小 格；
  // 正交：three 不按深度缩，size 就是页面像素，= 大小 × 页面高 × zoom ÷ 视体高
  useFrame(({ camera }) => {
    const c = camera as THREE.PerspectiveCamera & THREE.OrthographicCamera;
    dustMaterial.size = c.isOrthographicCamera ? (size * pageHeight * c.zoom) / (c.top - c.bottom) : size / Math.tan(rad(c.fov / 2));
  });
  useEffect(
    () => () => {
      geometry.dispose();
      dustMaterial.dispose();
    },
    [geometry, dustMaterial],
  );
  adjustBright(dustMaterial, '加', color, dustStrength, brightness);
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
  const doorHeight = opening.topEdge - opening.bottom;
  particles.forEach(([u, v, w], i) => {
    const vertFrac = (((v - (sec * driftSpeed) / doorHeight) % 1) + 1) % 1;
    const startPos = holePoint(opening, u, opening.bottom + doorHeight * vertFrac);
    const travel = ((startPos[2] - opening.bottom) / -d[2]) * (scatterStart + (1 - scatterStart) * w);
    pos.setXYZ(i, startPos[0] + d[0] * travel, startPos[1] + d[1] * travel, startPos[2] + d[2] * travel);
  });
  pos.needsUpdate = true;
  return <points geometry={geometry} material={dustMaterial} renderOrder={7} />;
};

/** 三样一起：地块、光带、浮尘。亮：0～1 一起乘（推门时跟着门开大）。光带：镜头站在门洞里时光带从头顶掠过、只看得见落地那截楔形，关掉。
 *  朝：见 门光光带（正交镜头给） */
export const DoorLight: React.FC<{ 参数: DoorLightParams; opening: DoorOpening; 眼: V3; dir?: V3; 秒?: number; ledges?: readonly Ledge[]; personShadow?: PersonShadow; brightness?: number; lightBand?: boolean }> = ({
  参数: params,
  opening,
  眼: eye,
  dir,
  秒: sec = 0,
  ledges,
  personShadow: figure,
  brightness = 1,
  lightBand = true,
}) => (
  <>
    <DoorLightGround 参数={params} opening={opening} ledges={ledges} personShadow={figure} brightness={brightness} />
    {lightBand && <DoorLightBand 参数={params} opening={opening} 眼={eye} dir={dir} brightness={brightness} />}
    {params.floatDust.数 > 0 && <DoorLightDust 参数={params} opening={opening} 秒={sec} brightness={brightness} />}
  </>
);
