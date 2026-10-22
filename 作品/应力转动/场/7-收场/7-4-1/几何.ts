// 第 7 章第 4 场 7-4-1 风筝、7-4-2 又一只共用的地理常量。坐标同第六章古城：场景 (x, y, z) = (游戏 x + 720, 240 − 游戏 z, 游戏 y + 50)，Z 朝上、北 = +Y。
// 地点：城心大院。中间是传送门「岛」（游戏 x −737～−712、z 216～264，监守者上不去），岛外一圈低一截的壕，壕外一圈 2 格宽的环道（比壕高 4 格、两边是垛和柱子）。
// 拉扯（用户 10-19：跑的人挑近路、监守者绕远路，马一直往前、不来回）：两个都在环道上逆时针兜圈，马到西南角之前从西环道跃上岛南头的台面、横穿过去再跃下东环道，
//   监守者上不了岛，只能顺环道绕西南角、南环道、东南角（77 米对马的 45 米）。马一圈 177 米、监守者 212 米，按 50、60 米/秒差不多一样快：
//   它在东、北、西三边一路追近，到起跳那一刻只差 10～12 米，马一跃又拉开到 25 米以上（工具/古城4x布局/方块.py 逐格查过：环道一圈监守者走得通，岛上不去；两跳身子不撞）。
// 高度表（`高度.json`）是 方块.py 沿两条路每 0.5 米取足迹里最高的能站面（rel = 脚底 y + 51），马足迹 1.4 格、监守者 0.9 格，头顶都留 3 格。
// 7-3-3 → 7-4-1 硬切（马顺大道回城心、从西北角跃上西环道不演，布局的 回城心 末点就在西环道上）。
import type { V3 } from '@engine/model/parts.tsx';
import { toScene } from '../../../地点/古城4x/6-4-1/古城戏.ts';
import { chest742, huangPanPortal741 } from '../../../地点/古城4x/布局.ts';
import heights资产 from 'asset:数据/镜头/7-4-1/高度';
const heights = heights资产 as unknown as { 步: number; 马: number[]; 监守者: number[] };

export const FPS = 24;
export const relY = (rel: number) => rel - 51;

// ---------- 一圈路：拐点（游戏 x, z）+ 拐角磨圆的半径，闭合；程 s 从第 0 个拐点起顺着走 ----------
type Seg = { kind: 'line'; a: [number, number]; b: [number, number]; len: number } | { kind: 'arc'; c: [number, number]; r: number; a0: number; da: number; len: number };
export type Loop = { len: number; at: (s: number) => [number, number]; heading: (s: number) => [number, number]; marks: number[] };
const buildLoop = (pts: [number, number][], radii: number[]): Loop => {
  const n = pts.length;
  const segs: Seg[] = [];
  const marks: number[] = []; // 各拐点（圆弧中点）的程
  // 每个拐点：进、出两条边的单位向量，切点
  const corners = pts.map((p, i) => {
    const prev = pts[(i - 1 + n) % n];
    const next = pts[(i + 1) % n];
    const din = [p[0] - prev[0], p[1] - prev[1]];
    const dout = [next[0] - p[0], next[1] - p[1]];
    const lin = Math.hypot(din[0], din[1]);
    const lout = Math.hypot(dout[0], dout[1]);
    const u: [number, number] = [din[0] / lin, din[1] / lin];
    const v: [number, number] = [dout[0] / lout, dout[1] / lout];
    const turn = Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]);
    const r = radii[i];
    const t = r * Math.tan(Math.abs(turn) / 2);
    const enter: [number, number] = [p[0] - u[0] * t, p[1] - u[1] * t];
    const exit: [number, number] = [p[0] + v[0] * t, p[1] + v[1] * t];
    // 圆心在转向那一侧
    const side = Math.sign(turn) || 1;
    const c: [number, number] = [enter[0] - u[1] * r * side, enter[1] + u[0] * r * side];
    return { enter, exit, c, r, turn, a0: Math.atan2(enter[1] - c[1], enter[0] - c[0]) };
  });
  let total = 0;
  for (let i = 0; i < n; i++) {
    const k = corners[i];
    const arcLen = k.r * Math.abs(k.turn);
    marks.push(total + arcLen / 2);
    segs.push({ kind: 'arc', c: k.c, r: k.r, a0: k.a0, da: k.turn, len: arcLen });
    total += arcLen;
    const nxt = corners[(i + 1) % n];
    const len = Math.hypot(nxt.enter[0] - k.exit[0], nxt.enter[1] - k.exit[1]);
    segs.push({ kind: 'line', a: k.exit, b: nxt.enter, len });
    total += len;
  }
  // 程从第 0 个拐点的圆弧中点起算
  const offset = marks[0];
  const find = (s: number) => {
    let c = (((s + offset) % total) + total) % total;
    for (const seg of segs) {
      if (c <= seg.len || seg === segs[segs.length - 1]) return { seg, c: Math.min(c, seg.len) };
      c -= seg.len;
    }
    throw new Error('unreachable');
  };
  const at = (s: number): [number, number] => {
    const { seg, c } = find(s);
    if (seg.kind === 'line') return [seg.a[0] + ((seg.b[0] - seg.a[0]) * c) / seg.len, seg.a[1] + ((seg.b[1] - seg.a[1]) * c) / seg.len];
    const ang = seg.a0 + (seg.da * c) / Math.max(seg.len, 1e-9);
    return [seg.c[0] + seg.r * Math.cos(ang), seg.c[1] + seg.r * Math.sin(ang)];
  };
  const heading = (s: number): [number, number] => {
    const a = at(s - 0.05);
    const b = at(s + 0.05);
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  };
  return { len: total, at, heading, marks: marks.map((m) => m - offset) };
};

