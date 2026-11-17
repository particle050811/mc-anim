// 6-4-3 挡箭三段（6-4-3a 风矢、6-4-3b 挡箭、6-4-3c 挑飞）共用的站位、箭的路线和剧情时刻，纯函数，只按剧情时间 T（秒）算，和慢放时钟无关（时钟在 时间线.ts）。
// 坐标：场景坐标（Z 朝上、北 = +Y、1 = 一格），游戏坐标用 `G4()` 换（../../模型/场景/古城4x.tsx）。站位全取自 ../古城4x布局.ts 的射箭一节；挑飞击穿的方块对着新世界方块数据搜（工具/挡箭/搜挑飞.py）。
// 站位在古城4x（用户 10-13 嫌把人拉到古城外射箭不合理）；旧版隧道网格作废。
//
// 戏：李樱在兵营 #210 箱北的羊毛上低头翻箱子（面朝南）；黄叛站在城心传送门框底梁上，刘心忠在门西边高台上。两人隔 370 米大道，黄叛拉满弓，弓前化出鼓风机虚影，风场成形「哄」一声；
// 黄叛大喝「贼子，拿命来！」放箭，箭穿过风扇加速到 1000 米/秒，顺大道往西飞（从场子北墙头上方 12 米掠过）；箭射出后「哄」才传到李樱耳朵（见 剧情时刻），他直起身往东转过来拔刀，由下往上一挑（夜幕刀光，见 画面.tsx），
// 箭在身前被扫中挑飞，扎进兵营上方洞顶，一路击穿岩层、从地面的湖里冲出去（不给特写，只听碎裂声），碎石往下掉；黄叛愣住，李樱握刀戒备。
//
// 游戏依据（拔刀剑 1.9.65 和原版 1.20.1 字节码，见 模型/特效/碰撞箱线框.tsx）：
// - 挡开范围：离李樱脚底 4.5 格的球（和粗选盒取交集），箭进去就被挡，不需碰到斩击实体的 3×3×3 碰撞箱。
// - 斩击实体活到第 11 刻；按住右键时拔刀后 6 刻内每刻都挡、斩击实体每两刻挡一次，挥刀后半秒内箭进范围都会被挡开。
// - 画面不画拔刀剑的斩击月牙和 F3+B 白框（用户 10-10 要换成史诗战斗夜幕特效）：挥刀画夜幕阎魔刀刀光拖尾，弹开那一刻画夜幕招架闪光（画面.tsx）；挥刀是 upperslash 那样几乎竖直、由下往上的一挑。
// 故意和游戏不符的（用户要的夸张，提示词里不解释）：
// - 箭被加速到 1000 米/秒（原文：弓箭出鞘的声音方才刚刚在手边响起）；游戏里挡开后是 3.5 格/刻（70 米/秒），这里挑飞后也是 1000 米/秒。
// - 挡开方向：游戏永远是玩家视线（`ArrowReflector.doReflect`），李樱看着黄叛则几乎原路折回成很尖的 V（用户 10-05 嫌锐角反弹不合理），所以改成被刀往上挑飞（见 `挑飞方向`）。
// - 挑飞的箭一路击穿击碎方块，直到冲出地面（用户 10-18：「一路冲出去」；游戏里箭打不碎方块，插在第一块上就停）。
// - 每刻 50 格的箭在游戏里一刻跨过整个 4.5 格范围，判定那一刻落在范围里才挡得到；这里取刀刃扫过箭路的那一点（见 `弹开`）。
import type { V3 } from '@engine/model/parts.tsx';
import { HITBOX } from '@库/特效/碰撞箱线框.tsx';
import { drawBowPose } from '../../../角色/追兵姿势.ts';
import { handPosition } from '@库/角色/骨架.tsx';
import { bowPointWorld, BOW_ARROW_TIP } from '@库/物品/弓.tsx';
import { ARROW } from '@库/物品/箭.tsx';
import { ductLength } from '@库/特效/气流.tsx';
import { yawTo } from '../../../地点/古城4x/6-4-1/古城戏.ts';
import { G4 } from '../../../地点/古城4x坐标.ts';
import { archery, liYingDeflectFeet, huangPanArcheryFeet, liuXinzhongArcheryFeet } from '../../../地点/古城4x/布局.ts';
import flingPierceJson from 'asset:碎块/镜头/6-4-3/挑飞击穿';
const gameToScene = G4;

