// 6-4-3 机位：A1～A3、6-4-3b 跟拍刹住、C1～C3，以及核对弓用的近景。
import type { V3 } from '@engine/model/parts.tsx';
import type { Cam } from '../../../../地点/古城4x/6-4-1/古城画面.tsx';
import * as geom from '../几何.ts';
import * as timeline from '../时间线.ts';
import { lastFrame642 } from '../../../../地点/古城4x/布局.ts';
import { ss, add, lerpV, norm, cross, storySecAt, fromHuangPanLocal } from './公用.ts';
// 古城4x 机位对着方块数据逐帧核过（工具/挡箭/机位.ts 导出、机位核对.py 核）。
const lerpCam = (a: Cam, b: Cam, k: number): Cam => ({ pos: lerpV(a.pos, b.pos, k), tgt: lerpV(a.tgt, b.tgt, k), lens: a.lens + (b.lens - a.lens) * k });
const segmentProgress = (g: number, g0: number, g1: number) => Math.min(1, Math.max(0, (g - g0) / Math.max(1, g1 - g0)));
const liYingChest: V3 = add(geom.FOOT, [0, 0, 1.2]);
// 黄叛的本地坐标（右、前、上）→ 场景
const besideHuangPan = (x: number, y: number, z: number): V3 => fromHuangPanLocal(x, y, z);
// A1：#210 南边、箱子那一侧往北看，略低于他弯下去的头，越过箱子看他。黄叛在镜头右手边 370 米外，不同框。
// 起点就是 6-4-2 镜头 3 落到的机位（契约 古城4x布局.ts 的 六四二末帧.cam，6-4-2 → 6-4-3a 是一个不切的镜头）
const A1a: Cam = lastFrame642.cam;
const A1p = A1a.pos;
const A1b: Cam = { pos: lerpV(A1p, add(geom.FOOT, [0, 0, 1.3]), 0.08), tgt: add(geom.FOOT, [0, 0, 1.25]), lens: 26 };
// A2：黄叛右前方（右 2.6、前 5.5 米，高半米，悬在门框外半空），28mm 推到 32mm：先交代他站在门框底梁上，再看风扇虚影转起来、风道喷出去
const A2a: Cam = { pos: fromHuangPanLocal(2.6, 5.5, 0.5), tgt: lerpV(geom.黄叛脚底, geom.搭箭点, 0.6), lens: 28 };
const A2b_: Cam = { pos: fromHuangPanLocal(2.4, 5.0, 0.6), tgt: lerpV(add(geom.黄叛脚底, [0, 0, 1.2]), geom.搭箭点, 0.6), lens: 32 };
// A3：黄叛左边（南）6 米、垂直箭路，24mm：他在画面右边，箭往左穿过风扇、飞出画面；看点在箭路 3.0 米处，风扇到风道末端整段在画里
const A3: Cam = { pos: besideHuangPan(-6.27, 2.07, 1.61), tgt: add(geom.搭箭点, geom.来向, 3.0), lens: 24 };
// ---- 6-4-3b：跟拍 → 刹住、让到侧面 ----
// 跟拍偏移（箭的右、上、后，米）。用户 10-13 要拍出放大后的尺度，所以镜头离箭 5.2 米（左 2.4、上 1.0、后 4.5）、18mm，房子和羊毛墙一帧掠过一大截。
// 镜头在箭的南边略高（兵营东墙南北两头都挡，只有南边看得见李樱和弹开点；再高就撞洞顶），
// 箭飞到 100 米左右南边有根岩柱垂下来，镜头在 85～98 米绕到北边让开、110～125 米绕回（整条箭路每 0.5 米核过机位不撞方块：工具/挡箭/机位核对.py --跟拍）
const followRight = (s: number) => -2.4 + 4.0 * ss((s - 85) / 13) * (1 - ss((s - 110) / 15));
const followUp = 1.0;
const followBack = 4.5;
const arrowRight: V3 = norm(cross(geom.来向, [0, 0, 1]));
const arrowUp: V3 = norm(cross(arrowRight, geom.来向));
const followCamPose = (dist: number): Cam => {
  const arrowPos = add(geom.搭箭点, geom.来向, dist);
  const pos = add(add(add(arrowPos, arrowRight, followRight(dist)), arrowUp, followUp), geom.来向, -followBack);
  // 看点在箭前 6 米、往右 0.8 米，前方大道和掠过的房子都在画里
  return { pos, tgt: add(add(arrowPos, geom.来向, 6), arrowRight, 0.8), lens: 18 };
};
// 侧面：弹开点正南 9 米、高 3.2 米（游戏 (-1085.1, -41.5, 203.7)），正对刀由下往上挑的竖面，来箭最后几米、弹开点、李樱胸口都看得到
// （北、东都被兵营东墙台阶挡着，工具/挡箭/机位核对.py --搜 搜出来的）。箭从画面右边几乎平着飞来，被挑得几乎竖直飞出画面。
export const sideCamPos = add(geom.弹开点, [0, -9, 3.15]);
export const sideTarget = lerpV(geom.弹开点, liYingChest, 0.35);
// 刹住：箭的程从 `弹开程` − 8 到 − 1.5（时钟 1/12 慢到 1/500），机位从跟拍挪到侧面、焦距 18 → 30。
// 挪多少按画面时间走 smoothstep：慢放刚开始箭一帧还走两三米，按箭的程走头两帧镜头会甩出 5 米。弹开后镜头不跟箭抬（用户 10-10），看点留在李樱身前
const brakeStartDist = geom.弹开程 - 8;
const brakeEndDist = geom.弹开程 - 1.5;
const brakeStartFrame = timeline.帧小数(geom.放箭 + geom.来箭到(brakeStartDist));
const brakeEndFrame = timeline.帧小数(geom.放箭 + geom.来箭到(brakeEndDist));
const followCam = (storyTime: number): Cam => {
  const arrowState = geom.箭(storyTime);
  const dist = arrowState.阶段 === '来' ? Math.max(0, geom.来箭程(storyTime - geom.放箭)) : geom.弹开程;
  const brakeWeight = ss((timeline.帧小数(storyTime) - brakeStartFrame) / (brakeEndFrame - brakeStartFrame));
  const followPose = followCamPose(Math.min(dist, brakeEndDist));
  const camPos = lerpV(followPose.pos, sideCamPos, brakeWeight);
  return { pos: camPos, tgt: lerpV(followPose.tgt, sideTarget, brakeWeight), lens: 18 + 12 * brakeWeight };
};
// ---- 6-4-3c ----
// C1：李樱南边 3.5 米、高过头顶 0.6 米（游戏 (-1086.5, -43.5, 198)），24 → 26mm 看他右侧身，是 6-4-3b 末尾南边 9 米机位往他身上推近的一刀。
// 不放正前方：招架闪光在慢放里亮两秒多，会整团挡在脸上
const liYingSouthPos = add(geom.FOOT, [0, -3.5, 2.5]);
const C1a: Cam = { pos: liYingSouthPos, tgt: add(lerpV(geom.FOOT, geom.弹开点, 0.25), [0, 0, 1.2]), lens: 24 };
const C1b: Cam = { pos: lerpV(liYingSouthPos, add(geom.FOOT, [0, 0, 1.7]), 0.06), tgt: add(lerpV(geom.FOOT, geom.弹开点, 0.25), [0, 0, 1.35]), lens: 26 };
// C2：黄叛左边 6 米（同 A3 位置），拉近到头和弓
const C2a: Cam = { pos: besideHuangPan(-6.27, 2.07, 1.61), tgt: add(geom.黄叛脚底, [0, 0, 1.3]), lens: 38 };
const C2b: Cam = { pos: besideHuangPan(-5.77, 1.98, 1.7), tgt: add(geom.黄叛脚底, [0, 0, 1.45]), lens: 40 };
// C3（末帧接 6-4-5）：李樱身后（西）6.5 米、偏南半米、高过头顶 2 米（游戏 (-1093, -42.25, 195)），24 → 26mm 慢慢推近，越过右肩往东看；
// 洞顶石块从画面上方砸到他左前方东墙后（落地被墙挡住只听见声），左边近处的尖啸体一圈圈喷声波环
const eastDir = norm([geom.黄叛脚底[0] - geom.FOOT[0], geom.黄叛脚底[1] - geom.FOOT[1], 0]);
const C3a: Cam = { pos: add(geom.FOOT, [-6.5, -0.5, 3.75]), tgt: add(add(geom.FOOT, eastDir, 4), [0, 0, 0.9]), lens: 24 };
const C3b: Cam = { pos: add(geom.FOOT, [-5.8, -0.45, 3.6]), tgt: add(add(geom.FOOT, eastDir, 4), [0, 0, 1.0]), lens: 26 };
// 核对弓用的近景（不是镜头）：和游戏里拍的左手持弓骷髅同一个相对机位——人前方 3 米、右边 3.6 米、脚底以上 1 米，看人前方 0.4 米、离地 1.25 米那点，竖向 35.1°（32mm）
export const bowCloseupCams: Cam[] = (() => {
  const yawRad = (geom.黄叛朝向 * Math.PI) / 180;
  const forward: V3 = [-Math.sin(yawRad), Math.cos(yawRad), 0];
  const right: V3 = [Math.cos(yawRad), Math.sin(yawRad), 0];
  const foot = geom.黄叛脚底;
  return [
    { pos: add(add(add(foot, forward, 3), right, 3.6), [0, 0, 1], 1), tgt: add(add(foot, forward, 0.4), [0, 0, 1], 1.25), lens: 32 },
    { pos: add(add(add(foot, forward, 0.9), right, -2.2), [0, 0, 1], 1.5), tgt: lerpV(geom.搭箭点, geom.拉弦手, 0.5), lens: 40 },
  ];
})();
// 按剧情时间给机位（6-4-3b 的跟拍按剧情时间走，各个时钟的版本都能用）；g 是主方案的全局帧（可以带小数）
export const camera = (globalFrame: number): Cam => {
  const cutFrames = timeline.切帧;
  const t = storySecAt(globalFrame);
  if (globalFrame < cutFrames.A2) return lerpCam(A1a, A1b, segmentProgress(globalFrame, 0, cutFrames.A2));
  if (globalFrame < cutFrames.A3) return lerpCam(A2a, A2b_, segmentProgress(globalFrame, cutFrames.A2, cutFrames.A3));
  if (t < timeline.切.B1) return A3;
  if (t < timeline.切.C1) return followCam(t);
  if (globalFrame < cutFrames.C2) return lerpCam(C1a, C1b, segmentProgress(globalFrame, cutFrames.C1, cutFrames.C2));
  if (globalFrame < cutFrames.C3) return lerpCam(C2a, C2b, segmentProgress(globalFrame, cutFrames.C2, cutFrames.C3));
  return lerpCam(C3a, C3b, ss(segmentProgress(globalFrame, cutFrames.C3, timeline.总帧数)));
};