// ---------- 环道（监守者那一圈）：四边走道的中线，西 x −745、东 −703、北 z 208、南 273 ----------
export const ringW = -745.0;
export const ringE = -703.0;
export const ringN = 208.0;
export const ringS = 273.0;
// 西北角起，往南（逆时针：西边往南、南边往东、东边往北、北边往西）
export const wardenLoop = buildLoop(
  [
    [ringW, ringN],
    [ringW, ringS],
    [ringE, ringS],
    [ringE, ringN],
  ],
  [1.0, 1.0, 1.0, 1.0],
);

// ---------- 马那一圈：西北角往南，西环道 z 248 起跳 → 岛南头台面（高 8，z 259～260 那两行，x −729～−717）→ 台面东头起跳 → 落东环道 z 259.5 → 往北、北环道往西 ----------
// 台面北边一行（z 258）和东头（x −716）高一格，起跳点留开；起跳前西环道 z 249～255 是下壕的台阶口（低 1～2 格），所以在 248 就跳。
export const takeoffW: [number, number] = [ringW, 248.0];
export const plinthW: [number, number] = [-728.5, 260.0];
export const plinthE: [number, number] = [-719.5, 260.0];
export const landingE: [number, number] = [ringE, 259.5];
export const horseLoop = buildLoop([[ringW, ringN], takeoffW, plinthW, plinthE, landingE, [ringE, ringN]], [1.2, 2.0, 2.0, 2.0, 2.0, 1.2]);
// 各拐点的程（马那一圈）
export const horseMarks = {
  起跳: horseLoop.marks[1],
  上台: horseLoop.marks[2],
  台东: horseLoop.marks[3],
  落环: horseLoop.marks[4],
};
// 两跳：脚底 rel 从 5 → 8（上台）、8 → 5（下环道），最高点比高的那头高 `apex`（方块.py 查过 1.5～3 都不撞；落地时后蹄擦过东环道里沿那一格矮垛）
export const leaps = [
  { s0: horseMarks.起跳, s1: horseMarks.上台, rel0: 5, rel1: 8, apex: 1.8 },
  { s0: horseMarks.台东, s1: horseMarks.落环, rel0: 8, rel1: 5, apex: 2.2 },
];

