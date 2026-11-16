// 6-1-3 起飞：时间轴与姿态，纯函数，输入段内秒 t（0 = 段首，共 `LENGTH` 秒）。原来按 1/24 秒一格排，注释里的「帧」是这种格，代码里写成 n / 24 秒。
// 故事（用户 10-01 定）：九胡在 6-1-2 结尾被传送进迷宫，顺着水池南边的通道笔直跑到中心李樱身边，二人在庭院中心上扫帚，拔地而起、猛加速冲上高空。
//   第 0 帧 = 6-1-2 末帧（同一画面：九胡在通道里往东跑，镜头在她后上方，尽头是李樱）；
//   镜头 1：跟她跑到中心，她在李樱身边刹住 → 切中景 → 唤出扫帚 → 两人跨上 → 下沉蓄力 → drop 起飞（之后的轨迹、末帧接一镜到底，见 `LAST`）。
// 配乐对齐先不管，等画面定稿再统一对（用户定）。放平（翻过来）那一帧按巡航高度挑（见 `pathAngleKeys`）。
// 场景坐标同 6-1-2（娜迦庭院中心为原点，Z 朝上，北 = +Y）。中心空地 x -5～9、y -9～5 是平地（z = 0），
// 北边是围着火盆台的下沉环槽，西边是水池，东边 x 9 起（y 0 以南，5 格高）、南边 y -10 起是树篱。
import { type Key, sample } from '@engine/anim/anim.ts';
import type { V3 } from '@engine/model/parts.tsx';
import type { FigurePose } from '@库/角色/骨架.tsx';
import { liYingFinalPose, type RideLiYing } from '@库/角色/骑扫帚.tsx';
import { twilightFogFar, twilightFogNear, clampFogToEdge, TWILIGHT_CRUISE_FOG_FAR } from '@engine/light/暮色光照.tsx';
import { VIEW_DISTANCE } from '@engine/voxel/视距.ts';
import { cruiseHeight, twilightLandmark, twilightHeightAboveGround, viewEdgeDistance } from '../../../地点/暮色新世界.tsx';
import { cruiseFogFar, farViewOf, TWILIGHT_FAR_VIEW } from '../../../地点/暮色新世界/超远景.ts';
import * as choreo612 from '../6-1-2/编排.ts';
// 6-1-2 的正式版（段长、台词开口都含打击停顿；末帧的李樱是收刀后站定带呼吸微动的样子）
import { officialLiying, officialLineStart, officialJiuhuLineStart, officialLength } from '../6-1-2/动作改进.ts';
import { segmentRange } from '../../../配乐/配乐音轨.tsx';
import { posToSec } from '@engine/audio/曲目.ts';
import lineTable from 'asset:数据/配音/台词表';
import { smoothstep01, lerp, lerpV } from '@engine/core/数学.ts';
import { onTick } from '../时刻.ts';

