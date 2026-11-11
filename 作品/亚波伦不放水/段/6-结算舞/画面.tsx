// 第 6 幕 结算舞的画面：照分镜第 9 节「跳一遍」。一进来就是中殿走道正面全身跳一遍（固定），收住停 2 秒。
// 用户 11-11：外立面全景「意义不明 去掉 直接跳」，「右边放一个躺在地上的史蒂夫表示也完全打不过投降」。
// 史蒂夫在画面右边、她左手边地上仰面躺着，两手举向天、跟着曲子左右摆，一条腿屈着，头隔一阵抬起来看她一眼又躺回去；剑扔在身边。
// 机位、他躺的位置和姿势、小动作都是 Agent 取的，用户没看过。天空是纯色淡蓝（教堂所在空间的天没核实，同 核对/粉色教堂）。
// 底部字幕「亚波伦结算动画」用户 11-10 说多余，去掉了。没做：结算面板（分镜默认不要）。
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import * as THREE from 'three';
import type { Cam } from '@engine/core/机位.ts';
import { smoothstep01 as 平滑 } from '@engine/core/数学.ts';
import { 摆相机 } from '@engine/core/three换算.ts';
import { canvasDpr } from '@engine/core/渲染级别.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { 定义画面, use段 } from '@engine/段/段画面.tsx';
import { standPose } from '@库/角色/骨架.tsx';
import type { StevePose } from '@库/角色/史蒂夫.tsx';
import { 教堂, 教堂灯光, 粉色教堂 } from '../../地点/粉色教堂.tsx';
import { 忘情牛肉面姿势, 忘情牛肉面环境 } from '../../角色/动作/忘情牛肉面.ts';
import { 曲晚秒 } from '../../角色/动作/忘情牛肉面时长.ts';
import { 娘化亚波伦, 定表演 } from '../../角色/娘化亚波伦.tsx';
import { 装备史蒂夫 } from '../../角色/史蒂夫装备.tsx';
import { 断曜流光 } from '../../物品/断曜流光.tsx';
import 段 from './段.ts';
import 声音 from './声音地址.生成.ts';

const 画幅 = { 宽: 1280, 高: 720 } as const;
const 天色 = '#b4cfff';
// idle 垫底，舞的姿势盖在上面（同 核对/结算舞）
const 跳舞 = 定表演({ 主: () => [{ 名: 'idle' }], 环境: 忘情牛肉面环境 });
const 加 = (a: readonly number[], b: readonly number[]): V3 => [a[0]! + b[0]!, a[1]! + b[1]!, a[2]! + b[2]!];

// 人站跳舞位面朝南，机位在南边过道里；横幅要把她脚底到举起的手、右边躺着的他都收进来
const 中殿: Cam = { pos: 加(教堂.跳舞位, [0.5, -5.6, 2.0]), tgt: 加(教堂.跳舞位, [1.1, 0, 0.95]), lens: 23 };

/** 他躺在哪：脚底中心（场景坐标），身子大致顺着东西向、脚朝她、头朝东（画面右边），离机位比她近一点 */
const 躺 = {
  脚: 加(教堂.跳舞位, [1.4, -1.9, 0]),
  /** 头朝哪（弧度，0 = 头朝南、90 度朝东）：朝东再往北偏 15 度，头离开南边长椅挡着的那一片 */
  头向: (105 * Math.PI) / 180,
  /** 胸口往机位那边侧过来多少（弧度）：平躺从侧面看只有一条，侧一点看得见胸口和脸 */
  侧: 0.12,
  /** 背贴地：身子方盒厚 4 像素的一半、侧过来以后背的一条棱更低，加盔甲鼓出来的一点（格） */
  垫高: 0.18,
  /** 曲子的拍（秒）：129.2 BPM（librosa 量的，08 的音轨和曲子一样）；手两拍摆一个来回 */
  拍: 60 / 129.2,
  /** 头抬起来看她：舞秒 [起, 止)，抬 0.25 秒、停着、0.3 秒落回去 */
  抬头: [
    [1.3, 2.4],
    [4.6, 5.5],
    [7.7, 8.6],
    [9.5, 10.9],
  ] as const,
};

