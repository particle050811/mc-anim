// 6-3-2 思索（编排，纯函数）：机械动力的思索（Ponder）界面，在场景板上演李樱头朝下、锤头领在最前面（同 6-3 下坠的俯冲，用户 10-19 把史蒂夫换成李樱），
// 锤头上浮现体内空间的动力压路机虚影，从高处落下，砸穿石半砖、泥土、石头、两层深板岩，一路砸到底板。界面不透明，盖住两人骑悬停扫帚的画面（用户 10-19：去掉游戏背景）；
// 李樱配音（台词.ts），说明框一段段出来；说完界面淡掉、镜头推到场景里的李樱、底色淡到天空，接上真的俯冲（转场.ts，用户 10-19）。
// 说明框的字是用户 10-06 改写的五句（文案.json），只讲压路机能干什么，不对原文校验；原文那一句由李樱说出（台词.ts）。
// 压路机虚影按 6-3 下坠锤头上那台画（贴图乘淡青白、自发光、半透明、不写深度）。
//
// 照思索场景的演法：
// - 场景板 5×5，最下面一层思索标配的白色混凝土/雪块棋盘格底板，上面是实心的地面：两层深板岩、一层石头、一层泥土、最上面一层平滑石台阶（边城地面是石半砖）。
//   不留空腔剖面（用户 10-18：缺一块看着难受，填满、一路砸到底）。
// - 砸穿的那一柱贴着朝镜头的北边沿（x 2～3、z 0～1），砸开后朝镜头那面是敞开的，看得见一路砸到底。宽窄是锤头上压路机虚影的占地（约 1.2 × 1.8 格），2×2 格装得下。
// - 顺序（五句说明框各配一步，跟着对应那截话出来）：底板落下 → 地面落下 → 李樱头朝下出现在高处（① 指锤头）→ 锤头上浮现压路机虚影（② 指虚影）
//   → 红框量出虚影离地高度（③）→ 往下掉，砸在石半砖上，方块带碎屑一层层破开，砸到底板，虚影散掉（④ 绿框框出砸穿的那一柱）
//   → ⑤ 不指东西，碎屑落完、场景停住 → 关界面，推近砸到底的他转场（用户 10-19：方块全砸穿、思索整个播完才转场）。每一下挂在哪个字上见 台词.ts 的 `smash`。
// - 下落照原版实体物理（每刻速度 −0.08 再乘 0.98，20 刻每秒），按虚影最低点算；砸穿每层先出裂纹再碎，碎时照原版 addDestroyBlockEffect 每格放 4×4×4 个碎屑。下落、碰层时刻按物理算，只有松手时刻和每层裂多久跟着台词定。
//
// 时间：这里的 t 是思索场景自己的时间（进度条），从开界面算起；段内秒数 = 台词.ts 的 `uiOpen` + t。
// 镜头照 PonderScene$SceneTransform 的默认视角（绕 X −35°、绕 Y 145°，正交），缩放 0.46、往下挪 2.22 格，让高处的李樱和底板一起装进按钮上面那块地方。
import * as THREE from 'three';
import type { V3 } from '../../../../engine/model/parts.tsx';
import type { FigurePose } from '../../../角色/骨架.tsx';
import { ponderScreen } from '../../../界面/思索界面.tsx';
import { MACE } from '../../../物品/重锤.tsx';
import * as LY from '../6-3-下坠/编排/李樱.ts';
import { goldGlow } from '../6-3-下坠/编排/金光.ts';
import { broomState } from '../6-3-下坠/编排/扫帚.ts';
import { 刻, 撞击时刻, yawVec } from '../6-3-下坠/时间线.ts';
import { uiClose, uiFade, smashBeats, calloutBeats, matchSec as pushEnd } from './台词.ts';

