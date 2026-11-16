// 隐世之境重逢核对的画面：按视图表一帧画一个视图，右下角写视图名（右下角本来就是封面的时长角标区，不挡构图）。
// 灯光先用一楼现成的那套（三渲二平涂底座还没并进来）。她用现成的魔法酒狐站姿（新表情、拿花另一路在做），头按门口的眼睛现算转过来看你。
import { ThreeCanvas } from '@remotion/three';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import type { V3 } from '@engine/model/parts.tsx';
import { standPose } from '@库/角色/骨架.tsx';
import { MagicalWineFox, magicalWineFoxLookAt } from '@库/角色/魔法酒狐.tsx';
import { uiFontFamily } from '@库/界面/基础.tsx';
import { PixelChatBar } from '@库/界面/像素聊天栏.tsx';
import { aspect } from '../../分镜/时间.ts';
import { FirstPersonRig } from '../../地点/机位.tsx';
import { pixelFont } from '../../界面/像素字.ts';
import { liYingLookAt, doorwayEye, HiddenLandReunionBackdrop, skyColor } from '../../场/2-隐世之境/布景.tsx';
import { liYing, cameraRig } from '../../场/2-隐世之境/参数.ts';
import { coverSafeArea } from '../../场/2-隐世之境/封面.ts';
import { CoverChatLine, ReunionBubble } from '../../场/2-隐世之境/叠层.tsx';
import { views, type View } from './视图.ts';
import { useViewIndex } from '@engine/段/时间.tsx';

const yellow = '#FFFF55';
// 成片画幅的封面：48.61 出的「Steve加入了游戏」到 49.96 过了 27 刻，还是满亮；聊天栏缩放照原版 2560×1440 的界面尺寸 6
const filmChat = { lines: [{ text: 'Steve加入了游戏', color: yellow, startTick: 0 }], 刻: 27, scale: 6 };

// 平面图的标注：浮在门楣（z 2～3）上面、不做深度测试、最后画，门光、屋顶都盖不住
const annotationHeight = 3.4;
const AnnotationMaterial: React.FC<{ 色: string }> = ({ 色: color }) => <meshBasicMaterial color={color} toneMapped={false} depthTest={false} depthWrite={false} transparent />;

/** 地图上一条有宽度的线：从 a 到 b（只取 x、y） */
const LineBetween: React.FC<{ a: V3; b: V3; 色: string; width?: number }> = ({ a, b, 色: color, width: width = 0.1 }) => {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  return (
    <mesh position={[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, annotationHeight]} rotation={[0, 0, Math.atan2(dy, dx)]} renderOrder={20}>
      <planeGeometry args={[Math.hypot(dx, dy), width]} />
      <AnnotationMaterial 色={color} />
    </mesh>
  );
};

const SquarePiece: React.FC<{ 位: V3; 色: string }> = ({ 位: pos, 色: color }) => (
  <mesh position={[pos[0], pos[1], annotationHeight]} renderOrder={20}>
    <planeGeometry args={[0.5, 0.5]} />
    <AnnotationMaterial 色={color} />
  </mesh>
);

/** 门口机位：脚、视线（到看点那么长）、横向视野的两条边（4 格长）；她：脚、身子朝向（1 格长） */
const Annotation: React.FC<{ bodyFacing: number }> = ({ bodyFacing }) => {
  const cyan = '#00e0ff';
  const markColor = '#ff40c0';
  const [ex, ey] = doorwayEye;
  const dirAngle = Math.atan2(cameraRig.看[1] - ey, cameraRig.看[0] - ex);
  const halfFovX = Math.atan(Math.tan(((cameraRig.fov / 2) * Math.PI) / 180) * (aspect.width / aspect.height));
  const edgePoint = (s: number): V3 => [ex + 4 * Math.cos(dirAngle + s * halfFovX), ey + 4 * Math.sin(dirAngle + s * halfFovX), 0];
  const y = (bodyFacing * Math.PI) / 180;
  return (
    <>
      <SquarePiece 位={doorwayEye} 色={cyan} />
      <LineBetween a={doorwayEye} b={cameraRig.看} 色={cyan} width={0.12} />
      <LineBetween a={doorwayEye} b={edgePoint(1)} 色={cyan} width={0.05} />
      <LineBetween a={doorwayEye} b={edgePoint(-1)} 色={cyan} width={0.05} />
      <SquarePiece 位={liYing.feet} 色={markColor} />
      <LineBetween a={liYing.feet} b={[liYing.feet[0] - Math.sin(y), liYing.feet[1] + Math.cos(y), 0]} 色={markColor} width={0.12} />
    </>
  );
};

