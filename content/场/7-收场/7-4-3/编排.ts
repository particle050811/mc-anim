// 7-4-3 报告：时间轴、机位、人的姿势，纯函数，输入帧号 f（0 起，24 帧/秒）。画面在 画面.tsx，声音在 声音.tsx。
// 戏（正篇/07-监守者之怒/脚本规划.md 7-4-3）：刘心忠、黄叛从竖井跳回边城坑口（坑口.ts）；刘心忠在城门边的卫兵室用原版书与笔写报告
//   （「地下古城」「贼人已死于怪物之手」），写完合上（原版「署名」= 变成成书、改不了），递给卫兵。
// 屋：模型/场景/边城室内.tsx 的 城门卫兵室（用户 10-19 定：在城门边，窗外是城门和城墙，不再看坑），城外导入地形不画（城墙挡着）。
// 人：刘心忠（模型/角色/追兵.tsx，匠师之杖靠在书桌北头）背对东窗坐在椅子上、面朝西。原版没有坐椅子：姿势照骑乘（HumanoidModel 的 riding：两腿前抬、手臂不动），
//   身子前探去够书；右手拿羽毛（书与笔上那根笔），写字时手在纸上小幅来回。卫兵：6-3 同一套（模型/角色/卫兵.tsx），站在书桌西边面朝刘心忠，不举望远镜。
// 镜头（硬切三个；屋里的坐标是卫兵室网格本地坐标，见 边城室内.tsx：x 往东、y 往北为正（屋子在 y ≤ 0）、z 地板顶面 0）：
//   1 坑口（0～`shot1End`）见 坑口.ts；2 书页（～`shot2End`）书桌正上方特写，右页从第 0 个字一个字一个字写到「贼人已死于怪物之手。」停一拍，落款，停住给观众读完两页；
//   3 递（～`END`）北墙下侧看两人：右手掀左页合上书，拿起来隔着书桌递出去，卫兵接住转身朝门。
//   坑口直接切书页，不拍屋里中景看他写（用户 10-19 定：那样看不到字）。
// 手和书的接触（掀页、拿书、接书）用 模型/角色/手臂逆解.ts 让手上那一点落到书上；书拿起来以后跟着手走（拿起那一刻手和书的相对位置定住），不穿桌面、不穿手。
import * as THREE from 'three';
import { Key, sample } from '../../../../engine/anim/anim.ts';
import type { V3 } from '../../../../engine/model/parts.tsx';
import { handMatrix, hipMatrix, standPose, type FigurePose } from '../../../../world/角色/骨架.tsx';
import { reachFigure, solveReach, type ReachParam } from '../../../../world/角色/手臂逆解.ts';
import { guardRestArm, guardRightArmMatrix } from '../../../../world/角色/卫兵.tsx';
import { guardRoom, toTownPoint } from '../../../../world/地点/边城室内.tsx';
import { borderTownPos } from '../../../../world/地点/主世界116.ts';
import { charPos, closedBookBox, guiPixel, pageCharCount, pageHeight, pageWidth, type BookPage } from '../../../../world/物品/书.tsx';
import bookPageData from 'asset:数据/镜头/7-4-3/书页.字';
import { pitCam } from './坑口.ts';

export const FPS = 24;
export const shot1End = 78; // 坑口 3.25 秒

// ---------- 坐标 ----------
export const roomToWorld = (localPos: number[]): V3 => {
  const cityPos = toTownPoint(guardRoom, localPos);
  return [cityPos[0] + borderTownPos[0], cityPos[1] + borderTownPos[1], cityPos[2] + borderTownPos[2]];
};