/** 他这一刻的姿势（站着的坐标系：正面 +Y、头顶 +Z，躺下由外面那层转）。舞秒：同她的，手的摆和曲子的拍对上 */
const 躺姿 = (舞秒: number): StevePose => {
  // 拍从曲子第一拍算（曲子比舞晚 曲晚秒 起，第一拍约在曲子 0.01 秒）
  const 摆 = Math.sin((2 * Math.PI * (舞秒 - 曲晚秒 - 0.01)) / (2 * 躺.拍));
  let 抬 = 0;
  for (const [a, b] of 躺.抬头) 抬 = Math.max(抬, 平滑((舞秒 - a) / 0.25) * (1 - 平滑((舞秒 - (b - 0.3)) / 0.3)));
  return {
    ...standPose([0, 0, 0]),
    ground: 0,
    // 两手往前抬 = 躺着时朝天，偏向脚那头（冲着她举手；朝头那头举，近处那只手会挡住抬起来的脸）。
    // 跟着拍一前一后摆（机位在他侧面，这个方向的摆画面里是左右，两手岔成 V）；略往外张
    armR: 76 + 22 * 摆,
    armRRoll: -14,
    armL: 76 - 22 * 摆,
    armLRoll: -14,
    elbowR: 14,
    elbowL: 14,
    // 靠机位的左腿伸直往外撇，远的右腿屈膝立着（立在近处会挡住身子）
    legL: 0,
    legLRoll: -10,
    legR: 48,
    legRRoll: -6,
    kneeR: 98,
    // 平时脸朝天、往机位这边偏一点；抬头时下巴往胸口收，看向脚那头的她
    headPitch: -42 * 抬,
    headYaw: 22 - 8 * 抬,
  };
};

/** 站着坐标 → 躺在地上：绕 X 转 90 度（正面朝天、头朝 −Y），转到 头向，胸口往南（机位）侧一点，垫高、放到 躺.脚 */
const 躺下矩阵 = new THREE.Matrix4()
  .makeTranslation(躺.脚[0], 躺.脚[1], 躺.脚[2] + 躺.垫高)
  .multiply(new THREE.Matrix4().makeRotationX(躺.侧))
  .multiply(new THREE.Matrix4().makeRotationZ(躺.头向))
  .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));

const 躺着的史蒂夫: React.FC<{ 舞秒: number; 秒: number }> = ({ 舞秒, 秒 }) => (
  <>
    <group matrix={躺下矩阵} matrixAutoUpdate={false}>
      <装备史蒂夫 pose={躺姿(舞秒)} 秒={秒} 装备={{ 剑: false }} />
    </group>
    {/* 剑扔在他身子靠机位那边的地上（物品空间 Y 朝上、薄片法线 +Z：原样放进 Z 朝上的场景就是平躺；旧版薄片贴在模型北面，抬 0.5 格回到地面） */}
    <group position={加(躺.脚, [0.9, -0.55, 0.5 + 0.01])} rotation={[0, 0, -1.1]}>
      <断曜流光 光泽秒={秒} />
    </group>
  </>
);

const 摆机位: React.FC<{ 机位: Cam }> = ({ 机位 }) => {
  const { camera, gl } = useThree();
  gl.toneMapping = THREE.NeutralToneMapping;
  gl.toneMappingExposure = 1.0;
  摆相机(camera as THREE.PerspectiveCamera, 机位, 画幅.宽 / 画幅.高, { 近: 0.05, 远: 512 });
  return null;
};

export default 定义画面(段, 声音, () => {
  const { 秒, 事件 } = use段(段);
  const 舞秒 = 秒 - 事件.起舞;
  return (
    <AbsoluteFill style={{ background: 天色 }}>
      <ThreeCanvas width={画幅.宽} height={画幅.高} gl={{ antialias: true }} dpr={canvasDpr(1)}>
        <color attach="background" args={[天色]} />
        <摆机位 机位={中殿} />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <教堂灯光 />
          <粉色教堂 />
          <娘化亚波伦 pose={{ loc: 教堂.跳舞位, yaw: 180 }} 秒={Math.max(0, 舞秒)} 表演={跳舞} 姿势={忘情牛肉面姿势(舞秒)} />
          <躺着的史蒂夫 舞秒={舞秒} 秒={秒} />
        </group>
      </ThreeCanvas>
    </AbsoluteFill>
  );
});
