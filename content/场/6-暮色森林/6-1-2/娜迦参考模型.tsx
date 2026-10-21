// 6-1-2 半空拔刀斩击杀娜迦：把模型库里的角色、道具、场景、特效按 编排.ts 组装成镜头。
// 场景和娜迦是从游戏里取的实机模型（带游戏贴图、实际比例）；李樱、九胡是纯色参考模型。
// 庭院放进游戏真实地形里（模型/场景/暮色新世界.tsx）。编排是庭院本地坐标：人、娜迦、特效、天空、云放进 <地标位 名="娜迦庭院">，镜头加上庭院原点换成世界坐标；
// 主光不放进去（平移的组里，平行光的目标还在世界原点，方向会歪）。
import { ThreeCanvas } from '@remotion/three';
import { canvasDpr } from '../../../../engine/core/渲染级别.ts';
import { useThree } from '@react-three/fiber';
import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { ScreenAo } from '../../../../engine/voxel/屏幕AO.tsx';
import { PostFx } from '../../../../engine/post/后期.tsx';
import * as THREE from 'three';
import { Ghost, V3 } from '../../../../engine/model/parts.tsx';
import { Jiuhu } from '../../../../world/角色/九胡.tsx';
import { LiYing } from '../../../../world/角色/李樱.tsx';
import { bladeInHand, handMatrix } from '../../../../world/角色/骨架.tsx';
import { GAME_NAGA, GameNaga } from '../../../../world/角色/娜迦实机.tsx';
import { bladeCenterY, DrawnKatana, Sheath, SHEATH_HANG_QUAT } from '../../../../world/物品/拔刀剑.tsx';
import { Chest, TWILIGHT_CHEST_TEX } from '../../../../world/物品/箱子.tsx';
import { SkyDome, twilightFogColor } from '../../../../engine/light/天空.tsx';
import { Debris, DustPuffs } from '../../../../world/特效/烟尘.tsx';
import { ExplosionBurst, PoofBurst } from '../../../../world/特效/生物死亡.tsx';
import { BladeTrail, BladePos, NightfallHit, NightfallBloom, liYingTrailPts } from '../../../../world/特效/夜幕刀光.tsx';
import { shadowFarFor, TwilightClouds, TwilightSunLight, useTwilightFog } from '../../../../engine/light/暮色光照.tsx';
import { VIEW_FOG } from '../../../../engine/voxel/视距.ts';
import { sunDirFromAngles, cliGain, cliSunDir, twilightSunDir } from '../../../../engine/light/光照配比.ts';
import { LandmarkPlacement, twilightLandmark, TwilightTerrain } from '../../../../world/地点/暮色新世界.tsx';
import * as choreo from './编排.ts';
import * as motion from './动作改进.ts';
import { nagaLineCues, NagaShotSound } from './声音.tsx';
import { mouthAt, type Mouth } from '../../../../world/角色/口型.ts';
import { 渲染输入 } from '../../../../engine/core/渲染设置.ts';

// 李樱用哪一版动作：原版（6-1-2-斩娜迦-旧动作）是 编排.ts 的 `liying`；正式的 6-1-2-斩娜迦（动作改进）换成 动作改进.ts 的 `liyingV2`（人、残影、刀光都跟着换）
type LiyingVersion = (frame: number) => ReturnType<typeof choreo.liying>;
export const LiyingVersion = React.createContext<LiyingVersion>(choreo.liying);


export const courtyardOrigin = twilightLandmark('娜迦庭院').原点;
export const courtyardToWorld = (p: number[]) => [p[0] + courtyardOrigin[0], p[1] + courtyardOrigin[1], p[2] + courtyardOrigin[2]];

