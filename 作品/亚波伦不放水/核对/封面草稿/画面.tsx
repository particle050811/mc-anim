// 封面草稿的画面：下界荒地的样子（不是真地形）——中间一块平的下界岩地，几处熔岩池（池边一圈岩浆块），四周的下界岩一级级垒高成坡，
// 暗红的雾和天；娘化亚波伦持下界魔杖悬空，多圈轮盘从杖尖张满（界面/杖尖轮盘.tsx），四稿及以前地上有史蒂夫仰视（五稿起不出镜，用户 11-10 定），有的方案加炼狱结界（本片的辉线，特效/炼狱结界辉线.tsx）。方案表在 视图.ts。
// 光：一盏中性的环境光加正面偏上的白主光（头发贴图是中性灰 64,64,64，一稿用偏橙的环境光和主光把它照成了棕色），背后下方一盏弱的橙色轮廓光，熔岩池上各一盏橙色点光。
// 八稿起镜头在她下方仰拍、被她的杖指着，机位由杖反算（界面/指杖机位.ts）。
// 轮盘的时刻取完全张开（第 40 刻）。每个方案那一秒的前半（第 60i 帧）是干净的构图，后半（第 60i+30 帧）叠方案名和 4:3、3:4 裁切参考框。
import { useThree } from '@react-three/fiber';
import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import * as THREE from 'three';
import { CheckCanvas, ZUp } from '@engine/段/核对画面.tsx';
import { smoothstep01 } from '@engine/core/数学.ts';
import { type Cam, sightDir } from '@engine/core/机位.ts';
import { hash2 } from '@engine/core/噪声.ts';
import { placeCamera } from '@engine/core/three换算.ts';
import { png, type Png } from '@engine/model/贴图.ts';
import { useCurrentSec, useViewIndex } from '@engine/段/时间.tsx';
import { Steve, steveLookAt, stevePose } from '@库/角色/史蒂夫.tsx';
import netherrackPng from 'asset:贴图/方块/下界岩';
import magmaBlockPng from 'asset:贴图/方块/岩浆块';
import lavaPng from 'asset:贴图/方块/熔岩';
import type { MultiRingParams } from '../../界面/多圈轮盘.tsx';
import { WandTipWheel } from '../../界面/杖尖轮盘.tsx';
import { GirlYaBoLun, hover, holdWandPose, stand } from '../../角色/娘化亚波伦.tsx';
import { AntiDark } from '../../角色/防暗.tsx';
import { HeldNetherWand, staffHeadCore } from '../../物品/下界魔杖.tsx';
import { RevelationCageGlow } from '../../特效/炼狱结界辉线.tsx';
import { ScreenAo } from '@engine/voxel/屏幕AO.tsx';
import { netherBrighter, RealNether } from '../../地点/真下界.tsx';
import { staffRig } from '../../界面/指杖机位.ts';
import { plans, type Plan } from './视图.ts';

const fogColor = '#3a0a07';
const zenithColor = '#050102';

// ── 地：格子坐标 (i, j) 的方块占 x ∈ [i, i+1)、y ∈ [j, j+1) ──
const bounds = { x0: -44, x1: 44, y0: -14, y1: 76 };
/** 值噪声（双线性），格距 尺 */
const noise = (x: number, y: number, period: number, seed: number) => {
  const [fx, fy] = [x / period, y / period];
  const [i, j] = [Math.floor(fx), Math.floor(fy)];
  const [u, v] = [smoothstep01(fx - i), smoothstep01(fy - j)];
  const topRow = hash2(i, j, seed) * (1 - u) + hash2(i + 1, j, seed) * u;
  const lowSample = hash2(i, j + 1, seed) * (1 - u) + hash2(i + 1, j + 1, seed) * u;
  return topRow * (1 - v) + lowSample * v;
};
// 熔岩池：[中心 x, 中心 y, 半径]。躲开四稿及以前各方案里史蒂夫站的地方
const pools: readonly [number, number, number][] = [
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
const isLava = (i: number, j: number) => pools.some(([cx, cy, r]) => Math.hypot(i + 0.5 - cx, j + 0.5 - cy) + (hash2(i, j, 7) - 0.5) * 1.2 < r);
/** 这一格垒几层（0 = 平地）：离场地中心 15 格以内是平的，往外越来越高，加两层噪声 */
const heightAt = (i: number, j: number): number => {
  if (isLava(i, j)) return 0;
  const dist = Math.hypot(i + 0.5, (j + 0.5 - 6) * 0.9);
  const farExcess = Math.max(0, dist - 15);
  const undulation = noise(i, j, 9, 1) * 0.75 + noise(i, j, 3.5, 2) * 0.25;
  const scatter = dist > 12 && hash2(i, j, 3) > 0.93 ? 1 : 0;
  return Math.max(0, Math.floor(farExcess * 0.42 * (0.35 + undulation * 1.5) + (farExcess > 0 ? undulation * 2.2 : 0) + scatter));
};

const blockTexture = (img: Png, frameHeight?: number) => {
  // 动画贴图只取最上面一帧
  const h = frameHeight ?? img.h;
  const t = new THREE.DataTexture(img.px.slice(0, img.w * h * 4), img.w, h, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
};

type CellPos = [number, number, number];
const CellGrid: React.FC<{ cells: readonly CellPos[]; children: React.ReactNode; geometry: THREE.BufferGeometry }> = ({ cells, children, geometry }) => {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    cells.forEach(([x, y, z], k) => ref.current!.setMatrixAt(k, m.makeTranslation(x, y, z)));
    ref.current!.instanceMatrix.needsUpdate = true;
  }, [cells]);
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, cells.length]} frustumCulled={false}>
      {children}
    </instancedMesh>
  );
};

