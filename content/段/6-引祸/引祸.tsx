// 6-4-5 引祸：收刀、瞥尖啸体、望传送门，强者大跳出兵营、出画（编排见 编排.ts）。场景是古城4x（../6-4-1/古城画面.tsx 的 古城4x画布）。
// 6-4-3 留下的东西照 6-4-3 的编排在这一刻的样子画（../6-4-3/画面.tsx 的 挡箭画面 里的那几样：藏掉击穿的方块和网格里的感测体、
// 换成会抖的感测体、掉下来的石块、钉在洞顶的箭、尖啸体的声波环、开过的战利品箱），只有李樱和羊毛按这一段编。
// 黄叛在东边 370 米外的传送门上，第一镜往东看也只是远处一个小点，雾里看不见，不画。刀光、招架、风扇、气流在 6-4-3c 末帧之前都已经没了，不画。
import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { png } from '../../../engine/model/贴图.ts';
import atlasWest3 from 'asset:网格/古城4x/西3/图集';
import { Arrow } from '../../../world/物品/箭.tsx';
import { BlockDebris, type DebrisData } from '../../../world/特效/方块飞溅.tsx';
import { SculkSensor } from '../../../world/特效/幽匿感测体.tsx';
import { VibrationSignal } from '../../../world/特效/振动粒子.tsx';
import { ShriekRings } from '../../../world/特效/尖啸声波.tsx';
import * as THREE from 'three';
import { rad } from '../../../engine/anim/anim.ts';
import { LiYing } from '../../../world/角色/李樱.tsx';
import { bladeInHand } from '../../../world/角色/骨架.tsx';
import { DrawnKatana, Sheath, SHEATH_HANG_QUAT } from '../../../world/物品/拔刀剑.tsx';
import { AncientCity4xCanvas, type Cam } from '../../../world/地点/古城4x/6-4-1/古城画面.tsx';
import * as K3 from '../../场/6-古城/6-4-3/编排.ts';
import * as G3 from '../../场/6-古城/6-4-3/几何.ts';
import debrisRaw from 'asset:碎块/镜头/6-4-3/碎块';
import * as choreo from '../../场/6-古城/6-4-5/编排.ts';
import { LureSound } from './声音.tsx';
import { mouthAt, type Mouth } from '../../../world/角色/口型.ts';

// 同 6-4-3/画面.tsx：只要击穿的那几格（外圈和取贴图用的那一格不画），洞壁另补；碎块贴图取自击穿那几格所在的网格块 古城4x-西3（同 6-4-3/画面.tsx 的 ATLAS_C）
const DEBRIS = { ...(debrisRaw as unknown as DebrisData), cells: (debrisRaw as unknown as DebrisData).cells.filter((c) => !c.ring && c.box < G3.击穿方块.length), lining: K3.holeWalls };
const debrisAtlas = png(atlasWest3);

export const lureFrames = choreo.frameCount;

// 4×4 变换拆成 group 的位置、朝向（同 6-1-2/娜迦参考模型.tsx）
const matrixToProps = (matrix?: THREE.Matrix4) => {
  if (!matrix) return {};
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  matrix.decompose(position, quaternion, new THREE.Vector3());
  return { position, quaternion };
};
// 李樱（同 6-4-1/古城画面.tsx 的 李樱，多了收刀约束：收刀那几帧鞘被左手转过来迎刀，刀画在鞘的坐标系里、顺着鞘滑进去，见 编排.ts 的 liying）
const SheathingLiYing: React.FC<{ ly: ReturnType<typeof choreo.liying>; 嘴?: Mouth }> = ({ ly, 嘴: mouth }) => (
  <LiYing
    pose={ly.pose}
    嘴={mouth}
    hipL={
      <group {...(ly.sheathedState ? matrixToProps(ly.sheathedState) : { quaternion: SHEATH_HANG_QUAT })}>
        <Sheath sheathed={!ly.bladeOn} />
        {ly.bladeOn && ly.sheathBlade && (
          <group {...matrixToProps(ly.sheathBlade)}>
            <DrawnKatana />
          </group>
        )}
      </group>
    }
    handR={ly.bladeOn && !ly.sheathBlade && <group quaternion={bladeInHand(ly.pose, ly.blade, ly.bladeSide)}><DrawnKatana /></group>}
  />
);

// 核对收刀穿模用（6-4-5-收刀特写）：机位跟着李樱，在他左前方近处平视腰间；收刀修前 = 不加收刀约束
const closeupCam = (ly: ReturnType<typeof choreo.liying>, bearingDeg: number): Cam => {
  const [x, y, z] = ly.pose.loc;
  // 方位按开头的朝向算（收刀时他转身，按当帧朝向算的话机位会跟着转进墙里）
  const yawRad = rad((choreo.liying(0).pose.yaw ?? 0) + bearingDeg);
  return { pos: [x - 2.3 * Math.sin(yawRad), y + 2.3 * Math.cos(yawRad), z + 1.0], tgt: [x, y, z + 0.8], lens: 30 };
};
export type LureParams = { rawSheathe?: boolean; 特写?: number };

export const Lure: React.FC<LureParams> = ({ rawSheathe = false, 特写: closeupBearing }) => {
  const segFrame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const globalFrame = choreo.globalFrameAt(segFrame);
  const ly = choreo.liying(segFrame, rawSheathe);
  const arrow = K3.arrowAt(globalFrame);
  const wool = choreo.woolAt(segFrame / choreo.FPS);
  return (
    <>
      <AncientCity4xCanvas 段="6-4-5" cam={closeupBearing === undefined ? choreo.camera(segFrame) : closeupCam(ly, closeupBearing)} width={width} height={height} hide={K3.HIDE} 开箱={K3.openChest(globalFrame)} 羊毛={wool.羊毛} growingWool={wool.growingWool}>
        <SheathingLiYing ly={ly} 嘴={mouthAt([choreo.lines.会会你们], '李樱', segFrame)} />
        {(arrow.阶段 === '来' || arrow.阶段 === '挑飞') && <Arrow p={arrow.p} dir={arrow.dir} spin={arrow.spin} />}
        <BlockDebris data={DEBRIS} atlas={debrisAtlas} bursts={K3.debrisBursts(globalFrame)} fixWinding />
        {K3.sensorStates(globalFrame).map((q, i) => (
          <SculkSensor key={i} p={q.p} 秒={q.sec} 激活秒={q.secSinceActive} seed={i + 1} />
        ))}
        {K3.vibrations.map((v, i) => (
          <VibrationSignal key={i} from={v.from} to={v.to} sec={K3.storySecAt(globalFrame) - v.t} 帧={i * 3} />
        ))}
        {K3.shriek && <ShriekRings p={K3.shriek.p} sec={K3.storySecAt(globalFrame) - K3.shriek.t} />}
      </AncientCity4xCanvas>
      <LureSound />
    </>
  );
};
