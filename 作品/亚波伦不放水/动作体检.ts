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
import { summonShots } from './段/1-召唤/机位.ts';
import { actTwoShotTable } from './段/2-开盘/机位.ts';
import { volleyShots } from './段/4-齐放/机位.ts';
import { actFiveShotTable } from './段/5-击败/机位.ts';
import { pickShot } from './场/1-台地/台地机位.ts';
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
  const points: Record<string, MotionPoint> = {}, directions: Record<string, MotionPoint> = {}, clearances: Record<string, number> = {};
  let pose: Record<string, BonePose>, shot: string;
  if (segment === 4) {
    const rig = settlementRig(sec - churchClock.events.danceStart.sec);
    pose = composeDanceLayers(rig.animation, rig.bonePose); shot = '教堂原舞';
  } else {
    const selected = pickShot(tables[segment]!, sec, segments[segment]!.sec);
    shot = selected.shot.name === '离杖' ? '2-03' : selected.shot.name;
    const { pos, tgt } = selected.cameraRig;
    points['机位'] = pos;
    directions['机位朝向'] = [tgt[0] - pos[0], tgt[1] - pos[1], tgt[2] - pos[2]];
    const time = segment === 0 ? opened.afterAppear(timeline.events.开始.sec + sec) : segment === 1 ? opened.actStart + toWorldSec(sec) : segment === 2 ? fired.secAt(sec) : defeatTime(sec);
    if (segment === 0 && time < 0) return { shot, points, directions };
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
  return { shot, points, directions, clearances };
};

export default {
  fps: segFps, frames: lengths.reduce((sum, length) => sum + length, 0), sample,
  required: (frame: number) => ({ directions: frame < danceFrame ? ['机位朝向'] : [], points: [...(frame < danceFrame ? ['机位'] : []), ...(frame >= appearFrame ? Object.keys(probes) : []), ...(frame >= appearFrame && frame < danceFrame ? ['角色根'] : [])],
    clearances: frame >= openingFrame && frame < volleyEnd ? ['施法裙与双腿'] : [] }),
  // 速度：分镜的拉升和三次横冲峰值为 70–85 格/秒；这些镜放行战斗速度，不给掌、脚放宽。
  // 加速度、骤降再起按 11-19 main 的各镜峰值定（docs/动作体检.md）。按镜放宽的分两种：写明出处的是有意的；写「现状」的是 11-19 体检新查出来、
  // 用户看过的画面（元规则 1 留现状），只放到刚好过现状，等用户定改不改。e98e94cc 修掉的 2-03 绕两次（朝向 359 度/秒、加速度 4125、骤降 0.78）三条都拦得住。
  tracks: {
    // 横冲起步一两帧就到速：2-01 977、2-03 1591、侧 2100、第一人称 2549 格/秒²（一帧跳 0.5 格约 1800）。第一人称里她一下下冲、到位前急刹再冲（齐放拍.ts），骤降再起放行
    '角色根': { maxSpeed: 65, shotSpeed: { '2-03': 90, '侧': 90, '第一人称': 90 }, maxAccel: 1200, shotAccel: { '2-03': 1800, '侧': 2400, '第一人称': 2800 }, dip: { minSpeed: 8, maxDepth: 0.6 }, shotDipDepth: { '第一人称': 1 } },
    // 现状：2-02 F545 跟拍的 max() 换支 1378；2-03 开头接拉升 1129；5-03 跟她落地 913
    '机位': { maxSpeed: 100, maxAccel: 500, shotAccel: { '2-02': 1400, '2-03': 1200, '5-03': 950 }, dip: { minSpeed: 8, maxDepth: 0.6 } },
    // 第一人称是原版 bobHurt 受伤晃动（20 Hz，用户 11-11 看过「焚烧也会抖」）加索命劈中定住 16 帧，三条都放行。
    // 现状：2-02 F544 朝向 28→1.9→19 度/秒（一帧顿住，同 F545 那一折）；2-03 F576 起绕 895；5-03 F1459 跟她落地 48→13→34、F1469 一折、F1517 急刹 1086
    '机位朝向': { maxSpeed: 180, shotSpeed: { '第一人称': 480 }, maxAccel: 600, shotAccel: { '2-02': 1050, '2-03': 950, '5-03': 1150, '第一人称': 30000 },
      dip: { minSpeed: 20, maxDepth: 0.6 }, shotDipDepth: { '2-02': 0.95, '5-03': 0.7, '第一人称': 1 } },
    // 掌、脚来回摆，骤降再起不适用；加速度只拦一帧跳位（掌：舞 885、第一人称打击停顿 704；脚：第一人称 347）
    '右掌': { maxSpeed: 15, maxAccel: 1000, checkAlternation: true, shotHoldSec: { '教堂原舞': 0.2 } }, '左掌': { maxSpeed: 15, maxAccel: 1000, checkAlternation: true, shotHoldSec: { '教堂原舞': 0.2 } },
    '右脚': { maxSpeed: 15, maxAccel: 600 }, '左脚': { maxSpeed: 15, maxAccel: 600 },
  },
  maxExposure: { '施法裙与双腿': 1e-5 },
} satisfies MotionProfile;