const Terrain: React.FC = () => {
  const { 岩: rockCells, plainCells, lavaCells, edgeTiles, rockMap, lavaMap, edgeMap, box, 片: plane } = useMemo(() => {
    const rockCells: CellPos[] = [];
    const plainCells: CellPos[] = [];
    const lavaCells: CellPos[] = [];
    const edgeTiles: CellPos[] = [];
    for (let i = bounds.x0; i < bounds.x1; i++)
      for (let j = bounds.y0; j < bounds.y1; j++) {
        if (isLava(i, j)) {
          lavaCells.push([i + 0.5, j + 0.5, -0.12]);
          continue;
        }
        const h = heightAt(i, j);
        const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
        if (h === 0) (neighbors.some(([a, b]) => isLava(i + a, j + b)) ? edgeTiles : plainCells).push([i + 0.5, j + 0.5, 0]);
        // 只垒露得出来的那几层：从四邻里最矮的那一层起
        const bottom = Math.min(h, ...neighbors.map(([a, b]) => heightAt(i + a, j + b)));
        for (let k = bottom; k < h; k++) rockCells.push([i + 0.5, j + 0.5, k + 0.5]);
      }
    return { 岩: rockCells, plainCells, lavaCells, edgeTiles, rockMap: blockTexture(png(netherrackPng)), lavaMap: blockTexture(png(lavaPng), 16), edgeMap: blockTexture(png(magmaBlockPng), 16), box: new THREE.BoxGeometry(1, 1, 1), 片: new THREE.PlaneGeometry(1, 1) };
  }, []);
  return (
    <>
      <CellGrid cells={rockCells} geometry={box}>
        <meshStandardMaterial map={rockMap} roughness={1} />
      </CellGrid>
      <CellGrid cells={plainCells} geometry={plane}>
        <meshStandardMaterial map={rockMap} roughness={1} />
      </CellGrid>
      {/* 岩浆块、熔岩自己发光，不受光 */}
      <CellGrid cells={edgeTiles} geometry={plane}>
        <meshBasicMaterial map={edgeMap} color="#d8d8d8" />
      </CellGrid>
      <CellGrid cells={lavaCells} geometry={plane}>
        <meshBasicMaterial map={lavaMap} toneMapped={false} />
      </CellGrid>
      {/* 熔岩池的坑壁：池面比地面低 0.12 格，露出一圈暗边 */}
      <mesh position={[0, 0, -0.13]}>
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial color="#1a0503" />
      </mesh>
      {pools.map(([x, y, r], k) => (
        <pointLight key={k} position={[x, y, 1.1]} color="#ff7a22" intensity={r * r * 5} distance={r * 5 + 6} decay={1.6} />
      ))}
    </>
  );
};

