// 隐世之境重逢核对的画面：按视图表一帧画一个视图，左上角写视图名。灯光先用一楼现成的那套（三渲二平涂底座还没并进来）。
// 她用现成的魔法酒狐站姿（表情、拿花另一路在做），头按机位现算转过来看你。
import { ThreeCanvas } from '@remotion/three';
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import type { V3 } from '@engine/model/parts.tsx';
import { standPose } from '@库/角色/骨架.tsx';
import { MagicalWineFox, magicalWineFoxLookAt } from '@库/角色/魔法酒狐.tsx';
import { uiFontFamily } from '@库/界面/基础.tsx';
import { ChatOverlay } from '@库/界面/聊天栏.tsx';
import { 画幅 } from '../../分镜.ts';
import { 第一人称机位 } from '../../地点/机位.tsx';
import { 她看你, 门口眼, 隐世之境重逢布景, 天色 } from '../../场/2-隐世之境/布景.tsx';
import { 她, 机位, 门光参数 } from '../../场/2-隐世之境/参数.ts';
import { 封面安全区 } from '../../场/2-隐世之境/封面.ts';
import { 视图们, type 视图 } from './视图.ts';

const 聊天缩放 = 2.5;
// 地块用「加」的那一版：颜色、强度照原来试过的（品红地毯上冲成艳粉）
const 地块加参数 = { ...门光参数, 地块: { ...门光参数.地块, 外色: '#ff9eb0', 内色: '#ffd27a', 外: 0.35, 内: 0.5, 混合: '加' as const } };
const 加入行 = [{ text: 'Steve加入了游戏', color: '#ffff55', 起刻: 0 }];

/** 平面图上的标记：一根竖杆加一块地上的方片 */
const 标记: React.FC<{ 位: V3; 色: string }> = ({ 位, 色 }) => (
  <group position={位}>
    <mesh position={[0, 0, 0.9]}>
      <boxGeometry args={[0.12, 0.12, 1.8]} />
      <meshBasicMaterial color={色} toneMapped={false} />
    </mesh>
    <mesh position={[0, 0, 0.08]}>
      <boxGeometry args={[0.6, 0.6, 0.02]} />
      <meshBasicMaterial color={色} toneMapped={false} />
    </mesh>
  </group>
);

/** 封面帧机位的视线：从眼睛到看点一根线 */
const 视线: React.FC<{ 从: V3; 到: V3 }> = ({ 从, 到 }) => (
  <line>
    <bufferGeometry>
      <bufferAttribute attach="attributes-position" args={[new Float32Array([...从, ...到]), 3]} />
    </bufferGeometry>
    <lineBasicMaterial color="#00e0ff" depthTest={false} toneMapped={false} />
  </line>
);

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
      <ChatOverlay lines={加入行} 刻={0} s={聊天缩放} />
    </AbsoluteFill>
  );
};

const 世界: React.FC<{ v: 视图 }> = ({ v }) => {
  const 机 = v.机位 ?? { 眼: 门口眼, 看: 机位.看, 视角: 机位.视角 };
  const 姿势 = { ...standPose(她.脚), yaw: v.身子朝向 ?? 她.身子朝向 };
  const 看 = v.头 === '正' ? undefined : 她看你(门口眼, 姿势);
  return (
    <ThreeCanvas width={画幅.宽} height={画幅.高} gl={{ antialias: true }}>
      <color attach="background" args={[天色]} />
      <第一人称机位 眼={机.眼} 看={机.看} 视角={机.视角} near={'近' in 机 ? 机.近 : undefined} />
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <隐世之境重逢布景 眼={机.眼} 开={v.开} 门光={v.门光 ?? true} 光带={v.光带} 门光参数={v.地块加 ? 地块加参数 : undefined}>
          {v.她 && <MagicalWineFox pose={姿势} 姿势="站" 看={看} 表情="无" />}
          {v.标注 && (
            <>
              <标记 位={[机位.脚[0], 机位.脚[1], 0]} 色="#00e0ff" />
              <视线 从={门口眼} 到={机位.看} />
            </>
          )}
        </隐世之境重逢布景>
      </group>
    </ThreeCanvas>
  );
};

const 画面: React.FC = () => {
  const v = 视图们[useCurrentFrame()]!;
  const 姿势 = { ...standPose(她.脚), yaw: v.身子朝向 ?? 她.身子朝向 };
  const [俯仰, 左右] = 她看你(门口眼, 姿势);
  const 正对 = magicalWineFoxLookAt(姿势, 门口眼, '站')[1];
  return (
    <AbsoluteFill style={{ background: '#1b1d22' }}>
      <世界 v={v} />
      {v.安全区 && <安全区层 />}
      <div style={{ position: 'absolute', left: 16, top: 12, fontFamily: uiFontFamily, fontSize: 20, lineHeight: 1.4, color: '#ffffff', textShadow: '0 1px 3px #000' }}>
        <div>核对-隐世之境重逢 · {v.名}</div>
        {v.她 && v.头 !== '正' && (
          <div style={{ fontSize: 15 }}>
            身子朝向 {姿势.yaw}°，头比身子多转 {左右.toFixed(1)}°（正对你要 {正对.toFixed(1)}°）、抬头 {俯仰.toFixed(1)}°
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

export default 画面;
