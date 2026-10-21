// 站位（房间本地坐标）：桌子、桌上的东西、手里东西的握持点、接 6-4 首帧的人和指南针，以及走路的路线和距离曲线。
import { BASE } from '../../../../../world/地点/基地工坊.tsx';
import * as K624 from '../../6-2-4/编排.ts';
import { WalkPath } from '../动作.ts';
import { cues } from './时间线.ts';

export const LY_H = 1.875; // 李樱身高（格），同 李樱.tsx

// ---------- 站位（房间本地坐标） ----------
export const tableSpot: number[] = [2.0, -3.28, 0]; // 桌子南边（桌子 x 1～3、y -3～-2，桌面 z = 1），面朝北
const LOOT_SIZE = 0.5; // 同 基地工坊.tsx 里桌上战利品的大小
export const LOOT_FACE = [-0.15, 1]; // 同 基地工坊.tsx 的默认 物品朝向
export const COMPASS_SIZE = 0.38; // 同 6-2-4
// 平放在桌子东南角（李樱右手边）。背面贴着桌面（指南针的背面一直在物品空间 z = -1/32，加厚只往正面长）。
// 表壳加厚到 4/16 格以后，6-2-1 放下毛皮那一下毛皮的角擦进表圈顶 1.3 厘米，所以 x 往东挪了 2 厘米（放下时离毛皮最近 0.2 厘米）
export const COMPASS_ON_TABLE: number[] = [2.74, -2.74, 1 + COMPASS_SIZE / 32 + 0.003];
export const J0: number[] = [-1.2, -5.9, 0]; // 九胡在南窗边看海（窗玻璃内面 y = -7）
export const F624 = 0; // 6-2-4 的第 0 帧
export const LY_END = K624.liyingOnFoot(F624)!;
export const JH_END = K624.jiuhuOnFoot(F624)!;
export const CP_END = K624.compass(F624)!;
// 手里的东西相对握持点的位置（房间坐标的偏移）：战利品握在下半截，指南针平托在拳头上。
// 指南针托高 9 厘米（z 0.195，表壳背面刚好在前臂上面）：表壳是 4/16 格厚的立体模型，手不托高的话右前臂会从表盘里戳出来（试过手放低：手越低前臂越竖，反而更高）。
// 托高以后表壳靠身子那边顶进低着的头（下巴、护目镜），所以再往北（朝俯拍机位）挪 3 厘米、放低 0.8 厘米（y 0.06 → 0.09，z 0.195 → 0.187），加上 `holdCompass` 的低头 −24°（见 李樱.ts 的 `poses`），
// 头离表圈 0.8 厘米、毛皮离表壳 1.2 厘米、前臂离背面 2 厘米（往北只能挪一点：北边 2.2 厘米就是桌上立着的毛皮）。拿李樱模型真实的面逐帧核过。
// 拿起来那 0.3 秒（段内 152～160 帧）和刚端起来的 161～163 帧手、下巴还会擦过表壳，那几帧是中景、手盖着指南针，没改。低头 −24° 用户 10-11 定不改。
export const LOOT_GRIP = [0, 0.04, 0.14];
export const COMPASS_GRIP = [-0.03, 0.09, 0.187];
export const lootTable = (k: '炽热的血' | '雪怪首领毛皮') => {
  const lootPos = BASE.loot[k];
  return [lootPos[0], lootPos[1], lootPos[2] + LOOT_SIZE / 2 + 0.01];
};
export const sub = (a: number[], b: number[]) => a.map((v, i) => v - b[i]);
export const add = (a: number[], b: number[]) => a.map((v, i) => v + b[i]);

// 李樱路线：6-2-1 从东边（画面左边）走进来；6-2-3 绕过桌子西头走到屋子中间（6-2-4 首帧的站位）
export const enter = new WalkPath([[4.6, -4.25, 0], [3.3, -3.75, 0], tableSpot]);
export const exitPath = new WalkPath([tableSpot, [0.45, -3.22, 0], [0.5, -0.7, 0], LY_END.loc]);
// 九胡路线：从南窗边小跑到屋子中间（6-2-4 首帧的站位）
export const jiuhuPath = new WalkPath([J0, [-1.05, -3.3, 0], JH_END.pose.loc]);

// 三段路怎么走（trip 的参数：起、止秒、加减速秒、一开始就在走），liying / jiuhu 和 声音.tsx 的脚步共用
export const walkPlans = {
  enter: [0, cues.atTable, 0.7, true] as const,
  exit: [cues.walk[0], cues.walk[1], 0.6, false] as const,
  jiuhu: [cues.jiuhuWalk[0], cues.jiuhuWalk[1], 0.5, false] as const,
};
// 走路的距离曲线：起步加速、匀速、减速停稳（ta：加减速各用多少秒；start0：一开始就在走，不加速）
export const trip = (t: number, t0: number, t1: number, length: number, ta: number, start0 = false) => {
  const duration = t1 - t0;
  const elapsed = Math.min(duration, Math.max(0, t - t0));
  const a0 = start0 ? 0 : ta;
  const cruiseSpeed = length / (duration - (a0 + ta) / 2);
  let dist: number;
  if (elapsed < a0) dist = (cruiseSpeed * elapsed * elapsed) / (2 * a0);
  else if (elapsed < duration - ta) dist = cruiseSpeed * (elapsed - a0 / 2);
  else {
    const remain = duration - elapsed;
    dist = length - (cruiseSpeed * remain * remain) / (2 * ta);
  }
  const speed = elapsed < a0 ? (cruiseSpeed * elapsed) / a0 : elapsed < duration - ta ? cruiseSpeed : (cruiseSpeed * (duration - elapsed)) / ta;
  return { s: Math.min(length, Math.max(0, dist)), speed: elapsed <= 0 && !start0 ? 0 : elapsed >= duration ? 0 : speed };
};