const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const norm = (vec: V3): V3 => {
  const mag = len(vec) || 1;
  return [vec[0] / mag, vec[1] / mag, vec[2] / mag];
};
const deg = Math.PI / 180;

// 游戏的 yRot / xRot（度，yRot 0 朝南、90 朝西，xRot 正 = 低头）和场景方向互换
export const gazeVector = (yRot: number, xRot: number): V3 => {
  // 游戏 getLookAngle = (−sin y · cos x, −sin x, cos y · cos x)，换成场景 (gx, −gz, gy)
  const gx = -Math.sin(yRot * deg) * Math.cos(xRot * deg);
  const gy = -Math.sin(xRot * deg);
  const gz = Math.cos(yRot * deg) * Math.cos(xRot * deg);
  return [gx, -gz, gy];
};
export const gazeAngles = (dir: V3) => {
  const [x, y, z] = norm(dir);
  const gz = -y;
  return { yRot: Math.atan2(-x, gz) / deg, xRot: -Math.asin(z) / deg };
};

// ---------- 站位 ----------
export const FOOT: V3 = liYingDeflectFeet; // 李樱脚底：#210 北边一格的羊毛（布局 射箭.李樱羊毛，= 6-4-2 的 C），游戏 (-1086.5, -46, 194.5)
export const liYingEye: V3 = add(FOOT, [0, 0, HITBOX.player.eye]);
// 黄叛：城心传送门框的底梁上（布局 射箭.黄叛脚底格，游戏 (-719.5, -34, 235.5)），比李樱的脚高 12 格，往西偏北 6° 射，箭路 370 米
export const huangPanFeet: V3 = huangPanArcheryFeet;
export const huangPanEye: V3 = add(huangPanFeet, [0, 0, HITBOX.player.eye]);
export const huangPanHeight = 1.875;
// 刘心忠：门西边那一阶高台（布局 射箭.刘心忠脚底格），站着看黄叛射
export const liuXinzhongFoot: V3 = liuXinzhongArcheryFeet;
// 瞄准李樱脚底以上 1.3 格（老城是 1.0；这里 1.0 会擦到他身后兵营东墙的台阶，见布局 射箭.瞄准高）
export const aimPoint: V3 = add(FOOT, [0, 0, archery.aimHeight]);

// 黄叛拉满弓的姿势：面朝李樱（水平），头往下看着瞄准点；弓在左手（模型/角色/追兵.tsx 的 拉弓姿势）
const toAim = sub(aimPoint, huangPanEye);
export const huangPanFacing = yawTo(toAim[0], toAim[1]);
export const huangPanPitch = (Math.atan2(toAim[2], Math.hypot(toAim[0], toAim[1])) * 180) / Math.PI;
export const huangPanFullDraw = drawBowPose(huangPanFeet, huangPanFacing, 0, huangPanPitch, 1);
// 箭从弓上搭着的那支箭的位置出发（游戏里从眼高 −0.1 的身体中线出来，差 0.3 米，画面上从弓上出来才对）：
// 拉满时弓用 bow_pulling_2 贴图，自带一支箭（模型/物品/弓.tsx）。放箭那一刻换回不带箭的 bow，3D 的箭接着出现，箭尖放在贴图箭尖上不重影。
// 贴图的箭比去瞄准点的方向偏 6.5°（原版第三人称拉弓本就不正对准星），3D 的箭直接对着瞄准点飞。搭箭点 = 放箭时箭（实体位置，箭尖后 0.225 格，见 模型/物品/箭.tsx）所在处
export const arrowTipStart: V3 = bowPointWorld(huangPanFullDraw, huangPanHeight, 'L', BOW_ARROW_TIP.弓拉2);
export const incomingDir: V3 = norm(sub(aimPoint, add(arrowTipStart, norm(sub(aimPoint, arrowTipStart)), -ARROW.tipAhead)));
export const nockPoint: V3 = add(arrowTipStart, incomingDir, -ARROW.tipAhead);
export const drawHand: V3 = handPosition(huangPanFullDraw, huangPanHeight, 'R');

