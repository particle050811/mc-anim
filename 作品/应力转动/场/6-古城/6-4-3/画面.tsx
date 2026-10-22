// 6-4-3 挡箭三段的画面：按全局帧 g 画出这一帧（时间线.ts 的时钟、编排.ts 的人、箭、风和机位、几何.ts 的站位）。各段 Composition（段.tsx）只给段名：段内第 f 帧 = 全局帧 段起 + f。
// 场景是放大 4 倍的新城（古城画面.tsx 的 `AncientCity4xCanvas`，夜视光照同 6-4-1，雾和视距照游戏最大视距）。
import React, { useMemo } from 'react';
import { useVideoConfig } from 'remotion';
import * as THREE from 'three';
import { png, pngDir } from '@engine/model/贴图.ts';
import { HuangPan } from '../../../角色/追兵.tsx';
import { Arrow } from '@库/物品/箭.tsx';
import { EncasedFan } from '@库/物品/鼓风机.tsx';
import { BlockDebris, type DebrisData } from '@库/特效/方块飞溅.tsx';
import { BladeTrail, type BladePos, NightfallParry, NightfallBloom, liYingTrailPts } from '@库/特效/夜幕刀光.tsx';
import { bladeInHand, handMatrix } from '@库/角色/骨架.tsx';
import { bladeCenterY } from '@库/物品/拔刀剑.tsx';
import { SculkSensor } from '@库/特效/幽匿感测体.tsx';
import { VibrationSignal } from '@库/特效/振动粒子.tsx';
import { ShriekRings } from '@库/特效/尖啸声波.tsx';
import { AirFlowQuads } from '@库/特效/气流.tsx';
import { particleTexture, ParticleQuads } from '@库/特效/粒子面片.tsx';
import { withTalkNod, type Mouth } from '../../../配音/口型.ts';
import { shoutLine } from './声音.tsx';
import { AncientCity4xCanvas, LiYingWithBlade, type Cam } from '../../../地点/古城4x/6-4-1/古城画面.tsx';
import { LiuXinzhong } from '../../../角色/追兵.tsx';
import * as choreo from './编排.ts';
import * as geom from './几何.ts';
import { 剧情时间, 帧小数, 挥刀开始帧, 弹开帧, 斩击生成帧 } from './时间线.ts';
import type { V3 } from '@engine/model/parts.tsx';
import debrisRaw from 'asset:碎块/镜头/6-4-3/碎块';
import atlasWest3 from 'asset:网格/古城4x/西3/图集';
import { 资产目录 } from '@engine/core/资产目录.ts';
import 资_0 from 'asset:贴图/特效/粒子/critical_hit';

// 只要击穿的那几格本身，外圈和取贴图用的那一格不画；崩掉以后露出来的洞壁另补（见 编排.ts 的 DEBRIS_HIDE、洞壁）
const DEBRIS = { ...(debrisRaw as unknown as DebrisData), cells: (debrisRaw as unknown as DebrisData).cells.filter((c) => !c.ring && c.box < geom.击穿方块.length), lining: choreo.holeWalls };
// 碎块的贴图取自击穿那几格所在的网格块（古城4x-西3，npm run 取材 -- 6-4-3碎块）
const ATLAS_C = png(atlasWest3);
const PT = pngDir(资产目录({ './critical_hit.png': 资_0 }));
const critTexture = particleTexture(PT.critical_hit.px, PT.critical_hit.w, PT.critical_hit.h);
// 挡箭的刀光（用户 10-10：不要雷霆碰撞箱，换成史诗战斗夜幕特效）：用 6-1-2 同一套夜幕阎魔刀刀光（模型/特效/夜幕刀光.tsx），拖尾跟着挥刀，弹开那刻放夜幕招架成功的闪光和火星（`EFNParryingSkill`）。
// 三个时刻接 时间线.ts 导出的帧常量：挥刀开始帧（6-1-2 关键帧 98，几何.ts 的 `拔刀起`）、斩击生成帧（刀挥到正前方，关键帧 104，`挥刀`）、弹开帧（刀刃扫过箭路，关键帧 104.576，`弹开`，比挥刀晚 0.0043 秒）。
// 拖尾照 6-1-2 从刀甩出（关键帧 102.8）画到刀送到正上方（108），这两刻按 98 → 104 的比例推出，弹开落在拖尾里，挥完刀光还留 0.15 秒淡掉。挥刀动作照 编排.ts。
// 招架闪光位置：游戏里在玩家胸口往攻击者方向最多 1 格；这里放在弹开点（几何.ts，离胸口 1.5 米），闪光和刀、箭同处。
const drawBladeSec = 剧情时间(挥刀开始帧);
const swingFrontSec = 剧情时间(斩击生成帧);
const deflectSec = 剧情时间(弹开帧);
const iaiKeyframeSec = (k: number) => drawBladeSec + ((k - 98) / (104 - 98)) * (swingFrontSec - drawBladeSec);
const trailStartSec = iaiKeyframeSec(102.8);
const trailEndSec = iaiKeyframeSec(108);
type LiyingFn = typeof choreo.liying;
// 刀上两点（刀光的根、尖）在任意剧情秒的场景坐标；按李樱的演法各建一个（BladeTrail 按函数缓存）
const bladeAtCache = new WeakMap<LiyingFn, (t: number) => BladePos>();
const bladeAtFor = (liying: LiyingFn) => {
  const hit = bladeAtCache.get(liying);
  if (hit) return hit;
  const fn = (t: number) => liYingBladeAt(liying, t);
  bladeAtCache.set(liying, fn);
  return fn;
};
const liYingBladeAt = (liying: LiyingFn, t: number): BladePos => {
  const liYingState = liying(帧小数(t));
  const bladeMatrix = handMatrix(liYingState.pose, 1.875, 'R').multiply(new THREE.Matrix4().makeRotationFromQuaternion(bladeInHand(liYingState.pose, liYingState.blade, liYingState.bladeSide)));
  const at = (z: number): V3 => {
    const point = new THREE.Vector3(0, bladeCenterY(z), z).applyMatrix4(bladeMatrix);
    return [point.x, point.y, point.z];
  };
  return { root: at(liYingTrailPts.root), tip: at(liYingTrailPts.tip) };
};
// 特效时间换算（打斗编排.ts）：parrySec 招架闪光的年龄（秒），trailVisibleSec、trailFadeSec 刀光拖尾留多长、淡多快（剧情秒）；exactParry 闪光不抖
export type 特效时间 = { parrySec: number; trailVisibleSec: number; trailFadeSec: number; exactParry: boolean };
export const DeflectBladeTrail: React.FC<{ sec: number; liying?: LiyingFn; fx?: 特效时间 }> = ({ sec: sec, liying = choreo.liying, fx }) => (
  <>
    <BladeTrail bladeAt={bladeAtFor(liying)} startSec={trailStartSec} endSec={trailEndSec} sec={sec} visibleSec={fx?.trailVisibleSec} fadeOutSec={fx?.trailFadeSec} />
    <NightfallParry center={geom.弹开点} sec={fx ? fx.parrySec : sec - deflectSec} seed={643} exact={fx?.exactParry} />
  </>
);
// 风扇的出风口（本地 +Y）转到来箭方向
const fanQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...geom.来向));

