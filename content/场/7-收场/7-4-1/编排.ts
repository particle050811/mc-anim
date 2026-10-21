// 7-4-1 风筝的剪辑：每圈取 戏.ts 剧情时间轴 T 上它跑西环道、马抄近路那一截（每一下挨打都在里面，伤害数字层逐下出数字），镜头之间硬切、剧情往后跳；机位，台词。
// 输入本段帧号 f（0 起，24 帧/秒）。戏全在 戏.ts，地理在 几何.ts；画面在 画面.tsx，声音在 声音.tsx，伤害数字在 伤害数字层.tsx。
// 台词（刘心忠得意的自言自语，配音 src/配音/7-4-1-刘心忠-风筝.wav 有声 8.09 秒）：四个分句起音（silencedetect 量的停顿，`clauseStartSecs`）。
// 镜头：1 西南角上空大全景（马从西环道一跃上岛南头台面、它只能顺环道绕过西南角，读得出谁抄近路谁绕远路）；2 台面西头上空看西环道（马朝镜头冲来、回身两炮、跃过镜头旁，音爆打在马身后）；
//   3 传送门顶上黄叛头顶往下看西环道（一串风矢）；4 西南角上空顺西环道往北（它迎着镜头冲来，挨炮挨箭，音爆）；5a 跟着它往后退的跟拍（最后一箭、倒下）；
//   5b 台面西南上空（马勒停在台面上，转过来看它倒下的地方）。7-3-3 → 本段、本段 → 7-4-2 都是硬切（7-4-2 接着本段末帧之后的剧情时刻往下演）。
import type { V3 } from '../../../../engine/model/parts.tsx';
import type { FigurePose } from '../../../../world/角色/骨架.tsx';
import { G4, toGame4 } from '../../../../world/地点/古城4x.tsx';
import type { Cam } from '../../../../world/地点/古城4x/6-4-1/古城画面.tsx';
import * as play from './戏.ts';
import * as chase from './追逐.ts';
import * as geom from './几何.ts';

export const FPS = play.FPS;
const ss = (x: number) => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};
const lerpV = (a: V3, b: V3, k: number): V3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const add = (a: V3, b: number[]): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

// ---------- 台词 ----------
const clauses = ['我是一名机技境法师，', '现在有一个五万血的怪物想抓我，', '但我丝毫不慌，', '因为它的脚步没我的魔力化马来得快。'];
export const lineStartFrame = 12;
const clauseStartSecs = [0, 1.83, 4.42, 5.5];
export const clauseStartFrames: number[] = clauseStartSecs.map((t) => lineStartFrame + Math.round(t * FPS));
export const lineEndFrame = lineStartFrame + Math.ceil(8.09 * FPS);
export const lines = [{ id: '7-4-1-刘心忠-风筝', 角色: '刘心忠', 文: clauses.join(''), 开口帧: lineStartFrame }];

