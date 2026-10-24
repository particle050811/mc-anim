// 隐世之境重逢核对的画面：按视图表一帧画一个视图，右下角写视图名（右下角本来就是封面的时长角标区，不挡构图）。
// 灯光先用一楼现成的那套（三渲二平涂底座还没并进来）。她用现成的魔法酒狐站姿（新表情、拿花另一路在做），头按门口的眼睛现算转过来看你。
import { ThreeCanvas } from '@remotion/three';
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import type { V3 } from '@engine/model/parts.tsx';
import { standPose } from '@库/角色/骨架.tsx';
import { MagicalWineFox, magicalWineFoxLookAt } from '@库/角色/魔法酒狐.tsx';
import { uiFontFamily } from '@库/界面/基础.tsx';
import { 像素聊天栏 } from '@库/界面/像素聊天栏.tsx';
import { 画幅 } from '../../分镜.ts';
import { 第一人称机位 } from '../../地点/机位.tsx';
import { 像素字 } from '../../界面/像素字.ts';
import { 她看你, 门口眼, 隐世之境重逢布景, 天色 } from '../../场/2-隐世之境/布景.tsx';
import { 她, 机位 } from '../../场/2-隐世之境/参数.ts';
import { 封面安全区 } from '../../场/2-隐世之境/封面.ts';
import { 封面聊天行, 重逢气泡 } from '../../场/2-隐世之境/叠层.tsx';
import { 视图们, type 视图 } from './视图.ts';

const 黄 = '#FFFF55';
// 片里：48.61 出的「Steve加入了游戏」到 49.96 过了 27 刻，还是满亮；聊天栏缩放照原版 2560×1440 的界面尺寸 6
const 片里聊天 = { 行们: [{ text: 'Steve加入了游戏', color: 黄, 起刻: 0 }], 刻: 27, 缩放: 6 };

// 平面图的标注：浮在门楣（z 2～3）上面、不做深度测试、最后画，门光、屋顶都盖不住
const 标注高 = 3.4;
const 标注料: React.FC<{ 色: string }> = ({ 色 }) => <meshBasicMaterial color={色} toneMapped={false} depthTest={false} depthWrite={false} transparent />;

/** 地图上一条有宽度的线：从 a 到 b（只取 x、y） */
const 线: React.FC<{ a: V3; b: V3; 色: string; 宽?: number }> = ({ a, b, 色, 宽 = 0.1 }) => {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  return (
    <mesh position={[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 标注高]} rotation={[0, 0, Math.atan2(dy, dx)]} renderOrder={20}>
      <planeGeometry args={[Math.hypot(dx, dy), 宽]} />
      <标注料 色={色} />
    </mesh>
  );
};

const 方片: React.FC<{ 位: V3; 色: string }> = ({ 位, 色 }) => (
  <mesh position={[位[0], 位[1], 标注高]} renderOrder={20}>
    <planeGeometry args={[0.5, 0.5]} />
    <标注料 色={色} />
  </mesh>
);

/** 门口机位：脚、视线（到看点那么长）、横向视野的两条边（4 格长）；她：脚、身子朝向（1 格长） */
const 标注: React.FC<{ 身子朝向: number }> = ({ 身子朝向 }) => {
  const 青 = '#00e0ff';
  const 品 = '#ff40c0';
  const [ex, ey] = 门口眼;
  const 向 = Math.atan2(机位.看[1] - ey, 机位.看[0] - ex);
  const 半横 = Math.atan(Math.tan(((机位.视角 / 2) * Math.PI) / 180) * (画幅.宽 / 画幅.高));
  const 边 = (s: number): V3 => [ex + 4 * Math.cos(向 + s * 半横), ey + 4 * Math.sin(向 + s * 半横), 0];
  const y = (身子朝向 * Math.PI) / 180;
  return (
    <>
      <方片 位={门口眼} 色={青} />
      <线 a={门口眼} b={机位.看} 色={青} 宽={0.12} />
      <线 a={门口眼} b={边(1)} 色={青} 宽={0.05} />
      <线 a={门口眼} b={边(-1)} 色={青} 宽={0.05} />
      <方片 位={她.脚} 色={品} />
      <线 a={她.脚} b={[她.脚[0] - Math.sin(y), 她.脚[1] + Math.cos(y), 0]} 色={品} 宽={0.12} />
    </>
  );
};