export const segmentId = '6-1-3';
// 本段第 0 秒接着 6-1-2 段尾：九胡跑到路线上的哪儿（t = 传送后的秒数）、李樱收刀站定的姿势、宝箱
const T0 = choreo612.MAZE_T612;
// 九胡停稳的那一刻（本段秒，真值：本段的秒不落在输出帧上，取到 1/60 秒也对不上帧）
const JH_ARRIVE = choreo612.MAZE_ARRIVE - T0;
// 台词（本段秒，负数是还在 6-1-2 里）：
//   娜迦：6-1-2 滑停站稳就开口「暮色的boss就算加强了十倍，也不过如此。」；本段第 0 秒 = 6-1-2 段尾，所以开口 = 6-1-2 的开口秒 − 6-1-2 段长；
//   九胡：「等等我啊，狗修金Sama！」在 6-1-2 迷宫那一镜开跑后边跑边喊（用户 10-20，6-1-2 编排的 `MAZE_SHOUT`），开口帧同样换过来，本段放说进来的后半截，她刹车前说完；
//   李樱：扫帚冒出来停稳就说「坐好了，看我速通暮色！」（用户 10-20：骑扫帚这一下要说明白是速通暮色），两人跳上扫帚时说，坐稳时说完，不动段长；
//   坐稳 `seatedHold` 帧就往下一沉、起飞。
// 长度读 src/配音/台词表.json 的 有声长（开口到说完）。两句都在九胡跑到前后说完，唤出是她停稳后喘 1 秒、抬头看他（`JH_ARRIVE` + 1 秒）。
// 有声长用真值，不再往上取到 1/24 秒的格（用户 11-16 定；唤出到起飞整串因此比旧版早几十毫秒）
const voicedSec = (id: string) => (lineTable as unknown as Record<string, { 有声长: number }>)[id].有声长;
const seatedHold = 0.5;
// 本段第 0 秒在 6-1-2 段内的秒数：接在 6-1-2 段尾
const T612_END = officialLength;
export const lineTimes = (() => {
  const nagaLine = officialLineStart - T612_END;
  const nagaLineEnd = nagaLine + voicedSec('6-1-2-李樱-不值一提');
  const jiuhuLine = officialJiuhuLineStart - T612_END;
  const jiuhuLineEnd = jiuhuLine + voicedSec('6-1-3-九胡-等等我');
  const summonTime = Math.max(JH_ARRIVE + 1, nagaLineEnd + 0.5, jiuhuLineEnd + 0.5); // 她停稳以后喘口气（1 秒），话也说完了，他再唤出扫帚
  const seatedTime = summonTime + 61 / 24;
  const speedrunLine = summonTime + 10 / 24; // 扫帚冒出来停稳（`broom` 的 appear）
  return { naga: nagaLine, nagaLineEnd: nagaLineEnd, jiuhu: jiuhuLine, jiuhuLineEnd, summon: summonTime, speedrun: speedrunLine, seated: seatedTime };
})();
// 帧 写的是段内秒（mouthAt 每秒给 1）
export const speedrunLine = { id: '6-1-3-李樱-看我速通暮色', 帧: lineTimes.speedrun };
// 娜迦那句有没有说进本段（句子短，可能在 6-1-2 里就说完了）
export const nagaLineCarriesOver = lineTimes.nagaLineEnd > 0;
// 台词轨（声音.tsx）和口型（起飞.tsx）共用；九胡那句开口在本段之前（负的），只放说进来的半截
export const lineCues = [
  ...(nagaLineCarriesOver ? [{ id: '6-1-2-李樱-不值一提', 帧: lineTimes.naga }] : []),
  { id: '6-1-3-九胡-等等我', 帧: lineTimes.jiuhu },
  speedrunLine,
];
const summonTime = lineTimes.summon;
const takeoffTime = lineTimes.seated + seatedHold + 15 / 24;
// 速度：起飞瞬间 40 米/秒，之后 v = 1000 - 960·e^(-t/τ)，τ ≈ 3.16 秒（1 秒时正好 300 米/秒）。
const V_CRUISE = 1000;
const V_KICK = 40;
const TAU = -1 / Math.log((V_CRUISE - 300) / (V_CRUISE - V_KICK));
const postTakeoffSec = 2.5;
const speedAfter = (dt: number) => (dt < 0 ? 0 : V_CRUISE - (V_CRUISE - V_KICK) * Math.exp(-dt / TAU));
// 方向：先笔直往上冲 1/3 秒（越过四周 30 多格高的树冠），然后扫帚头往起飞方位压，翻过来（放平）以后朝起飞方位平飞。
// 放平的高度就是一镜到底开头的巡航高度（用户 10-05 定 80 米，10-07 改离树冠 60 米）：按它挑翻过来那一格，末帧在起飞方位前方 800 来米处的巡航高度上
const pathAngleKeys = (flipT: number): Key[] => [[0, 90], [8 / 24, 90], [flipT - 8 / 24, 15], [flipT, 0]];
// 起飞方位（世界方位，0 = 北、顺时针为正）：唤出扫帚时杆头就朝着第一程（庭院 → 巫妖怪塔）的直线，拔起来、翻过来以后一镜到底接着直飞，不起飞后掉头（用户 10-05 要求）。
// 144.5° 是 归档/参考模型库/工具/一镜到底/直航设计.ts 的 `solveTakeoff` 解的、再按 工具/一镜到底/弯速.ts 二分调的：一镜到底的进场线提前 450 米（路线.ts 的 `alignAheadM`），第一个弯是进对正前的左转。
// 庭院网格没转，本地方位 = 世界方位；唤出、上扫帚、下沉、起飞和镜头 3 都绕起飞点转过来，镜头 2 挪到东边（见 `C2`），
// 镜头 1（接 6-1-2 末帧）不动；人站的地方、宝箱都是 6-1-2 留下的，不转
export const takeoffBearing = 144.5;
// 编排用的朝向（RideBroom 的 朝向：0 = 杆头朝北，正 = 往左）
export const takeoffYaw = -takeoffBearing;
const forwardXY: [number, number] = [Math.sin((takeoffBearing * Math.PI) / 180), Math.cos((takeoffBearing * Math.PI) / 180)];
const broomToCourtyard = (p: number[]): V3 => [p[0] * forwardXY[1] + p[1] * forwardXY[0], -p[0] * forwardXY[0] + p[1] * forwardXY[1], p[2] ?? 0];
// 爬升按 1/192 秒一步积分（原来每格 8 步）
const CLIMB_STEPS_PER_SEC = 192;
const climbHeight = (flipT: number) => {
  const keys = pathAngleKeys(flipT);
  let z = 0;
  for (let i = 0; i < postTakeoffSec * CLIMB_STEPS_PER_SEC; i++) {
    const dt = (i + 0.5) / CLIMB_STEPS_PER_SEC;
    z += (speedAfter(dt) / CLIMB_STEPS_PER_SEC) * Math.sin((sample(keys, dt) * Math.PI) / 180);
  }
  return z;
};
// 庭院网格在新世界里的位置见 模型/场景/暮色新世界.tsx（只平移，没转）；这一段是庭院的本地坐标，起飞.tsx 把整个场景放到那里
export const courtyard = twilightLandmark('娜迦庭院');
// 平飞高度取起飞方位前方 820 米处（末帧前后）的巡航高；取样点要跟着起飞方位转，否则末帧比一镜到底的起点低 17 米接不上
const levelFlightZ = (() => {
  const point = courtyard.toWorld([820 * forwardXY[0], 820 * forwardXY[1], 0]);
  return cruiseHeight(point[0], point[1]) - courtyard.原点[2];
})();
// 起飞后几秒放平：在 18～46 格（1/24 秒）里按格挑（挑出来是 26/24）。
// 没改成解出来的真值（早 12 毫秒）：本段末帧的扫帚位置跟着挪 2.6 米，一镜到底整条航线重解，六个首领的穿刺在画面里都早 125 毫秒、离开配乐卡点。
// 用户 11-16 定 1/24 格的取整一处不留，这一处牵动一镜到底的卡点，留给用户定
const flipDelay = (() => {
  let best = 46;
  for (let candidate = 18; candidate <= 46; candidate++) if (Math.abs(climbHeight(candidate / 24) - levelFlightZ) < Math.abs(climbHeight(best / 24) - levelFlightZ)) best = candidate;
  return best / 24;
})();
// 都落到刻上（时刻.ts）：切镜、上扫帚这些判断正好落在某一帧上，不能差一点浮点零头
export const beats = {
  liyingTurn: onTick(JH_ARRIVE - 14 / 24), // 她快跑到时回过身
  cutToMedium: onTick(JH_ARRIVE + 8 / 24), // 她停稳、他转过来以后切到中景
  summon: onTick(summonTime),
  liYingMount: onTick(summonTime + 31 / 24),
  jiuHuUp: onTick(summonTime + 46 / 24),
  seated: onTick(summonTime + 61 / 24),
  sinkStart: onTick(takeoffTime - 15 / 24),
  takeoff: onTick(takeoffTime),
  flip: onTick(takeoffTime + flipDelay),
  last: onTick(takeoffTime + postTakeoffSec), // 末帧
};
// 配乐晚几帧进（用户 10-10 定）：整条往后推，让 drop（[5, 1]）落在起飞那一帧，渐大的几拍落在扫帚下沉蓄力上；前奏（没有鼓）垫在九胡跑来、两人上扫帚的几秒（drop 前的前奏比本段这一截长，段首切进去的是前奏中间），之前没有配乐
// drop 用歌里的真时刻，不用配乐音轨.tsx 的 `frameInSegment`（它取整到 1/24 秒的格，drop 会早 16 毫秒；用户 11-16 定取整一处不留）
export const musicDelay = (() => {
  const range = segmentRange(segmentId);
  return beats.takeoff - (posToSec(range.table.song, [5, 1]) - range.start);
})();
export const songSec = (t: number) => t - musicDelay;
// 本段到末帧这一刻为止，一镜到底的第 0 秒接在这里
export const LENGTH = beats.last;
// 6-1-2 段尾的李樱（正式版）：站定后的呼吸、头左右看、重心挪动接着用 6-1-2/动作改进.ts 的 `微动`；回身、唤出、跳上扫帚都叠在它上面
const LY_END: FigurePose = officialLiying(choreo612.END).pose;
const standingPose = (t: number): FigurePose => officialLiying(choreo612.END + Math.max(0, t)).pose;
export const CHEST = choreo612.chest(choreo612.END).loc;

