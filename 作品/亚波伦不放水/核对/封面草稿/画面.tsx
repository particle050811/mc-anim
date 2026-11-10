// 封面草稿的画面：下界荒地的样子（不是真地形）——中间一块平的下界岩地，几处熔岩池（池边一圈岩浆块），四周的下界岩一级级垒高成坡，
// 暗红的雾和天；娘化亚波伦持下界魔杖悬空，多圈轮盘从杖尖张满（界面/杖尖轮盘.tsx），地上的史蒂夫仰视，有的方案加炼狱结界（本片的辉线，特效/炼狱结界辉线.tsx）。方案表在 视图.ts。
// 光：一盏中性的环境光加正面偏上的白主光（头发贴图是中性灰 64,64,64，一稿用偏橙的环境光和主光把它照成了棕色），背后下方一盏弱的橙色轮廓光，熔岩池上各一盏橙色点光。
// 轮盘的时刻取完全张开（第 40 刻）。每个方案那一秒的前半（第 60i 帧）是干净的构图，后半（第 60i+30 帧）叠方案名和 4:3、3:4 裁切参考框。
import { useThree } from '@react-three/fiber';
import { ThreeCanvas } from '@remotion/three';
import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import * as THREE from 'three';
import { smoothstep01 } from '@engine/core/数学.ts';
import { hash2 } from '@engine/core/噪声.ts';
import { 摆相机 } from '@engine/core/three换算.ts';
import { png, type Png } from '@engine/model/贴图.ts';
import { use当前秒, use视图下标 } from '@engine/段/时间.tsx';
import { Steve, steveLookAt, stevePose } from '@库/角色/史蒂夫.tsx';
import 下界岩 from 'asset:贴图/方块/下界岩';
import 岩浆块 from 'asset:贴图/方块/岩浆块';
import 熔岩 from 'asset:贴图/方块/熔岩';
import type { 多圈轮盘参数 } from '../../界面/多圈轮盘.tsx';
import { 杖尖轮盘 } from '../../界面/杖尖轮盘.tsx';
import { 娘化亚波伦, 悬停, 持杖位姿, 站立 } from '../../角色/娘化亚波伦.tsx';
import { 手持下界魔杖, 杖头芯 } from '../../物品/下界魔杖.tsx';
import { 炼狱结界辉线 } from '../../特效/炼狱结界辉线.tsx';
import { 方案们, type 方案 } from './视图.ts';

const 雾色 = '#3a0a07';
const 天顶色 = '#050102';

// ── 地：格子坐标 (i, j) 的方块占 x ∈ [i, i+1)、y ∈ [j, j+1) ──
const 范围 = { x0: -44, x1: 44, y0: -14, y1: 76 };
/** 值噪声（双线性），格距 尺 */
const 噪声 = (x: number, y: number, 尺: number, 种: number) => {
  const [fx, fy] = [x / 尺, y / 尺];
  const [i, j] = [Math.floor(fx), Math.floor(fy)];
  const [u, v] = [smoothstep01(fx - i), smoothstep01(fy - j)];
  const 上 = hash2(i, j, 种) * (1 - u) + hash2(i + 1, j, 种) * u;
  const 下 = hash2(i, j + 1, 种) * (1 - u) + hash2(i + 1, j + 1, 种) * u;
  return 上 * (1 - v) + 下 * v;
};
// 熔岩池：[中心 x, 中心 y, 半径]。躲开各方案里史蒂夫站的地方
const 池们: readonly [number, number, number][] = [
  [-6.5, 2.5, 2.3],
  [7.5, 4.5, 2.8],
  [-1.5, 13.5, 3.2],
  [-13, 12, 3.6],
  [13.5, 15, 3.4],
  [3.5, -4, 1.7],
  [-4.5, -6.5, 1.5],
  [-20, 24, 4.5],
  [20, 30, 5],
];
const 是熔岩 = (i: number, j: number) => 池们.some(([cx, cy, r]) => Math.hypot(i + 0.5 - cx, j + 0.5 - cy) + (hash2(i, j, 7) - 0.5) * 1.2 < r);
/** 这一格垒几层（0 = 平地）：离场地中心 15 格以内是平的，往外越来越高，加两层噪声 */
const 高 = (i: number, j: number): number => {
  if (是熔岩(i, j)) return 0;
  const 远 = Math.hypot(i + 0.5, (j + 0.5 - 6) * 0.9);
  const 坡 = Math.max(0, 远 - 15);
  const 起伏 = 噪声(i, j, 9, 1) * 0.75 + 噪声(i, j, 3.5, 2) * 0.25;
  const 零碎 = 远 > 12 && hash2(i, j, 3) > 0.93 ? 1 : 0;
  return Math.max(0, Math.floor(坡 * 0.42 * (0.35 + 起伏 * 1.5) + (坡 > 0 ? 起伏 * 2.2 : 0) + 零碎));
};