// ---------- 鼓风机虚影、风和箭速 ----------
// 风扇虚影边长 0.3 格（用户 10-05 嫌 1 格太大，要和手臂差不多粗）。在箭轴上，后脸离贴图上那支箭的箭尖 0.04 米，箭一离弦就从轮毂穿过去。
export const fanSideLength = 0.3;
const fanBackFaceDist = ARROW.tipAhead + 0.04;
export const fanCenter: V3 = add(nockPoint, incomingDir, fanBackFaceDist + fanSideLength / 2);
export const fanOutlet: V3 = add(nockPoint, incomingDir, fanBackFaceDist + fanSideLength);
const outletDist = fanBackFaceDist + fanSideLength;
//
// 风（用户 10-10 嫌风粒子没有箭快）：照机械动力 `AirFlowParticle`（模型/特效/气流.tsx 文件头）：离出风口 d 格处每刻走 0.0625 × (最大距离 − d + 1) 格，走出 最大距离 + 0.25 就没了。两处按剧情放大，不是原版数值：
// - 最大距离：原版满转 20 格；风扇缩到 0.3 格，风道横截面和推送距离按 0.3 倍缩，满转 6 格。
// - 快放 880 倍（应力转动之力）：风速 = 原版逐刻推 × 880（出风口 7700 米/秒、末端 1100 米/秒）。880 是倒推的：要箭出风道时 1000 米/秒，末端的风还比箭快一成，箭在风道里一直被风追着推。
// 箭：离弦 60 米/秒，箭尖碰到风扇后脸起被风推：dv/dt = k (u − v)²（u 是箭所在处的风速；迎面阻力公式反过来），推到箭（实体位置）走出风道末端为止。
// k 取让出风道正好 1000 米/秒的值（约 0.0043 /米，下面二分出来），和真箭阻力系数（约 0.002 /米）同一数量级。
// 出风道后匀速直线 1000 米/秒（不算重力、空气阻力）。程 s 是箭（实体位置）离搭箭点的距离，箭尖在 s + 0.225；风道里 d = s − 出风口程
export const ductScale = fanSideLength;
export const ductMaxDist = (rpm: number) => ductLength(rpm) * ductScale;
export const fullDuctLength = ductMaxDist(256); // 6 格
export const windFastForward = 880;
// 风道里离出风口 d 处的风速（米/秒，满转）：原版每刻 0.0625 × (6 − d + 1) 格 × 20 刻/秒 × 880
export const windSpeed = (d: number) => 0.0625 * (fullDuctLength - Math.min(fullDuctLength, Math.max(0, d)) + 1) * 20 * windFastForward;
export const releaseSpeed = 60;
const pushStartDist = fanBackFaceDist - ARROW.tipAhead; // 箭尖碰到风扇后脸
export const ductEndDist = outletDist + fullDuctLength; // 箭（实体位置）出风道
const integrateArrow = (k: number, trace?: { ts: number[]; sv: number[]; vv: number[] }) => {
  const ds = 0.001;
  let dist = 0;
  let speed = releaseSpeed;
  let t = 0;
  if (trace) {
    trace.ts.push(0);
    trace.sv.push(0);
    trace.vv.push(speed);
  }
  while (dist < ductEndDist - 1e-9) {
    const step = Math.min(ds, ductEndDist - dist);
    // 中点法：先走半步估速度，再整步
    const accelAt = (sv: number, vv: number) => (sv + step / 2 >= pushStartDist ? (k * (windSpeed(sv - outletDist) - vv) ** 2) / vv : 0);
    const vm = speed + (accelAt(dist, speed) * step) / 2;
    const dv = accelAt(dist + step / 2, vm) * step;
    t += step / (speed + dv / 2);
    speed += dv;
    dist += step;
    if (trace) {
      trace.ts.push(t);
      trace.sv.push(dist);
      trace.vv.push(speed);
    }
  }
  return speed;
};
export const thrustCoef = (() => {
  let lo = 1e-5;
  let hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = Math.sqrt(lo * hi);
    if (integrateArrow(mid) < 1000) lo = mid;
    else hi = mid;
  }
  return Math.sqrt(lo * hi);
})();
// 放箭后经过的剧情秒 → 箭离搭箭点的距离、速度（风道里按 1 毫米一步积的表，出了风道匀速）
const incomingArrowTable = (() => {
  const trace = { ts: [] as number[], sv: [] as number[], vv: [] as number[] };
  integrateArrow(thrustCoef, trace);
  return trace;
})();
export const arrowMaxSpeed = incomingArrowTable.vv[incomingArrowTable.vv.length - 1]; // 出风道的速度，1000 米/秒
export const arrowSpeed = (dist: number) => {
  const { sv, vv } = incomingArrowTable;
  const lastIdx = sv.length - 1;
  if (dist >= sv[lastIdx]) return vv[lastIdx];
  if (dist <= 0) return vv[0];
  const i = Math.min(lastIdx - 1, Math.floor(dist / 0.001));
  return vv[i] + ((dist - sv[i]) / (sv[i + 1] - sv[i])) * (vv[i + 1] - vv[i]);
};
export const incomingArrowDist = (dt: number) => {
  if (dt <= 0) return 0;
  const { ts, sv } = incomingArrowTable;
  const lastIdx = ts.length - 1;
  if (dt >= ts[lastIdx]) return sv[lastIdx] + (dt - ts[lastIdx]) * arrowMaxSpeed;
  let lo = 0;
  let hi = lastIdx;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ts[mid] <= dt) lo = mid;
    else hi = mid;
  }
  return sv[lo] + ((dt - ts[lo]) / (ts[hi] - ts[lo])) * (sv[hi] - sv[lo]);
};
// 来箭到程 s 要多少秒
export const arrowArriveTime = (dist: number) => {
  const { ts, sv } = incomingArrowTable;
  const lastIdx = ts.length - 1;
  if (dist >= sv[lastIdx]) return ts[lastIdx] + (dist - sv[lastIdx]) / arrowMaxSpeed;
  if (dist <= 0) return 0;
  const i = Math.min(lastIdx - 1, Math.floor(dist / 0.001));
  return ts[i] + ((dist - sv[i]) / (sv[i + 1] - sv[i])) * (ts[i + 1] - ts[i]);
};

