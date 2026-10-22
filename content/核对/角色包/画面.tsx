// 角色包核对的画面：四个场景各照旧项目一个核对 Composition 原样抄（机位、灯光、姿势、背景一字不改），只是角色换成 world/ 里的。
//   照李樱对照 ← 旧 模型/角色/李樱对照.tsx；照持刀对照 ← 旧 模型/物品/拔刀剑持刀对照.tsx；照口型预览、照口型演示 ← 旧 模型/角色/口型预览.tsx。
// 旧的在这几个文件里用 useVideoConfig 的宽高、useCurrentFrame 的帧，这里改成视图表给的尺寸和旧帧号；画布放在页面左上角。
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import * as THREE from 'three';
import { rad } from '../../../engine/anim/anim.ts';
import { type BedrockModel, BedrockModelView, type BonePose } from '../../../engine/model/基岩模型.tsx';
import { png } from '../../../engine/model/贴图.ts';
import { Jiuhu, JIUHU, JIUHU_MOUTHS, JIUHU_TALK_BONES, jiuhuMouthAttach } from '../../../world/角色/九胡.tsx';
import { LiYing } from '../../../world/角色/李樱.tsx';
import { mouthAt, MOUTH_SHAPES, type Mouth } from '../../../world/配音/口型.ts';
import { bladeInHand, type FigurePose, standPose } from '../../../world/角色/骨架.tsx';
import { DrawnKatana, Sheath } from '../../../world/物品/拔刀剑.tsx';
import jiuhuRaw from 'asset:模型/角色/九胡';
import jiuhuSkin from 'asset:贴图/角色/九胡';
import { 视图们 } from './视图.ts';

// ---------- 照李樱对照（旧 李樱对照.tsx 的 VIEWS 第 3、6 个，第 3～5 帧是平行投影） ----------
type 对照视图 = { az: number; el: number; pose: FigurePose; span?: number; centerZ?: number; centerX?: number };
const at = standPose([0, 0, 0]);
const 对照视图们: Record<number, 对照视图> = {
  3: { az: 0, el: 0, pose: at },
  6: { az: -45, el: 12, pose: { ...at, armR: 8, armRRoll: -12, armL: 4, armLRoll: -12, legRRoll: -5, legLRoll: -5 } },
};
const SPAN = 2.5;
const CENTER_Z = 1.02;

const 对照Rig: React.FC<{ view: 对照视图; ortho: boolean }> = ({ view, ortho }) => {
  const { camera, gl } = useThree();
  gl.toneMapping = THREE.NeutralToneMapping;
  const cam = camera as THREE.PerspectiveCamera;
  const fov = ortho ? 0.5 : 14;
  const span = view.span ?? SPAN;
  const cz = view.centerZ ?? CENTER_Z;
  const cx = view.centerX ?? 0;
  const dist = span / 2 / Math.tan(rad(fov / 2));
  const azimuth = rad(view.az);
  const elevation = rad(view.el);
  const sx = dist * Math.cos(elevation) * Math.sin(azimuth);
  const sy = dist * Math.cos(elevation) * Math.cos(azimuth);
  const sz = cz + dist * Math.sin(elevation);
  cam.fov = fov;
  cam.near = Math.max(0.1, dist - 5);
  cam.far = dist + 5;
  cam.position.set(cx + sx, sz, -sy);
  cam.lookAt(cx, cz, 0);
  cam.updateProjectionMatrix();
  return null;
};

const 照李樱对照: React.FC<{ 帧: number; width: number; height: number }> = ({ 帧: frame, width, height }) => {
  const view = 对照视图们[frame]!;
  const k = rad(view.az + 25);
  const key: [number, number, number] = [Math.sin(k) * 3.3, Math.cos(k) * 3.3, 2.3];
  return (
    <ThreeCanvas width={width} height={height} shadows="percentage" gl={{ antialias: true }}>
      <color attach="background" args={['#ffffff']} />
      <对照Rig view={view} ortho={frame >= 3 && frame <= 5} />
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <ambientLight intensity={0.55 * Math.PI} />
        <directionalLight
          position={key}
          intensity={0.6 * Math.PI}
          castShadow
          shadow-mapSize={[4096, 4096]}
          shadow-bias={-0.0004}
          shadow-normalBias={0.004}
          shadow-camera-left={-2.2}
          shadow-camera-right={2.2}
          shadow-camera-top={2.2}
          shadow-camera-bottom={-2.2}
          shadow-camera-near={0.1}
          shadow-camera-far={10}
        />
        <LiYing pose={view.pose} />
      </group>
    </ThreeCanvas>
  );
};

