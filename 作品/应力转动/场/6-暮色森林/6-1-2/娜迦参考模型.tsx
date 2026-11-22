// 6-1-2 半空拔刀斩击杀娜迦：把模型库里的角色、道具、场景、特效按 编排.ts 组装成镜头。
// 场景和娜迦是从游戏里取的实机模型（带游戏贴图、实际比例）；李樱、九胡是纯色参考模型。
// 庭院放进游戏真实地形里（模型/场景/暮色新世界.tsx）。编排是庭院本地坐标：人、娜迦、特效、天空、云放进 <地标位 名="娜迦庭院">，镜头加上庭院原点换成世界坐标；
// 主光不放进去（平移的组里，平行光的目标还在世界原点，方向会歪）。
import { ThreeCanvas } from '@remotion/three';
import { canvasDpr } from '@engine/core/渲染级别.ts';
import { useThree } from '@react-three/fiber';
import React from 'react';
import { useVideoConfig } from 'remotion';
import { ScreenAo } from '@engine/voxel/屏幕AO.tsx';
import { PostFx } from '@engine/post/后期.tsx';
import * as THREE from 'three';
import { Ghost, type V3 } from '@engine/model/parts.tsx';
import { Jiuhu } from '@库/角色/九胡.tsx';
import { LiYing } from '@库/角色/李樱.tsx';
import { bladeInHand, handMatrix } from '@库/角色/骨架.tsx';
import { GAME_NAGA, GameNaga } from '@库/角色/娜迦实机.tsx';
import { bladeCenterY, DrawnKatana, Sheath, SHEATH_HANG_QUAT } from '@库/物品/拔刀剑.tsx';
import { Chest, TWILIGHT_CHEST_TEX } from '@库/物品/箱子.tsx';
import { SkyDome, twilightFogColor } from '@engine/light/天空.tsx';
import { Debris, DustPuffs } from '@库/特效/烟尘.tsx';
import { ExplosionBurst, PoofBurst } from '@库/特效/生物死亡.tsx';
import { BladeTrail, type BladePos, NightfallHit, NightfallBloom, liYingTrailPts } from '@库/特效/夜幕刀光.tsx';
import { shadowFarFor, TwilightClouds, TwilightSunLight, useTwilightFog } from '@engine/light/暮色光照.tsx';
import { VIEW_FOG } from '@engine/voxel/视距.ts';
import { LandmarkPlacement, TwilightTerrain } from '../../../地点/暮色新世界.tsx';
import { courtyardToWorld, nagaLight, nagaShotCam, placeNagaCamera, type CamPose, type NagaShotProps } from './机位.ts';
import * as choreo from './编排.ts';
import * as motion from './动作改进.ts';
import { mouthAt, type Mouth } from '../../../配音/口型.ts';
import { useCurrentSec } from '@engine/段/时间.tsx';

// 李樱用哪一版动作：原版（6-1-2-斩娜迦-旧动作）是 编排.ts 的 `liying`；正式的 6-1-2-斩娜迦（动作改进）换成 动作改进.ts 的 `liyingV2`（人、残影、刀光都跟着换）
type LiyingVersion = (t: number) => ReturnType<typeof choreo.liying>;
export const LiyingVersion = React.createContext<LiyingVersion>(choreo.liying);


// 场景坐标 (x, y, z) Z 朝上 → three.js (x, z, -y) Y 朝上
// 口型用的台词开口（段内秒，cue 在 段/6-斩娜迦/段.ts）：打击停顿以后的台词跟着往后挪。mouthAt 按 帧 ÷ 每秒 算，这里 帧 写的是秒、每秒给 1
const nagaLineCues = (hitStopSec: number) => [
  { id: '6-1-2-李樱-不值一提', frame: choreo.lineStartSec + hitStopSec },
  { id: '6-1-3-九胡-等等我', frame: choreo.segSec(choreo.S3 + choreo.MAZE_SHOUT) + hitStopSec },
];
const Rig: React.FC<{ k: CamPose }> = ({ k }) => {
  const { camera, size, gl } = useThree();
  // 中性色调映射：保住参考图的配色，不像 ACES 那样压暗、去饱和
  gl.toneMapping = THREE.NeutralToneMapping;
  gl.toneMappingExposure = 1.0;
  placeNagaCamera(camera as THREE.PerspectiveCamera, k, size.width / size.height);
  return null;
};

