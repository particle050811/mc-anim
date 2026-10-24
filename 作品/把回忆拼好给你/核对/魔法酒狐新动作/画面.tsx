// 魔法酒狐新动作核对的画面：按视图表一帧画一个视图，左上角写视图名。地面、灯同 核对-魔法酒狐表情（看清贴图用，颜色是近似的）。
// 机位按姿势表现算：头、手在哪由 magicalWineFoxBoneAt 量出来，再按她身体的正面、右前方、右边、左边摆相机；花的正面转向相机（偏 = 相机在她哪个方位）。
// 正交的帧：相机沿机位方向平行看过去，每格 正交每格 页面像素，不开抗锯齿。
// 三渲二的帧：成片的画法（engine/三渲二 的画布、本作品的正交像素机位和调子），她套 贴图像素对齐（只吸附）和描边；
// 画布只开 320×180 页面像素，CSS 最近邻放大 4 倍铺满，看得清成片上的每个像素。
import { useThree } from '@react-three/fiber';
import { ThreeCanvas } from '@remotion/three';
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import * as THREE from 'three';
import type { V3 } from '@engine/model/parts.tsx';
import { DISPLAY } from '@engine/model/物品贴图.tsx';
import { standPose } from '@库/角色/骨架.tsx';
import { MagicalWineFox, magicalWineFoxLookAt } from '@库/角色/魔法酒狐.tsx';
import { 描边 } from '@engine/三渲二/描边.tsx';
import { 三渲二画布 } from '@engine/三渲二/画布.tsx';
import { 贴图像素对齐 } from '@engine/三渲二/对齐.tsx';
import { 画布调子, 正交机位 as 成片正交机位 } from '../../画风.ts';
import { magicalWineFoxTurnTo } from '@库/角色/魔法酒狐新动作.ts';
import { MagicalWineFoxEx, magicalWineFoxBoneAt, magicalWineFoxExBones, type 手持物, type 魔法酒狐新动作Props } from '@库/角色/魔法酒狐新动作组件.tsx';
import { 画幅 } from '../../分镜.ts';
import { 第一人称机位 } from '../../地点/机位.tsx';
import { 月铃兰 } from '../../物品/月铃兰.tsx';
import { 视图们, type 视图 } from './视图.ts';

const 原点: V3 = [0, 0, 0];
// 封面：你站在她南边 2.6 格的门口，眼高 1.62
const 封面眼: V3 = [0, -2.6, 1.62];

const 地面: React.FC = () => (
  <mesh position={[0, 0, -0.05]}>
    <boxGeometry args={[9, 9, 0.1]} />
    <meshStandardMaterial color="#b8945f" />
  </mesh>
);

const 加 = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

/** 机位：她面朝南（yaw 180），正前方 −Y、右手边 −X */
const 方向 = (机位: 视图['机位']): V3 => {
  const s = Math.SQRT1_2;
  if (机位 === '四分之三') return [-s, -s, 0];
  if (机位 === '侧面') return [-1, 0, 0];
  if (机位 === '左侧面') return [1, 0, 0];
  return [0, -1, 0];
};

// 正交：她站着连帽子约 1.8 格高，每格 300 页面像素让她占画面八成高（核对看得清；成片的像素密度另定）
const 正交每格 = 300;
const toThree = ([x, y, z]: V3) => new THREE.Vector3(x, z, -y);
const 正交机位: React.FC<{ 眼: V3; 看: V3 }> = ({ 眼, 看 }) => {
  const { camera, gl } = useThree();
  gl.toneMapping = THREE.NeutralToneMapping;
  const cam = camera as THREE.OrthographicCamera;
  cam.position.copy(toThree(眼));
  cam.up.set(0, 1, 0);
  cam.lookAt(toThree(看));
  cam.zoom = 正交每格;
  cam.near = 0.1;
  cam.far = 100;
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return null;
};