// ---------- 箭的自转 ----------
// 箭飞时旋转（用户 10-10）：真箭尾羽斜装，气流让箭绕长轴转，稳定后每走固定路程转一圈，转速与速度成正比。
// 数值取 James Park（Bow International「Arrows: dynamic behaviour」）：尾羽斜 1° 左右的 X10 箭约每 2～3 米一圈，离弦后约 10 米转速接近稳定；这里取每 2.5 米一圈、特征长度 10/3 米。游戏里箭不转（`ArrowRenderer`），这里是用户要的。
// 风道里风从后面追着吹，尾羽扭矩其实反向；这 6 米不演反转，出风道才开始带起来。挑飞：刀从侧面磕箭身，绕长轴角动量不变，接着转、按走过的路累计。
export const spinSecPerTurn = 2.5;
const spinRampM = 10 / 3;
// 走过的路（米，从搭箭点算，挑飞后接着加）→ 转过的角（度）
export const spinAngle = (traveledM: number) => {
  const x = traveledM - ductEndDist;
  if (x <= 0) return 0;
  return ((x - spinRampM * (1 - Math.exp(-x / spinRampM))) / spinSecPerTurn) * 360;
};

// ---------- 李樱的视线 ----------
// 他听到「哄」直起身、往左转过来，看着黄叛那边：yRot、xRot 都对准黄叛的眼睛（往东、往上看 1.9°，大道尽头的传送门）。
const lookAtHuangPan = gazeAngles(sub(huangPanEye, liYingEye));
export const gazeYRot = lookAtHuangPan.yRot;
export const gazeXRot = lookAtHuangPan.xRot;
export const sightDir: V3 = gazeVector(gazeYRot, gazeXRot);

// 斩击实体的位置（拔刀剑 EntitySlashEffect 生成处：脚底 + (0, 眼高×0.75, 0) + 视线×0.3）：画面上不画它，挥刀的破空声、振动从这里发出（编排.ts 的 声音链；声音在 段/6-挡箭 段.ts 的 cue）
export const slashPos: V3 = add(add(FOOT, [0, 0, HITBOX.player.eye * 0.75]), sightDir, 0.3);

// ---------- 弹开 ----------
// 弹开点：刀刃扫过箭路的那一点（工具/挡箭/刀刃扫箭.ts 量的）。刀走右肩前的竖面，来箭对着胸口正中，两者不相交，所以挥刀时整个人绕脚底往左多拧 `挥刀转身` 度（编排.ts 的 `swingTwistAt`），刀的竖面斜过来横穿箭路；关键帧和挥刀时刻不变。
// 拧的度数比过 20°～35°，取刀身前段（物打ち一带）砍到箭的那个；来箭线不变，只是在离他更远处被挑开。
// 当前：拧 17°，刀身 59% 处在 6-1-2 帧 104.217 扫过箭路，离瞄准点 1.40 米（来箭几乎平，往下 1.9°）。
// 改了挥刀姿态（挥刀转身、6-1-2 关键帧）要重跑 刀刃扫箭.ts，把 [精确] 那一行的两个数抄到这里
export const swingTurnDeg = 17;
export const deflectReach = 1.4038;
export const deflectKeyFrame = 104.21741;
export const deflectDist = len(sub(aimPoint, nockPoint)) - deflectReach;
export const deflectPoint: V3 = add(nockPoint, incomingDir, deflectDist);

