// 核对-亚波伦表演 的画面：灰底、一块地面，她照示范演出（视图.ts 的 示范轴）摆在原点上空，目标是东边地上一根红柱（顶替史蒂夫）。
// 机位跟着她脚底的高度走。坐标照场景约定（Z 朝上），进 three 换成 Y 朝上，场景内容放在 rotation [−π/2, 0, 0] 的 group 里。
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import * as THREE from 'three';
import { sceneToThree } from '@engine/core/three换算.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { useViewIndex } from '@engine/段/时间.tsx';
import { ChatOverlay } from '@库/界面/聊天栏.tsx';
import { GirlYaBoLun } from '../../角色/娘化亚波伦.tsx';
import { definePerformance } from '../../角色/动作/亚波伦演出.ts';
import { openDoneTick, defaultOpenClose } from '../../界面/分圈.ts';
import { WandTipWheel } from '../../界面/杖尖轮盘.tsx';
import { BattleUi, deathMessageLine } from '../../界面/战斗界面.tsx';
import { guiScale, openingSec, closingSec, aspect, target, demoPos, demoCast, demoTimeline, views, type View } from './视图.ts';

const perform = definePerformance({ timeline: demoTimeline, 位: demoPos, target: target, swingTimes: demoCast });

type CameraPose = { 眼: V3; 看: V3; fov: number };
/** 机位：她朝东（目标在东），右手在南边；侧 = 从南边看两人同框，侧近 = 只看她，正 = 从目标那头看她，手 = 右手特写 */
const getCameraRig = (v: View): CameraPose => {
  const z = demoPos(v.performSec)[2];
  if (v.cameraRig === '侧') return { 眼: [4, -15, z * 0.6 + 2], 看: [4, 0, z * 0.6 + 1.2], fov: 34 };
  if (v.cameraRig === '正') return { 眼: [7.5, -1.2, 1.6], 看: [0, 0, z + 1.4], fov: 30 };
  if (v.cameraRig === '手') {
    const tip = perform.杖(v.performSec).tip;
    return { 眼: [tip[0] - 0.4, tip[1] - 3.2, tip[2] + 0.3], 看: [tip[0] - 0.4, tip[1], tip[2]], fov: 26 };
  }
  return { 眼: [1.5, -8, z + 1.9], 看: [0.3, 0, z + 1.4], fov: 30 };
};

const CameraRig: React.FC<{ machine: CameraPose }> = ({ machine: rig }) => {
  const { camera, gl } = useThree();
  gl.toneMapping = THREE.NeutralToneMapping;
  gl.toneMappingExposure = 1.0;
  const cam = camera as THREE.PerspectiveCamera;
  cam.fov = rig.fov;
  cam.near = 0.05;
  cam.far = 256;
  cam.position.copy(sceneToThree(rig.眼));
  cam.up.set(0, 1, 0);
  cam.lookAt(sceneToThree(rig.看));
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return null;
};

/** 轮盘打开后第几刻：开盘后正着走；收盘开始后倒着走（从外往里收，分镜 5-03），收完是负的（不画） */
const wheelTick = (sec: number) => {
  if (sec < closingSec) return (sec - openingSec) * 20;
  return Math.min((closingSec - openingSec) * 20, openDoneTick(3, defaultOpenClose)) - (sec - closingSec) * 20;
};

const picture: React.FC = () => {
  const v = views[useViewIndex()]!;
  const currentState = perform.在(v.performSec);
  const staff = perform.杖(v.performSec);
  const tick = wheelTick(v.performSec);
  const lineEnd: V3 = [staff.tip[0] + staff.axis[0] * 14, staff.tip[1] + staff.axis[1] * 14, staff.tip[2] + staff.axis[2] * 14];
  const lineGeometry = React.useMemo(() => new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...staff.tip), new THREE.Vector3(...lineEnd)]), [staff.tip.join(), lineEnd.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const s = guiScale;
  return (
    <AbsoluteFill style={{ background: '#5a5e66' }}>
      <ThreeCanvas width={aspect.width} height={aspect.height} gl={{ antialias: true }}>
        <color attach="background" args={['#5a5e66']} />
        <CameraRig machine={getCameraRig(v)} />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <ambientLight intensity={0.55 * Math.PI} />
          <directionalLight position={[1.5, -4, 4]} intensity={0.6 * Math.PI} />
          <mesh position={[4, 0, -0.05]}>
            <boxGeometry args={[24, 12, 0.1]} />
            <meshStandardMaterial color="#8a8f98" />
          </mesh>
          <mesh position={[target[0], target[1], 0.9]}>
            <boxGeometry args={[0.6, 0.6, 1.8]} />
            <meshStandardMaterial color="#b03030" />
          </mesh>
          <GirlYaBoLun {...currentState.props} holdWand />
          {v.aimLine && (
            <lineSegments geometry={lineGeometry}>
              <lineBasicMaterial color="#ffe14d" />
            </lineSegments>
          )}
          {v.wheel && tick >= 0 && <WandTipWheel 杖={staff} facing="垂直杖身" tipOffset={0.1} params={{ 刻: tick }} cellsPerPixel={0.027} />}
        </group>
      </ThreeCanvas>
      {v.hudMode && (
        <BattleUi
          width={aspect.width}
          height={aspect.height}
          s={s}
          healthBar={{ healthRatio: v.hudMode === '半血' ? 0.5 : 1, variant: v.hudMode === '简版血条' ? '简版' : '完整' }}
          spellCount={v.hudMode === '全开' ? { n: 23 } : undefined}
          nameTags={
            v.hudMode === '全开'
              ? [
                  { 键: 'goety:fireball_focus', x: 760, y: 300, ageSec: 0.3 },
                  { 键: 'goety:wither_skull_focus', x: 900, y: 380, ageSec: 0.05 },
                  { 键: 'goety_revelation:revelation_focus', x: 820, y: 470, ageSec: 0.7 },
                ]
              : []
          }
        >
          {v.hudMode === '全开' && <ChatOverlay lines={[deathMessageLine(0)]} 刻={30} s={s} />}
        </BattleUi>
      )}
      <div style={{ position: 'absolute', left: 16, bottom: 12, color: '#ffffff', fontFamily: 'sans-serif', fontSize: 20, lineHeight: 1.4, textShadow: '0 1px 3px #000' }}>
        <div>
          {v.name}（演出第 {v.performSec} 秒，{currentState.transition.从 === currentState.transition.dest ? currentState.transition.dest : `${currentState.transition.从} → ${currentState.transition.dest} ${Math.round(currentState.transition.比 * 100)}%`}）
        </div>
        {v.note && <div style={{ fontSize: 15 }}>{v.note}</div>}
      </div>
    </AbsoluteFill>
  );
};

export default picture;
