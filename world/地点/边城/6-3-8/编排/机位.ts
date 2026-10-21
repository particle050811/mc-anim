// 6-3-8、6-3-10 的机位：卫兵身后看坑 → 绕到两人正面 → 往后退一点看两人跳出去（跳下镜）；硬切到池子西头低处看落水（落水镜）；切到坑口。
import type { V3 } from '../../../../../engine/model/parts.tsx';
import { ss, lerp, lerp3, add, sub, norm, slerpDir, town } from './工具.ts';
import { cues } from './时间线.ts';
import { WALK, innerEdgeY, liuStand, huangStand, shaftMouth } from './站位.ts';

// ---------- 机位 ----------
export type Cam = { pos: V3; tgt: V3; lens: number };
const withDir = (pos: V3, d: V3, lens: number): Cam => ({ pos, tgt: add(pos, [d[0] * 100, d[1] * 100, d[2] * 100]), lens });
const lookDir = (c: Cam) => norm(sub(c.tgt, c.pos));
const camLerp = (a: Cam, b: Cam, k: number): Cam => withDir(lerp3(a.pos, b.pos, k), slerpDir(lookDir(a), lookDir(b), k), Math.exp(lerp(Math.log(a.lens), Math.log(b.lens), k)));
const chest = (standPos: V3, h = 1.25): V3 => add(standPos, [0, 0, h]);
const pairCenter = lerp3(chest(liuStand, 1.2), chest(huangStand, 1.2), 0.5);

// ① 卫兵身后：城墙外、比走道高 7 米多，越过 2～5 号卫兵的肩看路口的坑，卫兵在画面下半、坑在正中；慢慢往前飘
const C1a: Cam = { pos: town(44.5, 216.5, WALK + 7.6), tgt: add(shaftMouth(), [0, 0, 2]), lens: 36 };
const C1b: Cam = { pos: town(43.2, 214.6, WALK + 7.0), tgt: add(shaftMouth(), [0, 0, 1.5]), lens: 37 };
// ② 两人正面（城里半空，比走道高 1.5 米），中景；右后方是那排卫兵
const C2: Cam = { pos: town(23.0, innerEdgeY - 6.6, WALK + 1.5), tgt: pairCenter, lens: 30 };
// ③ 黄叛说话时慢慢往右推一点，把右边的卫兵也带进来
const C3: Cam = { pos: town(24.4, innerEdgeY - 5.6, WALK + 1.3), tgt: add(pairCenter, [1.6, 0, 0]), lens: 30 };
// ④ 跳下镜：出发时往后、往上退几米，城里半空比走道高 2.5 米，稍往下看墙头：两人在左边门楼旁从内沿跳出去、往下掉，卫兵从右边跑向内沿；
// 退到以后再慢慢往后飘一点
const C4a: Cam = { pos: town(22.3, 187.5, WALK + 2.5), tgt: town(25.5, innerEdgeY, WALK - 0.7), lens: 20 };
const C4b: Cam = { pos: town(22.2, 187.0, WALK + 2.6), tgt: town(25.5, innerEdgeY, WALK - 0.8), lens: 20 };
// ⑤ 落水镜：池子西头环城路上空、离地 3.5 米，顺着池子往东、稍往上看：两人先后砸进近处的水里，卫兵一个接一个从墙头掉进画面、沿池子落水，
// 两人蹚到南池沿爬上岸、朝镜头这边往西跑（从镜头底下跑出画）；整镜慢慢往右下摇一点跟着上岸
const C5a: Cam = { pos: town(15.5, 190.4, 3.7), tgt: town(34, 196, 5.5), lens: 20 };
const C5b: Cam = { pos: town(15.3, 190.2, 3.8), tgt: town(33, 195, 4.4), lens: 20 };
// ⑥ 坑口：路口南边、坑沿外、离地 8 米往北看，坑在画面下半，城门大街一直往北伸到北城墙；两人起跳时镜头往下压，看他们掉进竖井
const C10a: Cam = { pos: add(shaftMouth(), [2.6, -11.5, 8.2]), tgt: add(shaftMouth(), [-0.4, 16.0, 0.6]), lens: 24 };
const C10b: Cam = { pos: add(shaftMouth(), [2.2, -10.2, 7.6]), tgt: add(shaftMouth(), [-0.4, 2.0, -2.4]), lens: 25 };

// 绕到两人正面：以两人中间为圆心，方向按球面插值、距离按对数插值（从卫兵身后越过走道、绕到城里一侧），视线从坑转到两人
const orbit = (k: number): Cam => {
  const o0 = sub(C1b.pos, pairCenter);
  const o1 = sub(C2.pos, pairCenter);
  const dir = slerpDir(norm(o0), norm(o1), k);
  const radius = Math.exp(lerp(Math.log(Math.hypot(...o0)), Math.log(Math.hypot(...o1)), k));
  const pos = add(pairCenter, [dir[0] * radius, dir[1] * radius, dir[2] * radius + 2.5 * Math.sin(Math.PI * k)]);
  const look = slerpDir(lookDir(C1b), norm(sub(pairCenter, pos)), ss(k / 0.55));
  return withDir(pos, look, Math.exp(lerp(Math.log(C1b.lens), Math.log(C2.lens), k)));
};
// 关键机位（编排秒 → 机位），相邻两个之间缓进缓出；绕 那一段单独算（见上）；落水镜、切坑 那一刻硬切
const buildCamKeys = (): [number, Cam][] => {
  const cue = cues;
  return [
    [0, C1a],
    [cue.绕[0], C1b],
    [cue.绕[1], C2],
    [cue.出发 - 0.1, C3],
    [cue.刘起跳 + 0.4, C4a],
    [cue.跳切, C4b],
  ];
};
const camKeys = buildCamKeys();
export const camPose = (t: number): Cam => {
  const cue = cues;
  if (t >= cue.切坑) return camLerp(C10a, C10b, ss((t - cue.切坑 - 0.3) / (cue.黄入井 - cue.切坑)));
  if (t >= cue.落水镜) return camLerp(C5a, C5b, ss((t - cue.落水镜) / (cue.切坑 - cue.落水镜)));
  if (t >= cue.绕[0] && t < cue.绕[1]) return orbit(ss((t - cue.绕[0]) / (cue.绕[1] - cue.绕[0])));
  for (let i = 1; i < camKeys.length; i++) {
    const [t0, camA] = camKeys[i - 1];
    const [t1, camB] = camKeys[i];
    if (t < t1) return camLerp(camA, camB, ss((t - t0) / (t1 - t0)));
  }
  return camKeys[camKeys.length - 1][1];
};