// ---------- 书 ----------
const pageNumFmt = bookPageData.页码;
export const bookPages: [BookPage, BookPage] = [
  { lines: bookPageData.页[0], pageNo: 1, pageTotal: 2, pageNumFormat: pageNumFmt },
  { lines: bookPageData.页[1], pageNo: 2, pageTotal: 2, pageNumFormat: pageNumFmt },
];
// 书摊在桌上：书脊中点（本地），书的上边朝西（离刘心忠远的那头，他坐在东边看是正的）：书模型的 +Y 是上边，画的时候绕 z 转 `bookYaw`。右页在北、左页在南。
// 书的近边（东）在 x 6.68，正好是刘心忠坐着手够得着、胳膊又不压到书的地方（见下面「刘心忠」）；远边离卫兵近，递书时卫兵够得着
export const bookOnDesk: V3 = [6.45, -2.5, guardRoom.deskTopZ];
export const bookYaw = 90;
const deskBookMatrix = new THREE.Matrix4().makeTranslation(...bookOnDesk).multiply(new THREE.Matrix4().makeRotationZ((bookYaw * Math.PI) / 180));

// 书页镜里右页写到第几个字（左页早写好了）：右页从第 0 个字写起，一个字 2.5 帧（用户 10-20 嫌写得慢，要快一点）；写完「贼人已死于怪物之手。」停 12 帧，
// 落款一个字 2 帧，落款后停 36 帧给观众读完两页（用户 10-19：落款后约 1 秒以上；字写得快了、边写边读的工夫少了，停得比 1 秒再长一点）
const rightPageChars = pageCharCount(bookPages[1]);
const thiefLineChars = [...bookPages[1].lines.slice(0, 3).join('')].length; // 前三行的字数（第三行是「贼人已死于怪物之手。」）
const writing = (() => {
  const start = shot1End + 6;
  const thiefLineEnd = start + Math.round(2.5 * thiefLineChars);
  const pauseEnd = thiefLineEnd + 12;
  const signatureEnd = pauseEnd + 2 * (rightPageChars - thiefLineChars);
  return { start, thiefLineEnd, pauseEnd, signatureEnd };
})();
export const shot2End = writing.signatureEnd + 36; // 书页
export const END = shot2End + 78; // 递 3.25 秒
export const charCounts = (frame: number): [number, number] => {
  const k = sample(
    [
      [writing.start, 0, 'linear'],
      [writing.thiefLineEnd, thiefLineChars, 'const'],
      [writing.pauseEnd, thiefLineChars, 'linear'],
      [writing.signatureEnd, rightPageChars],
    ] as Key[],
    frame,
  );
  return [999, Math.floor(k)];
};
export const isWriting = (f: number) => (f >= writing.start && f < writing.thiefLineEnd) || (f >= writing.pauseEnd && f < writing.signatureEnd);
// 右页第 i 个字从哪一帧起笔、哪一帧写完（同 charCounts）
const charSpan = (i: number): [number, number] => {
  const [f0, f1, i0, i1] = i < thiefLineChars ? [writing.start, writing.thiefLineEnd, 0, thiefLineChars] : [writing.pauseEnd, writing.signatureEnd, thiefLineChars, rightPageChars];
  const per = (f1 - f0) / (i1 - i0);
  return [f0 + (i - i0) * per, f0 + (i - i0 + 1) * per];
};
// 笔在纸上写的一截一截（声音.tsx 照着放写字声）：右页一行一截，从这一行第一个字起笔到最后一个字写完；空行不算，落款连中间的空格算一截
export const writingRuns = (): [number, number][] => {
  let first = 0;
  return bookPages[1].lines.flatMap((line) => {
    const n = [...line].length;
    const run: [number, number][] = line.trim() ? [[charSpan(first)[0], charSpan(first + n - 1)[1]]] : [];
    first += n;
    return run;
  });
};