/** 天：一个大球，贴一张从地平线的雾色往上暗到黑的竖向渐变，不吃雾。球心跟着镜头 */
const SkyDome: React.FC<{ 心: readonly number[] }> = ({ 心: center }) => {
  const skyTexImg = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 256;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    // 上半是天（0 = 天顶，0.5 = 地平线），下半是地平线以下
    g.addColorStop(0, zenithColor);
    g.addColorStop(0.3, '#0c0203');
    g.addColorStop(0.42, '#1f0504');
    g.addColorStop(0.5, fogColor);
    g.addColorStop(1, fogColor);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  return (
    // 球的两极在本地 Y 轴：转到场景的 Z 轴上
    <mesh position={[center[0]!, center[1]!, center[2]!]} rotation={[Math.PI / 2, 0, 0]} renderOrder={-10}>
      <sphereGeometry args={[400, 24, 24]} />
      <meshBasicMaterial map={skyTexImg} side={THREE.BackSide} fog={false} depthWrite={false} toneMapped={false} />
    </mesh>
  );
};

/** 一团加色的光（朝着镜头的片） */
const LightSpot: React.FC<{ 位: readonly number[]; 大: number; 色: string; strength?: number }> = ({ 位: pos, 大: size, 色: color, strength: spotStrength = 1 }) => {
  const spotTexImg = useMemo(() => {
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
    <sprite position={[pos[0]!, pos[1]!, pos[2]!]} scale={[size, size, 1]}>
      <spriteMaterial map={spotTexImg} color={color} opacity={spotStrength} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} fog={false} />
    </sprite>
  );
};

const PlaceRig: React.FC<{ cameraRig: Cam; far?: number }> = ({ cameraRig, far }) => {
  const { camera, size, gl } = useThree();
  gl.toneMapping = THREE.NeutralToneMapping;
  placeCamera(camera as THREE.PerspectiveCamera, cameraRig, size.width / size.height, far ? { far } : {});
  return null;
};

const Cage: React.FC<{ settings: NonNullable<Plan['cage']> }> = ({ settings }) => (
  <group position={[settings.心[0], settings.心[1], settings.心[2]]}>
    <RevelationCageGlow sec={settings.sec} radiusFactor={settings.radiusFactor} appearance={settings.appearance} />
  </group>
);

/**
 * 斜着看盘的机位（视图.ts 的 斜看盘）：杖的方向 d 在镜头坐标里要等于 sinθ·(cosφ·右 − sinφ·上) + cosθ·前（cosθ = 扁，φ = 斜），镜头不滚转。
 * 设镜头朝向的方位角 α（从北往东）、仰角 ε，h = d 的水平分量投到镜头朝向上的长度：(h, d.z) 转 −ε 得 (cosθ, −sinθ·sinφ)，解出 h、ε，再由 h 解 α（取杖指向画面右边的那个解）
 */
const diagLookRig = (d: readonly number[], aimCenter: readonly number[], settings: NonNullable<Plan['obliqueWheel']>, lens: number, aspectRatio: number): Cam => {
  const θ = Math.acos(settings.flatten);
  const upComp = -Math.sin(θ) * Math.sin((settings.angleDeg * Math.PI) / 180);
  const h2 = settings.flatten ** 2 + upComp ** 2 - d[2]! ** 2;
  const horizLen = Math.hypot(d[0]!, d[1]!);
  if (h2 < 0 || Math.sqrt(h2) > horizLen) throw new Error('封面草稿：杖这么陡，摆不出要的 扁、斜（镜头不滚转）');
  const h = Math.sqrt(h2);
  const ε = Math.atan2(d[2]!, h) - Math.atan2(upComp, settings.flatten);
  const α = Math.atan2(d[0]!, d[1]!) - Math.acos(h / horizLen);
  const forward = [Math.cos(ε) * Math.sin(α), Math.cos(ε) * Math.cos(α), Math.sin(ε)];
  const right = [Math.cos(α), -Math.sin(α), 0];
  const up = [-Math.sin(ε) * Math.sin(α), -Math.sin(ε) * Math.cos(α), Math.cos(ε)];
  // 圆心那个深度上画面的宽、高（格）：把镜头横着、竖着挪，圆心就落到 盘心 给的位置
  const width = (2 * settings.dist * 18) / lens;
  const [shiftRight, shiftUp] = [-(settings.wheelCenter[0] - 0.5) * width, (settings.wheelCenter[1] - 0.5) * (width / aspectRatio)];
  const pos = [0, 1, 2].map((i) => aimCenter[i]! - forward[i]! * settings.dist + right[i]! * shiftRight + up[i]! * shiftUp) as [number, number, number];
  return { pos, tgt: [pos[0] + forward[0]!, pos[1] + forward[1]!, pos[2] + forward[2]!], lens };
};