// ---------- 剧情时刻（秒） ----------
// 时机（用户 10-12 剪映：箭射出后李樱才发现）：李樱前半一直低头翻箱子，黄叛拉弓、召出鼓风机，「贼子，拿命来！」挪到放箭那一刻喊（落点见 时间线.ts 的 `shoutLine`）；李樱在 6-4-3b 才发现、拔刀。
// 声音照真的走：370 米外「哄」要 1.08 秒才传到他（声速 343 米/秒），箭飞完只要 0.37 秒，所以黄叛「哄」完要等一会儿才放箭；箭射出 0.2 秒后李樱听到「哄」，再 0.04 秒拔刀，0.045 秒后刀挥到正前方，正好扫过飞到的箭；
// 喊声比「哄」晚 0.7 秒出口，传到他时箭早被挑飞了（游戏里 370 米听不见，台词照放给观众听）。
// 反过来排：哄（定死）→ 听到哄 → 拔刀起 → 挥刀（刀到正前）→ 弹开，放箭 = 弹开 − 箭飞到弹开点的时间
export const soundSpeed = 343;
export const soundToLiYingSec = len(sub(huangPanEye, liYingEye)) / soundSpeed;
export const roar = 2.37; // 风场成形、风扇转满（10-10 版也落在这一刻附近）
export const heardRoar = roar + soundToLiYingSec;
export const drawStart = heardRoar + 0.04; // 下意识：听到就拔
export const swingTime = drawStart + 0.045; // 6-1-2 帧 98 → 104 用 0.045 秒
// 挥刀（斩击实体生成）＝ 6-1-2 帧 104：刀从身子下方兜上来、挥到正前方。刀刃扫过箭路在 `弹开关键帧`，帧 104 → 108 用 0.03 秒，所以弹开比挥刀晚 (弹开关键帧 − 104) / 4 × 0.03 秒
export const swingLead = ((deflectKeyFrame - 104) / 4) * 0.03;
export const deflect = swingTime + swingLead;
export const shootTime = deflect - arrowArriveTime(deflectDist);
// 放箭以后喊声传到李樱（只记账，不驱动动作；喊的落点见 时间线.ts 的 `shoutLine`）
export const heardShout = shootTime + soundToLiYingSec;
// 李樱的动作：一直低头翻箱子，听到「哄」松手（箱盖落下）、直起身、手搭上刀柄，0.04 秒后拔刀（6-1-2 帧 93 按刀 → 98 起拔）
export const turnStart = heardRoar;
export const handOnHilt = drawStart;

