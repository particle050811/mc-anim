// 6-1-6 穿刺九头蛇：九头蛇巢穴这一处的几何和动作。一镜到底（镜头/一镜到底/）按这里的穿刺线排扫帚的路线。
// 时间一律是物理时间 t（秒）：t = 0 是矛尖贯穿九头蛇身子的那一刻。
// 坐标：全按巢穴网格的本地坐标排（Z 朝上、北 = +Y，原点 = 网格原点），到世界经 `twilightLandmark('九头蛇巢穴')` 的 `到世界`（模型/场景/暮色新世界.tsx：网格平移不转，本地方位 = 世界方位）。
//
// 一镜到底（用户 10-02）：扫帚在巡航高度平飞过来，到巢穴前两百多米压下机头斜着扎下来、在跟前拉平：从三个头中间穿过去，矛贯穿身子，贴地平飞一段再慢慢爬回去。
// 九头蛇是远景，按原速打，不放慢（用户定）。扫帚 320 米/秒、在巢穴里不变。
//
// 方向（直航）：用户 10-05 红笔从巫妖怪塔直接往东偏南拉线到九头蛇巢穴、从西边进。巢穴网格不转，穿刺线顺着巫妖怪塔飞来的方向由西北偏西往东南偏东扎下去
// （本地 = 世界方位 112.95°，归档/参考模型库/工具/一镜到底/直航设计.ts 按来向解的）。方向写死成定稿的数，不跟着航线重解：来向差一点只是进线前多一个很小的弧。
// 九头蛇在洞口（用户 10-07 定「挪回洞口，钻穿土丘」，墙都能撞穿，土丘也一样）：刷怪方块在本地 (-7, 7)（游戏 (-6335, 3, 2177)），盆地东边、大土丘西脚的洞口外。
// 大土丘是空心的（地面 z 7、洞里空到 z 23 上下，顶上四五格厚的土壳）。扎穿九头蛇后冲进洞口，在洞里飞 30 米，a 31.5 撞上洞的东侧壁，a 52.5 从东坡钻出去（下面 `侧壁`，列段逐格查）。
// 东侧壁这一截在 暮色新世界.tsx 九头蛇巢穴那一行挖成斜隧道，出口喷石块、土（戏.tsx）。隧道一直开着：出口在土丘背着来向的那面，镜头在西北边高处看不到。
import type { V3 } from '@engine/model/parts.tsx';
import { HYDRA, type HydraHead } from '@库/生物/九头蛇.tsx';
import { cruiseHeight, twilightLandmark } from '../../../地点/暮色新世界.tsx';
import { integrateProfile, profileLookup, descendTo, pierceProfileLimits } from '@engine/flight/平顺航迹.ts';

export const V = 320;
export const 框 = twilightLandmark('九头蛇巢穴');
// 本地的飞行方位（度，0 = 北、顺时针）和水平单位向量
export const 方位 = 112.95;
export const DIR: [number, number] = [Math.sin((方位 * Math.PI) / 180), Math.cos((方位 * Math.PI) / 180)];
export const YAW = -方位; // 本地朝向：0 = +Y，正 = 往左转

// ---------- 九头蛇 ----------
export const FLOOR = 7; // 九头蛇脚下的地面（本地 z，洞口外的盆地：草方块顶在游戏 y 1）
// 朝着扫帚来的方向（-DIR）：实体正面是 -Y，转 ψ 后正面 = (sinψ, -cosψ)
export const HYDRA_YAW = Math.atan2(-DIR[0], DIR[1]);
const rotH = (point: number[]) => {
  const cos = Math.cos(HYDRA_YAW);
  const sin = Math.sin(HYDRA_YAW);
  return [point[0] * cos - point[1] * sin, point[0] * sin + point[1] * cos];
};
// 矛尖穿过的点：身子正中（实体坐标 (0, 3.24, 2.4)，往左偏 1.5 格让扫帚从两根脖子中间过），放在刷怪方块那一格
const PIERCE_LOCAL = [-7, 7];
const OFF = rotH([1.5, 3.24]);
export const HYDRA_AT: V3 = [PIERCE_LOCAL[0] - OFF[0], PIERCE_LOCAL[1] - OFF[1], FLOOR];
// 九头蛇实体坐标 → 巢穴本地
export const hydraToLocal = (point: number[]): V3 => {
  const rotated = rotH(point);
  return [HYDRA_AT[0] + rotated[0], HYDRA_AT[1] + rotated[1], HYDRA_AT[2] + point[2]];
};
export const PIERCE: V3 = hydraToLocal([1.5, 3.24, 2.4]);