const Scene: React.FC<{ v: Plan }> = ({ v }) => {
  const aspectRatio = useThree((s) => s.size.width / s.size.height);
  const params: MultiRingParams = { 放: v.wheel.放, 刻: 40, dimLevel: v.wheel.dimLevel };
  const yaBoLun = v.yaBoLun;
  const yaBoLunProps = { pose: { loc: [...yaBoLun.位], yaw: yaBoLun.yaw ?? 180 }, sec: 1.4, act: yaBoLun.act === '悬停' ? hover : stand, bonePose: yaBoLun.bonePose };
  // 杖尖在哪、朝哪：和画她用同一份属性算
  // 杖握在手里是六稿起的挂法；五稿及以前的旧案照旧握法画，画面不动
  const newGrip = !!v.obliqueWheel || !!v.pointWand;
  const gripOffset = v.pointWand?.gripOffset;
  const staff = holdWandPose({ ...yaBoLunProps, gripOffset, oldGrip: !newGrip });
  // 盘心居中的方案：镜头朝向不变（手臂的角度是照这个朝向搜的），整个平移到光轴穿过圆心（杖尖再沿杖身伸出 离尖）
  const cameraRig = useMemo((): Cam => {
    const aimCenter = [0, 1, 2].map((i) => staff.tip[i]! + staff.axis[i]! * (v.wheel.placement.tipOffset ?? 0));
    if (v.obliqueWheel) return diagLookRig(staff.axis, aimCenter, v.obliqueWheel, v.cameraRig.lens, aspectRatio);
    if (v.pointWand?.lookMid) {
      // 扫角度用：镜头位置照 θ 反算，但对准盘心和她胸口的中点，哪个角度她和盘都在画里
      const camPos = staffRig({ 心: aimCenter, d: staff.axis, θ: v.pointWand.θ, azimuthDeg: v.pointWand.azimuthDeg, dist: v.pointWand.dist, lens: v.cameraRig.lens, discCenterPicture: [0.5, 0.5], aspectRatio }).pos;
      const chest = [v.yaBoLun.位[0], v.yaBoLun.位[1], v.yaBoLun.位[2] + 1];
      return { pos: camPos, tgt: [0, 1, 2].map((i) => (aimCenter[i]! + chest[i]!) / 2) as [number, number, number], lens: v.cameraRig.lens };
    }
    if (v.pointWand) return staffRig({ 心: aimCenter, d: staff.axis, θ: v.pointWand.θ, azimuthDeg: v.pointWand.azimuthDeg, dist: v.pointWand.dist, lens: v.cameraRig.lens, discCenterPicture: v.pointWand.wheelCenter, aspectRatio });
    if (!v.wheelCentered) return v.cameraRig;
    const viewDir = sightDir(v.cameraRig);
    const depth = [0, 1, 2].reduce((sum, i) => sum + (aimCenter[i]! - v.cameraRig.pos[i]!) * viewDir[i]!, 0);
    const moveVec = [0, 1, 2].map((i) => aimCenter[i]! - v.cameraRig.pos[i]! - viewDir[i]! * depth);
    const shiftPoint = (p: readonly number[]) => [p[0]! + moveVec[0]!, p[1]! + moveVec[1]!, p[2]! + moveVec[2]!] as [number, number, number];
    return { ...v.cameraRig, pos: shiftPoint(v.cameraRig.pos), tgt: shiftPoint(v.cameraRig.tgt) };
  }, [v, staff, aspectRatio]);
  // 盘的圆心：默认就是杖尖；要退后的顺着镜头到杖尖的视线挪，画面上位置不变
  const eye = cameraRig.pos;
  const eyeToTip = Math.hypot(staff.tip[0] - eye[0], staff.tip[1] - eye[1], staff.tip[2] - eye[2]);
  const backOffRatio = (v.wheel.backOff ?? 0) / eyeToTip;
  const wheelWand = { tip: [0, 1, 2].map((i) => staff.tip[i]! + (staff.tip[i]! - eye[i]!) * backOffRatio) as [number, number, number], axis: staff.axis };
  const headPos = [yaBoLun.位[0], yaBoLun.位[1], yaBoLun.位[2] + 1.4] as const;
  const wandGlow = useMemo(() => v.wandTipGlow && <LightSpot 位={staffHeadCore} 大={1.1} 色="#ff8a30" strength={0.9} />, [v.wandTipGlow]);
  const wandMount = useMemo(() => ({ RightHandLocator: <HeldNetherWand>{wandGlow}</HeldNetherWand> }), [wandGlow]);
  const { facing, ...placement } = v.wheel.placement;
  return (
    <>
      <PlaceRig cameraRig={cameraRig} far={v.farView ? 1400 : undefined} />
      {v.farView ? <ScreenAo /> : <fog attach="fog" args={[fogColor, 16, 70]} />}
      <ZUp>
        {!v.farView && <SkyDome 心={cameraRig.pos} />}
        {/* 真下界自己带灯（地点/真下界.tsx），再加这几盏会把地形照得比用户看过的亮 */}
        {!v.farView && (
          <>
            <ambientLight color="#ffffff" intensity={0.3 * Math.PI} />
            <directionalLight position={[-2.5, -6, 4]} color="#fff2ea" intensity={0.55 * Math.PI} />
            {/* 轮廓光：从背后下方往上打。要弱、淡：强的饱和橙光会把黑衣服照成棕色 */}
            <directionalLight position={[2, 7, -4]} color="#ff8a5c" intensity={0.35 * Math.PI} />
          </>
        )}
        {v.farView ? <RealNether cameraPos={cameraRig.pos} 光={netherBrighter} /> : <Terrain />}
        <AntiDark lift={v.figureBrighten ?? 0}>{newGrip ? <GirlYaBoLun {...yaBoLunProps} holdWand gripOffset={gripOffset} wandOverlay={wandGlow} /> : <GirlYaBoLun {...yaBoLunProps} attach={wandMount} />}</AntiDark>
        {v.steve && <Steve pose={steveLookAt(stevePose(v.steve.位, 0), [...(v.steve.看 ?? headPos)])} mcLight={1} />}
        {v.cage && <Cage settings={v.cage} />}
        <WandTipWheel 杖={wheelWand} facing={facing === '正对镜头' ? { faceCamera: cameraRig } : facing} {...placement} params={params} cellsPerPixel={v.wheel.cellsPerPixel} renderOrder={v.wheel.wheelInFront ? 5 : -1} />
      </ZUp>
    </>
  );
};