// 庭院的光（用户 10-13 定）：东偏北 70°、仰角 28°、灯 0.75 倍（相当于光倍 1.5）。原来一镜到底的黄昏光（200°/14°）在庭院里太低，整片地面落在树影里，又平又蓝。
// 依据写实关键帧（正篇/…/2-斩娜迦/关键帧/0、60）；仰角再高或强度照旧时第 159 帧墙角整片受光、没了黄昏感。
// 只管 6-1-2：一镜到底往东飞那几程照旧用 200°（见 lib/光照配比.ts）。命令行给了 `lightAzimuth`/`lightElevation`/`lightGain` 时让给命令行。6-1-1 的暮色那半段也用这一道。
export const courtyardLightDir = cliSunDir ? twilightSunDir : sunDirFromAngles(70, 28);
export const courtyardLightGain = cliGain ? 1 : 0.75;
// 迷宫镜头（S3 起，九胡被传送进树篱迷宫）的光：70°/28° 时太阳在镜头背后，顺光把她晒成粉橙、脸发白。用 --props='{"mazeLight":"…"}' 切换，对比帧在 预览/1013-纯渲染光影材质与动作/收尾/：
// 庭院（70°/28°、0.75 倍）过曝；压暗（灯 0.5 倍）仍平、发粉；
// 侧光（东偏南 115°、仰角 28°，从左后方斜照）肤色本色、有暖光斑，和庭院收刀的 70° 只差 45°，硬切不跳；
// 侧逆光（南偏西 215°、仰角 18° 等多档）被两三层树篱挡住，整个迷宫又暗又蓝；100°/28° 被正面晒粉，130°/28° 暖光斑太少；
// 一镜（默认）：一镜到底的黄昏光（200°/14°、1 倍，同 6-1-3 起飞），也整片在阴影里。
// 用户 10-13 定：本镜头最后一帧就是 6-1-3 第一帧，光必须和 6-1-3 接上，按改动量最小统一成 6-1-3 的光；代价是迷宫这镜偏暗偏蓝，庭院收刀（70°）切过来光向会变。侧光那档留着备用
export type MazeLightPreset = '庭院' | '压暗' | '侧光' | '侧逆光' | '一镜';
const mazeLightPresets: Record<MazeLightPreset, { 向: V3; 倍: number; remap: boolean }> = {
  庭院: { 向: sunDirFromAngles(70, 28), 倍: 0.75, remap: true },
  压暗: { 向: sunDirFromAngles(70, 28), 倍: 0.5, remap: true },
  侧光: { 向: sunDirFromAngles(115, 28), 倍: 0.75, remap: true },
  侧逆光: { 向: sunDirFromAngles(215, 18), 倍: 0.75, remap: true },
  一镜: { 向: sunDirFromAngles(200, 14), 倍: 1, remap: false },
};
const defaultMazeLight: MazeLightPreset = '一镜';
// 屏幕 AO 压不压导出网格（评估用：--props='{"meshAO":true}'）
const meshAO = Boolean((渲染输入() as { meshAO?: boolean }).meshAO);

// 场景坐标 (x, y, z) Z 朝上 → three.js (x, z, -y) Y 朝上
const toThree = ([x, y, z]: number[]) => new THREE.Vector3(x, z, -y);

type CamPose = { lens: number; pos: number[]; tgt: number[] };
const Rig: React.FC<{ k: CamPose }> = ({ k }) => {
  const { camera, size, gl } = useThree();
  // 中性色调映射：保住参考图的配色，不像 ACES 那样压暗、去饱和
  gl.toneMapping = THREE.NeutralToneMapping;
  gl.toneMappingExposure = 1.0;
  const cam = camera as THREE.PerspectiveCamera;
  // 焦距按 36mm 横向画幅换算，three.js 用竖向视角
  cam.fov = (2 * Math.atan(18 / k.lens / (size.width / size.height)) * 180) / Math.PI;
  cam.near = 0.1;
  cam.far = 1200;
  cam.position.copy(toThree(courtyardToWorld(k.pos)));
  cam.up.set(0, 1, 0);
  cam.lookAt(toThree(courtyardToWorld(k.tgt)));
  cam.updateProjectionMatrix();
  return null;
};