// 递书镜（镜头 3）里的时刻：段内帧 = shot2End + s
const at = (s: number) => shot2End + s;
const ss = (x: number) => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};
const ramp = (f: number, f0: number, f1: number) => ss((f - f0) / (f1 - f0));
const lerp3 = (a: number[], b: number[], k: number): V3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
// 合书（0～1，书.tsx 的 合）：右手按住左页靠书脊的近角往上一掀（贴着掀到 0.2），手接着往上一挑，左页跟在手后面立起来，过了竖直自己倒下去（越倒越快）
const pinchStart = at(8);
export const pinchEnd = at(11);
const flickEnd = at(15);
export const bookLandFrame = at(19);
export const closeBook = (f: number) => {
  if (f < pinchEnd) return 0.2 * ramp(f, pinchStart, pinchEnd);
  if (f < flickEnd) return 0.2 + 0.4 * Math.min(1, (f - pinchEnd) / (flickEnd - pinchEnd));
  const u = Math.min(1, (f - flickEnd) / (bookLandFrame - flickEnd));
  return 0.6 + 0.4 * u * u;
};
// 拿起（手和书的相对位置从这一帧定住）、交到卫兵手上（从这一帧起书跟着卫兵的手）
export const pickFrame = at(26);
export const handoffFrame = at(48);
const handoffHeld = at(40); // 刘心忠把书递到、举住的那一帧；卫兵在这之后才上前把手伸到书底下
const handoffReached = at(44); // 卫兵上前托到书的那一帧
// 原版「署名」：书与笔连笔一起变成成书，羽毛不还回来，所以递书镜里手上、桌上都没有羽毛
export const holdingQuill = (f: number) => f < shot2End;

// ---------- 刘心忠 ----------
// 坐：脚底原点往下挪到坐面减一截大腿（髋在脚底上方 12 像素，刘心忠 1.95 格高 → 0.73 格），`ground` 0；两腿前抬 50°（原版骑乘 ~81°，压低免得大腿、膝盖顶到桌板底下）。
// 他坐着肩膀只比桌面高 0.1 格、手臂又是一根不弯、0.28 格粗的方块（肩到袖口 0.64 格），所以手只能落在以肩为心、0.64 格为半径的球面上，
//   手要碰到桌面、书面，只能在离肩约 0.6 格的地方（胳膊从肩往手往上斜，下沿才不压到桌沿）——书就摆在那儿（`bookOnDesk`）。右手用逆解（模型/角色/手臂逆解.ts），
//   由手臂抬角、左右摆加胸口扭转凑；身子坐直（一前倾肩膀就低下去，胸口顶到桌沿）。左手垂在身侧不上桌（左手上桌也只能压在书或桌沿上）。
const liuHeight = 1.95;
export const liuYaw = (_f: number) => 90; // 面朝西；卫兵就站在书桌正西，递书不用转身
const hipHeight = (12 / 32) * liuHeight;
const seated = (frame: number, lean: number): FigurePose => ({
  ...standPose([guardRoom.chair[0] - 0.25, guardRoom.chair[1], guardRoom.chair[2] - hipHeight]), // 坐在椅子前沿，好够到书
  yaw: liuYaw(frame),
  ground: 0,
  pitch: -lean,
  legR: 50,
  legL: 50,
  legRRoll: -6,
  legLRoll: -6,
  twist: 0,
  armR: 100,
  armRYaw: -8,
  armRRoll: 0,
  armL: 6,
  armLYaw: 0,
  armLRoll: -30, // 左手垂着往外张一点，不碰椅子坐面
});
// 手上贴到书、桌上的那一点（手插槽坐标，像素）：袖口下沿正中（手臂方盒连袖子半宽 2.3、末端在插槽下 1.3）。手从上面压下来时这一条边最低；左手同一处
const handEdge: V3 = [0, -2.3, -1.3];
const bodyParams: ReachParam[] = [
  ['armR', 2e-4],
  ['armRYaw', 2e-4],
  ['twist', 1.5e-3, [-5, 35]],
];
// 不穿桌子：胳膊、身子、腿方盒上取一圈点，点进了桌子（桌面上有书时算上书：摊开 'open' 两页往外翘、外边高，合上 'closed' 一样厚）多深就罚多深（比够不着目标重），逆解时一起解
const chairBack = { x: [7.5 - 0.015, 8], y: [-3, -2], z: [0.5, 1 + 0.015] }; // 楼梯椅子立起来的那半格
const pointsIn = (m: THREE.Matrix4, xs: number[], ys: number[], zs: number[]): THREE.Vector3[] =>
  xs.flatMap((x) => ys.flatMap((y) => zs.map((z) => new THREE.Vector3(x, y, z).applyMatrix4(m))));
