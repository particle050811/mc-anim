// 核对段画面的共用件：画布、机位、中性灰台子（灯 + 地面）、左上角的视图名。新核对段照 anim new seg 核对-<名> 的模板用这些，不再各抄一份。
// 画布的 dpr 一律 canvasDpr(1)：不给 dpr 时 R3F 最多按 2 倍画，4K 档（截图 3 倍）就成了 2560 宽画完再放大（用户 11-16 定补上）。
// 场景内容放在 <ZUp> 里：场景坐标 Z 朝上，three 是 Y 朝上。
import { useThree } from '@react-three/fiber';
import { ThreeCanvas } from '@remotion/three';
import React from 'react';
import * as THREE from 'three';
import { canvasDpr } from '../core/渲染级别.ts';
import { placeEyeCamera } from '../core/three换算.ts';
import { checkViewAt, type CheckShot } from './核对段.ts';
import { useCurrentSec } from './时间.tsx';

/** 中性灰台子的颜色：底色（页面和画布清屏）、地面 */
export const checkGrey = { background: '#5a5e66', ground: '#8a8f98' } as const;

/** 一秒一个视图：当前这一秒的视图（过了最后一个停在最后一个） */
export const useCheckView = <V,>(views: readonly V[]): V => checkViewAt(views, useCurrentSec());

type CanvasProps = Omit<React.ComponentProps<typeof ThreeCanvas>, 'dpr' | 'gl'> & {
  /** 画布清屏色（<color attach="background">）；不给就透明，露出页面底色 */
  background?: string;
  /** 默认开。史蒂夫这类贴图没做 UV 内收的要关，不然轮廓冒出相邻格子的颜色 */
  antialias?: boolean;
  gl?: Omit<THREE.WebGLRendererParameters, 'antialias'>;
};

/** 核对段的 three 画布：dpr 跟着截图倍数走（见文件头） */
export const CheckCanvas: React.FC<CanvasProps> = ({ background, antialias = true, gl, children, ...rest }) => (
  <ThreeCanvas {...rest} gl={{ antialias, ...gl }} dpr={canvasDpr(1)}>
    {background && <color attach="background" args={[background]} />}
    {children}
  </ThreeCanvas>
);

/** 透视机位：中性色调映射、曝光 1，眼和看的点是场景坐标。aspect 不给用画布的 */
export const CheckCamera: React.FC<CheckShot & { near?: number; far?: number; aspect?: number }> = (props) => {
  const { camera, gl } = useThree();
  gl.toneMapping = THREE.NeutralToneMapping;
  gl.toneMappingExposure = 1.0;
  placeEyeCamera(camera as THREE.PerspectiveCamera, props);
  return null;
};

/** 场景坐标（Z 朝上）→ three（Y 朝上） */
export const ZUp: React.FC<{ children?: React.ReactNode }> = ({ children }) => <group rotation={[-Math.PI / 2, 0, 0]}>{children}</group>;

/** 中性灯：均匀的环境光加一盏正面偏上的平行光，看清形和贴图用 */
export const NeutralLights: React.FC = () => (
  <>
    <ambientLight intensity={0.55 * Math.PI} />
    <directionalLight position={[1.5, -4, 4]} intensity={0.6 * Math.PI} />
  </>
);

/** 地面：顶面在 z = 0 的一块薄板。size 是边长（或 [东西, 南北]），center 是板心的 x、y */
export const CheckGround: React.FC<{ size: number | readonly [number, number]; center?: readonly [number, number]; color?: string; z?: number }> = ({ size, center = [0, 0], color = checkGrey.ground, z = -0.05 }) => {
  const [width, depth] = typeof size === 'number' ? [size, size] : size;
  return (
    <mesh position={[center[0], center[1], z]}>
      <boxGeometry args={[width, depth, 0.1]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
};

/** 左上角（或左下角）的视图名和说明；children 是额外的小字行 */
export const CheckLabel: React.FC<{ title: React.ReactNode; note?: React.ReactNode; bottom?: boolean; fontSize?: number; noteSize?: number; children?: React.ReactNode }> = ({ title, note, bottom, fontSize = 22, noteSize = 16, children }) => (
  <div style={{ position: 'absolute', left: 16, ...(bottom ? { bottom: 12 } : { top: 12 }), color: '#ffffff', fontFamily: 'sans-serif', fontSize, lineHeight: 1.4, textShadow: '0 1px 3px #000' }}>
    <div>{title}</div>
    {note && <div style={{ fontSize: noteSize }}>{note}</div>}
    {children}
  </div>
);
