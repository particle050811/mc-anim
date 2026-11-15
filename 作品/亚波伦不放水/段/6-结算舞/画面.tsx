// 第 6 幕 结算舞的画面：照分镜第 9 节「跳一遍」。一进来就是中殿走道正面全身跳一遍（固定），收住停 2 秒。
// 用户 11-11：外立面全景「意义不明 去掉 直接跳」，「右边放一个躺在地上的史蒂夫表示也完全打不过投降」。
// 史蒂夫在画面右边、她左手边地上仰面瘫着，摆成「大」字：两臂往两边平摊在地上、两腿叉开，头微抬冲着机位、偏向她，一直不动
// （用户 11-11「史蒂夫瘫在地上，张开双手，不要把手举起来  摆成一个大字形」，取代原来两手朝天张成 V、随拍摆、隔一阵抬头看她）。
// 用户 11-11「战败了 怎么还穿着装备把装备下了呀」：不穿装备，原版史蒂夫皮肤（他第 5 幕死时东西撒了一地）；盔甲、披风、剑去掉，头后的晋升之环也是饰品，一起去掉（Agent 取的）。
// 用户 11-11「跳舞这里衣服穿模了」：她的腿叉开、提膝时从袍子下摆戳出来，袍摆按腿让开（角色/袍摆让腿.ts），舞的动作不改。
// 用户 11-11「跳舞头动作有点僵硬」：头跟着上身慢半拍走（角色/动作/忘情牛肉面.ts 末尾「头」一节），身子不改。
// 机位、他躺的位置和姿势都是 Agent 取的，用户没看过。天空是纯色淡蓝（教堂所在空间的天没核实，同 核对/粉色教堂）。
// 底部字幕「亚波伦结算动画」用户 11-10 说多余，去掉了。没做：结算面板（分镜默认不要）。
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import * as THREE from 'three';
import type { Cam } from '@engine/core/机位.ts';
import { placeCamera } from '@engine/core/three换算.ts';
import { canvasDpr } from '@engine/core/渲染级别.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { blendLayers } from '@engine/anim/基岩动画.ts';
import type { BonePose } from '@engine/model/基岩模型.tsx';
import { definePicture, useSeg } from '@engine/段/段画面.tsx';
import { standPose } from '@库/角色/骨架.tsx';
import type { StevePose } from '@库/角色/史蒂夫.tsx';
import { church, ChurchLighting, PinkChurch } from '../../地点/粉色教堂.tsx';
import { noodleDancePose, noodleDanceEnv } from '../../角色/动作/忘情牛肉面.ts';
import { animSkeletonTable, GirlYaBoLun, GirlYaBoLunCreature, defineAct } from '../../角色/娘化亚波伦.tsx';
import { hemYieldLeg } from '../../角色/袍摆让腿.ts';
import { EquippedSteve } from '../../角色/史蒂夫装备.tsx';
import seg from './段.ts';
import soundUrl from './声音地址.生成.ts';

const aspect = { 宽: 1280, 高: 720 } as const;
const skyColor = '#b4cfff';
// idle 垫底，舞的姿势盖在上面（同 核对/结算舞）
const dance = defineAct({ 主: () => [{ 名: 'idle' }], 环境: noodleDanceEnv });
const addVec = (a: readonly number[], b: readonly number[]): V3 => [a[0]! + b[0]!, a[1]! + b[1]!, a[2]! + b[2]!];
const yaBoLunGeometry = GirlYaBoLunCreature.definition.模型 as Parameters<typeof hemYieldLeg>[0];
/** 这一刻她的手摆姿势：舞的骨骼，加上按腿让开的袍摆（袍摆要看动画垫底的那份合起来以后腿在哪） */
const dancePose = (sec: number, danceSec: number): Record<string, BonePose> => {
  const danceBones = noodleDancePose(danceSec);
  return { ...danceBones, ...hemYieldLeg(yaBoLunGeometry, blendLayers([{ skeleton: animSkeletonTable(sec, dance) }, { skeleton: danceBones }], 'TLM')).bonePose };
};

// 人站跳舞位面朝南，机位在南边过道里；横幅要把她脚底到举起的手、右边躺着的他都收进来
const naveRig: Cam = { pos: addVec(church.dancePos, [0.5, -5.6, 2.0]), tgt: addVec(church.dancePos, [1.1, 0, 0.95]), lens: 23 };