// 刀上两点（刀光的根、尖）在任意剧情秒的场景坐标（庭院本地）
export const makeLiyingBlade = (liying: LiyingVersion) => (sec: number): BladePos => {
  const state = liying(sec * choreo.FPS);
  const handMat = handMatrix(state.pose, 1.875, 'R').multiply(new THREE.Matrix4().makeRotationFromQuaternion(bladeInHand(state.pose, state.blade, state.bladeSide)));
  const at = (z: number): V3 => {
    const point = new THREE.Vector3(0, bladeCenterY(z), z).applyMatrix4(handMat);
    return [point.x, point.y, point.z];
  };
  return { root: at(liYingTrailPts.root), tip: at(liYingTrailPts.tip) };
};
export const liyingBlade = makeLiyingBlade(choreo.liying);

const groupTransform = (mat?: THREE.Matrix4) => {
  if (!mat) return {};
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  mat.decompose(position, quaternion, new THREE.Vector3());
  return { position, quaternion };
};

// 嘴：说话的口型（残影不给）
export const LiYingAt: React.FC<{ f: number; ghost?: boolean; 嘴?: Mouth }> = ({ f: frame, 嘴: mouth }) => {
  const state = React.useContext(LiyingVersion)(frame);
  const pose = state.pose;
  return (
    <>
      <LiYing
        pose={pose}
        嘴={mouth}
        hipL={
          // 鞘相对挂点的变换（收刀时左手把鞘转过来迎刀，见 收刀.ts）；收刀那几帧刀画在鞘的坐标系里，由鞘带着对准鞘口、顺着鞘滑进去
          <group {...(state.sheath ? groupTransform(state.sheath) : { quaternion: SHEATH_HANG_QUAT })}>
            <Sheath sheathed={!state.bladeOn} />
            {state.bladeOn && state.sheathBlade && (
              <group {...groupTransform(state.sheathBlade)}>
                <DrawnKatana />
              </group>
            )}
          </group>
        }
        // 刀的方向是按身体坐标给的，握持点上怎么转由骨架倒推（胸扭转、肩、肘都算进去）
        handR={state.bladeOn && !state.sheathBlade && <group quaternion={bladeInHand(pose, state.blade, state.bladeSide)}><DrawnKatana /></group>}
      />
    </>
  );
};

const hitGround: V3 = [choreo.CUT_X, choreo.DASH_Y, 0];

// fn：娜迦、宝箱用的剧情帧（动作改进版收刀晚了，娜迦跟着晚炸，见 动作改进.ts 的 娜迦时间）
const Action: React.FC<{ f: number; fn?: number; liYingMouth?: Mouth; jiuhuMouth?: Mouth }> = ({ f: frame, fn = frame, liYingMouth, jiuhuMouth }) => {
  const naga = choreo.naga(fn);
  const ch = choreo.chest(fn);
  const jh = choreo.jiuhu(frame);
  const liyingVersion = React.useContext(LiyingVersion);
  const bladeAt = React.useMemo(() => (liyingVersion === choreo.liying ? liyingBlade : makeLiyingBlade(liyingVersion)), [liyingVersion]);
  return (
    <>
      <LiYingAt f={frame} 嘴={liYingMouth} />
      {choreo.ghosts(frame).map((g, i) => (
        <Ghost.Provider key={i} value={{ color: '#e6e2f2', opacity: g.opacity }}>
          <LiYingAt f={g.f} ghost />
        </Ghost.Provider>
      ))}
      <Jiuhu pose={jh.pose} tail={jh.tail} bend={jh.bend} gait={jh.gait} run={jh.run} 嘴={jiuhuMouth} />
      <GameNaga pose={naga.pose} />
      {naga.bursts.map((b, i) => (
        // 镜头 2b 里李樱站在断口东边 3～4 格：粒子只散在 x 0 以西，免得整团烟把他埋住
        <ExplosionBurst key={i} center={b.center} width={GAME_NAGA.segmentSize} sec={b.sec} seed={b.seed} maxX={0} />
      ))}
      <PoofBurst center={naga.poof.center} width={GAME_NAGA.headSize / 2} height={GAME_NAGA.headSize} sec={naga.poof.sec} seed={99} />
      <Debris sec={naga.debris.sec} origin={naga.debris.origin} seed={9} colors={GAME_NAGA.debris} count={18} />
      <DustPuffs puffs={choreo.dust(frame)} />
      {/* 夜幕阎魔刀的刀光拖尾和刀穿过脖子那一刻的命中闪光、血滴 */}
      <BladeTrail bladeAt={bladeAt} startSec={choreo.bladeTrailFrames.start / choreo.FPS} endSec={choreo.bladeTrailFrames.end / choreo.FPS} sec={frame / choreo.FPS} />
      <NightfallHit feet={hitGround} width={GAME_NAGA.segmentSize} height={GAME_NAGA.segmentSize} sec={(frame - choreo.bladeTrailFrames.hit) / choreo.FPS} seed={117} />
      {ch.scale > 0 && (
        <group position={ch.loc} scale={ch.scale}>
          {/* 娜迦死后掉落物装进暮色木箱（游戏里暮色橡木、林冠木随机二选一，用户 2026-10-02 要用暮色的箱子，同 6-1-5 巫妖挑暮色橡木） */}
          <Chest 贴图={TWILIGHT_CHEST_TEX.暮色橡木} />
        </group>
      )}
    </>
  );
};

