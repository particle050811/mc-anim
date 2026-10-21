// 6-3 下坠的画面：按全局帧 G 画出这一帧（时钟见 时间线.ts，人和机位见 编排.ts，坑和井见 竖井.tsx，特效见 碎块.tsx）。
// 各段 Composition（镜头/6-3-3/俯冲.tsx 等）只给段名：段内第 f 帧 = 全局帧 段起 + f。
// 地上用主世界-116 的真实地形（城址整平、竖井和古城挖掉，见 地形.ts）+ 边城 + 云，光照同 6-2-5、6-2-6（飞行镜头.tsx 的灯），地形加屏幕空间 AO；
// 地下（竖井、古城）用这套灯、不投影，像开了夜视（用户 10-02），不画天空；雾同古城4x 满视距（竖井.tsx 的 `UnderFog`）。
// 不画推力来源（用户 10-10 删了脚底鼓风机虚影和气流）。金光、望远镜视野（原版镜筒遮罩）、6-3-6 撞击的金白闪光是画面层。
import { ThreeCanvas } from '@remotion/three';
import React, { useMemo } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import * as THREE from 'three';
import { rad } from '../../../../engine/anim/anim.ts';
import type { V3 } from '../../../../engine/model/parts.tsx';
import { BedrockModel, BedrockModelView } from '../../../../engine/model/基岩模型.tsx';
import { png } from '../../../../engine/model/贴图.ts';
import { LevelParams, canvasDpr } from '../../../../engine/core/渲染级别.ts';
import { ScreenAo } from '../../../../engine/voxel/屏幕AO.tsx';
import { VoxelWorld } from '../../../../engine/voxel/世界.tsx';
import { FlightFog, FlightRig, overworldShadowOn, overworldShadowFar, OverworldSunLight } from '../../../../world/地点/飞行镜头.tsx';
import { JIUHU, jiuhuMouthAttach } from '../../../../world/角色/九胡.tsx';
import jiuhuRaw资产 from 'asset:模型/角色/九胡';
import jiuhuSkin from 'asset:贴图/角色/九胡';
import { LiYing } from '../../../../world/角色/李樱.tsx';
import { RideBroom } from '../../../../world/角色/骑扫帚.tsx';
import { bladeInHand } from '../../../../world/角色/骨架.tsx';
import { Guard } from '../../../../world/角色/卫兵.tsx';
import { MaceInHand } from '../../../../world/物品/重锤.tsx';
import { MechanicalRoller } from '../../../../world/物品/动力压路机.tsx';
import { BorderTown } from '../../../../world/地点/边城轮廓.tsx';
import { borderTownPos } from '../../../../world/地点/主世界116.ts';
import { SKY, SkyDome } from '../../../../engine/light/天空.tsx';
import { sheath } from '../../../../world/地点/边城/6-2-5/飞越主世界.tsx';
import { OverworldSky, SUN_OW, SUN_OW_DIR } from '../../../../world/地点/主世界光照.tsx';
import { overworldMix } from '../../../../engine/light/光照配比.ts';
import * as choreo from '../../../../world/地点/边城/6-3-下坠/编排.ts';
import * as timeline from '../../../../world/地点/边城/6-3-下坠/时间线.ts';
import { AncientCity, SlabFloor, ShaftWalls, UnderFog, UNDER_BACKGROUND } from '../../../../world/地点/边城/6-3-下坠/竖井.tsx';
import { ShaftFill } from '../../../../world/地点/边城/6-3-下坠/填块.tsx';
import { useFallTerrain } from '../../../../world/地点/边城/6-3-下坠/地形.ts';
import { GuchengLight } from '../../../../world/地点/古城.tsx';
import { BlockDebris, type FxParams } from '../../../../world/地点/边城/6-3-下坠/碎块.tsx';
import { LiYingGoldGlow, GoldGlowBurst } from '../../../../world/特效/锤击金光.tsx';
import { backToTown, NEEDLE_SETTLED } from '../6-3-1/编排.ts';
import { onBroomState } from '../6-3-2/扫帚上.ts';
import { HeldCompass } from '../6-3-1/指南针.tsx';
import { JiuhuHandCompass } from '../../../../world/角色/九胡持指南针.tsx';
import scopeUri from 'asset:贴图/镜头/6-3-下坠/望远镜视野';
import { mouthAt } from '../../../../world/角色/口型.ts';
import { fallSoundTable } from './声音.tsx';
const jiuhuRaw = jiuhuRaw资产 as unknown as any; // 迁移：类型待补