/** 他躺在哪：脚底中心（场景坐标），在她右前方、离机位比她近；脚冲着机位、头朝里，镜头看过去脸是正的 */
const lying = {
  feet: addVec(church.dancePos, [1.5, -1.9, 0]),
  /** 头朝哪（弧度，0 = 头朝南、90 度朝东）：朝北偏东 25 度。横着躺（头朝东）脸在画面里是横的、被头盔两翼和近处的手挡住，认不出是他（协调者 11-11） */
  headDirRad: (155 * Math.PI) / 180,
  /** 绕东西轴侧多少（弧度）：现在身子顺着南北，侧了就是头抬离地面，不侧 */
  sideTilt: 0,
  /** 背贴地：身子方盒厚 4 像素的一半（格）。原来穿盔甲时是 0.22，脱了甲往下落 */
  padHeightM: 0.13,
  /** 头：微微抬着冲机位（平躺脸朝天，从机位看太扁）、往她那边偏一点（她在他西边）；瘫着不动 */
  头: { pitch: -20, 转: -14 },
};

/** 他的姿势（站着的坐标系：正面 +Y、头顶 +Z，躺下由外面那层转）：摊成「大」字，两臂往两边平摊在地上、两腿叉开 */
const lyingPose: StevePose = {
  ...standPose([0, 0, 0]),
  ground: 0,
  // 用户 11-11「张开双手，不要把手举起来 摆成一个大字形」：手臂只往两侧张（roll 负 = 往外），不往前抬，躺下后就贴着地；
  // 略往脚那头收一点（−80 而不是 −90），像瘫开而不是摆 T 字
  armR: 0,
  armRRoll: -80,
  armL: 0,
  armLRoll: -80,
  // 两腿伸直往外叉开
  legL: 0,
  legLRoll: -28,
  legR: 0,
  legRRoll: -28,
  headPitch: lying.头.pitch,
  headYaw: lying.头.转,
};

/** 站着坐标 → 躺在地上：绕 X 转 90 度（正面朝天、头朝 −Y），转到 头向，按 侧 绕东西轴转，垫高、放到 躺.脚 */
const lyingMatrix = new THREE.Matrix4()
  .makeTranslation(lying.feet[0], lying.feet[1], lying.feet[2] + lying.padHeightM)
  .multiply(new THREE.Matrix4().makeRotationX(lying.sideTilt))
  .multiply(new THREE.Matrix4().makeRotationZ(lying.headDirRad))
  .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));

// 什么都不穿不拿：盔甲（连胸甲背后的披风）、剑、晋升之环都不要
const noEquipment = { armor: [], 剑: false, hasRing: false } as const;
const LyingSteve: React.FC<{ 秒: number }> = ({ 秒: sec }) => (
  <group matrix={lyingMatrix} matrixAutoUpdate={false}>
    <EquippedSteve pose={lyingPose} 秒={sec} equipment={noEquipment} />
  </group>
);

const PlaceRig: React.FC<{ cameraRig: Cam }> = ({ cameraRig }) => {
  const { camera, gl } = useThree();
  gl.toneMapping = THREE.NeutralToneMapping;
  gl.toneMappingExposure = 1.0;
  placeCamera(camera as THREE.PerspectiveCamera, cameraRig, aspect.宽 / aspect.高, { near: 0.05, far: 512 });
  return null;
};

export default definePicture(seg, soundUrl, () => {
  const { 秒: sec, 事件: events } = useSeg(seg);
  const danceSec = sec - events.danceStart;
  return (
    <AbsoluteFill style={{ background: skyColor }}>
      <ThreeCanvas width={aspect.宽} height={aspect.高} gl={{ antialias: true }} dpr={canvasDpr(1)}>
        <color attach="background" args={[skyColor]} />
        <PlaceRig cameraRig={naveRig} />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <ChurchLighting />
          <PinkChurch />
          <GirlYaBoLun pose={{ loc: church.dancePos, yaw: 180 }} 秒={Math.max(0, danceSec)} act={dance} bonePose={dancePose(Math.max(0, danceSec), danceSec)} />
          <LyingSteve 秒={sec} />
        </group>
      </ThreeCanvas>
    </AbsoluteFill>
  );
});