const nagaLandmarks: ['娜迦庭院'] = ['娜迦庭院'];
// 动作改进的开关（见 动作改进.ts）。全不给就是原版（6-1-2-斩娜迦-旧动作）；正式的 6-1-2-斩娜迦 给 动作改进.ts 的 `official`。
// 动作改进：李樱换成错开起止、急停弹簧、呼吸微动的那一版；打击停顿：斩中时整个画面定格几帧（0 = 不停，总长跟着加这么多帧）；
// 新机位：迅冲、俯拍斩击拉近，收刀换成参考的近景低机位（动作改进.ts 的 `cameraV2`）；
// 收刀修前：不加收刀约束（修穿模以前的样子，核对用）；跟拍：机位跟着李樱（全身 / 腰间特写），只用来新旧对比、核对穿模
export type NagaShotProps = { mazeLight?: MazeLightPreset; 动作改进?: boolean; hitStopFrames?: number; newCams?: boolean; preSheathFix?: boolean; 跟拍?: '全身' | '腰' };
export const nagaShotFrames = (p: NagaShotProps) => choreo.FRAMES + (p.hitStopFrames ?? 0);
const preFixLiying = (f: number) => choreo.liying(f, { sheathTiming: '关' });
const followCamPose = (frame: number, mode: '全身' | '腰'): CamPose => {
  const [x, y, z] = choreo.liyingLoc(frame);
  return mode === '全身'
    ? { lens: 35, pos: [x + 3.6, y + 2.4, z + 0.5], tgt: [x, y, z + 0.95] }
    : { lens: 40, pos: [x + 3.3, y + 2.2, z + 1.0], tgt: [x, y, z + 0.8] };
};
// 段内帧（Remotion 帧）→ 剧情帧和这一帧的机位。伤害数字层也调它，和画面同帧同机位。
// 编排里的时间轴是剧情帧（助跑中途跳过了一段，见 编排.ts 的 `story`）；打击停顿在剧情帧上再停住几帧
export const nagaShotCam = ({ hitStopFrames = 0, newCams = false, 跟拍: followMode }: NagaShotProps, frame: number) => {
  const storyFrame = motion.hitStopFrames(hitStopFrames)(choreo.story(frame + 1));
  const cam: CamPose = followMode ? followCamPose(storyFrame, followMode) : newCams ? motion.cameraV2(storyFrame) : choreo.camera(storyFrame);
  return { f: storyFrame, cam: cam };
};
export const NagaBlockout: React.FC<NagaShotProps> = (props) => {
  const { 动作改进: motionV2 = false, hitStopFrames = 0, newCams = false, preSheathFix = false, 跟拍: followMode } = props;
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const { f: storyFrame, cam: cam } = nagaShotCam({ hitStopFrames, newCams, 跟拍: followMode }, frame);
  // 光：庭院几个镜头 70°/28°；迷宫镜头（S3 起）按 迷宫光 换（见上面）
  const mazePreset = storyFrame >= choreo.S3 && !cliSunDir && !cliGain ? mazeLightPresets[props.mazeLight ?? defaultMazeLight] : null;
  const lightDir = mazePreset ? mazePreset.向 : courtyardLightDir;
  const lightGain = mazePreset ? mazePreset.倍 : courtyardLightGain;
  const liyingVersion = motionV2 ? motion.liyingV2 : preSheathFix ? preFixLiying : choreo.liying;
  const lineCues = nagaLineCues(hitStopFrames);
  useTwilightFog(lightDir);
  // 不超采样（用户 10-07 定，见 lib/渲染级别.ts）：720p 时 dpr=2 远处方块、树叶、海带出摩尔纹，超采样只减半，3 倍反而更差（非整数倍缩放）
  return (
    <>
      <NagaShotSound hitStopFrames={hitStopFrames} sheathLateFrames={motionV2 ? motion.sheathLateFrames : 0} listener={followMode ? undefined : newCams ? motion.cameraV2 : undefined} />
      <ThreeCanvas width={width} height={height} shadows="percentage" gl={{ antialias: true }} dpr={canvasDpr(1)}>
        <color attach="background" args={[twilightFogColor]} />
        {/* 暮色森林的雾是很亮的薄荷绿；按全片规矩开满视距，只在视距边上淡出（lib/视距.ts） */}
        <fog attach="fog" args={[twilightFogColor, VIEW_FOG.near, VIEW_FOG.far]} />
        <Rig k={cam} />
        {/* 刀光、命中闪光的泛光（夜幕的 bloom 管线），这个画布由它来画 */}
        {/* 渲染顺序：后期（0.5，换到半精度离屏图）→ 屏幕 AO（1）→ 后期拷到画布（1.5）→ 夜幕刀光泛光（2） */}
        <PostFx drawsScene={false} remap={mazePreset ? mazePreset.remap : true} />
        <ScreenAo applyToMesh={meshAO} />
        <NightfallBloom drawsScene={false} />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          {/* 暮色森林天上没有太阳（见 模型/场景/天空.tsx），主光是艺术选择，和一镜到底同一道（lib/光照配比.ts 的 暮色光向）。
              10-07 起是黄昏档的落日，南偏西 200°、仰角 14°（为一镜到底往东飞的几程定的）；原来是东偏南，为的是墙内镜头（朝西南看）看到的东面是亮面，
              现在那几个镜头里墙是背光的，靠黄昏档偏蓝紫的天光托着。投影到雾的远端（视距） */}
          <TwilightSunLight shadowFar={shadowFarFor(VIEW_FOG.far)} lightDir={lightDir} gain={lightGain} />
          {/* 跑道上的草留着（用户 2026-10-01：不用清），跑起来脚会被草挡住一点。庭院网格由 暮色地形 画（摆在新世界的庭院上） */}
          <TwilightTerrain camPos={courtyardToWorld(cam.pos)} landmarks={nagaLandmarks} t={frame / fps} shadowLightDir={lightDir} />
          {/* 云同暮色各镜头（lib/暮色光照.tsx 的 TwilightClouds），按这里的光向打光 */}
          <TwilightClouds sun={lightDir} />
          <LandmarkPlacement 名="娜迦庭院">
            <SkyDome twilight sun={lightDir} />
            <LiyingVersion.Provider value={liyingVersion}>
              <Action f={storyFrame} fn={motionV2 ? motion.nagaWarp(storyFrame) : storyFrame} liYingMouth={mouthAt(lineCues, '李樱', frame)} jiuhuMouth={mouthAt(lineCues, '九胡', frame)} />
            </LiyingVersion.Provider>
          </LandmarkPlacement>
        </group>
      </ThreeCanvas>
    </>
  );
};