const 安全区层: React.FC = () => {
  const { 宽: W, 高: H } = 画幅;
  const { 四比三, 底边, 右下角 } = 封面安全区(W, H);
  const 遮 = 'rgba(0, 0, 0, 0.45)';
  const 禁 = 'rgba(255, 40, 40, 0.28)';
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 四比三.x0, height: H, background: 遮 }} />
      <div style={{ position: 'absolute', left: 四比三.x1, top: 0, width: W - 四比三.x1, height: H, background: 遮 }} />
      <div style={{ position: 'absolute', left: 0, top: 底边.y0, width: W, height: H - 底边.y0, background: 禁, borderTop: '2px dashed #ff5050' }} />
      <div style={{ position: 'absolute', left: 右下角.x0, top: 右下角.y0, width: W - 右下角.x0, height: H - 右下角.y0, background: 禁, border: '2px dashed #ff5050' }} />
      <div style={{ position: 'absolute', left: 四比三.x0, top: 0, width: 四比三.x1 - 四比三.x0, height: H, boxSizing: 'border-box', border: '2px solid #ffe14d' }} />
    </AbsoluteFill>
  );
};

const 机位于 = (v: 视图) => v.机位 ?? { 眼: 门口眼, 看: 机位.看, 视角: 机位.视角 };

const 世界: React.FC<{ v: 视图 }> = ({ v }) => {
  const 机 = 机位于(v);
  const 姿势 = { ...standPose(她.脚), yaw: v.身子朝向 ?? 她.身子朝向 };
  const 看 = 她看你(门口眼, 姿势);
  return (
    <ThreeCanvas width={画幅.宽} height={画幅.高} gl={{ antialias: true }}>
      <color attach="background" args={[天色]} />
      <第一人称机位 眼={机.眼} 看={机.看} 视角={机.视角} near={'近' in 机 ? 机.近 : undefined} />
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <隐世之境重逢布景 眼={机.眼} 门光={v.门光 ?? true}>
          {v.她 && <MagicalWineFox pose={姿势} 姿势="站" 看={看} 表情="无" />}
          {v.标注 && <标注 身子朝向={姿势.yaw} />}
        </隐世之境重逢布景>
      </group>
    </ThreeCanvas>
  );
};

const 画面: React.FC = () => {
  const v = 视图们[useCurrentFrame()]!;
  const 机 = 机位于(v);
  const 姿势 = { ...standPose(她.脚), yaw: v.身子朝向 ?? 她.身子朝向 };
  const [俯仰, 左右] = 她看你(门口眼, 姿势);
  const 正对 = magicalWineFoxLookAt(姿势, 门口眼, '站')[1];
  return (
    <AbsoluteFill style={{ background: '#1b1d22' }}>
      <世界 v={v} />
      {v.气泡 && <重逢气泡 机位={机} />}
      {v.聊天 === '片' && <像素聊天栏 lines={片里聊天.行们} 刻={片里聊天.刻} 缩放={片里聊天.缩放} 字体={像素字} 宽={画幅.宽} 高={画幅.高} />}
      {v.聊天 === '封面' && <封面聊天行 />}
      {v.安全区 && <安全区层 />}
      <div style={{ position: 'absolute', right: 12, bottom: 8, textAlign: 'right', fontFamily: uiFontFamily, fontSize: 15, lineHeight: 1.35, color: '#ffffff', textShadow: '0 1px 3px #000' }}>
        <div>核对-隐世之境重逢 · {v.名}</div>
        {v.她 && (
          <div style={{ fontSize: 12 }}>
            身子朝向 {姿势.yaw}°，头比身子多转 {左右.toFixed(1)}°（正对你要 {正对.toFixed(1)}°）、抬头 {俯仰.toFixed(1)}°
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

export default 画面;