// ---------- 扫帚：唤出在两人中间，杆头朝起飞方位（东南） ----------
// 李樱在 (2.6, -0.8)，九胡停在他西南 (0.1, -3.6)，宝箱在 (-1, -0.8)。两人连线东北—西南，杆头朝东南正好垂直：李樱从东北、九胡从西南各自侧着跨上去
export const BROOM_XY: [number, number] = [1.35, -2.0];
const HOVER = 0.65;
const Z_SINK = 0.35; // 4.4 一沉到底的高度
export type BroomState = { pos: V3; yaw: number; pitch: number; roll: number; appear: number; speed: number };

const LAUNCH = beats.takeoff - 0.5 / 24; // 起飞的瞬间（取那一格的中点：5.1 那一格已经离地）
const speedAt = (t: number) => (t < LAUNCH ? 0 : speedAfter(t - LAUNCH));
const GAMMA: Key[] = pathAngleKeys(flipDelay).map(([t, angle]) => [LAUNCH + t, angle]);
const gammaAt = (t: number) => sample(GAMMA, t);
// 航迹按 1/192 秒一步积分成表，到末帧后 2 格
const FLIGHT_STEPS_PER_SEC = 192;
const FLIGHT_LAST = Math.round((beats.last + 2 / 24 - LAUNCH) * FLIGHT_STEPS_PER_SEC);
const FLIGHT: V3[] = (() => {
  const out: V3[] = [];
  let horizDist = 0;
  let z = Z_SINK;
  for (let i = 0; i <= FLIGHT_LAST; i++) {
    out.push([BROOM_XY[0] + forwardXY[0] * horizDist, BROOM_XY[1] + forwardXY[1] * horizDist, z]);
    const t = LAUNCH + (i + 0.5) / FLIGHT_STEPS_PER_SEC;
    const step = speedAt(t) / FLIGHT_STEPS_PER_SEC;
    const gammaRad = (gammaAt(t) * Math.PI) / 180;
    horizDist += step * Math.cos(gammaRad);
    z += step * Math.sin(gammaRad);
  }
  return out;
})();
const flightAt = (t: number): V3 => {
  const x = Math.max(0, (t - LAUNCH) * FLIGHT_STEPS_PER_SEC);
  const i = Math.min(Math.floor(x), FLIGHT.length - 2);
  const k = x - i;
  return FLIGHT[i].map((v, c) => v + (FLIGHT[i + 1][c] - v) * k) as V3;
};
export const broom = (t: number): BroomState => {
  const appear = t < beats.summon ? 0 : sample([[beats.summon, 0], [beats.summon + 0.25, 1.15], [beats.summon + 10 / 24, 1]], t);
  if (t >= beats.takeoff) {
    // 扫帚头：4 格内翘起来、跟上航迹角（笔直往上冲时也竖起来，最多 88°，封顶太低会像斜着往上滑），之后跟着航迹角压下来，末帧和速度方向一致；人往前压着贴住扫帚（见 `riders` 的前倾）
    const pitch = t < beats.takeoff + 4 / 24 ? lerp(6, Math.min(88, gammaAt(t)), smoothstep01((t - beats.takeoff) / (4 / 24))) : Math.min(88, gammaAt(t));
    return { pos: flightAt(t), yaw: takeoffYaw, pitch: pitch, roll: 0, appear, speed: speedAt(t) };
  }
  const bob = 0.05 * Math.sin((2 * Math.PI * t) / (40 / 24));
  let z = HOVER + bob + 0.25 * smoothstep01((t - beats.seated) / 1.25);
  let pitch = 0;
  if (t >= beats.sinkStart) {
    const k = smoothstep01((t - beats.sinkStart) / 0.25);
    z = lerp(z, Z_SINK, k) + 0.035 * Math.sin(t * 64.8) * k; // 每格 2.7 弧度的抖
    pitch = 6 * k;
  }
  return { pos: [BROOM_XY[0], BROOM_XY[1], z], yaw: takeoffYaw, pitch: pitch, roll: 0, appear, speed: 0 };
};
export const velocity = (t: number): V3 => {
  const speed = speedAt(t);
  const gammaRad = (gammaAt(t) * Math.PI) / 180;
  return [forwardXY[0] * speed * Math.cos(gammaRad), forwardXY[1] * speed * Math.cos(gammaRad), speed * Math.sin(gammaRad)];
};