const SafeAreaLayer: React.FC = () => {
  const { width: W, height: H } = aspect;
  const { fourThreeRect, bottomEdge, bottomRight } = coverSafeArea(W, H);
  const dimColor = 'rgba(0, 0, 0, 0.45)';
  const forbidden = 'rgba(255, 40, 40, 0.28)';
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: fourThreeRect.x0, height: H, background: dimColor }} />
      <div style={{ position: 'absolute', left: fourThreeRect.x1, top: 0, width: W - fourThreeRect.x1, height: H, background: dimColor }} />
      <div style={{ position: 'absolute', left: 0, top: bottomEdge.y0, width: W, height: H - bottomEdge.y0, background: forbidden, borderTop: '2px dashed #ff5050' }} />
      <div style={{ position: 'absolute', left: bottomRight.x0, top: bottomRight.y0, width: W - bottomRight.x0, height: H - bottomRight.y0, background: forbidden, border: '2px dashed #ff5050' }} />
      <div style={{ position: 'absolute', left: fourThreeRect.x0, top: 0, width: fourThreeRect.x1 - fourThreeRect.x0, height: H, boxSizing: 'border-box', border: '2px solid #ffe14d' }} />
    </AbsoluteFill>
  );
};

const rigOf = (v: View) => v.cameraRig ?? { 眼: doorwayEye, 看: cameraRig.看, fov: cameraRig.fov };

const World: React.FC<{ v: View }> = ({ v }) => {
  const rig = rigOf(v);
  const pose = { ...standPose(liYing.feet), yaw: v.bodyFacing ?? liYing.bodyFacing };
  const gaze = liYingLookAt(doorwayEye, pose);
  return (
    <ThreeCanvas width={aspect.width} height={aspect.height} gl={{ antialias: true }}>
      <color attach="background" args={[skyColor]} />
      <FirstPersonRig 眼={rig.眼} 看={rig.看} fov={rig.fov} near={'nearClip' in rig ? rig.nearClip : undefined} />
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <HiddenLandReunionBackdrop 眼={rig.眼} doorLight={v.doorLight ?? true}>
          {v.hasLiYing && <MagicalWineFox pose={pose} stancePose="站" 看={gaze} expression="无" />}
          {v.showAnnotation && <Annotation bodyFacing={pose.yaw} />}
        </HiddenLandReunionBackdrop>
      </group>
    </ThreeCanvas>
  );
};

const picture: React.FC = () => {
  const v = views[useViewIndex()]!;
  const rig = rigOf(v);
  const pose = { ...standPose(liYing.feet), yaw: v.bodyFacing ?? liYing.bodyFacing };
  const [pitch, yaw] = liYingLookAt(doorwayEye, pose);
  const faceAngle = magicalWineFoxLookAt(pose, doorwayEye, '站')[1];
  return (
    <AbsoluteFill style={{ background: '#1b1d22' }}>
      <World v={v} />
      {v.showBubble && <ReunionBubble cameraRig={rig} />}
      {v.chatMode === '片' && <PixelChatBar lines={filmChat.lines} 刻={filmChat.刻} scale={filmChat.scale} 字体={pixelFont} width={aspect.width} height={aspect.height} />}
      {v.chatMode === '封面' && <CoverChatLine />}
      {v.safeArea && <SafeAreaLayer />}
      <div style={{ position: 'absolute', right: 12, bottom: 8, textAlign: 'right', fontFamily: uiFontFamily, fontSize: 15, lineHeight: 1.35, color: '#ffffff', textShadow: '0 1px 3px #000' }}>
        <div>核对-隐世之境重逢 · {v.name}</div>
        {v.hasLiYing && (
          <div style={{ fontSize: 12 }}>
            身子朝向 {pose.yaw}°，头比身子多转 {yaw.toFixed(1)}°（正对你要 {faceAngle.toFixed(1)}°）、抬头 {pitch.toFixed(1)}°
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

export default picture;