// ---------- 照持刀对照（旧 拔刀剑持刀对照.tsx 的 HOLD_VIEWS 第 2 个：正面右手持出鞘的刀） ----------
const 持刀视图 = {
  az: 0,
  el: 8,
  pose: { ...at, armR: 55, armRRoll: -22, elbowR: 25, armL: 8, armLRoll: -12, legRRoll: -7, legLRoll: -7 } as FigurePose,
  drawn: true,
};
const FOV = 14;

const 持刀Rig: React.FC<{ view: typeof 持刀视图 }> = ({ view }) => {
  const { camera, gl } = useThree();
  gl.toneMapping = THREE.NeutralToneMapping;
  const cam = camera as THREE.PerspectiveCamera;
  const dist = SPAN / 2 / Math.tan(rad(FOV / 2));
  const azimuth = rad(view.az);
  const elevation = rad(view.el);
  cam.fov = FOV;
  cam.near = Math.max(0.1, dist - 5);
  cam.far = dist + 5;
  cam.position.set(dist * Math.cos(elevation) * Math.sin(azimuth), CENTER_Z + dist * Math.sin(elevation), -dist * Math.cos(elevation) * Math.cos(azimuth));
  cam.lookAt(0, CENTER_Z, 0);
  cam.updateProjectionMatrix();
  return null;
};

const 照持刀对照: React.FC<{ width: number; height: number }> = ({ width, height }) => {
  const view = 持刀视图;
  const k = rad(view.az + 25);
  const key: [number, number, number] = [Math.sin(k) * 3.3, Math.cos(k) * 3.3, 2.3];
  const pose = view.pose;
  return (
    <ThreeCanvas width={width} height={height} shadows="percentage" gl={{ antialias: true }}>
      <color attach="background" args={['#ffffff']} />
      <持刀Rig view={view} />
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <ambientLight intensity={0.55 * Math.PI} />
        <directionalLight
          position={key}
          intensity={0.6 * Math.PI}
          castShadow
          shadow-mapSize={[4096, 4096]}
          shadow-bias={-0.0004}
          shadow-normalBias={0.004}
          shadow-camera-left={-2.2}
          shadow-camera-right={2.2}
          shadow-camera-top={2.2}
          shadow-camera-bottom={-2.2}
          shadow-camera-near={0.1}
          shadow-camera-far={10}
        />
        <LiYing
          pose={pose}
          hipL={
            <group rotation={[rad(109), 0, rad(-20), 'ZYX']}>
              <Sheath sheathed={!view.drawn} />
            </group>
          }
          handR={
            view.drawn && (
              <group quaternion={bladeInHand(pose, 0, 42).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2))}>
                <DrawnKatana />
              </group>
            )
          }
        />
      </group>
    </ThreeCanvas>
  );
};

// ---------- 照口型预览（旧 口型预览.tsx 的 MouthPreview：第 0 帧九胡自带的嘴，第 1 帧李樱各口型，第 2 帧九胡各口型） ----------
type Item = { liYing?: Mouth; jiuhu?: Record<string, BonePose>; jiuhuMouth?: Mouth };
const SHAPES = 'XBCDEF'.split('').map((shape) => MOUTH_SHAPES[shape]!);
const MOUTH_PREVIEW_VIEWS: { items: Item[]; headZ: number }[] = [
  { items: JIUHU_MOUTHS.map((name) => ({ jiuhu: { [name]: { pos: [0, 0, -1] } } })), headZ: 1.54 },
  { items: SHAPES.map((mouth) => ({ liYing: mouth })), headZ: 1.64 },
  { items: SHAPES.map((mouth) => ({ jiuhu: JIUHU_TALK_BONES, jiuhuMouth: mouth })), headZ: 1.54 },
];
const JIUHU_MODEL = { ...(jiuhuRaw as unknown as object), texture: png(jiuhuSkin) } as unknown as BedrockModel;
const JIUHU_FACE: Record<string, BonePose> = { Mask: { scale: 0 }, Expression: { scale: 0 } };
const GAP = 0.75;