// ---------- 九胡：沿 6-1-2 的路线跑到中心，刹住喘气，看李樱，跳上后座 ----------
export type JiuhuOnFoot = { pose: FigurePose; tail: number; bend: number; gait: number; run: number } | null;
export const jiuhuOnFoot = (t: number): JiuhuOnFoot => {
  if (t >= beats.jiuHuUp) return null;
  const maze = choreo612.jiuhuMaze(T0 + t);
  const mazePose = maze.pose;
  const stopped = smoothstep01((t - JH_ARRIVE + 4 / 24) / (8 / 24));
  const pant = Math.sin(2 * Math.PI * 2.2 * t);
  const look = smoothstep01((t - JH_ARRIVE - 14 / 24) / (10 / 24));
  const flinch = Math.sin(Math.PI * Math.min(1, Math.max(0, (t - beats.summon) / (10 / 24))));
  const hopK = smoothstep01((t - (beats.jiuHuUp - 8 / 24)) / (8 / 24));
  const crouch = t > beats.jiuHuUp - 0.5 ? Math.sin(Math.PI * Math.min(1, (t - (beats.jiuHuUp - 0.5)) / 0.25)) : 0;
  const hopZ = 0.9 * Math.sin(Math.PI * Math.min(1, hopK * 1.6)) * (t > beats.jiuHuUp - 8 / 24 ? 1 : 0);
  const [x, y] = mazePose.loc;
  const back = 0.45 * flinch * (1 - hopK);
  const yaw0 = mazePose.yaw ?? 0;
  const fx = -Math.sin((yaw0 * Math.PI) / 180);
  const fy = Math.cos((yaw0 * Math.PI) / 180);
  const seat = [BROOM_XY[0] - 0.35 * forwardXY[0], BROOM_XY[1] - 0.35 * forwardXY[1]];
  const pose: FigurePose = {
    ...mazePose,
    loc: [lerp(x - fx * back, seat[0], hopK), lerp(y - fy * back, seat[1], hopK), mazePose.loc[2] + hopZ],
    pitch: mazePose.pitch - 12 * crouch + 8 * flinch * (1 - hopK),
    headPitch: mazePose.headPitch + (30 - 3 * pant) * stopped * (1 - look) + 18 * look,
    legR: mazePose.legR + 30 * crouch,
    legL: mazePose.legL + 30 * crouch,
    armR: mazePose.armR + 2 * stopped - 20 * crouch,
    armL: mazePose.armL + 2 * stopped - 20 * crouch,
    // 停下时面朝李樱（东北，yaw −57），跳上扫帚时往右转 79° 转成朝起飞方位（东南）
    yaw: lerp(yaw0, takeoffYaw, hopK),
  };
  return { pose, gait: maze.gait, run: maze.run, bend: (40 + 5 * pant) * stopped * (1 - look) + 8 * look * (1 - hopK), tail: maze.tail };
};