const JIUHU_MODEL = { ...jiuhuRaw, texture: png(jiuhuSkin) } as unknown as BedrockModel;
// 望远镜视野（原版 Gui.renderSpyglassOverlay）：misc/spyglass_scope.png 画成边长 = 画面高 × 1.125 的正方形放在正中，四周补黑
const ScopeOverlay: React.FC<{ k: number; width: number; height: number }> = ({ k, width, height }) => {
  const side = Math.floor(height * 1.125);
  const x = Math.floor((width - side) / 2);
  const y = Math.floor((height - side) / 2);
  const black: React.CSSProperties = { position: 'absolute', backgroundColor: '#000' };
  return (
    <AbsoluteFill style={{ opacity: k }}>
      <img src={scopeUri} style={{ position: 'absolute', left: x, top: y, width: side, height: side, imageRendering: 'pixelated' }} />
      <div style={{ ...black, left: 0, top: 0, width: Math.max(0, x), height }} />
      <div style={{ ...black, left: x + side, top: 0, width: Math.max(0, width - x - side), height }} />
      <div style={{ ...black, left: 0, top: 0, width, height: Math.max(0, y) }} />
      <div style={{ ...black, left: 0, top: y + side, width, height: Math.max(0, height - y - side) }} />
    </AbsoluteFill>
  );
};
const landBurstScale = 0.35; // 落进古城那下的金光：冲击波环半径 10 米上下（城的地面那下 30 米）

// 灯：同 飞行镜头.tsx 的 `FlightSky`（主世界统一的天、云、灯，lib/主世界光照.tsx），地下不画天空穹顶、不开 Photon 的天和云。地面以上（`dome`）日光投影（同 6-2-5，`OverworldSunLight`）；
// 钻进地下改用不投影的日光：投影的话井外整片地下都在地形影子里
const Lights: React.FC<{ camPos: number[]; dome: boolean }> = ({ camPos: camPos, dome }) => {
  const light = useMemo(() => new THREE.DirectionalLight(SKY.sunLight, overworldMix.直射), []);
  const sunOffset = new THREE.Vector3(...SUN_OW).normalize().multiplyScalar(1000);
  light.position.set(camPos[0] + sunOffset.x, camPos[1] + sunOffset.y, camPos[2] + sunOffset.z);
  light.target.position.set(camPos[0], camPos[1], camPos[2]);
  light.target.updateMatrixWorld();
  return (
    <>
      {dome && <OverworldSky />}
      {dome && (
        <group position={camPos as [number, number, number]}>
          <SkyDome sun={SUN_OW} />
        </group>
      )}
      {dome && overworldShadowOn ? (
        <OverworldSunLight shadowFar={overworldShadowFar(timeline.起点.visibility)} aboveGround={camPos[2] - choreo.groundZ} />
      ) : (
        <>
          <primitive object={light} />
          <primitive object={light.target} />
        </>
      )}
      <hemisphereLight args={[SKY.skyLight, SKY.groundLight, overworldMix.天光]} position={[0, 0, 1]} />
      <ambientLight intensity={overworldMix.环境光} />
    </>
  );
};