export const FPS = 24;
const ss = (x: number) => {
  const clamped = Math.min(1, Math.max(0, x));
  return clamped * clamped * (3 - 2 * clamped);
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const D2R = Math.PI / 180;

// ---------- 时刻（思索场景时间，秒） ----------
// 开界面、底板地面落下、李樱出现固定（配音 1.25 秒开始放，① 跟着第一个字出来）；后面的动作挂在说明框上，说明框挂在台词的拍上
// （台词.ts 的 `calloutBeats`：每截话第一个字起音的时刻），砸穿挂在 `smashBeats`，所以换台词整页跟着重排。
const [beat1, beat2, beat3, beat4, beat5] = calloutBeats;
// 原版实体下落（LivingEntity.travel：每刻先挪，再 −0.08、×0.98）
export const tickSec = 1 / 20;
// 虚影最低点开始时离石半砖几格（为什么是 4 见 `footStartY`）
const dropHeight = 4;
// 从静止落下 h 格要多久（秒）：和 `fallPath` 一样逐刻算、碰到那刻按比例插
const fallTime = (height: number) => {
  let y = height;
  let vel = 0;
  for (let tick = 0; tick < 400; tick++) {
    const ny = y + vel;
    if (ny <= 0) return tickSec * (tick + y / (y - ny));
    y = ny;
    vel = (vel - 0.08) * 0.98;
  }
  throw new Error('落不到底');
};
export const cues = {
  open: [0, 0.5] as const, // 界面淡入
  basePlate: [0.3, 1.0] as const, // 底板落下
  ground: [0.75, 1.45] as const, // 墙和地层落下
  liYing: 1.2, // 头朝下出现在高处
  ghost: [beat2, beat2 + 0.6] as const, // 压路机虚影在锤头上浮现（和第 ② 句一起出）
  // 松开（开始自由落体）：从「砸到石半砖的那个字」往前倒推落 4 格的时间
  fall: smashBeats.impact - fallTime(dropHeight),
  close: [uiClose, uiClose + uiFade] as const, // 最后一个字说完 0.6 秒以后界面淡出
};
// 说明框：调色、出现和消失的时刻、指着什么。一段段出，读完再出下一段（框都在被指东西的高度，叠在一起会挡），
// 只有上下离得远的两段交接时同时在（③ 在高处、④ 在底下），③④ 叠 0.4 秒、④⑤ 叠 0.6 秒。
export type PointTarget = '锤头' | '压路机' | '高度' | '砸穿处' | null;
// 调色：①② 是「东西」（重锤白、压路机淡青 INPUT），③ 红（同红框），④ 绿（同绿框），⑤ 收尾淡金 OUTPUT。
// 靠近：思索的 placeNearTarget。被指的点在框出现那一刻定住（思索的 pointAt 是定点）
export const captionTable: { start: number; end: number; palette: 'WHITE' | 'RED' | 'GREEN' | 'OUTPUT' | 'INPUT'; pointsAt: PointTarget; height?: number; nearTarget?: boolean }[] = [
  { start: beat1, end: beat2, palette: 'WHITE', pointsAt: '锤头' }, // 手持重锤类武器
  { start: beat2, end: beat3, palette: 'INPUT', pointsAt: '压路机' }, // 召唤出体内空间的动力压路机
  { start: beat3, end: beat4 + 0.4, palette: 'RED', pointsAt: '高度' }, // 重锤的高度伤害倍率增加
  { start: beat4, end: beat5 + 0.6, palette: 'GREEN', pointsAt: '砸穿处' }, // 破坏接触到的方块
  { start: beat5, end: cues.close[0], palette: 'OUTPUT', pointsAt: null, height: 40 }, // 应力转动之力，实际全能！
];
export const captionFadeSec = 0.25; // 淡入淡出（秒）
// 思索场景的总时长 = 开界面到关界面；关键帧在每段说明框出现的时刻（思索里 attachKeyFrame 挂在说明框上）
export const sceneDuration = cues.close[0];
export const keyframes = captionTable.map((b) => b.start / sceneDuration);

// ---------- 场景板（游戏坐标：x 东、y 上、z 南，单位格，底板占 x、z 0～5） ----------
export type BlockKind = '白色混凝土' | '雪块' | '深板岩' | '石头' | '泥土' | '平滑石台阶';
export type Block = { x: number; y: number; z: number; kind: BlockKind; part: '底板' | '地面' };
export const blocks: Block[] = (() => {
  const out: Block[] = [];
  for (let x = 0; x < 5; x++)
    for (let z = 0; z < 5; z++) {
      out.push({ x, y: 0, z, kind: (x + z) % 2 === 0 ? '白色混凝土' : '雪块', part: '底板' });
      for (const y of [1, 2]) out.push({ x, y, z, kind: '深板岩', part: '地面' });
      out.push({ x, y: 3, z, kind: '石头', part: '地面' });
      out.push({ x, y: 4, z, kind: '泥土', part: '地面' });
      out.push({ x, y: 5, z, kind: '平滑石台阶', part: '地面' });
    }
  return out;
})();
export const slabTop = 5.5;
// 砸穿的那一柱：x 2～3、z 0～1，贴着北边沿（锤头上的压路机虚影正好压在这 2×2 格上；为什么贴边见文件头）
export const breachColumn = { x: [2, 3], z: [0, 1] } as const;
export const inBreachColumn = (b: { x: number; z: number }) => b.x >= breachColumn.x[0] && b.x <= breachColumn.x[1] && b.z >= breachColumn.z[0] && b.z <= breachColumn.z[1];

// ---------- 下落（原版实体物理，按刻算，刻之间线性插值） ----------
// 虚影最低点开始的高度：离石半砖 4 格（再高场景要缩得更小）。红框是 2×2×整数格，4 格时红框静止时上下都贴住（用户 10-10）。
// 松手由砸到石半砖的时刻倒推（`cues.下落`），高度不影响砸的时刻
const footStartY = slabTop + dropHeight;
// 撞到每一层：台阶顶 5.5 一砸就碎；泥土顶 5、石头顶 4 先停住出裂纹，裂完碎掉再接着掉；两层深板岩（顶 3、2）一碰就碎、速度不减，最后落在底板顶 1。
// 深板岩不停顿：落到底的时刻和原来落进空腔一样，台词里「直达地下」的对位不用重排
// 碎：这一层在哪个字上碎（台词.ts 的 `smash`）；裂：至少裂几刻（字来得太早时照这个，物理上不会穿层）
const layers = [
  { 顶: 5.0, crackTicks: 4, 碎: smashBeats.breaks[0] }, // 泥土
  { 顶: 4.0, crackTicks: 4, 碎: smashBeats.breaks[1] }, // 石头
];
const passThroughTops = [3, 2]; // 深板岩
type PathPoint = { t: number; y: number };
export type LayerBreak = { y: number; t: number; crackStart: number }; // 这一层（方块 y）在 t 秒碎掉，裂纹从 裂起 秒开始
const fallPath: { points: PathPoint[]; breaks: LayerBreak[]; impact: number; landSec: number } = (() => {
  const points: PathPoint[] = [];
  const breakList: LayerBreak[] = [];
  let y = footStartY;
  let vel = 0;
  let t = cues.fall;
  let hitSec = NaN;
  let layerIdx = -1; // -1：还没砸到台阶；0、1：停在泥土、石头上；2 起：往下穿深板岩
  points.push({ t, y });
  for (let tick = 0; tick < 400; tick++) {
    const passIdx = layerIdx - layers.length;
    const floorY = layerIdx < 0 ? slabTop : layerIdx < layers.length ? layers[layerIdx].顶 : (passThroughTops[passIdx] ?? 1);
    // LivingEntity.travel：先按速度挪，再 −0.08、×0.98
    const ny = y + vel;
    if (ny > floorY) {
      y = ny;
      vel = (vel - 0.08) * 0.98;
      t += tickSec;
      points.push({ t, y });
      continue;
    }
    // 这一刻里碰到了：按比例算碰到的时刻
    const tc = t + tickSec * ((y - floorY) / (y - ny));
    points.push({ t: tc, y: floorY });
    if (layerIdx < 0) {
      // 重锤砸在石半砖上：台阶当场碎掉，速度剩一半接着往下（台阶只有半格厚，下面就是泥土）
      hitSec = tc;
      breakList.push({ y: 5, t: tc, crackStart: tc });
      vel *= 0.5;
    } else if (layerIdx < layers.length) {
      // 停在这一层上出裂纹（思索里挖方块的演法），裂到该碎的那个字碎掉，锤头接着往下压
      const breakAt = Math.max(tc + layers[layerIdx].crackTicks * tickSec, layers[layerIdx].碎);
      points.push({ t: breakAt, y: floorY });
      breakList.push({ y: layerIdx === 0 ? 4 : 3, t: breakAt, crackStart: tc });
      t = breakAt;
      y = floorY;
      vel = -0.3;
      layerIdx++;
      continue;
    } else if (passIdx < passThroughTops.length) {
      // 深板岩：碰到当场碎，速度不变接着往下
      breakList.push({ y: floorY - 1, t: tc, crackStart: tc });
      t += tickSec;
      y = ny;
      vel = (vel - 0.08) * 0.98;
      points.push({ t, y });
      layerIdx++;
      continue;
    } else {
      return { points: points, breaks: breakList, impact: hitSec, landSec: tc };
    }
    t = tc;
    y = floorY;
    layerIdx++;
  }
  throw new Error('下落没落地');
})();
export const impactSec = fallPath.impact;
export const landingSec = fallPath.landSec;
// 红框：和第 ③ 段一起出，砸到石半砖前 0.23 秒收掉（量的是压路机虚影离地的高度，往下掉时一格格变短）；绿框：砸到底板那一刻出，⑤ 出来后收掉（至少留 1.2 秒）
export const boxCues = {
  redBox: [beat3, impactSec - 0.23] as const,
  greenBox: [landingSec, Math.max(beat5 + 0.35, landingSec + 1.2)] as const,
};
export const layerBreaks = fallPath.breaks;
// 虚影最低点的高度（游戏 y）
export const footY = (t: number) => {
  const points = fallPath.points;
  if (t <= points[0].t) return points[0].y;
  for (let i = 1; i < points.length; i++) if (t <= points[i].t) return lerp(points[i - 1].y, points[i].y, (t - points[i - 1].t) / (points[i].t - points[i - 1].t));
  return points[points.length - 1].y;
};
// 每个方块碎掉的时刻（不碎 = Infinity）、裂纹进度（0～1）
export const breakSecOf = (b: Block) => (b.part === '地面' && inBreachColumn(b) ? (layerBreaks.find((c) => c.y === b.y)?.t ?? Infinity) : Infinity);
export const blockGone = (b: Block, t: number) => t >= breakSecOf(b);
// 演示演完：最后一层碎掉后碎屑落完（原版 TerrainParticle 最长活 40 刻 = 2 秒，思索场景.tsx 的 `destroyParticle`），再停一会儿才关界面
export const demoEnd = layerBreaks[layerBreaks.length - 1].t + 2;
if (demoEnd + 0.4 > cues.close[0]) throw new Error('6-3-2 思索：碎屑还没落完就关界面，把 台词.ts 的 uiClose 往后挪');
export const crackProgress = (block: Block, t: number) => {
  if (block.part !== '地面' || !inBreachColumn(block)) return 0;
  const layerBreak = layerBreaks.find((x) => x.y === block.y);
  if (!layerBreak || layerBreak.t === layerBreak.crackStart) return 0;
  return Math.min(1, Math.max(0, (t - layerBreak.crackStart) / (layerBreak.t - layerBreak.crackStart)));
};
// 每段（底板、地面）落下的动画：思索的 showSection(…, Direction.DOWN)，从上方 1 格处边落边淡入
export const dropIn = (part: '底板' | '地面', t: number) => {
  const [start, end] = part === '底板' ? cues.basePlate : cues.ground;
  const k = ss((t - start) / (end - start));
  return { opacity: k, offset: 1 - k };
};

// ---------- 李樱：和 6-3 下坠里同一个模型、同一套姿势（编排/李樱.ts） ----------
// 摆法：把下坠里的李樱整个绕竖直轴转 ψ，让扫帚朝向转到南边：他背朝北、右手朝西，思索镜头（西北上方）看他的那一侧和 6-3-5 跟拍一样（斜后上方），
// 锤上的压路机滚筒轴沿东西，2×2 的砸穿柱装得下。场景板是游戏坐标（x 东、y 上、z 南），下坠是场景坐标（x 东、y 北、z 上），差一个绕 x 的 −90°。
// 姿势：悬着时是 `刻`.俯冲起 那一刻的架势（翻完收稳、锤头朝下领在最前面、还没往回抡；转场里接上的就是这一刻），砸到石半砖前 0.15 秒戳成打击姿势。
// 虚影在锤头上（同下坠），随第 ② 句浮现；金光照下坠：悬着 0.45，往下掉时升到 1，落到底熄掉。
export const toScene = (p: number[]): V3 => [p[0], -p[2], p[1]];
export const toGame = (p: number[]): V3 => [p[0], p[2], -p[1]];
type FigureRef = { psi: THREE.Matrix4; stance: FigurePose; hit: FigurePose; hipXY: [number, number] };
let FIGURE: FigureRef | null = null;
export const figureRef = (): FigureRef => {
  if (FIGURE) return FIGURE;
  const fwd = yawVec(broomState(刻.leap).yaw).fwd;
  const psi = new THREE.Matrix4().makeRotationZ(Math.atan2(-1, 0) - Math.atan2(fwd[1], fwd[0]));
  const stance = { ...LY.liYing(刻.俯冲起).pose, loc: [0, 0, 0] };
  const hit = { ...LY.liYing(撞击时刻()).pose, loc: [0, 0, 0] };
  // 悬着时锤头正对砸穿那一柱的中心
  const head = new THREE.Vector3(...LY.maceHeadPos({ pose: stance, matrix: LY.diveMatrix([0, 0, 0], stance), maceAngle: LY.maceAngleOf(stance), maceHeld: 1, ghost: 0, hip: [0, 0, 0] })).applyMatrix4(psi);
  const center = toScene([breachColumn.x[0] + 1, 0, breachColumn.z[0] + 1]);
  FIGURE = { psi, stance, hit, hipXY: [center[0] - head.x, center[1] - head.y] };
  return FIGURE;
};
const blendPose = (a: FigurePose, b: FigurePose, k: number): FigurePose => {
  const out = { ...a, loc: [0, 0, 0] } as Record<string, unknown>;
  for (const [key, value] of Object.entries(b)) if (typeof value === 'number') out[key] = lerp((a as unknown as Record<string, number>)[key] ?? 0, value, k);
  return out as FigurePose;
};
export const ghostOpacity = 0.62; // 同下坠锤头上那台
const bottomBreakSec = layerBreaks[layerBreaks.length - 1].t;
const hoverGlow = 0.45; // 同下坠翻完以后（编排/金光.ts 的 goldGlow）
// 推近（关界面淡完到 6-3-3 首帧）：落在底板上的他手臂、腿慢慢收成 `刻`.俯冲起 的架势（两个姿势只差十来度），金光重新亮到悬着时的亮度，接上真的俯冲
export type PonderFigure = { visible: boolean; pose: FigurePose; matrix: THREE.Matrix4; hip: V3; maceAngle: number; ghost: number; glow: number };
// 髋高 = 虚影最低点 + 姿势定的深度；落到底虚影散掉的同时往下坐到锤头顶钮碰着底板（不然锤悬在半空）
const maceTipBelowHead = (MACE.tip - MACE.head) * (1.875 / 32) * 16; // 锤头中心到顶钮（李樱手里的锤，单位同 编排/李樱.ts 的 PX）
export const hipAt = (t: number, pose: FigurePose): V3 => {
  const { hipXY } = figureRef();
  const settle = ss((t - bottomBreakSec) / 0.25) * (LY.rollerRadius - maceTipBelowHead);
  return [hipXY[0], hipXY[1], footY(t) + LY.ghostDepth(pose) - settle];
};
export const figureAt = (t: number, transitionW?: number): PonderFigure => {
  const ref = figureRef();
  let pose: FigurePose;
  let ghost = 0;
  let glow: number;
  let hip: V3;
  if (transitionW !== undefined) {
    // 转场：和下坠里同一刻的姿势、虚影、金光（髋停在推近结束的位置，镜头相对髋走，见 转场.ts）
    const real = LY.liYing(transitionW);
    pose = { ...real.pose, loc: [0, 0, 0] };
    ghost = real.ghost;
    glow = goldGlow(transitionW);
    hip = hipAt(pushEnd, ref.stance);
  } else if (t < cues.close[1]) {
    pose = blendPose(ref.stance, ref.hit, ss((t - (impactSec - 0.15)) / 0.15));
    ghost = ghostOpacity * ss((t - cues.ghost[0]) / (cues.ghost[1] - cues.ghost[0])) * (1 - ss((t - bottomBreakSec) / 0.25));
    glow = lerp(hoverGlow, 1, ss((t - cues.fall) / (impactSec - cues.fall))) * (1 - ss((t - landingSec) / 0.5));
    hip = hipAt(t, pose);
  } else {
    const k = ss((t - cues.close[1]) / (pushEnd - cues.close[1]));
    pose = blendPose(ref.hit, ref.stance, k);
    glow = hoverGlow * k;
    hip = hipAt(t, pose);
  }
  const visible = transitionW !== undefined || t >= cues.liYing;
  const matrix = new THREE.Matrix4().makeTranslation(...hip).multiply(ref.psi).multiply(LY.diveMatrix([0, 0, 0], pose));
  return { visible, pose, matrix, hip, maceAngle: LY.maceAngleOf(pose), ghost, glow };
};
// 锤头中心（游戏坐标，说明框指它）
export const maceHeadPos = (t: number): V3 => {
  const f = figureAt(t);
  return toGame(LY.maceHeadPos({ pose: f.pose, matrix: f.matrix, maceAngle: f.maceAngle, maceHeld: 1, ghost: f.ghost, hip: f.hip }));
};

// ---------- 镜头（正交）和投影 ----------
// 场景变换（PonderScene$SceneTransform.apply）：屏幕中心 ← 绕 X −35° ← 绕 Y 145° ← y 翻转 ← 缩放 30 × scaleFactor ← 平移到底板中心。
export const ponderScale = 0.46; // scaleFactor：30 × 0.46 = 每格 13.8 界面像素（底板最低的角到举起的锤顶 12.5 格，装进标题下面、按钮上面）
export const pixelsPerBlock = 30 * ponderScale * ponderScreen.s;
export const sceneCenter: [number, number, number] = [2.5, 1 + 2.22, 2.5]; // 底板中心往上（setSceneOffsetY(−2.22)）
export const viewRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(35 * D2R, 145 * D2R, 0, 'XYZ'));
// 游戏坐标 → 画面像素（1280×720）
export const project = (point: number[]): [number, number] => {
  const view = new THREE.Vector3(point[0] - sceneCenter[0], point[1] - sceneCenter[1], point[2] - sceneCenter[2]).applyQuaternion(viewRotation);
  return [(ponderScreen.W * ponderScreen.s) / 2 + view.x * pixelsPerBlock, (ponderScreen.H * ponderScreen.s) / 2 - view.y * pixelsPerBlock];
};
export const projectUi = (point: number[]): [number, number] => {
  const screen = project(point);
  return [screen[0] / ponderScreen.s, screen[1] / ponderScreen.s];
};