type BookOnDesk = 'open' | 'closed' | 'none';
// 手臂方盒（手插槽坐标，像素）：书角会卡在取样点之间，取密一点
const armX = [-2.3, -1.15, 0, 1.15, 2.3];
const armY = [-2.3, 0, 2.3];
const armZ = Array.from({ length: 10 }, (_, i) => -1.3 + i * 1.4);
const deskPenalty = (book: BookOnDesk) => (pose: FigurePose): number[] => {
  const hip = hipMatrix(pose, liuHeight);
  const torso = hip.clone().multiply(new THREE.Matrix4().makeRotationZ(((pose.twist ?? 0) * Math.PI) / 180));
  const pts = [
    ...pointsIn(handMatrix(pose, liuHeight, 'R'), armX, armY, armZ),
    ...pointsIn(handMatrix(pose, liuHeight, 'L'), armX, armY, armZ),
    ...pointsIn(torso, [-4.25, 0, 4.25], [-3.25, 3.25], [4, 12, 18, 24]),
    ...[2, -2].flatMap((side) => pointsIn(hip.clone().multiply(new THREE.Matrix4().makeTranslation(side, 0, 12)).multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler((pose.legR * Math.PI) / 180, ((side > 0 ? -1 : 1) * 6 * Math.PI) / 180, 0, 'YXZ'))), [-2, 2], [-2, 2], [0, -6, -12])),
  ];
  const inside = (v: THREE.Vector3, b: { x: number[]; y: number[]; z: number[] }) =>
    Math.max(0, Math.min(v.x - b.x[0], b.x[1] - v.x, v.y - b.y[0], b.y[1] - v.y, v.z - b.z[0], b.z[1] - v.z));
  const m = 0.015; // 留一点缝
  return pts.map((v) => {
    const dy = Math.abs(v.y - bookOnDesk[1]);
    const overBook = book !== 'none' && dy < pageWidth + 0.008 + m && Math.abs(v.x - bookOnDesk[0]) < pageHeight / 2 + 0.006 + m; // 书皮比纸大一圈（书.tsx）
    const bookTop = !overBook ? 0 : book === 'closed' ? closedBookBox.max[2] : coverThick + paperThick + dy * Math.sin(tilt);
    const desk = { x: [6, 7 + m], y: [-4, -2], z: [0.5 - m, guardRoom.deskTopZ + bookTop + m] };
    return 10 * (inside(v, desk) + inside(v, chairBack));
  });
};

// 书的本地点 → 屋里坐标。右页上的点带上摊开时往上翘的 6°；左半本上的点按 合 转（同 书.tsx 的 OpenBook：书皮底面抬 coverThick，左半本绕纸面高度的书脊转）
const coverThick = 0.008;
const paperThick = 0.03;
const tilt = (6 * Math.PI) / 180;
const applyTo = (m: THREE.Matrix4, local: V3): V3 => {
  const v = new THREE.Vector3(...local).applyMatrix4(m);
  return [v.x, v.y, v.z];
};
const rightPagePoint = (local: V3): V3 =>
  applyTo(new THREE.Matrix4().copy(deskBookMatrix).multiply(new THREE.Matrix4().makeTranslation(0, 0, coverThick)).multiply(new THREE.Matrix4().makeRotationY(-tilt)), local);
const leftPagePoint = (local: V3, closed: number): V3 =>
  applyTo(
    new THREE.Matrix4()
      .copy(deskBookMatrix)
      .multiply(new THREE.Matrix4().makeTranslation(0, 0, coverThick + paperThick))
      .multiply(new THREE.Matrix4().makeRotationY(Math.PI * closed))
      .multiply(new THREE.Matrix4().makeTranslation(0, 0, -paperThick))
      .multiply(new THREE.Matrix4().makeRotationY(tilt * (1 - closed))),
    local,
  );