// cam：换机位（核对用的近景、打斗编排.ts），不给就是这一帧镜头的机位；liying、fx：换李樱的演法和特效时间（打斗编排.ts）；嘴：李樱说话的口型（6-4-4「烦死了！」）
export const DeflectView: React.FC<{ g: number; cam?: Cam; liying?: LiyingFn; fx?: 特效时间; 嘴?: Mouth }> = ({ g: globalFrame, cam, liying = choreo.liying, fx, 嘴: mouth }) => {
  const { width, height } = useVideoConfig();
  const ly = liying(globalFrame);
  const hp = choreo.huangpan(globalFrame);
  const arrow = choreo.arrowAt(globalFrame);
  const fan = choreo.fanState(globalFrame);
  const flow = useMemo(() => choreo.airflow(globalFrame), [globalFrame]);
  const crit = choreo.critParticles(globalFrame);
  return (
    <AncientCity4xCanvas 段="6-4-3" cam={cam ?? choreo.camera(globalFrame)} width={width} height={height} hide={choreo.HIDE} 开箱={choreo.openChest(globalFrame)} 羊毛={choreo.WOOL_NAMES}>
      <LiYingWithBlade pose={ly.pose} bladeOn={ly.bladeOn} blade={ly.blade} bladeSide={ly.bladeSide} 嘴={mouth} />
      <HuangPan pose={withTalkNod(hp.pose, [shoutLine], '黄叛', globalFrame)} 弓={hp.bow} />
      <LiuXinzhong pose={choreo.liuxinzhong(globalFrame)} />
      {(arrow.阶段 === '来' || arrow.阶段 === '挑飞') && <Arrow p={arrow.p} dir={arrow.dir} spin={arrow.spin} />}
      {fan.opacity > 0 && (
        <group position={fan.pos} quaternion={fanQuat} scale={fan.sideLength}>
          <EncasedFan spin={fan.spin} thickBlades ghost opacity={fan.opacity} />
        </group>
      )}
      {flow.length > 0 && <AirFlowQuads items={flow} />}
      {crit.length > 0 && <ParticleQuads tex={critTexture} items={crit} />}
      <BlockDebris data={DEBRIS} atlas={ATLAS_C} bursts={choreo.debrisBursts(globalFrame)} fixWinding />
      {choreo.sensorStates(globalFrame).map((q, i) => (
        <SculkSensor key={i} p={q.p} 秒={q.sec} 激活秒={q.secSinceActive} seed={i + 1} />
      ))}
      {choreo.vibrations.map((v, i) => (
        <VibrationSignal key={i} from={v.from} to={v.to} sec={choreo.storySecAt(globalFrame) - v.t} 帧={i * 3} />
      ))}
      {choreo.shriek && <ShriekRings p={choreo.shriek.p} sec={choreo.storySecAt(globalFrame) - choreo.shriek.t} />}
      <DeflectBladeTrail sec={choreo.storySecAt(globalFrame)} liying={liying} fx={fx} />
      {/* 刀光、招架的泛光（夜幕的 bloom 管线），这个画布由它来画 */}
      <NightfallBloom />
    </AncientCity4xCanvas>
  );
};