const 摆 = (v: 视图) => {
  const 她 = v.机位 === '封面' ? { ...standPose(原点), yaw: magicalWineFoxTurnTo(原点, 封面眼, 50, '左').yaw } : { ...standPose(原点), yaw: 180 };
  const 显示 = v.手持显示 ? DISPLAY.handheld.thirdperson_righthand : undefined;
  const 花 = (朝向?: 手持物['朝向']): Partial<魔法酒狐新动作Props> => (v.拿花 ? { [v.左手 ? '左手' : '右手']: { 物品: <月铃兰 />, 显示, 朝向 } } : {});
  const 底: 魔法酒狐新动作Props = { pose: 她, 姿势: v.姿势, 表情: v.表情, 眨眼: v.眨眼, 秒: v.秒, 看: Array.isArray(v.看) ? v.看 : undefined, ...花() };
  const 骨 = magicalWineFoxExBones(底);
  const 头 = 加(magicalWineFoxBoneAt(她, 骨, 'Head'), [0, 0, 0.12]);
  let 眼: V3;
  let 看: V3;
  let 视角: number;
  if (v.机位 === '封面') [眼, 看, 视角] = [封面眼, 头, 40];
  else if (v.远近 === '脸') [看, 视角] = [头, 26];
  else if (v.远近 === '手') [看, 视角] = [magicalWineFoxBoneAt(她, 骨, v.左手 ? 'LeftHandLocator' : 'RightHandLocator'), 24];
  else [看, 视角] = [[0, 0, 0.55 * (头[2] + 0.3)], 30];
  if (v.机位 !== '封面') {
    const 远 = v.正交 ? 30 : v.远近 === '脸' ? 1.5 : v.远近 === '手' ? 1.3 : 4.6;
    眼 = 加(看, 方向(v.机位), 远);
    if (v.远近 === '全身' && !v.正交) 眼[2] += 0.35;
  }
  const props: 魔法酒狐新动作Props = {
    ...底,
    看向: v.看 === '镜头' ? 眼! : undefined,
    ...花(v.拿花 === '原样' ? '原样' : { 偏: magicalWineFoxLookAt(她, 眼!, '站')[1] }),
  };
  return { props, 眼: 眼!, 看, 视角 };
};

const 三渲二放大 = 4;
const 三渲二朝: Record<视图['机位'], '北' | '东' | '西'> = { 正面: '北', 四分之三: '北', 封面: '北', 侧面: '东', 左侧面: '西' };
const 三渲二地面: React.FC = () => (
  <mesh position={[0, 0, -0.5]}>
    <boxGeometry args={[6, 3, 1]} />
    <meshStandardMaterial color="#7fb238" />
  </mesh>
);

const 三渲二画面: React.FC<{ v: 视图; props: 魔法酒狐新动作Props }> = ({ v, props }) => (
  <div style={{ position: 'absolute', left: 0, top: 0, width: 画幅.宽 / 三渲二放大, height: 画幅.高 / 三渲二放大, transform: `scale(${三渲二放大})`, transformOrigin: '0 0', imageRendering: 'pixelated' }}>
    <三渲二画布 宽={画幅.宽 / 三渲二放大} 高={画幅.高 / 三渲二放大} 机位={成片正交机位({ 看: [0, 0, 0.9], 朝: 三渲二朝[v.机位] })} {...画布调子('夏日白天')}>
      <三渲二地面 />
      <描边>
        <贴图像素对齐 锚={props.pose.loc as V3}>
          <MagicalWineFoxEx {...props} />
        </贴图像素对齐>
      </描边>
    </三渲二画布>
  </div>
);

const 画面: React.FC = () => {
  const v = 视图们[useCurrentFrame()]!;
  const { props, 眼, 看, 视角 } = 摆(v);
  if (v.三渲二)
    return (
      <AbsoluteFill style={{ background: '#000000' }}>
        <三渲二画面 v={v} props={props} />
        <div style={{ position: 'absolute', left: 16, top: 12, color: '#ffffff', fontFamily: 'sans-serif', fontSize: 22, lineHeight: 1.4, textShadow: '0 1px 3px #000' }}>
          <div>{v.名}</div>
          <div style={{ fontSize: 16 }}>成片像素密度，最近邻放大 {三渲二放大} 倍</div>
        </div>
      </AbsoluteFill>
    );
  return (
    <AbsoluteFill style={{ background: '#5a5e66' }}>
      <ThreeCanvas key={v.正交 ? '正交' : '透视'} orthographic={!!v.正交} width={画幅.宽} height={画幅.高} gl={{ antialias: !v.正交 }}>
        <color attach="background" args={['#5a5e66']} />
        {v.正交 ? <正交机位 眼={眼} 看={看} /> : <第一人称机位 眼={眼} 看={看} 视角={视角} />}
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <ambientLight intensity={0.55 * Math.PI} />
          <directionalLight position={[1.5, -4, 4]} intensity={0.6 * Math.PI} />
          <地面 />
          {v.旧组件 ? <MagicalWineFox pose={props.pose} 姿势="站" 眨眼={v.眨眼} 秒={v.秒} /> : <MagicalWineFoxEx {...props} />}
        </group>
      </ThreeCanvas>
      <div style={{ position: 'absolute', left: 16, top: 12, color: '#ffffff', fontFamily: 'sans-serif', fontSize: 22, lineHeight: 1.4, textShadow: '0 1px 3px #000' }}>
        <div>{v.名}</div>
        <div style={{ fontSize: 16 }}>
          姿势 {v.姿势}
          {v.表情 ? `，表情 ${v.表情}` : ''}
          {v.看 ? `，看 ${Array.isArray(v.看) ? `[${v.看.join(', ')}]` : '镜头'}` : ''}
          {v.拿花 ? `，${v.左手 ? '左手' : ''}拿花（${v.拿花}${v.手持显示 ? '，handheld 显示' : ''}）` : ''}
          {v.旧组件 ? '，旧组件 MagicalWineFox 姿势=站' : ''}
          {v.正交 ? '，正交' : ''}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export default 画面;