// ---------- 李樱：收刀站定（6-1-2 末帧的姿势）→ 回身看着她跑过来 → 唤出扫帚 → 跳上前座 ----------
// 6-1-2 末帧他面朝东（身体左转 29°、胸再拧 18°、头往回转 48°），九胡从他身后（西边）通道跑来、停在他西南边。回身往右转 134° 正好看着她；跳上扫帚时再往左转 89° 朝起飞方位（东南）。
// 站姿里身体比面朝的方向左转 29°（按刀侧身），所以朝向都加这 29°
const YAW_END = LY_END.yaw ?? 0; // -61：面朝东（-90）+ 29
const YAW_FACE = YAW_END - 134; // 面朝西南（她停下的方向）
const YAW_RIDE = (() => {
  const y = takeoffYaw + 29;
  return y + 360 * Math.round((YAW_FACE - y) / 360);
})();
export const liyingOnFoot = (t: number): FigurePose | null => {
  if (t >= beats.liYingMount) return null;
  const turn = smoothstep01((t - beats.liyingTurn + 2 / 24) / 0.5);
  const summon = smoothstep01((t - (beats.summon - 7 / 24)) / (7 / 24)) * (1 - smoothstep01((t - (beats.summon + 0.5)) / (10 / 24)));
  const hopK = smoothstep01((t - (beats.liYingMount - 8 / 24)) / (8 / 24));
  const crouch = t > beats.liYingMount - 0.5 ? Math.sin(Math.PI * Math.min(1, (t - (beats.liYingMount - 0.5)) / 0.25)) : 0;
  const base = standingPose(t);
  const [x0, y0] = base.loc;
  const x = lerp(x0, BROOM_XY[0] + 0.35 * forwardXY[0], hopK);
  const y = lerp(y0, BROOM_XY[1] + 0.35 * forwardXY[1], hopK);
  const z = 1.0 * Math.sin(Math.PI * Math.min(1, hopK * 1.6)) * (t > beats.liYingMount - 8 / 24 ? 1 : 0);
  const yaw = lerp(lerp(YAW_END, YAW_FACE, turn), YAW_RIDE, hopK);
  return {
    ...base,
    loc: [x, y, z],
    pitch: base.pitch - 15 * crouch,
    headPitch: base.headPitch + 8 * summon,
    legR: (base.legR ?? 0) + 35 * crouch,
    legL: (base.legL ?? 0) + 35 * crouch,
    kneeR: (base.kneeR ?? 0) + 60 * crouch,
    kneeL: (base.kneeL ?? 0) + 60 * crouch,
    armR: lerp(base.armR, 120, summon),
    armRRoll: lerp(base.armRRoll, 20, summon),
    elbowR: lerp(base.elbowR ?? 0, 10, summon),
    yaw,
  };
};

