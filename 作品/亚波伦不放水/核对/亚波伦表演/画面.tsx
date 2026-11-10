// 核对-亚波伦表演 的画面：灰底、一块地面，她照示范演出（视图.ts 的 示范轴）摆在原点上空，目标是东边地上一根红柱（顶替史蒂夫）。
// 机位跟着她脚底的高度走。坐标照场景约定（Z 朝上），进 three 换成 Y 朝上，场景内容放在 rotation [−π/2, 0, 0] 的 group 里。
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import * as THREE from 'three';
import { 场景到three } from '@engine/core/three换算.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { use视图下标 } from '@engine/段/时间.tsx';
import { ChatOverlay } from '@库/界面/聊天栏.tsx';
import { 娘化亚波伦 } from '../../角色/娘化亚波伦.tsx';
import { 定演出 } from '../../角色/动作/亚波伦演出.ts';
import { 开完刻, 默认开合 } from '../../界面/分圈.ts';
import { 杖尖轮盘 } from '../../界面/杖尖轮盘.tsx';
import { 战斗界面, 死亡消息行 } from '../../界面/战斗界面.tsx';
import { GUI缩放, 开盘秒, 收盘秒, 画幅, 目标, 示范位, 示范出手, 示范轴, 视图们, type 视图 } from './视图.ts';

const 演 = 定演出({ 轴: 示范轴, 位: 示范位, 目标, 出手: 示范出手 });

type 机 = { 眼: V3; 看: V3; 视角: number };
/** 机位：她朝东（目标在东），右手在南边；侧 = 从南边看两人同框，侧近 = 只看她，正 = 从目标那头看她，手 = 右手特写 */
const 取机位 = (v: 视图): 机 => {
  const z = 示范位(v.演秒)[2];
  if (v.机位 === '侧') return { 眼: [4, -15, z * 0.6 + 2], 看: [4, 0, z * 0.6 + 1.2], 视角: 34 };
  if (v.机位 === '正') return { 眼: [7.5, -1.2, 1.6], 看: [0, 0, z + 1.4], 视角: 30 };
  if (v.机位 === '手') {
    const 尖 = 演.杖(v.演秒).尖;
    return { 眼: [尖[0] - 0.4, 尖[1] - 3.2, 尖[2] + 0.3], 看: [尖[0] - 0.4, 尖[1], 尖[2]], 视角: 26 };
  }
  return { 眼: [1.5, -8, z + 1.9], 看: [0.3, 0, z + 1.4], 视角: 30 };
};

const 机位: React.FC<{ 机: 机 }> = ({ 机 }) => {
  const { camera, gl } = useThree();
  gl.toneMapping = THREE.NeutralToneMapping;
  gl.toneMappingExposure = 1.0;
  const cam = camera as THREE.PerspectiveCamera;
  cam.fov = 机.视角;
  cam.near = 0.05;
  cam.far = 256;
  cam.position.copy(场景到three(机.眼));
  cam.up.set(0, 1, 0);
  cam.lookAt(场景到three(机.看));
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return null;
};

/** 轮盘打开后第几刻：开盘后正着走；收盘开始后倒着走（从外往里收，分镜 5-03），收完是负的（不画） */
const 盘刻 = (秒: number) => {
  if (秒 < 收盘秒) return (秒 - 开盘秒) * 20;
  return Math.min((收盘秒 - 开盘秒) * 20, 开完刻(3, 默认开合)) - (秒 - 收盘秒) * 20;
};

const 画面: React.FC = () => {
  const v = 视图们[use视图下标()]!;
  const 此刻 = 演.在(v.演秒);
  const 杖 = 演.杖(v.演秒);
  const 刻 = 盘刻(v.演秒);
  const 线尾: V3 = [杖.尖[0] + 杖.轴[0] * 14, 杖.尖[1] + 杖.轴[1] * 14, 杖.尖[2] + 杖.轴[2] * 14];
  const 线 = React.useMemo(() => new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...杖.尖), new THREE.Vector3(...线尾)]), [杖.尖.join(), 线尾.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const s = GUI缩放;
  return (
    <AbsoluteFill style={{ background: '#5a5e66' }}>
      <ThreeCanvas width={画幅.宽} height={画幅.高} gl={{ antialias: true }}>
        <color attach="background" args={['#5a5e66']} />
        <机位 机={取机位(v)} />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <ambientLight intensity={0.55 * Math.PI} />
          <directionalLight position={[1.5, -4, 4]} intensity={0.6 * Math.PI} />
          <mesh position={[4, 0, -0.05]}>
            <boxGeometry args={[24, 12, 0.1]} />
            <meshStandardMaterial color="#8a8f98" />
          </mesh>
          <mesh position={[目标[0], 目标[1], 0.9]}>
            <boxGeometry args={[0.6, 0.6, 1.8]} />
            <meshStandardMaterial color="#b03030" />
          </mesh>
          <娘化亚波伦 {...此刻.属性} 持杖 />
          {v.瞄线 && (
            <lineSegments geometry={线}>
              <lineBasicMaterial color="#ffe14d" />
            </lineSegments>
          )}
          {v.轮盘 && 刻 >= 0 && <杖尖轮盘 杖={杖} 朝向="垂直杖身" 离尖={0.1} 参={{ 刻 }} 每像素格={0.027} />}
        </group>
      </ThreeCanvas>
      {v.界面 && (
        <战斗界面
          宽={画幅.宽}
          高={画幅.高}
          s={s}
          血条={{ 血比: v.界面 === '半血' ? 0.5 : 1, 款: v.界面 === '简版血条' ? '简版' : '完整' }}
          计数={v.界面 === '全开' ? { n: 23 } : undefined}
          名签们={
            v.界面 === '全开'
              ? [
                  { 键: 'goety:fireball_focus', x: 760, y: 300, 年龄秒: 0.3 },
                  { 键: 'goety:wither_skull_focus', x: 900, y: 380, 年龄秒: 0.05 },
                  { 键: 'goety_revelation:revelation_focus', x: 820, y: 470, 年龄秒: 0.7 },
                ]
              : []
          }
        >
          {v.界面 === '全开' && <ChatOverlay lines={[死亡消息行(0)]} 刻={30} s={s} />}
        </战斗界面>
      )}
      <div style={{ position: 'absolute', left: 16, bottom: 12, color: '#ffffff', fontFamily: 'sans-serif', fontSize: 20, lineHeight: 1.4, textShadow: '0 1px 3px #000' }}>
        <div>
          {v.名}（演出第 {v.演秒} 秒，{此刻.过渡.从 === 此刻.过渡.到 ? 此刻.过渡.到 : `${此刻.过渡.从} → ${此刻.过渡.到} ${Math.round(此刻.过渡.比 * 100)}%`}）
        </div>
        {v.说明 && <div style={{ fontSize: 15 }}>{v.说明}</div>}
      </div>
    </AbsoluteFill>
  );
};

export default 画面;