// 界面像素里手对着的位置：写第 i 个字时从字 i 挪到字 i+1；跨行时前一半挪到下一行行首、后一半写那一行的第一个字（不一帧跳过去）
const handGui = (k: number): [number, number] => {
  const i = Math.floor(k);
  const u = k - i;
  const [x0, y0] = charPos(bookPages[1], i);
  const [x1, y1] = charPos(bookPages[1], Math.min(rightPageChars, i + 1));
  const mix = (a: number[], b: number[], w: number): [number, number] => [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w];
  if (y1 === y0) return mix([x0, y0], [x1, y1], u);
  const lineStart = [charPos(bookPages[1], 0)[0], y1];
  return u < 0.5 ? mix([x0, y0], lineStart, u * 2) : mix(lineStart, [x1, y1], u * 2 - 1);
};
// 写字：右手对着正在写的那个字走、停在这一行下面（不盖住写好的字），小幅来回。目标点放在纸上方 0.45 格：胳膊得往上斜、留够余量从书的近边上面过去（贴着书边逆解会在相邻帧之间跳），
// 够不着的字（上面几行）手就停在够得着的最远处，在没字的下半页上方，由逆解自己定
const handK = (frame: number) =>
  sample(
    [
      [writing.start, 0, 'linear'],
      [writing.thiefLineEnd, thiefLineChars, 'const'],
      [writing.thiefLineEnd + 4, thiefLineChars, 'linear'],
      [writing.pauseEnd, thiefLineChars + 0.5, 'linear'],
      [writing.signatureEnd, rightPageChars],
    ] as Key[],
    frame,
  );
const writingHand = (frame: number): V3 => {
  // 手走到第几个字（同 charCounts，只是停顿那 16 帧里手挪到落款那一行行首：k 的 .5 是「下一行行首」，见 `handGui`），前后 4 帧取平均，换行时手是顺过去的
  const window = Array.from({ length: 9 }, (_, j) => handGui(handK(frame + j - 4)));
  const gx = window.reduce((a, p) => a + p[0], 0) / window.length;
  const gy = window.reduce((a, p) => a + p[1], 0) / window.length;
  const t = frame / FPS;
  const on = isWriting(frame) ? 1 : 0;
  const local: V3 = [(gx + 4) * guiPixel + on * 0.006 * Math.sin(t * 9.1), pageHeight / 2 - (gy + 14) * guiPixel + on * 0.005 * Math.sin(t * 5.3 + 0.7), paperThick + 0.45];
  return rightPagePoint(local);
};
// 身子不动（坐直、右肩往前扭一点），只动右臂
const writingPose = (frame: number): FigurePose => {
  const on = isWriting(frame) ? 1 : 0;
  const base = { ...seated(frame, 0), twist: 10, headPitch: -30, headYaw: on * 4 * Math.sin((frame / FPS) * 1.7) };
  return reachFigure(base, liuHeight, 'R', handEdge, writingHand(frame), [['armR', 2e-4], ['armRYaw', 2e-4]]);
};