// 说明框指的点（游戏坐标）
export const pointerTarget = (target: PointTarget, t: number): number[] | null => {
  switch (target) {
    case '锤头':
      return maceHeadPos(t);
    case '压路机': {
      // 虚影朝西（画面右边、说明框一侧）那面：滚筒中心在锤头上，滚筒轴沿东西、半宽约 0.6 格
      const head = maceHeadPos(t);
      return [head[0] - 0.6, head[1], head[2]];
    }
    case '高度':
      // 红框朝西那面正中：指中轴线会从框里面拉出引线（思索里指方块也是指某一面的中心）
      return [breachColumn.x[0], (Math.max(footY(t), slabTop) + slabTop) / 2, (breachColumn.z[0] + breachColumn.z[1] + 1) / 2];
    case '砸穿处':
      return [2.3, 1.4, 0]; // 砸穿那一柱朝镜头的北面、底板上方，李樱的西边（画面右边、说明框那一侧）
    default:
      return null;
  }
};
// 红框：截面是砸穿的那一柱（2×2 格，同绿框），从石半砖顶面量到压路机虚影最低点，高取整数格、向下取整，往下掉时一格格变短，不到一格不画（用户 10-10：红框要 2×2×n）。
// 绿框：砸穿的那一柱，从底板顶面到石半砖顶面
export const redBoxAt = (t: number) => {
  const boxHeight = Math.floor(footY(t) - slabTop + 1e-6);
  const k = boxHeight < 1 ? 0 : ss((t - boxCues.redBox[0]) / 0.3) * (1 - ss((t - boxCues.redBox[1]) / 0.3));
  return { k, min: [breachColumn.x[0], slabTop, breachColumn.z[0]], max: [breachColumn.x[1] + 1, slabTop + Math.max(boxHeight, 0), breachColumn.z[1] + 1] };
};
export const greenBox = (t: number) => {
  const k = ss((t - boxCues.greenBox[0]) / 0.3) * (1 - ss((t - boxCues.greenBox[1]) / 0.3));
  return { k, min: [breachColumn.x[0], 1, breachColumn.z[0]], max: [breachColumn.x[1] + 1, slabTop, breachColumn.z[1] + 1] };
};

// ---------- 界面 ----------
export const uiOpacityAt = (t: number) => ss((t - cues.open[0]) / (cues.open[1] - cues.open[0])) * (1 - ss((t - cues.close[0]) / (cues.close[1] - cues.close[0])));
export const captionOpacity = (i: number, t: number) => {
  const caption = captionTable[i];
  return Math.min(1, Math.max(0, (t - caption.start) / captionFadeSec), Math.max(0, (caption.end - t) / captionFadeSec));
};