const 方块贴图 = (图: Png, 帧高?: number) => {
  // 动画贴图只取最上面一帧
  const h = 帧高 ?? 图.h;
  const t = new THREE.DataTexture(图.px.slice(0, 图.w * h * 4), 图.w, h, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
};

type 格 = [number, number, number];
const 摆格: React.FC<{ 格们: readonly 格[]; children: React.ReactNode; 几何: THREE.BufferGeometry }> = ({ 格们, children, 几何 }) => {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    格们.forEach(([x, y, z], k) => ref.current!.setMatrixAt(k, m.makeTranslation(x, y, z)));
    ref.current!.instanceMatrix.needsUpdate = true;
  }, [格们]);
  return (
    <instancedMesh ref={ref} args={[几何, undefined, 格们.length]} frustumCulled={false}>
      {children}
    </instancedMesh>
  );
};

const 地形: React.FC = () => {
  const { 岩, 平, 浆, 边, 岩图, 浆图, 边图, 方, 片 } = useMemo(() => {
    const 岩: 格[] = [];
    const 平: 格[] = [];
    const 浆: 格[] = [];
    const 边: 格[] = [];
    for (let i = 范围.x0; i < 范围.x1; i++)
      for (let j = 范围.y0; j < 范围.y1; j++) {
        if (是熔岩(i, j)) {
          浆.push([i + 0.5, j + 0.5, -0.12]);
          continue;
        }
        const h = 高(i, j);
        const 邻 = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
        if (h === 0) (邻.some(([a, b]) => 是熔岩(i + a, j + b)) ? 边 : 平).push([i + 0.5, j + 0.5, 0]);
        // 只垒露得出来的那几层：从四邻里最矮的那一层起
        const 底 = Math.min(h, ...邻.map(([a, b]) => 高(i + a, j + b)));
        for (let k = 底; k < h; k++) 岩.push([i + 0.5, j + 0.5, k + 0.5]);
      }
    return { 岩, 平, 浆, 边, 岩图: 方块贴图(png(下界岩)), 浆图: 方块贴图(png(熔岩), 16), 边图: 方块贴图(png(岩浆块), 16), 方: new THREE.BoxGeometry(1, 1, 1), 片: new THREE.PlaneGeometry(1, 1) };
  }, []);
  return (
    <>
      <摆格 格们={岩} 几何={方}>
        <meshStandardMaterial map={岩图} roughness={1} />
      </摆格>
      <摆格 格们={平} 几何={片}>
        <meshStandardMaterial map={岩图} roughness={1} />
      </摆格>
      {/* 岩浆块、熔岩自己发光，不受光 */}
      <摆格 格们={边} 几何={片}>
        <meshBasicMaterial map={边图} color="#d8d8d8" />
      </摆格>
      <摆格 格们={浆} 几何={片}>
        <meshBasicMaterial map={浆图} toneMapped={false} />
      </摆格>
      {/* 熔岩池的坑壁：池面比地面低 0.12 格，露出一圈暗边 */}
      <mesh position={[0, 0, -0.13]}>
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial color="#1a0503" />
      </mesh>
      {池们.map(([x, y, r], k) => (
        <pointLight key={k} position={[x, y, 1.1]} color="#ff7a22" intensity={r * r * 5} distance={r * 5 + 6} decay={1.6} />
      ))}
    </>
  );
};

/** 天：一个大球，贴一张从地平线的雾色往上暗到黑的竖向渐变，不吃雾。球心跟着镜头 */
const 天: React.FC<{ 心: readonly number[] }> = ({ 心 }) => {
  const 图 = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 256;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    // 上半是天（0 = 天顶，0.5 = 地平线），下半是地平线以下
    g.addColorStop(0, 天顶色);
    g.addColorStop(0.3, '#0c0203');
    g.addColorStop(0.42, '#1f0504');
    g.addColorStop(0.5, 雾色);
    g.addColorStop(1, 雾色);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  return (
    // 球的两极在本地 Y 轴：转到场景的 Z 轴上
    <mesh position={[心[0]!, 心[1]!, 心[2]!]} rotation={[Math.PI / 2, 0, 0]} renderOrder={-10}>
      <sphereGeometry args={[400, 24, 24]} />
      <meshBasicMaterial map={图} side={THREE.BackSide} fog={false} depthWrite={false} toneMapped={false} />
    </mesh>
  );
};

/** 一团加色的光（朝着镜头的片） */
const 光斑: React.FC<{ 位: readonly number[]; 大: number; 色: string; 强?: number }> = ({ 位, 大, 色, 强 = 1 }) => {
  const 图 = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }, []);
  return (
    <sprite position={[位[0]!, 位[1]!, 位[2]!]} scale={[大, 大, 1]}>
      <spriteMaterial map={图} color={色} opacity={强} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} fog={false} />
    </sprite>
  );
};

const 摆机位: React.FC<{ v: 方案 }> = ({ v }) => {
  const { camera, size, gl } = useThree();
  gl.toneMapping = THREE.NeutralToneMapping;
  摆相机(camera as THREE.PerspectiveCamera, v.机位, size.width / size.height);
  return null;
};

const 结界: React.FC<{ 设: NonNullable<方案['结界']> }> = ({ 设 }) => (
  <group position={[设.心[0], 设.心[1], 设.心[2]]}>
    <炼狱结界辉线 秒={设.秒} 半径系数={设.半径系数} 外观={设.外观} />
  </group>
);