// 递书镜：右手要到的地方（屋里坐标）。开头停在写完的地方 → 按住左页靠书脊的近角 → 贴着掀起一点、再往上一挑（左页跟在手后面立起来，手一直在它前头）→
// 往右上让开（左页倒下来扫过的半圆外头）→ 按到合上的书上 → 拿起 → 隔着书桌往卫兵那边递 → 交出去以后抬手收回、放回桌上（书原来摊着的地方）。
// 手碰书都在书的近边上（离肩约 0.6 格，见上面「刘心忠」）：按左页按在靠书脊的近角（胸口往左扭着够），拿书捏住合上的书的近边
const pinchOnLeftPage: V3 = [-0.045, -pageHeight / 2 + 0.01, paperThick + 0.001];
const pinchOnClosedBook: V3 = [0.19, -pageHeight / 2 + 0.03, closedBookBox.max[2]]; // 合上的书的近边
const flickPoint: V3 = [6.86, -2.45, 1.5]; // 胳膊西侧在书的近边（x 6.69）以东，左页倒下来扫不到
const withdrawPoint: V3 = [6.95, -2.25, 1.62];
const handoffPoint: V3 = [6.7, -2.33, 1.42]; // 举高一点：卫兵的胳膊从桌面上方伸过来托，胳膊下沿要高过桌面
const raisedBack: V3 = [6.9, -2.25, 1.45];
const restOnDesk: V3 = [6.68, -2.3, guardRoom.deskTopZ + 0.012];
const rightHandTarget = (f: number): V3 => {
  const pinch0 = leftPagePoint(pinchOnLeftPage, 0);
  if (f < pinchStart) {
    // 从写字的地方挪过去，中间抬高一点，不擦着书页
    const k = ramp(f, at(2), pinchStart);
    const p = lerp3(writingHand(shot2End), pinch0, k);
    return [p[0], p[1], p[2] + 0.06 * Math.sin(Math.PI * k)];
  }
  if (f < pinchEnd) return leftPagePoint(pinchOnLeftPage, closeBook(f));
  if (f < flickEnd) return lerp3(leftPagePoint(pinchOnLeftPage, 0.2), flickPoint, ramp(f, pinchEnd, flickEnd));
  if (f < bookLandFrame) return lerp3(flickPoint, withdrawPoint, ramp(f, flickEnd, bookLandFrame));
  const grip = applyTo(deskBookMatrix, pinchOnClosedBook);
  if (f < pickFrame) {
    const k = ramp(f, bookLandFrame, pickFrame);
    const p = lerp3(withdrawPoint, grip, k);
    return [p[0], p[1], p[2] + 0.08 * Math.sin(Math.PI * k)];
  }
  const lifted: V3 = [grip[0] + 0.02, grip[1], grip[2] + 0.2];
  if (f < at(32)) return lerp3(grip, lifted, ramp(f, pickFrame, at(32)));
  if (f < handoffFrame + 4) return lerp3(lifted, handoffPoint, ramp(f, at(31), handoffHeld));
  if (f < handoffFrame + 12) return lerp3(handoffPoint, raisedBack, ramp(f, handoffFrame + 4, handoffFrame + 12));
  return lerp3(raisedBack, restOnDesk, ramp(f, handoffFrame + 12, handoffFrame + 20));
};
const shot3Pose = (f: number): FigurePose => {
  const base: FigurePose = {
    ...seated(f, 0),
    headPitch: sample([[at(0), -30, 'linear'], [at(34), -30], [at(44), -8, 'linear'], [handoffFrame + 10, -8], [handoffFrame + 22, -20]] as Key[], f),
    headYaw: sample([[at(0), 0], [at(4), -6, 'linear'], [at(14), -6], [at(20), 0]] as Key[], f), // 掀页时头跟着手往左页看一点
  };
  return reachFigure(base, liuHeight, 'R', handEdge, rightHandTarget(f), bodyParams, deskPenalty(f < bookLandFrame ? 'open' : f < pickFrame ? 'closed' : 'none'));
};
const liuPoses = new Map<number, FigurePose>(); // 书拿在手上要反复用前面帧的姿势
export const liuPose = (frame: number): FigurePose => {
  let pose = liuPoses.get(frame);
  if (!pose) liuPoses.set(frame, (pose = frame < shot2End ? writingPose(frame) : shot3Pose(frame)));
  return pose;
};
export const liuXinzhongState = (frame: number) => ({ pose: liuPose(frame), holdingQuill: holdingQuill(frame) });
// 匠师之杖靠在椅子后面东北墙角（本地坐标：杖尖点地，杖头往东北斜靠在墙上）
export const staffPos: V3 = [7.72, -1.28, 0];

