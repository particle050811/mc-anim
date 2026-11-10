// 晋升之环的画：原版贴片（照游戏）和本片自制的三个候选（方盒模型，自发光），以及戴到头后的摆法（史蒂夫戴的那层在 角色/戴环史蒂夫.tsx）。
// 形、游戏里的画法和出处都在 晋升之环形.ts 的文件头；用户 11-10 定史蒂夫戴它、娘化亚波伦头后的眼形大光环也换成它，候选还没挑。
// 原版贴片：贴图 贴图/特效/晋升之环/halo（启示录 textures/entity/player/halo.png，16×16），两面都画、两面看都不镜像（照 ModelPart 方盒南北两面的 UV），
//   加色混合、不受光、透明度 < 0.1 丢掉（energy_swirl）。加色的东西在亮底上会发白，游戏里就这样。
// 候选：每层的方盒并成一个网格，颜色按面的朝向压暗后写进顶点色（正面最亮，侧面、背面暗一些，看得出厚度），不受光、不过色调映射；
//   后面垫一张一格一个像素、分级的加色晕（本片加的，游戏里没有）。
// 环坐标：环面在 XY 平面，+Z 朝正面的观众，+Y 朝上，单位是戴的人的模型像素。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { png } from '@engine/model/贴图.ts';
import { entityTexture } from '@engine/model/贴图方盒.tsx';
import 贴片图 from 'asset:贴图/特效/晋升之环/halo';
import { 亚波伦头轴, 候选们, 原版环, 原版转角, 戴法, type 候选名, type 层, type 晕, type 环款 } from './晋升之环形.ts';

const 度 = Math.PI / 180;
/** '#rrggbb' → sRGB 数值 0～1 */
const 三色 = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];

// ── 原版贴片 ──
const 贴片材质 = () =>
  new THREE.MeshBasicMaterial({ map: entityTexture(png(贴片图)), blending: THREE.AdditiveBlending, alphaTest: 0.1, transparent: true, side: THREE.FrontSide, toneMapped: false });
let 贴片材质缓存: THREE.MeshBasicMaterial | undefined;
const 贴片几何 = new THREE.PlaneGeometry(原版环.边长, 原版环.边长);

/** 原版那张片（环坐标，环心在原点），按秒自转 */
export const 晋升之环贴片: React.FC<{ 秒: number }> = ({ 秒 }) => {
  const 材质 = (贴片材质缓存 ??= 贴片材质());
  return (
    <group rotation={[0, 0, 原版转角(秒) * 度]}>
      <mesh geometry={贴片几何} material={材质} />
      <mesh geometry={贴片几何} material={材质} rotation={[0, Math.PI, 0]} />
    </group>
  );
};

// ── 候选：方盒网格 ──
// 面朝哪边压多暗（sRGB 数值上乘）：正面 1，上 0.9，背面 0.8，左右 0.72，下 0.62
const 面亮度 = (n: THREE.Vector3) => (n.z > 0.5 ? 1 : n.z < -0.5 ? 0.8 : n.y > 0.5 ? 0.9 : n.y < -0.5 ? 0.62 : 0.72);
const 层几何 = (层: 层): THREE.BufferGeometry => {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const [v, n, 色, m] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Color(), new THREE.Matrix4()];
  for (const b of 层.盒们) {
    const 寸 = [b.大[0] - b.小[0], b.大[1] - b.小[1], b.大[2] - b.小[2]] as const;
    const g = new THREE.BoxGeometry(寸[0], 寸[1], 寸[2]);
    m.makeRotationZ((b.绕Z ?? 0) * 度).multiply(new THREE.Matrix4().makeTranslation(b.小[0] + 寸[0] / 2, b.小[1] + 寸[1] / 2, b.小[2] + 寸[2] / 2));
    const [p, nor, 底] = [g.getAttribute('position'), g.getAttribute('normal'), pos.length / 3];
    const 原 = 三色(b.色);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m);
      n.fromBufferAttribute(nor, i);
      const k = 面亮度(n);
      // 顶点色要线性值：先在 sRGB 数值上压暗再转
      色.setRGB(原[0] * k, 原[1] * k, 原[2] * k, THREE.SRGBColorSpace);
      pos.push(v.x, v.y, v.z);
      col.push(色.r, 色.g, 色.b);
    }
    for (const i of g.getIndex()!.array) idx.push(底 + i);
    g.dispose();
  }
  const 出 = new THREE.BufferGeometry();
  出.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  出.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  出.setIndex(idx);
  return 出;
};
const 盒材质 = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });

// 晕：一格一个像素，亮度分 4 级
const 晕贴图 = (晕: 晕): { 图: THREE.DataTexture; 边: number } => {
  const 半 = Math.ceil(晕.外 + 晕.宽);
  const 边 = 半 * 2;
  const px = new Uint8Array(边 * 边 * 4);
  const [r, g, b] = 三色(晕.色).map((c) => Math.round(c * 255)) as [number, number, number];
  for (let j = 0; j < 边; j++)
    for (let i = 0; i < 边; i++) {
      const 距 = Math.hypot(i + 0.5 - 半, j + 0.5 - 半);
      const 离带 = Math.max(0, 晕.内 - 距, 距 - 晕.外);
      const 级 = Math.ceil(Math.max(0, 1 - 离带 / 晕.宽) * 4) / 4;
      px.set([r, g, b, Math.round(255 * 级 * 级 * 晕.强)], (j * 边 + i) * 4);
    }
  const 图 = new THREE.DataTexture(px, 边, 边, THREE.RGBAFormat);
  图.colorSpace = THREE.SRGBColorSpace;
  图.magFilter = THREE.NearestFilter;
  图.minFilter = THREE.NearestFilter;
  图.needsUpdate = true;
  return { 图, 边 };
};

type 备好 = { 几何们: THREE.BufferGeometry[]; 晕几何: THREE.PlaneGeometry; 晕材质: THREE.MeshBasicMaterial; 晕z: number };
const 备好缓存 = new Map<候选名, 备好>();
const 备 = (名: 候选名): 备好 => {
  let 出 = 备好缓存.get(名);
  if (!出) {
    const 候选 = 候选们[名];
    const { 图, 边 } = 晕贴图(候选.晕);
    出 = {
      几何们: 候选.层们.map(层几何),
      晕几何: new THREE.PlaneGeometry(边, 边),
      // 加色、不写深度；雾不往上混（加色的东西混雾色会把暗底抬亮）
      晕材质: new THREE.MeshBasicMaterial({ map: 图, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.FrontSide, toneMapped: false, fog: false }),
      晕z: -2.5,
    };
    备好缓存.set(名, 出);
  }
  return 出;
};

/** 一个候选（环坐标，环心在原点），各层按秒转；晕 默认画 */
export const 晋升之环候选: React.FC<{ 款: 候选名; 秒: number; 晕?: boolean }> = ({ 款, 秒, 晕 = true }) => {
  const 好 = useMemo(() => 备(款), [款]);
  return (
    <>
      {候选们[款].层们.map((层, i) => {
        const p = 层.位姿(秒);
        const [c, e] = [p.中心 ?? [0, 0, 0], p.自转 ?? [0, 0, 0]];
        return (
          <group key={i} rotation={[0, 0, p.公转 * 度]}>
            <mesh geometry={好.几何们[i]!} material={盒材质} position={[c[0], c[1], c[2]]} rotation={[e[0] * 度, e[1] * 度, e[2] * 度]} />
          </group>
        );
      })}
      {/* 晕垫在环的后面：正面看的一张在环后，背面看的一张在环前（各只画朝观众的那面），哪边看都不盖住环 */}
      {晕 && <mesh geometry={好.晕几何} material={好.晕材质} position={[0, 0, 好.晕z]} renderOrder={1} />}
      {晕 && <mesh geometry={好.晕几何} material={好.晕材质} position={[0, 0, 5]} rotation={[0, Math.PI, 0]} renderOrder={1} />}
    </>
  );
};

/** 原版贴片或一个候选（环坐标，环心在原点） */
export const 晋升之环: React.FC<{ 款: 环款; 秒: number; 晕?: boolean }> = ({ 款, 秒, 晕 }) => (款 === '原版' ? <晋升之环贴片 秒={秒} /> : <晋升之环候选 款={款} 秒={秒} 晕={晕} />);

/** 戴在头后（头坐标：原点 = 头的转轴，+Y 朝上，+Z 朝脸的前方，单位是那个人的模型像素）：位置、前倾、大小照 晋升之环形.ts 的 戴法 */
export const 头后环: React.FC<{ 款: 环款; 秒: number; 戴: '史蒂夫' | '亚波伦' }> = ({ 款, 秒, 戴 }) => {
  const 法 = 戴法[戴][款];
  return (
    <group position={[法.位[0], 法.位[1], 法.位[2]]} rotation={[法.前倾度 * 度, 0, 0]} scale={法.倍}>
      <晋升之环 款={款} 秒={秒} />
    </group>
  );
};

/** 挂到娘化亚波伦的 aaabody 骨骼上（不跟头转，原因见 戴法 的注释）：先挪到站姿时 Head 的转轴，骨骼坐标正面朝 −Z，绕 Y 转半圈换成头坐标 */
export const 亚波伦头后环 = (款: 环款, 秒: number): React.ReactNode => (
  <group position={[亚波伦头轴[0], 亚波伦头轴[1], 亚波伦头轴[2]]} rotation={[0, Math.PI, 0]}>
    <头后环 款={款} 秒={秒} 戴="亚波伦" />
  </group>
);