/** 裁切参考：4:3（B 站动态、横版缩略）和 3:4（抖音竖版封面）的框，上下顶满、以 裁切中线 为中线 */
const CropFrame: React.FC<{ centerLine: number }> = ({ centerLine }) => {
  const { width, height } = useVideoConfig();
  const cropFrame = (aspect: number, color: string, text: string) => {
    const cropWidth = height * aspect;
    const left = Math.max(0, Math.min(width - cropWidth, width * centerLine - cropWidth / 2));
    return (
      <div style={{ position: 'absolute', left: left, top: 0, width: cropWidth, height, boxSizing: 'border-box', border: `2px solid ${color}` }}>
        <div style={{ position: 'absolute', left: 6, bottom: 4, color: color, fontFamily: 'sans-serif', fontSize: 13, textShadow: '0 1px 2px #000' }}>{text}</div>
      </div>
    );
  };
  return (
    <>
      {cropFrame(4 / 3, '#ffe14d', '4:3')}
      {cropFrame(3 / 4, '#4dd2ff', '3:4')}
    </>
  );
};

const picture: React.FC = () => {
  const { width, height } = useVideoConfig();
  const sec = useCurrentSec();
  const v = plans[Math.min(plans.length - 1, useViewIndex())]!;
  // 每个方案那一秒的前半是干净的构图，后半叠裁切参考框和方案名
  const annotationBlink = sec % 1 >= 0.5;
  return (
    <AbsoluteFill style={{ background: zenithColor }}>
      <CheckCanvas width={width} height={height}>
        <Scene v={v} />
      </CheckCanvas>
      {annotationBlink && (
        <>
          <CropFrame centerLine={v.cropCenterLine} />
          <div style={{ position: 'absolute', left: 14, top: 10, color: '#ffffff', fontFamily: 'sans-serif', fontSize: 18, lineHeight: 1.4, textShadow: '0 1px 3px #000', maxWidth: width * 0.5 }}>
            <div>{v.name}</div>
            <div style={{ fontSize: 13 }}>{v.note}</div>
          </div>
        </>
      )}
    </AbsoluteFill>
  );
};

export default picture;