// ---------- 骑在扫帚上 ----------
export const riders = (t: number): { liYing: RideLiYing | false; jiuhu: { lean: number; hugWaist: number; tailPhase: number; wind: number; headRaise: number } | false } => {
  const sink = t >= beats.sinkStart ? smoothstep01((t - beats.sinkStart) / 0.25) : 0;
  const launched = smoothstep01((t - beats.takeoff) / (4 / 24));
  // 竖直往上冲时（航迹角大过 25°）再往前压一点，贴住竖起来的扫帚
  const vertical = t >= beats.takeoff ? Math.max(0, (gammaAt(t) - 25) / (90 - 25)) : 0;
  const lean = 22 + 26 * sink + 10 * launched * (1 - smoothstep01((t - beats.flip) / (10 / 24))) + 8 * vertical * launched;
  return {
    liYing: t >= beats.liYingMount ? { lean, headRaise: 10 * (1 - sink) + 20 * launched } : false,
    // 尾巴相位每 9 格走 1
    jiuhu: t >= beats.jiuHuUp ? { lean: 18 + 20 * sink, hugWaist: smoothstep01((t - beats.jiuHuUp) / 0.25), tailPhase: t / (9 / 24), wind: launched, headRaise: 10 * launched } : false,
  };
};
export const liyingRidePose = (t: number) => {
  const liying = riders(t).liYing;
  return liying ? liYingFinalPose(liying) : null;
};