// 刀上两点（刀光的根、尖）在任意剧情秒的场景坐标（庭院本地）
export const makeLiyingBlade = (liying: LiyingVersion) => (sec: number): BladePos => {
  const state = liying(sec);
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
export const LiYingAt: React.FC<{ t: number; ghost?: boolean; mouth?: Mouth }> = ({ t, mouth: mouth }) => {
  const state = React.useContext(LiyingVersion)(t);
  const pose = state.pose;
  return (
    <>
      <LiYing
        pose={pose}
        mouth={mouth}
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

// t：剧情时间；tn：娜迦、宝箱用的剧情时间（动作改进版收刀晚了，娜迦跟着晚炸，见 动作改进.ts 的 `nagaWarp`）
const Action: React.FC<{ t: number; tn?: number; liYingMouth?: Mouth; jiuhuMouth?: Mouth }> = ({ t, tn = t, liYingMouth, jiuhuMouth }) => {
  const naga = choreo.naga(tn);
  const ch = choreo.chest(tn);
  const jh = choreo.jiuhu(t);
  const liyingVersion = React.useContext(LiyingVersion);
  const bladeAt = React.useMemo(() => (liyingVersion === choreo.liying ? liyingBlade : makeLiyingBlade(liyingVersion)), [liyingVersion]);
  return (
    <>
      <LiYingAt t={t} mouth={liYingMouth} />
      {choreo.ghosts(t).map((g, i) => (
        <Ghost.Provider key={i} value={{ color: '#e6e2f2', opacity: g.opacity }}>
          <LiYingAt t={g.t} ghost />
        </Ghost.Provider>
      ))}
      <Jiuhu pose={jh.pose} tail={jh.tail} bend={jh.bend} gait={jh.gait} run={jh.run} mouth={jiuhuMouth} />
      <GameNaga pose={naga.pose} />
      {naga.bursts.map((b, i) => (
        // 镜头 2b 里李樱站在断口东边 3～4 格：粒子只散在 x 0 以西，免得整团烟把他埋住
        <ExplosionBurst key={i} center={b.center} width={GAME_NAGA.segmentSize} sec={b.sec} seed={b.seed} maxX={0} />
      ))}
      <PoofBurst center={naga.poof.center} width={GAME_NAGA.headSize / 2} height={GAME_NAGA.headSize} sec={naga.poof.sec} seed={99} />
      <Debris sec={naga.debris.sec} origin={naga.debris.origin} seed={9} colors={GAME_NAGA.debris} count={18} />
      <DustPuffs puffs={choreo.dust(t)} />
      {/* 夜幕阎魔刀的刀光拖尾和刀穿过脖子那一刻的命中闪光、血滴 */}
      <BladeTrail bladeAt={bladeAt} startSec={choreo.bladeTrailTimes.start} endSec={choreo.bladeTrailTimes.end} sec={t} />
      <NightfallHit feet={hitGround} width={GAME_NAGA.segmentSize} height={GAME_NAGA.segmentSize} sec={t - choreo.bladeTrailTimes.hit} seed={117} />
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
const preFixLiying = (t: number) => choreo.liying(t, { sheathTiming: '关' });
export const NagaBlockout: React.FC<NagaShotProps> = (props) => {
  const { motionImproved: motionV2 = false, hitStopSec = 0, newCams = false, preSheathFix = false, followMode: followMode } = props;
  const sec = useCurrentSec();
  const { width, height } = useVideoConfig();
  const { t: storyTime, cam: cam } = nagaShotCam({ hitStopSec, newCams, followMode: followMode }, sec);
  const { mazePreset, dir: lightDir, gain: lightGain } = nagaLight(props, storyTime);
  const liyingVersion = motionV2 ? motion.liyingV2 : preSheathFix ? preFixLiying : choreo.liying;
  const lineCues = nagaLineCues(hitStopSec);
  useTwilightFog(lightDir);
  // 不超采样（用户 10-07 定，见 lib/渲染级别.ts）：720p 时 dpr=2 远处方块、树叶、海带出摩尔纹，超采样只减半，3 倍反而更差（非整数倍缩放）
  return (
    <>
      {/* 声音照 段.ts 的 cue 放（definePicture 自动挂，决策 0015），不在这里挂 */}
      <ThreeCanvas width={width} height={height} shadows="percentage" gl={{ antialias: true }} dpr={canvasDpr(1)}>
        <color attach="background" args={[twilightFogColor]} />
        {/* 暮色森林的雾是很亮的薄荷绿；按全片规矩开满视距，只在视距边上淡出（lib/视距.ts） */}
        <fog attach="fog" args={[twilightFogColor, VIEW_FOG.near, VIEW_FOG.far]} />
        <Rig k={cam} />
        {/* 刀光、命中闪光的泛光（夜幕的 bloom 管线），这个画布由它来画 */}
        {/* 渲染顺序：后期（0.5，换到半精度离屏图）→ 屏幕 AO（1）→ 后期拷到画布（1.5）→ 夜幕刀光泛光（2） */}
        <PostFx drawsScene={false} remap={mazePreset ? mazePreset.remap : true} />
        <ScreenAo />
        <NightfallBloom drawsScene={false} />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          {/* 暮色森林天上没有太阳（见 模型/场景/天空.tsx），主光是艺术选择，和一镜到底同一道（lib/光照配比.ts 的 暮色光向）。
              10-07 起是黄昏档的落日，南偏西 200°、仰角 14°（为一镜到底往东飞的几程定的）；原来是东偏南，为的是墙内镜头（朝西南看）看到的东面是亮面，
              现在那几个镜头里墙是背光的，靠黄昏档偏蓝紫的天光托着。投影到雾的远端（视距） */}
          <TwilightSunLight shadowFar={shadowFarFor(VIEW_FOG.far)} lightDir={lightDir} gain={lightGain} />
          {/* 跑道上的草留着（用户 2026-10-01：不用清），跑起来脚会被草挡住一点。庭院网格由 暮色地形 画（摆在新世界的庭院上） */}
          <TwilightTerrain camPos={courtyardToWorld(cam.pos)} landmarks={nagaLandmarks} t={sec} shadowLightDir={lightDir} />
          {/* 云同暮色各镜头（lib/暮色光照.tsx 的 TwilightClouds），按这里的光向打光 */}
          <TwilightClouds sun={lightDir} />
          <LandmarkPlacement name="娜迦庭院">
            <SkyDome twilight sun={lightDir} />
            <LiyingVersion.Provider value={liyingVersion}>
              <Action t={storyTime} tn={motionV2 ? motion.nagaWarp(storyTime) : storyTime} liYingMouth={mouthAt(lineCues, '李樱', sec, 1)} jiuhuMouth={mouthAt(lineCues, '九胡', sec, 1)} />
            </LiyingVersion.Provider>
          </LandmarkPlacement>
        </group>
      </ThreeCanvas>
    </>
  );
};