// ---------- 镜头：起帧、取剧情时间轴上从哪一刻开始 ----------
// 成片第 n 圈（0 起，从 戏.ts 的 firstLap 算）它拐过西北角（进西环道）那一刻；各镜都从这一刻前一点开始，到这一圈最后一下挨打以后
const lapT = (n: number) => chase.wardenTAt(chase.wardenLapS(play.firstLap + n, 0));
const wardenChestAt = (T: number) => add(play.wardenState(T).p, [0, 0, 1.6]);
const horseAt = (T: number) => play.horseState(T).p;
// 它脚下在环道上的程（死后算滑出去的那一截）
const wardenLaneS = (T: number) => {
  const p = toGame4(play.wardenState(T).p);
  const s0 = chase.wardenS(Math.min(T, play.deathT));
  let best = s0;
  for (let d = 0; d <= 5; d += 0.05) {
    const q = geom.wardenLoop.at(s0 + d);
    const b = geom.wardenLoop.at(best);
    if (Math.hypot(q[0] - p[0], q[1] - p[2]) < Math.hypot(b[0] - p[0], b[1] - p[2])) best = s0 + d;
  }
  return best;
};
type Shot = { 起帧: number; 起T: number; cam: (T: number, k: number) => Cam };
const shots: Shot[] = [
  {
    // 西南角正上方（比环道高 21 格，再往外是洞壁）往东北俯看：西环道、岛南头台面、南环道、门顶上的黄叛一个画面
    起帧: 0,
    起T: lapT(0) - 0.2,
    cam: (T, k) => ({ pos: G4(-747.5 + 0.8 * k, -25.0, 277.5 - 0.5 * k), tgt: G4(-732.0, -44.0, 253.0), lens: 18 }),
  },
  {
    // 台面西头上空（比台面高 15 格，再低就隔着岛上的墙看不到西环道北半截）往西北看西环道：马朝镜头冲来、刘心忠回身放两炮，马一跃从镜头左边落上台面，镜头跟着马转过来
    起帧: 48,
    起T: lapT(1) - 0.2,
    cam: (T) => {
      const h = add(horseAt(T), [0, 0, 1.6]);
      const lane = G4(-745.0, -44.5, 236.0);
      const k = ss((T - chase.takeoffT(play.firstLap + 1) + 0.05) / 0.45);
      return { pos: G4(-727.0, -27.5, 265.5), tgt: lerpV(lerpV(lane, h, 0.45), h, 0.8 * k), lens: 20 };
    },
  },
  {
    // 传送门顶上、黄叛身后头顶上 4 格往西俯看：近处黄叛拉弓、鼓风机，一串风矢扎进西环道上的它，台面在左边
    起帧: 80,
    起T: lapT(2) - 0.15,
    cam: (T, k) => ({ pos: G4(-720.5, -15.5, 242.5), tgt: G4(-733.0, -35.0, 242.5 + 1.0 * k), lens: 16 }),
  },
  {
    // 西南角上空（比环道高 9 格）往北顺着西环道看：它迎着镜头冲来，马在它前头跑、回身放炮，一跃从右边上台面，它蓄好的音爆往右上打空
    起帧: 111,
    起T: lapT(3) - 0.1,
    cam: () => ({ pos: G4(-745.5, -37.0, 281.0), tgt: G4(-742.5, -44.0, 250.0), lens: 18 }),
  },
  {
    // 跟拍：在它前头 8 米、高 3 格、贴环道外沿（里沿一排石阶栏）往后退着拍它的脸，最后一箭打穿它倒下滑过来，镜头跟着刹住
    起帧: 141,
    起T: lapT(4) - 0.02,
    cam: (T) => {
      const s = wardenLaneS(T) + 8;
      const [x, z] = geom.wardenLoop.at(s);
      return { pos: G4(x - 0.3, -42.8, z), tgt: wardenChestAt(T), lens: 22 };
    },
  },
  {
    // 台面西南上空：右边台面上马勒停、转过来朝着它倒下的地方，左边远处西环道上它倒着、白烟散开，门顶上黄叛放下弓
    起帧: 178,
    起T: lapT(4) - 0.02 + (178 - 141) / FPS,
    cam: (T, k) => ({ pos: lerpV(G4(-732.5, -34.0, 269.0), G4(-732.0, -34.3, 268.4), ss(k)), tgt: G4(-727.0, -40.0, 250.0), lens: 16 }),
  },
];
export const END = 210;
export const shotCount = shots.length;
// 镜号 1～6
export const shotIndex = (f: number) => shots.filter((s) => f >= s.起帧).length;
const shotOf = (f: number) => shots[shotIndex(f) - 1];
export const shotStartFrame = (k: number) => shots[k - 1].起帧;
export const shotEndFrame = (k: number) => (k < shots.length ? shots[k].起帧 : END);
export const shotStartT = (k: number) => shots[k - 1].起T;
export const storyT = (f: number) => {
  const s = shotOf(f);
  return s.起T + (f - s.起帧) / FPS;
};
// 剧情时刻 T 在镜 k 里是哪一帧（不在这个镜头那一截里就是 undefined）
export const frameInShot = (k: number, T: number) => {
  const f = shotStartFrame(k) + (T - shotStartT(k)) * FPS;
  return f >= shotStartFrame(k) && f < shotEndFrame(k) ? f : undefined;
};
export const camera = (f: number): Cam => {
  const k = shotIndex(f);
  const s = shots[k - 1];
  return s.cam(storyT(f), (f - s.起帧) / Math.max(1, shotEndFrame(k) - 1 - s.起帧));
};
// 每一下挨打都得落在某个镜头那一截里（伤害数字层逐下出数字，用户 10-19：算进血里的每一下都要看得到）
for (const h of play.hits) {
  if (!Array.from({ length: shots.length }, (_, i) => frameInShot(i + 1, h.T)).some((f) => f !== undefined && f < shotEndFrame(shotIndex(Math.floor(f))) - 6))
    throw new Error(`${h.kind} ${h.T.toFixed(2)} 秒那一下没进任何镜头（或离切点不到 6 帧）`);
}

// ---------- 人、马、怪（剧情时刻的状态在 戏.ts） ----------
export const horseState = play.horseState;
export const wardenState = play.wardenState;
export const huangPanState = play.huangPanState;
export const liuXinzhongPose = (f: number): FigurePose => play.liuXinzhongPose(storyT(f));