// ---------- 穿刺线 ----------
// a = 矛尖从贯穿点沿飞行方向走过的水平距离（米）。高度（相对贯穿点）按 lib/平顺航迹.ts 的竖直剖面排：俯仰在路程上按梯形转（曲率连续），上限是 `pierceLimits`（俯仰角速度 2°/帧、角加速度 2°/帧²，竖直加速度 0.47 米/帧²）。
// 起点在巡航高度平飞 `alignDist` 米（1 秒，用户 10-03「平着冲进去」）→ 压机头往下扎（最陡 `diveAngle`）→ 在九头蛇跟前拉平、贯穿时正好平 → 贯穿后抬到 `exitSlope`、直线钻穿土丘东坡、贴着林子飞到 `后`
// （用户 10-02：穿出来马上放平，之后由航线爬回巡航高度）。
// 半径 382 米、扎下去 25°：拉平从贯穿前一百多米就开始（西边是平的盆地，贯穿前 60 米矛尖比贯穿点高 3.8 米，管子碰不到地；曲率太急会让竖直加速度、俯仰一帧转得过大）。
// 东坡的隧道接长到 a 53（暮色新世界.tsx 的 补挖，工具/一镜到底/隧道.ts 九头蛇 打印）。树不让（用户 10-07）
const alignDist = V * 1.0;
const diveAngle = 25;
const exitSlope = 7;
const tailLen = 204;
const profileLimits = pierceProfileLimits(V);
// 巡航高度（本地 z）：取穿刺线前端那里的巡航高（模型/场景/暮色新世界.tsx 的 `cruiseHeight`），和前面的巡航接平。前端又随压机头的位置变：先按 -500 估一次、再按算出来的前端取一次
const cruiseZ = (dist: number) => {
  const worldPt = 框.到世界([PIERCE[0] + DIR[0] * dist, PIERCE[1] + DIR[1] * dist, 0]);
  return cruiseHeight(worldPt[0], worldPt[1]) - 框.原点[2];
};
const pierceState = { a: 0, z: 0, γ: 0 };
const frontProfileFor = (height: number) => {
  const drop = descendTo(pierceState, (-diveAngle * Math.PI) / 180, 0, height, profileLimits, -1);
  return integrateProfile(pierceState, [{ toAngle: drop.γ }, { 直: drop.直 }, { toAngle: 0 }], profileLimits, -1);
};
const frontProfile = (() => {
  let profile = frontProfileFor(cruiseZ(-500) - PIERCE[2]);
  profile = frontProfileFor(cruiseZ(profile[profile.length - 1].a - alignDist) - PIERCE[2]);
  return profile;
})();
const diveStart = frontProfile[frontProfile.length - 1];
const rearProfile = integrateProfile(pierceState, [{ toAngle: (exitSlope * Math.PI) / 180 }, { 直: tailLen + 20 }], profileLimits, 1);
const tipProfile = profileLookup([...frontProfile, ...rearProfile.slice(1)]);
export const 剖面信息 = { diveStartA: diveStart.a, diveStartZ: diveStart.z, diveAngle: (Math.min(...frontProfile.map((q) => q.γ)) * 180) / Math.PI };
const hTip = (a: number) => PIERCE[2] + tipProfile.z(a);
const tipLocal = (a: number): V3 => [PIERCE[0] + DIR[0] * a, PIERCE[1] + DIR[1] * a, hTip(a)];
export const 穿刺线 = {
  名: '九头蛇',
  V,
  朝向: 框.朝向(YAW),
  矛尖: (a: number): V3 => 框.到世界(tipLocal(a)),
  // 前端：压机头以前先按 320 米/秒平飞 1 秒（对正）
  前: diveStart.a - alignDist,
  后: tailLen,
  撞: -1, // 没有墙：贯穿前 1 米
  出: 4,
};
export const T_DIVE = -diveStart.s / V;

// ---------- 九头蛇的动作（t：贯穿后的物理秒数） ----------
const ease = (x: number) => {
  const clamped = Math.min(1, Math.max(0, x));
  return clamped * clamped * (3 - 2 * clamped);
};
export const hydraHeads = (t: number, broom: V3): HydraHead[] => {
  const up = ease((t - T_DIVE + 0.25) / 0.55);
  const hit = t >= 0 ? ease(t / 0.17) : 0;
  const cos = Math.cos(-HYDRA_YAW);
  const sin = Math.sin(-HYDRA_YAW);
  const broomLocal = 框.toLocal(broom);
  const rel = [broomLocal[0] - HYDRA_AT[0], broomLocal[1] - HYDRA_AT[1], broomLocal[2] - HYDRA_AT[2]];
  const look: V3 = [rel[0] * cos - rel[1] * sin, rel[0] * sin + rel[1] * cos, rel[2]];
  return HYDRA.idle.map((h, i) => ({
    x: h.x + up * (i === 0 ? 18 : 32) + hit * 25,
    y: h.y * (1 - 0.25 * up),
    len: h.len + up * 1.5,
    mouthOpen: 0.15 + 0.65 * up * (1 - hit) + hit * 0.9,
    看: up > 0.05 && t < 0.08 ? look : undefined,
  }));
};
// 贯穿后：变红（同巫妖，用户 10-07），几帧后身体、三个头依次炸开（原版爆炸粒子 + 生物死亡的白烟），模型消失
export const DEATH = { body: 5 / 24, heads: [8 / 24, 11 / 24, 14 / 24], gone: 9 / 24 };
export const hydraHurt = (t: number) => (t >= 0 ? 1 : 0);
// 钻穿土丘：矛尖管子在 a 31.5 撞进洞的东侧壁、a 52.5 从东坡钻出来（工具/一镜到底/雪怪碰.ts 九头蛇 量的，不算树），撞进去、钻出来的时刻（物理秒）和那两点（本地）
export const 侧壁 = { 进: 31.5, 出: 52.5 };
export const 侧壁点 = (a: number): V3 => tipLocal(a);
export const 侧壁时刻 = (a: number) => a / V;
export const 出场 = { 起: -40, 止: 8 };
