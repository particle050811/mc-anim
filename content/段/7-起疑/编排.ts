// 7-4-4 起疑：时间轴、机位、人的姿势，纯函数，输入帧号 f（0 起，24 帧/秒）。画面在 画面.tsx，声音在 声音.tsx。
// 戏（正篇/07-监守者之怒/脚本规划.md 7-4-4，简单版）：边城新城主乔雷夫在城主府书房读报告，手顺着字往下，停在「贼人已死于怪物之手。」那一行，攥紧，把这一页捏皱；抬头望向窗外。黑场，接第八章正文。
//   原文只有一句「他似乎隐约察觉……」，不用旁白，全靠这几个动作。
// 报告：和 7-4-3 同一本（7-4-3/书页.字.json），摊在书桌上。原版书页不会皱：右页被攥皱是 模型/物品/书.tsx 的 `crumpleAt`（网格往握点收、起褶），只为给 Seedance 看「手攥紧、纸被捏皱」；换成纸、地图之类原版物品的话见 预览/第7章/00-说明.md。
// 乔雷夫：没有设定图，只拍背影和手（模型/角色/乔雷夫.tsx：史蒂夫换深色长袖外套的占位）。坐在窗前书桌后面朝北（窗），背对镜头，坐姿同 7-4-3。
//   原版方块人的手没有手指：「手指停在那行」= 右手搭在右页正文右边的空白上、顺着往下挪、停在那一行的行尾，「攥紧」= 手往下压、往回收，纸跟着往手里收。
//   右手、右臂一直在正文右边，从正上方看不压字（用户 10-19：要看清字）。左手垂在身侧。
// 场景：模型/场景/边城室内.tsx 的 城主府书房（mcai mesh 导出），中央广场南边二楼，北窗外是广场中央的传送石碑和对面的房子。
// 镜头（坐标是书房网格本地坐标，见 边城室内.tsx：x 往东、y 往北为正（屋子在 y ≤ 0）、z 地板顶面 0）：
//   1 背影（0～镜1止）书房南头略高往前看，推近一点，交代他在屋里看东西；2 书（镜1止～镜2止）书上方往下看，两页摆正、字是正的，
//   手顺着右页边往下、停在那一行，停一拍，攥紧捏皱；3 抬头（镜2止～END）回到背后近一点，攥着纸慢慢抬头看窗外，最后 1 秒黑场。
//   用户 10-19：推近那镜太长，只留交代在屋里看书的 2 秒；原来肩后斜看书的那镜看不清字，换成正上方。
import { Key, sample } from '../../../engine/anim/anim.ts';
import type { V3 } from '../../../engine/model/parts.tsx';
import * as THREE from 'three';
import { standPose, handMatrix, type FigurePose } from '../../../world/角色/骨架.tsx';
import { reachFigure } from '../../../world/角色/手臂逆解.ts';
import { qiaoLeifuHeight } from '../../../world/角色/乔雷夫.tsx';
import { lordStudy, toTownPoint } from '../../../world/地点/边城室内.tsx';
import { borderTownPos } from '../../../world/地点/主世界116.ts';
import { guiPixel, lineY, pageHeight, pageWidth } from '../../../world/物品/书.tsx';
export { bookPages as 书页们 } from '../../场/7-收场/7-4-3/编排.ts';

export const FPS = 24;
export const shot1End = 48; // 背影 2 秒
export const shot2End = 168; // 书 5 秒
export const END = 240; // 抬头 3 秒（含最后 1 秒黑场），共 10 秒
export const blackoutStart = END - 24;

export const roomToWorld = (localPos: number[]): V3 => {
  const cityPos = toTownPoint(lordStudy, localPos);
  return [cityPos[0] + borderTownPos[0], cityPos[1] + borderTownPos[1], cityPos[2] + borderTownPos[2]];
};


// ---------- 书 ----------
// 字头朝北（乔雷夫坐在南边看是正的）。书脊中点（本地）：东西按右臂定——右臂（连袖子半宽 2.25 像素）的西侧在右页正文右边 2 个界面像素，
// 南北让「贼人已死于怪物之手。」那一行（第 3 行）落在手自然搭着的地方
export const thiefLine = 2;
export const holdFrame = 72;
const armHalf = (2.25 * qiaoLeifuHeight) / 32;
const textRight = 132; // 界面像素，正文最宽到 130
const holdTipY = -2.6;
const lineHalf = 4.5; // 一行字的半高（界面像素）
const lineAt = (k: number) => lineY(0) + k * (lineY(1) - lineY(0));
// 右页纸面最高处（摊开时往外翘 6°，在右边沿）：手搭在这上面
const pageEdgeTop = 0.008 + 0.03 + pageWidth * Math.sin((6 * Math.PI) / 180);

