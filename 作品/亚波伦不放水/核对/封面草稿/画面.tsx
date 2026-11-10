// 封面草稿的画面：暗红渐变的天（CSS 渐变垫在透明画布下面）、平铺下界岩的地面（远处用雾化进天色）、娘化亚波伦持杖悬空、身后立着张满的多圈轮盘、地上的史蒂夫仰视。
// 方案表在 视图.ts。轮盘的时刻取完全张开（第 40 刻）。每个方案那一秒的前半（第 60i 帧）是干净的构图，后半（第 60i+30 帧）叠方案名和 4:3、3:4 裁切参考框。
import { useThree } from '@react-three/fiber';
import { ThreeCanvas } from '@remotion/three';
import React, { useMemo } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import * as THREE from 'three';
import { 摆相机 } from '@engine/core/three换算.ts';
import { png } from '@engine/model/贴图.ts';
import { use视图下标 } from '@engine/段/时间.tsx';
import { 轮盘世界面 } from '@库/界面/径向轮盘世界.tsx';
import { Steve, steveLookAt, stevePose } from '@库/角色/史蒂夫.tsx';
import 下界岩 from 'asset:贴图/方块/下界岩';
import { 画多圈轮盘, 轮盘外半径, type 多圈轮盘参数 } from '../../界面/多圈轮盘.tsx';
import { 娘化亚波伦, 悬停, 站立 } from '../../角色/娘化亚波伦.tsx';
import { 方案们, type 方案 } from './视图.ts';

const 天顶 = '#1a0406';
const 天边 = '#7a1810';
const 地边 = 200;

const 摆机位: React.FC<{ v: 方案 }> = ({ v }) => {
  const { camera, size, gl } = useThree();
  gl.toneMapping = THREE.NeutralToneMapping;
  摆相机(camera as THREE.PerspectiveCamera, v.机位, size.width / size.height);
  return null;
};

const 地面: React.FC = () => {
  const 贴图 = useMemo(() => {
    const 图 = png(下界岩);
    const t = new THREE.DataTexture(图.px, 图.w, 图.h, THREE.RGBAFormat);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(地边, 地边);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  }, []);
  return (
    <mesh>
      <planeGeometry args={[地边, 地边]} />
      <meshStandardMaterial map={贴图} roughness={1} />
    </mesh>
  );
};

const 场景: React.FC<{ v: 方案 }> = ({ v }) => {
  const 参: 多圈轮盘参数 = { 放: v.轮盘.放, 刻: 40 };
  const 半径 = Math.max(128, 轮盘外半径(参) + 4);
  const 头 = [0, 0, v.悬高 + 1.4] as const;
  const 史 = stevePose(v.史蒂夫.位, v.史蒂夫.yaw ?? 0);
  return (
    <>
      <摆机位 v={v} />
      <fog attach="fog" args={[天边, 30, 110]} />
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <ambientLight color="#ffb0a0" intensity={0.5 * Math.PI} />
        <directionalLight position={[-3, -6, 5]} color="#ffe0d0" intensity={0.7 * Math.PI} />
        <地面 />
        <娘化亚波伦 pose={{ loc: [0, 0, v.悬高], yaw: 180 }} 秒={1.4} 表演={v.表演 === '悬停' ? 悬停 : 站立} 姿势={v.姿势} 持杖 />
        <Steve pose={steveLookAt(史, [...头])} mcLight={1} />
        {/* 轮盘面在本地 XY、朝 +Z：立起来面朝南（−y） */}
        <group position={[0, v.轮盘.后, v.轮盘.心高]} rotation={[Math.PI / 2, 0, 0]}>
          <轮盘世界面 画={(位) => 画多圈轮盘(位, 参)} 半径={半径} 每像素格={v.轮盘.每像素格} 依赖={[JSON.stringify(参)]} renderOrder={-1} />
        </group>
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
  const { width, height, fps } = useVideoConfig();
  const 帧 = useCurrentFrame();
  const v = 方案们[Math.min(方案们.length - 1, use视图下标())]!;
  // 每个方案那一秒的前半是干净的构图，后半叠裁切参考框和方案名
  const 标注 = 帧 % fps >= fps / 2;
  return (
    <AbsoluteFill style={{ background: `linear-gradient(to bottom, ${天顶} 0%, #3a0a0a 45%, ${天边} 100%)` }}>
      <ThreeCanvas width={width} height={height} gl={{ antialias: true, alpha: true }}>
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