// ---------- 挑飞 ----------
// 去路：仰角 86.15°，水平方向从来箭方向（往西偏北）往右转 126.3°（几乎竖直），箭在身前被由下往上一刀挑起，看得出是被刀往上挑（用户 10-05）。
// 搜法（工具/挡箭/搜挑飞.py，新世界方块数据，不开游戏）：从弹开点往上，仰角 55～88°、右转 ±180° 每 1°×2° 打射线，兵营上空先空飞 12 米以上再扎进洞顶，一路击穿「至少一面原本露着空气」的方块，六面全埋着的就钉住；
// 再看每条挪 ±0.3°、±0.6° 是否还是同一串。取最竖、穿得多的一片（仰 85.75～86.5°、右转 120～133.5°，同一串 7 块、钉进同一块深板岩）的中间。
// 击穿的：洞顶底面（游戏 y −31）往上一列 6 块（幽匿块，中间夹 1 块深板岩），冲进上面 10 米高空腔，再击穿腔顶，一路往上打穿岩层（`一路击穿`）。
const flickPitchDeg = 86.15;
const flickLeftYawDeg = -126.3;
export const flingDir: V3 = (() => {
  const horizDir = norm([incomingDir[0], incomingDir[1], 0]);
  const yawRad = (flickLeftYawDeg * Math.PI) / 180;
  const pitchRad = (flickPitchDeg * Math.PI) / 180;
  const hx = horizDir[0] * Math.cos(yawRad) - horizDir[1] * Math.sin(yawRad);
  const hy = horizDir[0] * Math.sin(yawRad) + horizDir[1] * Math.cos(yawRad);
  return [hx * Math.cos(pitchRad), hy * Math.cos(pitchRad), Math.sin(pitchRad)];
})();
// 画面上要藏网格、补洞壁、出碎块的只有洞顶底下 6 块和腔顶第一块（离弹开点 13.7～18.7 米、29.7 米），再往上埋在岩层里看不见，只出声音（`一路击穿`）
export const breachBlocks: V3[] = [
  [-1085, -31, 193],
  [-1085, -30, 193],
  [-1085, -29, 193],
  [-1085, -28, 193],
  [-1085, -27, 193],
  [-1085, -26, 193],
  [-1084, -15, 193],
];
// 方块名照 搜挑飞.py 读的世界（古城放大幽匿-20260930）
export type CaveCeilingBlock = '幽匿块' | '深板岩' | '凝灰岩';
export const breachBlockNames: CaveCeilingBlock[] = ['幽匿块', '幽匿块', '深板岩', '幽匿块', '幽匿块', '幽匿块', '深板岩'];
// 洞顶底面朝下露着的那一块幽匿块（下面是兵营东边低一层的地面，游戏 y −51）：被箭撞松，整块连同碎渣往下掉，落在李樱右前方 1.5 米外低一层的地上；其余的当场崩成破坏粒子
export const fallingBlocks: V3[] = [[-1085, -31, 193]];
export const rockfallGroundY = -51;
const blockBox = ([x, y, z]: V3) => ({ min: gameToScene(x, y, z + 1), max: gameToScene(x + 1, y + 1, z) }); // 场景里的范围（S 把游戏 z 翻成 −y）
const boxEntryDist = (origin: V3, dir: V3, box: { min: V3; max: V3 }) => {
  let t0 = -Infinity;
  let t1 = Infinity;
  for (let k = 0; k < 3; k++) {
    const tToMin = (box.min[k] - origin[k]) / dir[k];
    const tToMax = (box.max[k] - origin[k]) / dir[k];
    t0 = Math.max(t0, Math.min(tToMin, tToMax));
    t1 = Math.min(t1, Math.max(tToMin, tToMax));
  }
  return t0 <= t1 ? t0 : NaN;
};
// 一路击穿：沿挑飞方向打到地面的每块实心方块（游戏坐标、原版方块 id、进这一格的程），出地面程 = 冲出湖面；工具/挡箭/搜挑飞.py --一路 写的，改了挑飞方向要重跑
export const breachPath = (flingPierceJson as unknown as { 方块: [number, number, number, string, number][] }).方块.map(([x, y, z, id, dist]) => ({ 方块: [x, y, z] as V3, id, 程: dist }));
export const exitGroundDist = (flingPierceJson as unknown as { 出地面程: number }).出地面程;
// 洞顶击穿完：箭尖穿过腔顶第二块深板岩（`一路击穿`[7]）、实体位置进到它里面这一刻，时间线.ts 的慢放从这里回原速（以前箭钉在这块里，回原速的时刻不变）
export const caveCeilingDist = breachPath[7].程 + 0.225;
export const caveBreachDone = deflect + caveCeilingDist / arrowMaxSpeed;
export const blockCenter = ([x, y, z]: V3): V3 => gameToScene(x + 0.5, y + 0.5, z + 0.5);
// 每块被箭（箭尖）碰到的时刻（相对 弹开，秒）
export const breachTimes = breachBlocks.map((b) => (boxEntryDist(deflectPoint, flingDir, blockBox(b)) - 0.225) / arrowMaxSpeed);

// ---------- 箭在 T 时的位置 ----------
// 返回实体位置、飞行方向、速度（米/秒）、绕长轴自转的角（度，见 自转角）。冲出地面以后是 '飞走'，不再画
export type ArrowState = { p: V3; dir: V3; v: number; spin: number; stage: '弦上' | '来' | '挑飞' | '飞走' };
export const arrowState = (storySec: number): ArrowState => {
  if (storySec < shootTime) return { p: nockPoint, dir: incomingDir, v: 0, spin: 0, stage: '弦上' };
  if (storySec < deflect) {
    const dist = incomingArrowDist(storySec - shootTime);
    return { p: add(nockPoint, incomingDir, dist), dir: incomingDir, v: arrowSpeed(dist), spin: spinAngle(dist), stage: '来' };
  }
  const dist = (storySec - deflect) * arrowMaxSpeed;
  return { p: add(deflectPoint, flingDir, dist), dir: flingDir, v: arrowMaxSpeed, spin: spinAngle(deflectDist + dist), stage: dist < exitGroundDist ? '挑飞' : '飞走' };
};
