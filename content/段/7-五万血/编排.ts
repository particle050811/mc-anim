// 7-2-1 五万血：机位和本段时刻，纯函数，输入段内帧 f（0 起，24 帧/秒）。戏在 ../7-2/戏.ts，地理在 ../7-2/几何.ts。
// 戏：李樱站在场子西边屋顶 V 的羊毛上（离地 8 格），开场就背对镜头望着 55～90 米外火把光中的监守者（不演转过去，用户 10-19 定）；他眼里的 Jade 显出它的血，看到就喊「五万血？！这我打个集贸啊！」（画外音），
//   说完切回他，转回身往 #240 强者跳，起跳时说「溜了溜了」。远景是第 1 场同一刻（../7-2/戏.ts 的 `远景t`，用户 10-19 定）。
// 两镜硬切（机位都核过在空气里）：
//   Jade（他望过去的方向、准星即画面正中对着监守者，从他眼睛往那边推近、抬高，顶上出 Jade 信息框，引线从它头顶连到框上，见 `jade()`）；
//   3 跳（正前偏右 2.3 米，35mm 稍俯；他转回身就往后上退开、跟着他蹲、跳，到落地后 0.1 秒段尾，下一段切开箱）。
// 他背对镜头站着远望的镜 1 用户 10-20 删了（「意义不明」），段首就是镜 Jade。
import type { V3 } from '../../../engine/model/parts.tsx';
import type { Cam } from '../../../world/地点/古城4x/6-4-1/古城画面.tsx';
import { FPS } from '../../../world/地点/古城4x/6-4-1/古城戏.ts';
import * as geom from '../../场/7-李樱撤离/7-2/几何.ts';
import * as timeline from '../../场/7-李樱撤离/7-2/时间线.ts';
import * as play from '../../场/7-李樱撤离/7-2/戏.ts';
import * as K71 from '../../../world/地点/古城4x/7-1/戏.ts';

export { FPS };
export const 段起 = timeline.segmentStartFrame['7-2-1'];
export const 帧数 = timeline.frameCountOf('7-2-1');
export const sf = (f: number) => 段起 + f; // 场内帧

// ---------- 台词 ----------
// 开口帧（段内）：五万血在镜 Jade 里，他不在画面上（画外音）；溜了在镜 3 起跳那一刻
export const 五万血开口帧 = Math.round(timeline.fiftyKHpLineT * FPS);
export const 溜了开口帧 = Math.round(timeline.slipLineT * FPS);
export const 台词: { id: string; 帧: number; text: string; estDuration: number }[] = [
  { id: '7-2-1-李樱-五万血', 帧: 五万血开口帧, text: '五万血？！这我打个集贸啊！', estDuration: timeline.fiftyKHpLineDur },
  { id: '7-2-1-李樱-溜了', 帧: 溜了开口帧, text: '溜了溜了。', estDuration: timeline.slipLineDur },
];

// ---------- 机位 ----------
const feet = geom.roofFeet;
const head: V3 = [feet[0], feet[1], feet[2] + 1.62];
// 往西（远景）的水平单位向量、它的右手边（北）
export const dW = (() => {
  const dx = geom.wideShotCenter[0] - feet[0];
  const dy = geom.wideShotCenter[1] - feet[1];
  const norm = Math.hypot(dx, dy);
  return [dx / norm, dy / norm];
})();
const rW = [dW[1], -dW[0]];
const addOffset = (point: number[], ...vs: [number[], number][]): V3 => {
  const out = [point[0], point[1], point[2]];
  for (const [vec, k] of vs) for (let i = 0; i < vec.length; i++) out[i] += vec[i] * k;
  return out as V3;
};

export const 镜Jade止 = Math.round(timeline.jadeShotEndSec * FPS);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const ss = (x: number) => {
  const clamped = Math.min(1, Math.max(0, x));
  return clamped * clamped * (3 - 2 * clamped);
};

const shot3Start: Cam = { pos: addOffset(head, [dW, 2.2], [rW, 0.7], [[0, 0, 1], 1.0]), tgt: [head[0], head[1], head[2] - 0.35], lens: 35 };

