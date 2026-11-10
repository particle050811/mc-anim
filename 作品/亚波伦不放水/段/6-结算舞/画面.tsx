// 第 6 幕 结算舞的画面：照分镜第 9 节「跳一遍」。6-01 教堂外立面（固定）、6-02 中殿走道正面全身跳一遍（固定，底部字幕）、6-03 同机位收住。
// 机位是 Agent 摆的，用户没看过。和分镜不一样：分镜写「正面外墙囍字」，实际囍在北山墙（祭坛后墙外面，核对/粉色教堂 查的），正门在南，
// 所以 6-01 拍北山墙。天空是纯色淡蓝（教堂所在空间的天没核实，同 核对/粉色教堂）。
// 没做：配乐、环境声、结算面板（分镜默认不要）。
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import * as THREE from 'three';
import type { Cam } from '@engine/core/机位.ts';
import { 摆相机 } from '@engine/core/three换算.ts';
import { canvasDpr } from '@engine/core/渲染级别.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { 定义画面, use段 } from '@engine/段/段画面.tsx';
import { 教堂, 教堂灯光, 粉色教堂 } from '../../地点/粉色教堂.tsx';
import { 忘情牛肉面姿势, 忘情牛肉面环境 } from '../../角色/动作/忘情牛肉面.ts';
import { 娘化亚波伦, 定表演 } from '../../角色/娘化亚波伦.tsx';
import 段 from './段.ts';
import 声音 from './声音地址.生成.ts';

const 画幅 = { 宽: 1280, 高: 720 } as const;
const 天色 = '#b4cfff';
// idle 垫底，舞的姿势盖在上面（同 核对/结算舞）
const 跳舞 = 定表演({ 主: () => [{ 名: 'idle' }], 环境: 忘情牛肉面环境 });
const 加 = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

// 6-01：北山墙外面，囍字在两个心形中间（核对/粉色教堂「外观：北立面」往近处收一点）
const 外立面: Cam = { pos: [43.5, 50, 14], tgt: [43.5, -17, 33], lens: 22 };
// 6-02、6-03：人站跳舞位面朝南，机位在南边过道里；横幅要把脚底到举起的手都收进来
const 中殿: Cam = { pos: 加(教堂.跳舞位, [0, -8.5, 1.5]), tgt: 加(教堂.跳舞位, [0, 0, 1.6]), lens: 33 };

const 摆机位: React.FC<{ 机位: Cam }> = ({ 机位 }) => {
  const { camera, gl } = useThree();
  gl.toneMapping = THREE.NeutralToneMapping;
  gl.toneMappingExposure = 1.0;
  摆相机(camera as THREE.PerspectiveCamera, 机位, 画幅.宽 / 画幅.高, { 近: 0.05, 远: 512 });
  return null;
};

const 字幕: React.CSSProperties = { position: 'absolute', left: 0, right: 0, bottom: 画幅.高 * 0.07, textAlign: 'center', color: '#fff', fontFamily: '"PingFang SC", sans-serif', fontWeight: 800, fontSize: 40, textShadow: '0 0 6px #000, 0 2px 0 #000' };

export default 定义画面(段, 声音, () => {
  const { 秒, 事件 } = use段(段);
  const 舞秒 = 秒 - 事件.起舞;
  const 在里面 = 舞秒 >= 0;
  return (
    <AbsoluteFill style={{ background: 天色 }}>
      <ThreeCanvas width={画幅.宽} height={画幅.高} gl={{ antialias: true }} dpr={canvasDpr(1)}>
        <color attach="background" args={[天色]} />
        <摆机位 机位={在里面 ? 中殿 : 外立面} />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <教堂灯光 />
          <粉色教堂 />
          <娘化亚波伦 pose={{ loc: 教堂.跳舞位, yaw: 180 }} 秒={Math.max(0, 舞秒)} 表演={跳舞} 姿势={忘情牛肉面姿势(舞秒)} />
        </group>
      </ThreeCanvas>
      {在里面 && <div style={字幕}>亚波伦结算动画</div>}
    </AbsoluteFill>
  );
});
