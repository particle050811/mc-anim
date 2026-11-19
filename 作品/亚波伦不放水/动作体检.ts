import { Vector3 } from 'three';
import type { MotionPoint, MotionProfile, MotionSample } from '@engine/anim/动作体检.ts';
import { segFps, segFrameCount } from '@engine/段/段定义.ts';
import { skeletonMatrix } from '@engine/model/基岩正解.ts';
import type { BonePose } from '@engine/model/基岩模型.tsx';
import summon from './段/1-召唤/段.ts';
import opening from './段/2-开盘/段.ts';
import volley from './段/4-齐放/段.ts';
import defeat from './段/5-击败/段.ts';
import dance from './段/6-结算舞/段.ts';
import { summonShots } from './段/1-召唤/画面.tsx';
import { actTwoShotTable } from './段/2-开盘/画面.tsx';
import { volleyShots } from './段/4-齐放/画面.tsx';
import { actFiveShotTable } from './段/5-击败/画面.tsx';
import { pickShot } from './场/1-台地/台地场.tsx';
import timeline from './场/1-台地/时间线.ts';
import churchClock from './场/2-教堂/时间线.ts';
import * as opened from './场/1-台地/编排-开盘.ts';
import * as fired from './场/1-台地/编排-齐放.ts';
import * as defeated from './场/1-台地/编排-击败.ts';
import { toWorldSec } from './场/1-台地/开盘拍.ts';
import { secAt as defeatTime } from './场/1-台地/击败拍.ts';
import { animSkeletonTable, GirlYaBoLunCreature } from './角色/娘化亚波伦.tsx';
import { castingSkirtProbe } from './角色/施法裙体检.ts';
import { withCastingHem } from './角色/空中施法袍摆.ts';
import { composeDanceLayers, settlementRig } from './角色/结算舞姿势.ts';

const segments = [summon, opening, volley, defeat, dance];
const lengths = segments.map(segment => segFrameCount(segment, segFps));
const tables = [summonShots, actTwoShotTable, volleyShots, actFiveShotTable];
const model = GirlYaBoLunCreature.getModel(), scale = GirlYaBoLunCreature.definition.scale!;
const skirt = castingSkirtProbe();
const openingFrame = lengths[0]!, volleyEnd = lengths.slice(0, 3).reduce((sum, length) => sum + length, 0);
const appearFrame = Math.ceil((timeline.events.yaBoLunAppears.sec - timeline.events.开始.sec) * segFps);
const danceFrame = lengths.slice(0, 4).reduce((sum, length) => sum + length, 0);
const probes = { '右掌': ['RightForeArm', [-0.08, -5.78, 0.5]], '左掌': ['LeftForeArm', [0.08, -5.78, 0.5]], '右脚': ['RightFoot', [0, 0, 0]], '左脚': ['LeftFoot', [0, 0, 0]] } as const;
const sample = (frame: number): MotionSample => {
  let segment = 0, local = frame;
  while (local >= lengths[segment]!) local -= lengths[segment++]!;
  const sec = local / segFps;
  const points: Record<string, MotionPoint> = {}, clearances: Record<string, number> = {};
  let pose: Record<string, BonePose>, shot: string;
  if (segment === 4) {
    const rig = settlementRig(sec - churchClock.events.danceStart.sec);
    pose = composeDanceLayers(rig.animation, rig.bonePose); shot = '教堂原舞';
  } else {
    const selected = pickShot(tables[segment]!, sec, segments[segment]!.sec);
    shot = selected.shot.name === '离杖' ? '2-03' : selected.shot.name;
    points['机位'] = selected.cameraRig.pos;
    const time = segment === 0 ? opened.afterAppear(timeline.events.开始.sec + sec) : segment === 1 ? opened.actStart + toWorldSec(sec) : segment === 2 ? fired.secAt(sec) : defeatTime(sec);
    if (segment === 0 && time < 0) return { shot, points };
    const snap = segment < 2 ? opened.perform.在(time) : segment === 2 ? fired.perform.在(time) : defeated.performAt(time);
    const { props } = snap;
    points['角色根'] = props.pose.loc;
    const hem = segment === 1 || segment === 2 || segment === 3 && (snap.transition.从 === '指向' || snap.transition.dest === '指向');
    pose = composeDanceLayers(animSkeletonTable(props.sec, props.act), hem ? withCastingHem(props) : props.bonePose);
    if (segment === 1 || segment === 2) clearances['施法裙与双腿'] = skirt(pose).exposure;
  }
  for (const [name, [bone, offset]] of Object.entries(probes)) {
    points[name] = new Vector3(...offset).applyMatrix4(skeletonMatrix(model, bone, pose, scale)).toArray();
  }
  return { shot, points, clearances };
};

export default {
  fps: segFps, frames: lengths.reduce((sum, length) => sum + length, 0), sample,
  required: (frame: number) => ({ points: [...(frame < danceFrame ? ['机位'] : []), ...(frame >= appearFrame ? Object.keys(probes) : []), ...(frame >= appearFrame && frame < danceFrame ? ['角色根'] : [])],
    clearances: frame >= openingFrame && frame < volleyEnd ? ['施法裙与双腿'] : [] }),
  // 分镜的拉升和三次横冲峰值为 70–85 格/秒；这些镜放行战斗速度，不给掌、脚放宽。
  tracks: { '角色根': { maxSpeed: 65, shotSpeed: { '2-03': 90, '侧': 90, '第一人称': 90 } }, '机位': { maxSpeed: 100 }, '右掌': { maxSpeed: 15, checkAlternation: true, shotHoldSec: { '教堂原舞': 0.2 } }, '左掌': { maxSpeed: 15, checkAlternation: true, shotHoldSec: { '教堂原舞': 0.2 } }, '右脚': { maxSpeed: 15 }, '左脚': { maxSpeed: 15 } },
  maxExposure: { '施法裙与双腿': 1e-5 },
} satisfies MotionProfile;