// 特效参数（撞击时刻、竖井中心等，模块加载后定下来）
let FX: FxParams | null = null;
const fx = (): FxParams => {
  if (FX) return FX;
  const shaft = choreo.liYingShaft();
  const imp = timeline.撞击时刻();
  FX = {
    impact: imp,
    中心: choreo.shaftCellCenter(),
    groundZ: choreo.groundZ,
    caveCeilingZ: choreo.caveCeilingZ,
    ancientCityFloorZ: choreo.ancientCityFloorZ,
    breachSec: imp + shaft.breachDelay,
    landSec: shaft.落地,
  };
  return FX;
};

// 6-3-5 喊「ロードローラーだッ！」时动嘴：开口帧（全局帧）取 声音.tsx 的 RoadRoller；台词只在 6-3-5 放，别的段不动嘴
const shoutMouth = (globalFrame: number) => mouthAt([fallSoundTable().RoadRoller], '李樱', globalFrame);

export const FallScene: React.FC<{ G: number; segment: timeline.段名 }> = ({ G: globalFrame, segment: segment }) => {
  const { width, height } = useVideoConfig();
  const terrain = useFallTerrain();
  const physSec = timeline.物理时间(globalFrame);
  const imp = timeline.撞击时刻();
  const after = physSec >= imp;
  // 6-3-1、6-3-2（G < 0）：机位、两人姿势、李樱手里的指南针换成 6-3-1/编排.ts、6-3-2/扫帚上.ts 的
  const preLeap = globalFrame < timeline.段表['6-3-1'].止 ? backToTown(globalFrame) : globalFrame < 0 ? onBroomState(globalFrame) : null;
  const cam = preLeap?.cam ?? choreo.camPose(globalFrame);
  const under = cam.pos[2] < choreo.groundZ - 0.5;
  const fxParams = fx();
  const pit = after ? choreo.crater() : null;
  const nearTown = cam.pos[2] < choreo.groundZ + 400;
  const ly = preLeap?.liYing ?? choreo.liYing(physSec);
  const jh = preLeap?.jiuhu ?? choreo.jiuhu(physSec);
  const br = choreo.broomState(physSec);
  const dist = (p: number[]) => Math.hypot(p[0] - cam.pos[0], p[1] - cam.pos[1], p[2] - cam.pos[2]);
  // 李樱手里的锤（够到肩后那一刻出现）和锤头上的压路机虚影
  const phantom =
    ly.ghost > 0.01 ? (
      <group rotation={[Math.PI, 0, 0]} scale={choreo.rollerGhostScale}>
        <MechanicalRoller ghost opacity={ly.ghost} />
      </group>
    ) : undefined;
  const mace =
    ly.maceHeld > 0 ? (
      <group quaternion={bladeInHand(ly.pose, ly.maceAngle)}>
        <MaceInHand headSlot={phantom} glow={choreo.goldGlow(physSec)} />
      </group>
    ) : undefined;
  const g6 = timeline.段表['6-3-6'].起;
  const flash = segment === '6-3-6' ? Math.max(0, 1 - Math.abs(globalFrame - g6 - timeline.撞击段内帧 - 0.5) / 2) * 0.55 : 0;
  // 金光：锤头、光尾（沿走过的路往回取点，平移到锤头上）
  const glowLevel = choreo.goldGlow(physSec);
  const head = choreo.maceHeadPos(ly);
  const off = [head[0] - ly.hip[0], head[1] - ly.hip[1], head[2] - ly.hip[2]];
  // 光尾往回取 0.3 秒，长度封顶 45 米（快时按速度缩）；钻进地里后只留 0.12 秒（再长会从井口一路拖到镜头身上）。用户 10-10 嫌太长，减半
  const speed = physSec > timeline.刻.leap && physSec <= imp ? Math.hypot(...timeline.李樱下落(physSec).v) : 0;
  const trailSec = physSec > imp ? 0.12 : 0.3 * Math.min(1, 150 / Math.max(speed, 1));
  // 取点越靠近锤头越密（往回 尾长 × (j/n)^指数）：跟拍时镜头离他只三四米，等距取点的话近镜头那几米又淡掉（锤击金光.tsx），整条光尾看不见；指数随速度从 1 升到 2（20～100 米/秒）
  const 指数 = 1 + Math.min(1, Math.max(0, (speed - 20) / 80));
  const pathAt = (secAgo: number): V3 => {
    const hip = choreo.liYingHip(Math.max(timeline.刻.leap, physSec - secAgo));
    return [hip[0] + off[0], hip[1] + off[1], hip[2] + off[2]];
  };
  // 撞地前那段光尾（撞地后留在原地散掉）：撞击那一刻锤头相对髋的偏移，光尾长度按撞击速度（同上）
  const afterglow = after && physSec - imp < 0.5 ? (() => {
    const impactState = choreo.liYing(imp);
    const impactHead = choreo.maceHeadPos(impactState);
    const impactOff = [impactHead[0] - impactState.hip[0], impactHead[1] - impactState.hip[1], impactHead[2] - impactState.hip[2]];
    return {
      轨迹: (secBeforeImpact: number): V3 => {
        const hip = choreo.liYingHip(Math.max(timeline.刻.leap, imp - secBeforeImpact));
        return [hip[0] + impactOff[0], hip[1] + impactOff[1], hip[2] + impactOff[2]];
      },
      trailSec: 0.3 * Math.min(1, 150 / Math.max(Math.hypot(...timeline.李樱下落(imp).v), 1)),
    };
  })() : undefined;
  const jhDist = dist(jh.hip);
  // 长焦（6-3-4 望远镜里焦距 1000，见 编排.ts 的 `LENS_SCOPE`）：光团、光尾「远处按距离放大」的部分按画面比例跟着缩（变焦 = 焦距 / 40），不然金光盖住李樱整个人；
  // 焦距 40 以内照旧
  const zoom = Math.max(1, cam.lens / 40);
  const hidden = nearTown ? choreo.hiddenGuardIdx(cam.pos) : -1;
  if (!terrain) return null;
  return (
    <AbsoluteFill style={{ backgroundColor: UNDER_BACKGROUND }}>
      <ThreeCanvas width={width} height={height} shadows="percentage" gl={{ antialias: true, logarithmicDepthBuffer: true }} dpr={canvasDpr(LevelParams.视频.dpr)}>
        {under ? <UnderFog /> : <FlightFog visibility={timeline.起点.visibility} />}
        <FlightRig c={cam} near={0.02} />
        <ScreenAo />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          {cam.pos[2] < choreo.caveCeilingZ ? <GuchengLight /> : <Lights camPos={cam.pos} dome={!under} />}
          {/* 地形：坑和竖井那一圈在导入的地形里一直是挖开的（地形.ts），砸穿以前城的地面盖在上面 */}
          {!under && <VoxelWorld 键={terrain.键} 来源={terrain.来源} 中心={cam.pos} 像素={LevelParams.视频.像素} 远={terrain.远} 高度={terrain.高度} shadowLightDir={SUN_OW_DIR} />}
          <group position={borderTownPos}>
            <BorderTown holeRect={pit?.holeRect} />
          </group>
          {nearTown && <SlabFloor holeRect={pit?.holeRect} />}
          {after && dist(fxParams.中心) < 400 && (
            <>
              <group position={[fxParams.中心[0], fxParams.中心[1], 0]}>
                <ShaftWalls />
                {/* 还没被锤底碰到的格子照原样填着，碰到哪层碎哪层（填块.tsx） */}
                <ShaftFill w={physSec} />
              </group>
              {/* 古城里砸地的震波（方块真挪走、裂纹）跟着古城画，见 竖井.tsx 的 `AncientCity` */}
              {cam.pos[2] < choreo.groundZ + 30 && <AncientCity center={fxParams.中心} slamSec={physSec - fxParams.landSec} />}
            </>
          )}
          {/* 扫帚（李樱跃出以后九胡驾着它停在原地）、九胡（一直坐在扫帚上） */}
          {dist(br.pos) < 600 && <RideBroom pos={br.pos} yaw={br.yaw} pitch={br.pitch} roll={br.roll} liYing={false} jiuhu={false} />}
          {jhDist < 600 && (
            <group matrix={jh.matrix} matrixAutoUpdate={false}>
              {/* 右手一直握着 6-2-4 李樱递给她的结构指南针；6-3-1 她拿到身前看的那几秒由 HeldCompass 画（6-3-1/编排.ts 的 `compass`） */}
              <BedrockModelView model={JIUHU_MODEL} scale={JIUHU.scale} pose={jh.bones} attach={preLeap?.compass ? jiuhuMouthAttach(preLeap?.jiuhuMouth) : { ...jiuhuMouthAttach(preLeap?.jiuhuMouth), RightHandLocator: <JiuhuHandCompass ride needle={NEEDLE_SETTLED} /> }} />
            </group>
          )}
          {preLeap?.compass && <HeldCompass s={preLeap.compass} />}
          <LiYingGoldGlow g={glowLevel} head={head} hip={ly.hip} w={physSec} pathAt={pathAt} trailSec={trailSec} sampleExp={指数} cam={cam.pos} zoom={zoom} />
          <group matrix={ly.matrix} matrixAutoUpdate={false}>
            <LiYing pose={ly.pose} handR={mace} hipL={sheath} 嘴={preLeap?.liYingMouth ?? (segment === '6-3-5' ? shoutMouth(globalFrame) : undefined)} />
          </group>
          {/* 北城墙上的卫兵（每人一张脸：号 = 第几张原版默认皮肤；巡逻的 5 号有位移和走路的摆腿，见 编排.ts 的 卫兵） */}
          {nearTown &&
            choreo.guardPositions.map((guardPos, i) => {
              if (i === hidden) return null;
              const pose = choreo.guardPoseAt(globalFrame, i);
              return (
                <group key={i} position={[borderTownPos[0] + guardPos[0] + pose.偏移[0], borderTownPos[1] + guardPos[1] + pose.偏移[1], borderTownPos[2] + guardPos[2] + pose.偏移[2]]} rotation={[0, 0, rad(180 + pose.转身)]}>
                  <Guard sec={physSec + i * 0.7} glintSec={physSec} headPitch={pose.画头仰} headYaw={pose.头偏} raiseSpyglass={pose.举镜} skinIndex={i} limbSwing={pose.步} stride={pose.stride} />
                </group>
              );
            })}
          {after && (
            <>
              <BlockDebris P={fxParams} w={physSec} />
              <GoldGlowBurst t={physSec - imp} at={[fxParams.中心[0], fxParams.中心[1], choreo.groundZ]} cam={cam.pos} afterglow={afterglow} />
              {/* 落进古城那一下也炸一次小一号的金光（用户 10-18 嫌这下特效小） */}
              <GoldGlowBurst t={physSec - fxParams.landSec} at={[fxParams.中心[0], fxParams.中心[1], choreo.ancientCityFloorZ]} cam={cam.pos} scale={landBurstScale} />
            </>
          )}
        </group>
      </ThreeCanvas>
      {(cam.scope ?? 0) > 0 && <ScopeOverlay k={cam.scope ?? 0} width={width} height={height} />}
      {flash > 0 && <AbsoluteFill style={{ backgroundColor: '#fff3c4', opacity: flash }} />}
    </AbsoluteFill>
  );
};

export const FallSegment: React.FC<{ segment: timeline.段名 }> = ({ segment: segment }) => {
  const frame = useCurrentFrame();
  return <FallScene G={timeline.段表[segment].起 + frame} segment={segment} />;
};