// ---------- 卫兵 ----------
// 站在书桌西边、面朝刘心忠（卫兵模型正面朝 −Y，`yaw` 是模型绕 z 转多少：90 = 朝东）。镜头 3 里先在离桌一步外抬起右臂（贴着桌边抬，胳膊往前摆会扫进桌子），
// 再往前一步到桌边、托住递过来的书的远端；接到以后托着书退回一步，再收到胸前，头先、身子随后转向东墙的门（从书桌南头绕过去），往南挪一步
export const guardPos: V3 = [5.6, -2.1, 0]; // 上前一步站到的地方；x 由 `guardReach` 定（胳膊抬平正好托到书），这里是大约位置（给声音用）
const guardStepLength = 0.3;
export const guardSteps: [number, number][] = [
  [at(35), handoffReached], // 上前
  [handoffFrame + 3, handoffFrame + 12], // 退回
  [END - 12, END], // 往南
];
const guardYaw = (f: number) => sample([[END - 18, 84], [END - 2, 42]] as Key[], f);
const guardPosAt = (f: number): V3 => {
  const x = guardReach().x - guardStepLength * (1 - ramp(f, ...guardSteps[0]) + ramp(f, ...guardSteps[1]));
  const south = ramp(f, ...guardSteps[2]);
  return [x + 0.05 * south, guardPos[1] - 0.35 * south, 0];
};
const guardWorldAt = (pos: V3, yaw: number) => new THREE.Matrix4().makeTranslation(...pos).multiply(new THREE.Matrix4().makeRotationZ((yaw * Math.PI) / 180));
const guardWorldMatrix = (f: number) => guardWorldAt(guardPosAt(f), guardYaw(f));
// 右臂坐标系里托书的那一点：胸甲袖子（每边比手臂凸 1 像素）手背一面的末端（举平时这一面朝上）
const guardPalm: V3 = [-1, 11, -3];
// 书的本地点 → 屋里坐标（书在刘心忠手上时）
const bookPoint = (f: number, local: V3): V3 => {
  const v = new THREE.Vector3(...local).applyMatrix4(liuBookMatrix(f));
  return [v.x, v.y, v.z];
};
// 卫兵托住书的远端（西边，书的 +Y）底面：手伸到这里，交书那一帧起书跟着他的手
const farEdgeUnder: V3 = [0.19, closedBookBox.max[1] - 0.03, -0.02]; // 低 2 厘米：胳膊方盒的棱比手背中线高一点
// 抬平的右臂转角 + 上前一步站到的 x：一起解，手背正好顶在书的远端底下（只解胳膊的话够得太长、手穿进书里）
let guardReachCache: { arm: number[]; x: number } | null = null;
const guardReach = () => {
  if (guardReachCache) return guardReachCache;
  const target = bookPoint(handoffHeld, farEdgeUnder);
  const yaw = guardYaw(handoffReached);
  const point = (x: number[]): V3 => {
    const v = new THREE.Vector3(...guardPalm).applyMatrix4(guardWorldAt([x[2], guardPos[1], 0], yaw).multiply(guardRightArmMatrix([x[0], x[1], 0])));
    return [v.x, v.y, v.z];
  };
  const x = solveReach(point, [-1.45, 0, guardPos[0]], target, [1e-3, 1e-3, 1e-3]);
  guardReachCache = { arm: [x[0], x[1], 0], x: x[2] };
  return guardReachCache;
};
// 右臂转角（弧度，卫兵.tsx 的 rightArm）：垂手晃 → 一步外抬平（`guardReach`，上前一步正好托到书）→ 接到书退回一步以后托着书往怀里收（书底一直高过桌面）
const chestHold = [-1.55, -0.35, 0];
export const guardRightArm = (f: number): number[] => {
  const rest = guardRestArm(f / FPS);
  const reach = guardReach().arm;
  const k1 = ramp(f, at(24), at(34));
  const k2 = ramp(f, handoffFrame + 10, handoffFrame + 20);
  return rest.map((r, i) => r + (reach[i] - r) * k1 + (chestHold[i] - reach[i]) * k2);
};
export const guardState = (f: number) => ({
  yaw: guardYaw(f),
  headYaw: sample([[END - 22, 0], [END - 16, -30], [END - 2, -8]] as Key[], f), // 正 = 往左：头先往右（南）转
  headPitch: sample([[at(20), -14], [at(40), -8], [END - 20, -8], [END - 10, 2]] as Key[], f),
  pos: guardPosAt(f),
  limbSwing: guardSteps.reduce((a, [f0, f1]) => a + ramp(f, f0, f1) * 6, 0),
  stride: Math.max(...guardSteps.map(([f0, f1]) => Math.sin(Math.PI * ramp(f, f0, f1)) * 0.5)),
  rightArm: guardRightArm(f),
});