// ---------- 乔雷夫 ----------
const hipHeight = (12 / 32) * qiaoLeifuHeight;
// 右手末端（手臂方块下端面的下沿）读到第几行：一行行往下，停在第 3 行；攥紧时往下压、往回收（格）
const readLineKeys: Key[] = [
  [0, 0],
  [24, 1],
  [48, 1.6],
  [70, thiefLine],
];
const pressKeys: Key[] = [
  [102, 0],
  [124, 0.6],
  [156, 1],
];
const basePose = (frame: number): FigurePose => {
  const t = frame / FPS;
  const lookUp = sample([[shot2End + 10, 0], [shot2End + 50, 1]] as Key[], frame);
  return {
    // 髋抬高 2 像素，大腿（4 像素粗）下面正好贴着坐面：桌面比他肩膀低不了多少，坐低了胳膊搭不到纸面上
    ...standPose([lordStudy.chair[0], lordStudy.chair[1] + 0.2, lordStudy.chair[2] - hipHeight + (2 * qiaoLeifuHeight) / 32]),
    ground: 0,
    pitch: -8 + 4 * lookUp,
    legR: 70,
    legL: 70,
    legRRoll: -6,
    legLRoll: -6,
    headPitch: -24 + 34 * lookUp, // 低头看书，但头顶不往前探到书上方（镜2 从上面拍书）
    headYaw: 0.8 * Math.sin(t * 0.9),
    armR: 98,
    armRYaw: 0, // 手臂正朝北，整条胳膊都在右页右边沿外头
    armRRoll: 0,
    armL: 6,
    armLYaw: 0,
    armLRoll: -30,
  };
};
// 手末端下沿（手插槽坐标，像素）：手臂方块连袖子半宽 2.25、末端在插槽下 1.25（乔雷夫.tsx）。东西位置不随 armR、前倾变（armRYaw 0，手臂正朝北）
const tipSlot: V3 = [0, -2.25, -1.25];
const tipX = new THREE.Vector3(...tipSlot).applyMatrix4(handMatrix(basePose(0), qiaoLeifuHeight, 'R')).x;
export const bookOnDesk: V3 = [
  tipX - armHalf - textRight * guiPixel,
  holdTipY - pageHeight / 2 + (lineAt(thiefLine) + lineHalf) * guiPixel,
  lordStudy.deskTopZ,
];
const lineTipY = (k: number) => bookOnDesk[1] + pageHeight / 2 - (lineAt(k) + lineHalf) * guiPixel;
// 手末端下沿落到那一行、贴着纸面最高处；够不着靠前倾（上身前后挪）和抬放胳膊一起凑
export const qiaoLeifuPose = (frame: number): FigurePose => {
  if (frame >= shot2End) return reachAt(shot2End - 1, basePose(frame));
  return reachAt(frame, basePose(frame));
};
const reachAt = (handFrame: number, pose: FigurePose): FigurePose => {
  const press = sample(pressKeys, handFrame);
  const target: V3 = [tipX, lineTipY(sample(readLineKeys, handFrame)) - 0.03 * press, lordStudy.deskTopZ + pageEdgeTop + 0.008 - 0.006 * press];
  return reachFigure(pose, qiaoLeifuHeight, 'R', tipSlot, target, [['armR', 1e-4], ['pitch', 2e-3, [-16, 0]]]);
};
// 右页上攥住的点（界面像素，纸框里）：那一行的行尾、手底下
export const pageGripPt: [number, number] = [textRight + 6, lineY(thiefLine) + 4];
export const crumpleAt = (f: number) => sample([[112, 0], [156, 1]] as Key[], f);

// ---------- 镜头 ----------
export type Cam = { pos: V3; tgt: V3; lens: number; roll?: number };
const lerpCam = (a: Cam, b: Cam, k: number): Cam => ({
  pos: a.pos.map((v, i) => v + (b.pos[i] - v) * k) as V3,
  tgt: a.tgt.map((v, i) => v + (b.tgt[i] - v) * k) as V3,
  lens: a.lens + (b.lens - a.lens) * k,
  roll: a.roll,
});
const smooth = (x: number) => x * x * (3 - 2 * x);
const ramp = (f: number, f0: number, f1: number) => smooth(Math.min(1, Math.max(0, (f - f0) / (f1 - f0))));
const shot1aCam: Cam = { pos: [5.5, -7.3, 2.5], tgt: [5.5, -1.0, 1.7], lens: 26 };
const shot1bCam: Cam = { pos: [5.5, -6.2, 2.25], tgt: [5.5, -1.0, 1.6], lens: 28 };
// 书：书北半边正上方往下、稍往南看，滚 180° 让画面上方朝北、字是正的；两页和右边的手都在画面里，整镜慢推一点点。
// 他埋头看书，头伸到书南边沿上方：机位在书的北边，头在画面里落到书外头，不挡纸
const spreadAim: V3 = [bookOnDesk[0] + 0.06, bookOnDesk[1], lordStudy.deskTopZ + 0.04];
const shot2aCam: Cam = { pos: [spreadAim[0], spreadAim[1] + 0.35, spreadAim[2] + 1.4], tgt: spreadAim, lens: 44, roll: 180 };
const shot2bCam: Cam = { pos: [spreadAim[0], spreadAim[1] + 0.35, spreadAim[2] + 1.38], tgt: spreadAim, lens: 46, roll: 180 };
const shot3aCam: Cam = { pos: [5.7, -5.4, 2.0], tgt: [5.5, -1.0, 1.75], lens: 32 };
const shot3bCam: Cam = { pos: [5.7, -5.1, 1.95], tgt: [5.5, -1.0, 1.85], lens: 33 };
export const localCam = (frame: number): Cam => {
  if (frame < shot1End) return lerpCam(shot1aCam, shot1bCam, ramp(frame, 0, shot1End));
  if (frame < shot2End) return lerpCam(shot2aCam, shot2bCam, ramp(frame, shot1End, shot2End));
  return lerpCam(shot3aCam, shot3bCam, ramp(frame, shot2End, END));
};
export const camAt = (frame: number): Cam => {
  const local = localCam(frame);
  return { pos: roomToWorld(local.pos), tgt: roomToWorld(local.tgt), lens: local.lens, roll: local.roll };
};
export const blackout = (f: number) => sample([[blackoutStart, 0], [END - 4, 1]] as Key[], f);