// ---------- 高度表：每 0.5 米一个 rel，平滑同老版（先在前后 reach 米取最高，再前后 radius 米取平均） ----------
const smoothTable = (table: number[], step: number, reach: number, radius: number, loopLen: number) => {
  const raw = (u: number) => {
    const i = Math.round((((u % loopLen) + loopLen) % loopLen) / step);
    return table[Math.min(table.length - 1, Math.max(0, i))];
  };
  const dilated = (u: number) => {
    let m = -Infinity;
    for (let v = u - reach; v <= u + reach + 1e-9; v += step / 2) m = Math.max(m, raw(v));
    return m;
  };
  return (s: number) => {
    const n = 10;
    let sum = 0;
    for (let j = 0; j <= n; j++) sum += dilated(s - radius + (2 * radius * j) / n);
    return sum / (n + 1);
  };
};
const horseRelTable = smoothTable(heights.马, heights.步, 0.75, 0.75, horseLoop.len);
export const wardenRelAt = smoothTable(heights.监守者, heights.步, 1.5, 0.8, wardenLoop.len);
const wrap = (s: number, len: number) => ((s % len) + len) % len;
// 马脚底 rel：跳的那两截按抛物线（最高点在两头之间按高低差摆），其余查表
export const horseRelAt = (s: number) => {
  const u = wrap(s, horseLoop.len);
  for (const l of leaps) {
    if (u >= l.s0 && u <= l.s1) {
      const top = Math.max(l.rel0, l.rel1) + l.apex;
      const r0 = Math.sqrt(top - l.rel0);
      const r1 = Math.sqrt(top - l.rel1);
      const kTop = r0 / (r0 + r1);
      const k = (u - l.s0) / (l.s1 - l.s0);
      return top - (r0 + r1) ** 2 * (k - kTop) ** 2;
    }
  }
  return horseRelTable(u);
};
export const inLeap = (s: number) => {
  const u = wrap(s, horseLoop.len);
  return leaps.findIndex((l) => u >= l.s0 && u <= l.s1);
};
export const horseGame = (s: number): V3 => {
  const [x, z] = horseLoop.at(s);
  return [x, relY(horseRelAt(s)), z];
};
export const wardenGame = (s: number): V3 => {
  const [x, z] = wardenLoop.at(s);
  return [x, relY(wardenRelAt(wrap(s, wardenLoop.len))), z];
};

// ---------- 黄叛：传送门顶上西沿（比环道高 25 格，西环道整条都看得见、箭路不挡，见 古城4x布局/第7章.ts） ----------
export const huangSpot = huangPanPortal741;

// ---------- 7-4-2 的战利品箱（北墙外石龛 #213） ----------
// 7-4-2 开箱那一场是硬切过去的（二人下了岛、出北墙走到石龛不演）：
//   幽灵马：龛里东半边（游戏 (-707.5, -49, 200.5)），马头朝箱子；刘心忠在马上探身开箱。黄叛：马的北边（游戏 (-706.5, -49, 197.2)）。
// 石龛在北墙外 9 格（游戏 x −713～−705、z 193～202，地台 y −50、站立面 −49），龛里一只箱子 (-712, -49, 198) 朝东，古城4x画布里已换成 Lootr 战利品箱（#213）。
// 箱子东边 2～3 格：感测体 (-711,-49,196)、(-709,-49,197)、(-709,-49,198)，尖啸体 (-708,-49,198)、(-709,-49,199)（读自片场存档）。
export const chest = { 号: chest742.号, block: [...chest742.block] as V3 };
export const sensors: V3[] = [
  [-711, -49, 196],
  [-709, -49, 197],
  [-709, -49, 198],
];
export const shriekers: V3[] = [
  [-708, -49, 198],
  [-709, -49, 199],
];
export const horseChestSpot: V3 = toScene(-707.5, -49, 200.5);
export const huangPanChestSpot: V3 = toScene(-706.5, -49, 197.2);