// ---------- 镜头 ----------
export type Cam = { pos: number[]; tgt: number[]; lens: number; roll?: number };
// 镜头 1（0～切中景）：6-1-2 镜头 3 那个跟拍（6-1-2 编排的 `mazeCam`）接着往下走：在她后上方 7.5 格、高 8.5 格，通道尽头的李樱越来越近，快到时视线挪到两人中间。
const chase = (t: number): Cam => choreo612.mazeCam(T0 + t);
// 镜头 2（切中景～下沉）：中心空地东边的中景，离地 3 格往西看：右边（近）是回身的李樱，左边（远）是刚刹住弯腰喘气的九胡；扫帚在两人中间冒出来，杆头朝画面左前方（东南），坐稳后是 3/4 正面。整段慢慢往前推。
// 机位在东边的原因：杆头朝东南后，机位在东南则扫帚正对镜头缩成点；挪到西边看则人和宝箱逆光（暮色主光从东南偏东来，lib/光照配比.ts 的 `twilightSunDir`）、宝箱遮掉扫帚尾巴。东边顺光，扫帚斜 45°，宝箱在扫帚后面。
// 东边 x 9 起是 5 格高的树篱，机位最远只能退到 x 7.9（离扫帚 6.6 格），焦距从 24 起推到 30 不变
const C2 = { pos: [[beats.cutToMedium, [7.9, -1.6, 3.1]], [beats.sinkStart, [6.3, -1.75, 2.6]]] as [number, number[]][], tgt0: [0.8, -2.6, 1.0], tgt1: [1.3, -2.0, 1.1] };
const besideBroom = (point: number[]): V3 => {
  const rotated = broomToCourtyard(point);
  return [BROOM_XY[0] + rotated[0], BROOM_XY[1] + rotated[1], point[2]];
};
// 镜头 3（4.4～6.1）：扫帚后面偏左的低机位（离地 0.65）看扫帚一沉；5.1 起飞时镜头和他们一起往上冲（平视着扫帚、相对位置不变），10 帧内挪到后上方，之后锁在后面 10.5 格、上方 6 格一起飞，
// 视线慢慢从人身上落到前下方的林海：末帧是后面飞行段的首帧（机位高、俯角大、视距远）。速度感靠脚下的庭院、林海一下子缩下去。
// 机位按扫帚坐标排（右、前、高），跟着起飞方位转。宝箱（6-1-2 留下的，不转）在扫帚正后方偏右 2.6 格，从后面低着看它在画面右边近处
const C3_START: V3 = besideBroom([-1.5, -6.0, 0.65]);
const C3_PRE: V3 = besideBroom([-1.4, -5.5, 0.6]);
const C3_OFF: V3 = broomToCourtyard([0, -10.5, 6]); // 追上以后镜头相对扫帚的位置
export const camera = (t: number): Cam => {
  if (t < beats.cutToMedium) return chase(t);
  if (t < beats.sinkStart) {
    const u = Math.min(1, (t - C2.pos[0][0]) / (C2.pos[1][0] - C2.pos[0][0]));
    const eased = smoothstep01(u) * 0.6 + u * 0.4;
    return { pos: lerpV(C2.pos[0][1], C2.pos[1][1], eased), tgt: lerpV(C2.tgt0, C2.tgt1, smoothstep01((t - beats.cutToMedium - 10 / 24) / (40 / 24))), lens: lerp(24, 30, eased) };
  }
  const bp = broom(t).pos;
  if (t < beats.takeoff) return { pos: lerpV(C3_START, C3_PRE, (t - beats.sinkStart) / (beats.takeoff - beats.sinkStart)), tgt: [bp[0], bp[1], bp[2] + 0.6], lens: 24 };
  // 起飞那一帧起镜头跟着扫帚一起往上冲（相对位置从低机位慢慢挪到后上方），不原地仰头追（那样背景几乎全是天）：镜头和扫帚一样高平视，10 格内挪到后上方往下看
  const pre = broom(beats.takeoff - 1 / 24).pos;
  const off0 = [C3_PRE[0] - pre[0], C3_PRE[1] - pre[1], C3_PRE[2] - pre[2]];
  const k = smoothstep01((t - beats.takeoff) / (10 / 24));
  const off = lerpV(off0, C3_OFF, k);
  const pos = [bp[0] + off[0], bp[1] + off[1], bp[2] + off[2]];
  const kl = smoothstep01((t - (beats.flip - 0.5)) / (beats.last - beats.flip + 0.5));
  const nearLook = broomToCourtyard([0, 1, 0.8]);
  const farLook = broomToCourtyard([0, 40, -24]);
  const look = lerpV([bp[0] + nearLook[0], bp[1] + nearLook[1], bp[2] + nearLook[2]], [bp[0] + farLook[0], bp[1] + farLook[1], bp[2] + farLook[2]], kl);
  return { pos, tgt: look, lens: lerp(24, 18, smoothstep01((t - beats.takeoff) / 1.25)) };
};
// 清草：中心空地（一格高的草会挡住人的脚和悬在离地 0.65 格的扫帚）。迷宫通道里的草和 6-1-2 一样留着
export const CLEAR_PLANTS = [[-5.5, -9.5, 9.5, 5.5]];
// 镜头 1 接 6-1-2 末帧：6-1-2 没清草，画面深处就是中心空地，所以切中景以前草照画，不然首帧和 6-1-2 末帧对不上。同一个数组对象，换的时候场景网格只重建一次
export const clearPlants = (t: number) => (t < beats.cutToMedium ? undefined : CLEAR_PLANTS);
export const LAST = { camera: () => camera(beats.last), broom: () => broom(beats.last), speed: () => broom(beats.last).speed, velocity: () => velocity(beats.last) };