// ---------- 书拿在手上 ----------
// 书（合上的那本，书.tsx 的 ClosedBook 坐标）在屋里的变换。拿起前摊在桌上；拿起以后跟着刘心忠的右手；交书以后跟着卫兵的右臂
const liuHand = (f: number) => new THREE.Matrix4().copy(handMatrix(liuPose(f), liuHeight, 'R'));
let liuGripCache: THREE.Matrix4 | null = null;
const liuGrip = () => (liuGripCache ??= new THREE.Matrix4().copy(liuHand(pickFrame)).invert().multiply(deskBookMatrix));
const liuBookMatrix = (f: number) => (f < pickFrame ? deskBookMatrix.clone() : liuHand(Math.min(f, handoffFrame)).multiply(liuGrip()));
const guardArmWorld = (f: number) => guardWorldMatrix(f).multiply(guardRightArmMatrix(guardRightArm(f)));
let guardGripCache: THREE.Matrix4 | null = null;
const guardGrip = () => (guardGripCache ??= guardArmWorld(handoffFrame).invert().multiply(liuBookMatrix(handoffFrame)));
export const bookMatrix = (f: number): THREE.Matrix4 => (f < handoffFrame ? liuBookMatrix(f) : guardArmWorld(f).multiply(guardGrip()));
export const bookOnHand = (f: number) => f >= pickFrame;

// ---------- 镜头 ----------
export type Cam = { pos: V3; tgt: V3; lens: number; roll?: number };
const lerpCam = (a: Cam, b: Cam, k: number): Cam => ({
  pos: lerp3(a.pos, b.pos, k),
  tgt: lerp3(a.tgt, b.tgt, k),
  lens: a.lens + (b.lens - a.lens) * k,
  roll: a.roll,
});
// 书页特写：书正上方略偏西（书的上边）往下看，镜头滚转 180° 让画面上方朝西、字是正的；画面中线对着书脊，左右两页连页码整个入画，四周留一圈桌面
// （用户 10-19：机位往左、往高挪，看得清全文）。机位高、镜头长，刘心忠抬着的手离镜头近也不会大得盖住半页；手和羽毛笔从画面下方伸进来。整镜慢推一点点
const pageCenter: V3 = [bookOnDesk[0], bookOnDesk[1], guardRoom.deskTopZ + 0.04];
const pageAim: V3 = [pageCenter[0] + 0.05, pageCenter[1], pageCenter[2]]; // 画面中心比书心靠下一点，下边露出伸进来的手
const shot2aCam: Cam = { pos: [pageCenter[0] - 0.1, pageCenter[1], pageCenter[2] + 1.4], tgt: pageAim, lens: 46, roll: 180 };
const shot2bCam: Cam = { pos: [pageCenter[0] - 0.1, pageCenter[1], pageCenter[2] + 1.38], tgt: pageAim, lens: 48, roll: 180 };
// 递书：北墙下高处往南俯看，两人隔着书桌一左一右（卫兵在西、刘心忠在东），书在中间；背后是南墙。机位比两人的头高，卫兵离墙近也不会挡半个画面
const shot3aCam: Cam = { pos: [6.4, -1.25, 2.45], tgt: [6.4, -2.8, 1.0], lens: 16 };
const shot3bCam: Cam = { pos: [6.4, -1.3, 2.42], tgt: [6.4, -2.8, 1.02], lens: 16.5 };
export const localCam = (frame: number): Cam => {
  if (frame < shot2End) return lerpCam(shot2aCam, shot2bCam, ramp(frame, shot1End, shot2End));
  return lerpCam(shot3aCam, shot3bCam, ramp(frame, shot2End, END));
};
export const camAt = (frame: number): Cam => {
  if (frame < shot1End) return pitCam(frame);
  const local = localCam(frame);
  return { pos: roomToWorld(local.pos), tgt: roomToWorld(local.tgt), lens: local.lens, roll: local.roll };
};