const 场景: React.FC<{ v: 方案 }> = ({ v }) => {
  const 参: 多圈轮盘参数 = { 放: v.轮盘.放, 刻: 40, 压暗: v.轮盘.压暗 };
  const 她 = v.亚波伦;
  const 她属性 = { pose: { loc: [...她.位], yaw: 她.yaw ?? 180 }, 秒: 1.4, 表演: 她.表演 === '悬停' ? 悬停 : 站立, 姿势: 她.姿势 };
  // 杖尖在哪、朝哪：和画她用同一份属性算
  const 杖 = 持杖位姿(她属性);
  // 盘的圆心：默认就是杖尖；要退后的顺着镜头到杖尖的视线挪，画面上位置不变
  const 眼 = v.机位.pos;
  const 眼到尖 = Math.hypot(杖.尖[0] - 眼[0], 杖.尖[1] - 眼[1], 杖.尖[2] - 眼[2]);
  const 退 = (v.轮盘.退后 ?? 0) / 眼到尖;
  const 盘杖 = { 尖: [0, 1, 2].map((i) => 杖.尖[i]! + (杖.尖[i]! - 眼[i]!) * 退) as [number, number, number], 轴: 杖.轴 };
  const 头 = [她.位[0], 她.位[1], 她.位[2] + 1.4] as const;
  const 史 = stevePose(v.史蒂夫.位, 0);
  const 杖挂 = useMemo(() => ({ RightHandLocator: <手持下界魔杖>{v.杖头光 && <光斑 位={杖头芯} 大={1.1} 色="#ff8a30" 强={0.9} />}</手持下界魔杖> }), [v.杖头光]);
  const { 朝向, ...摆法 } = v.轮盘.摆法;
  return (
    <>
      <摆机位 v={v} />
      <fog attach="fog" args={[雾色, 16, 70]} />
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <天 心={v.机位.pos} />
        <ambientLight color="#ffffff" intensity={0.3 * Math.PI} />
        <directionalLight position={[-2.5, -6, 4]} color="#fff2ea" intensity={0.55 * Math.PI} />
        {/* 轮廓光：从背后下方往上打。要弱、淡：强的饱和橙光会把黑衣服照成棕色 */}
        <directionalLight position={[2, 7, -4]} color="#ff8a5c" intensity={0.35 * Math.PI} />
        <地形 />
        <娘化亚波伦 {...她属性} 挂载={杖挂} />
        <Steve pose={steveLookAt(史, [...(v.史蒂夫.看 ?? 头)])} mcLight={1} />
        {v.结界 && <结界 设={v.结界} />}
        <杖尖轮盘 杖={盘杖} 朝向={朝向 === '正对镜头' ? { 正对: v.机位 } : 朝向} {...摆法} 参={参} 每像素格={v.轮盘.每像素格} renderOrder={v.轮盘.盘在前 ? 5 : -1} />
      </group>
    </>
  );
};

/** 裁切参考：4:3（B 站动态、横版缩略）和 3:4（抖音竖版封面）的框，上下顶满、以 裁切中线 为中线 */
const 裁切框: React.FC<{ 中线: number }> = ({ 中线 }) => {
  const { width, height } = useVideoConfig();
  const 框 = (比: number, 色: string, 字: string) => {
    const 宽 = height * 比;
    const 左 = Math.max(0, Math.min(width - 宽, width * 中线 - 宽 / 2));
    return (
      <div style={{ position: 'absolute', left: 左, top: 0, width: 宽, height, boxSizing: 'border-box', border: `2px solid ${色}` }}>
        <div style={{ position: 'absolute', left: 6, bottom: 4, color: 色, fontFamily: 'sans-serif', fontSize: 13, textShadow: '0 1px 2px #000' }}>{字}</div>
      </div>
    );
  };
  return (
    <>
      {框(4 / 3, '#ffe14d', '4:3')}
      {框(3 / 4, '#4dd2ff', '3:4')}
    </>
  );
};

const 画面: React.FC = () => {
  const { width, height } = useVideoConfig();
  const 秒 = use当前秒();
  const v = 方案们[Math.min(方案们.length - 1, use视图下标())]!;
  // 每个方案那一秒的前半是干净的构图，后半叠裁切参考框和方案名
  const 标注 = 秒 % 1 >= 0.5;
  return (
    <AbsoluteFill style={{ background: 天顶色 }}>
      <ThreeCanvas width={width} height={height} gl={{ antialias: true }}>
        <场景 v={v} />
      </ThreeCanvas>
      {标注 && (
        <>
          <裁切框 中线={v.裁切中线} />
          <div style={{ position: 'absolute', left: 14, top: 10, color: '#ffffff', fontFamily: 'sans-serif', fontSize: 18, lineHeight: 1.4, textShadow: '0 1px 3px #000', maxWidth: width * 0.5 }}>
            <div>{v.名}</div>
            <div style={{ fontSize: 13 }}>{v.说明}</div>
          </div>
        </>
      )}
    </AbsoluteFill>
  );
};

export default 画面;