// 镜头离脚下树冠多高（米）
// 镜头离脚下地物多高（起飞后在世界坐标里量；起飞前就是离庭院地面的高度）
export const aboveGround = (t: number) => {
  const camPos = camera(t).pos;
  return t < beats.takeoff ? camPos[2] : twilightHeightAboveGround(courtyard.toWorld(camPos));
};
// 雾的远端（米）：同 6-1-2 的暮色线性雾，地面上是满视距（lib/视距.ts），升空后按镜头离地高度放远（lib/暮色光照.tsx）。起飞到放平那一帧放到一镜到底的巡航下限（`TWILIGHT_CRUISE_FOG_FAR`），
// 才和 6-1-4 首帧接得上；往导入范围边上看时压到边以内（`clampFogToEdge`）。
// 超远景（用户 11-07 定 10 公里，暮色新世界/超远景.ts）：起飞后跟着这条放远的曲线一起放进（`farViewRamp`），起飞前林子里的雾、高度雾不变，首帧接得上 6-1-2
export const farView = () => farViewOf(TWILIGHT_FAR_VIEW);
export const farViewRamp = (t: number) => (t < beats.takeoff ? 0 : smoothstep01((t - beats.takeoff) / flipDelay));
export const fogFar = (t: number) => {
  const nearFog = twilightFogFar(aboveGround(t));
  if (t < beats.takeoff) return nearFog;
  const cam = camera(t);
  const farFog = Math.max(nearFog, VIEW_DISTANCE + (TWILIGHT_CRUISE_FOG_FAR - VIEW_DISTANCE) * farViewRamp(t));
  return cruiseFogFar(farFog, () => viewEdgeDistance(courtyard.toWorld(cam.pos), courtyard.toWorld(cam.tgt)), clampFogToEdge, farView(), farViewRamp(t));
};
// 本段第 0 秒在 6-1-2 段内的秒数
export const T612 = T612_END;