// ---------- 镜 Jade ----------
// 李樱望过去（用户 10-19：要是他的观察，机位就从他那边来；这一镜不画他），准星（画面正中）对着监守者胸口，取前 6 帧的平均跟着它。
// 用户 10-20 要「更贴近一点、适当抬高，看清监守者」：机位从他眼睛顺着望过去的方向往前推 `jadeForward` 米、抬高 `jadeRise` 米，镜头里慢慢再推近一点（黄叛两支风矢从画外射进来钉上它）。
// Jade 照原版只显示准星对着的实体；原版射线只到交互距离，55 米外照规矩不显示，这里照原文「远远看见那监守者磅礴的血量」显示（等于把 Jade 的射线距离调大）。
export const 远景t = (frame: number) => play.远景t(sf(frame)); // 第 1 场的场时刻
const wardenChestAt = (t: number): V3 => {
  const p = K71.wardenState(t).p;
  return [p[0], p[1], p[2] + 1.9];
};
// 他望过去的水平方向（段首监守者胸口）
const dJade = (() => {
  const p = wardenChestAt(远景t(0));
  const norm = Math.hypot(p[0] - head[0], p[1] - head[1]);
  return [(p[0] - head[0]) / norm, (p[1] - head[1]) / norm];
})();
const jadeForward = [20, 23];
const jadeRise = 6;
const jadeLens = [100, 115];
const jadeCamera = (frame: number): Cam => {
  const samples = [0, 2, 4, 6].map((d) => wardenChestAt(远景t(Math.max(0, frame - d))));
  const tgt = [0, 1, 2].map((i) => samples.reduce((acc, p) => acc + p[i], 0) / samples.length) as V3;
  const k = ss(frame / (镜Jade止 - 1));
  return { pos: addOffset(head, [dJade, lerp(jadeForward[0], jadeForward[1], k)], [[0, 0, 1], jadeRise]), tgt, lens: lerp(jadeLens[0], jadeLens[1], k) };
};
// 监守者的血：第 1 场命中表（../7-1/戏/伤害.ts）按这一刻算，镜 Jade 里风矢打中它，框里的数跟着掉
export const 监守者血 = (frame: number) => ({ max: K71.wardenMaxHp, now: K71.wardenHpAt(远景t(frame)) });
// Jade 界面：引线从监守者头顶往上长（0.3 秒），够到框时框出来（Jade 自己约 2 帧淡入）。点：头顶（站直 3.125 格，见 模型/角色/监守者.tsx），场景坐标
export const jade = (frame: number): { 点: V3; 线: number; 框: number } | null => {
  if (frame >= 镜Jade止) return null;
  const sec = frame / FPS;
  const lineK = Math.min(1, Math.max(0, (sec - timeline.jadeLineSec) / 0.3));
  const boxK = Math.min(1, Math.max(0, (sec - timeline.jadeLineSec - 0.3) * FPS * 0.5 + 0.5));
  const p = K71.wardenState(远景t(frame)).p;
  return { 点: [p[0], p[1], p[2] + 3.125], 线: lineK, 框: lineK < 1 ? 0 : boxK };
};

// ---------- 镜 3 ----------
// 他转回身之前机位不动；一转身就往后、往上退开（往远景那边 1.5 米、上 0.3 格；再高碰洞顶），免得蹲、跳时挤满画面，
// 目标从他的头过渡到跟着他的身子（脚底往上 1 格，取前 4 帧抹平一点，镜头跟人稍滞后），起跳后焦距从 35mm 松到 32mm
const bodyAt = (scf: number): V3 => {
  const loc = play.李樱(scf).pose.loc;
  return [loc[0], loc[1], loc[2] + 1.0];
};
const shot3Camera = (frame: number): Cam => {
  const scf = sf(frame);
  const sec = scf / FPS;
  const blend = ss((sec - timeline.turnBackStart) / 0.5);
  const samples = [0, 2, 4].map((d) => bodyAt(Math.max(sf(镜Jade止), scf - d)));
  const followTarget = [0, 1, 2].map((i) => (samples[0][i] + samples[1][i] + samples[2][i]) / 3);
  const retreat = ss((sec - timeline.turnBackStart) / 0.8);
  const pos = addOffset(shot3Start.pos, [dW, 1.5 * retreat], [[0, 0, 1], 0.3 * retreat]);
  const tgt = shot3Start.tgt.map((v, i) => lerp(v, followTarget[i], blend)) as V3;
  return { pos, tgt, lens: lerp(shot3Start.lens, 32, ss((sec - timeline.takeoffSec) / 0.8)) };
};

export const camera = (frame: number): Cam => {
  if (frame < 镜Jade止) return jadeCamera(frame);
  return shot3Camera(frame);
};