const 口型Rig: React.FC<{ width: number; z: number }> = ({ width, z }) => {
  const { camera, gl } = useThree();
  gl.toneMapping = THREE.NeutralToneMapping;
  const cam = camera as THREE.PerspectiveCamera;
  cam.fov = 12;
  const dist = (width / 2 / Math.tan(((cam.fov / 2) * Math.PI) / 180)) * (9 / 16);
  cam.position.set(0, z + 0.05, -dist);
  cam.lookAt(0, z, 0);
  cam.near = 0.1;
  cam.far = dist + 5;
  cam.updateProjectionMatrix();
  return null;
};

const 照口型预览: React.FC<{ 帧: number; width: number; height: number }> = ({ 帧: frame, width, height }) => {
  const view = MOUTH_PREVIEW_VIEWS[frame]!;
  const span = view.items.length * GAP;
  return (
    <ThreeCanvas width={width} height={height} gl={{ antialias: true }}>
      <color attach="background" args={['#c9d6e3']} />
      <口型Rig width={span} z={view.headZ} />
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <ambientLight intensity={0.55 * Math.PI} />
        <directionalLight position={[-1.5, 3, 2.5]} intensity={0.6 * Math.PI} />
        {view.items.map((item, i) => {
          const x = ((view.items.length - 1) / 2 - i) * GAP;
          return item.liYing ? (
            <LiYing key={i} pose={standPose([x, 0, 0])} 嘴={item.liYing} />
          ) : (
            <group key={i} position={[x, 0, 0]}>
              <BedrockModelView model={JIUHU_MODEL} scale={JIUHU.scale} pose={{ ...JIUHU_FACE, ...item.jiuhu }} attach={jiuhuMouthAttach(item.jiuhuMouth)} />
            </group>
          );
        })}
      </group>
    </ThreeCanvas>
  );
};

// ---------- 照口型演示（旧 口型预览.tsx 的 MouthDemo，24 fps 的第几帧；台词照旧 镜头/6-3-1/编排.ts 的 lines，帧 = 开口秒数 × 24） ----------
const lines631 = [
  { id: '6-3-1-李樱-又回到这里', 帧: 1.0 * 24 },
  { id: '6-3-1-九胡-边城脚下', 帧: 4.4 * 24 },
  { id: '6-3-1-九胡-怎么下去', 帧: Math.round(8.25 * 24) },
];

const 照口型演示: React.FC<{ 帧: number; width: number; height: number }> = ({ 帧: frame, width, height }) => (
  <ThreeCanvas width={width} height={height} gl={{ antialias: true }}>
    <color attach="background" args={['#c9d6e3']} />
    <口型Rig width={2.5 * GAP} z={1.55} />
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <ambientLight intensity={0.55 * Math.PI} />
      <directionalLight position={[-1.5, 3, 2.5]} intensity={0.6 * Math.PI} />
      <LiYing pose={standPose([GAP / 2, 0, -0.05])} 嘴={mouthAt(lines631, '李樱', frame)} />
      <Jiuhu pose={standPose([-GAP / 2, 0, 0.05])} tail={frame / 12} 嘴={mouthAt(lines631, '九胡', frame)} />
    </group>
  </ThreeCanvas>
);

const 画面: React.FC = () => {
  const v = 视图们[useCurrentFrame()]!;
  const 尺寸 = { width: v.宽, height: v.高 };
  return (
    <AbsoluteFill style={{ background: '#000000' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, ...尺寸 }}>
        {v.旧.id === '李樱对照' && <照李樱对照 帧={v.旧.帧} {...尺寸} />}
        {v.旧.id === '拔刀剑持刀对照' && <照持刀对照 {...尺寸} />}
        {v.旧.id === '口型预览' && <照口型预览 帧={v.旧.帧} {...尺寸} />}
        {v.旧.id === '口型演示' && <照口型演示 帧={v.旧.帧} {...尺寸} />}
      </div>
    </AbsoluteFill>
  );
};

export default 画面;
