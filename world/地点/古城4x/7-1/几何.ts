// 第 7 章第 1 场「黑暗监守」七段（7-1-1～7-1-7）共用的地理（纯数据）。场子在古城4x（../古城4x布局.ts），坐标一律从布局文件取。
// 场景 (x, y, z) = (游戏 x + 720, 240 − 游戏 z, 游戏 y + 50)，Z 朝上、北 = +Y、1 = 一格。
// 场子：x −907～−842、z 214～246 的幽匿空场，四面是城自带的双层墙（墙脊深板岩砖，两边灰羊毛道），头顶 18～27 格。里面：中央台（x −882～−867，北半 z 222～225 高 7～8 格、南半 z 231～237 高 12～14 格）、
//   东南一座幽匿土丘（顶 (−856, 238)，高 7 格）、西边矮废墟（x −895～−888、z 228～237）。监守者 6-4-8 在中央台北边 (−873.5, 217.5) 钻出来；F1（李樱 6-4-1 垫的羊毛）在北墙根 (−878, 214)。
import type { V3 } from '../../../../engine/model/parts.tsx';
import { RAMP_SEC } from '../../../角色/跑步.ts';
import { G4 } from '../../古城4x.tsx';
import { vanilla, elite, baseSpeed, shieldPoint, scene71, wallTopLanding as 上墙点4x, wallJumpTakeoff, footOf, handoffs, huangPanPerch, type BlockPos } from '../布局.ts';
import * as K649 from '../6-4-9/编排.ts';

export const FPS = 24;
export const floorZ = -1; // 场子地面（脚底 y −51）

// ---------- 接 6-4-9 末帧 ----------
export const handoffFrame649 = K649.END - 1;
export const wardenStart: V3 = K649.WARDEN_AT; // 游戏 (−873.5, −51, 217.5)
export const wardenStartYaw = K649.WARDEN_YAW; // 实体转角（正面朝 −Y 的模型绕 Z 转多少度）
export const pursuersStart = K649.pursuers(handoffFrame649); // { 刘, 黄 } 的 FigurePose（loc、yaw 等）

// ---------- 速度、原版参数 ----------
// 监守者跑 60 米/秒（用户 10-18 定的古城基准速度），起跑、刹车按默认的 `RAMP_SEC`；攻击冷却照原版 18 刻
export const wardenSpeed = baseSpeed.监守者;
export const wardenAccel = wardenSpeed / RAMP_SEC;
export const attackCooldownSec = vanilla.监守者.attackCooldownTicks / 20; // 0.9
export const dodgeLeap = elite.闪避跳;
// 每一跳的离地（`eliteLeap` 的 apexHeight）：照 6-4 的 `woolLeapApex`（用户 10-18 定人跑跳 30 米/秒），取水平 ≥ 28 米/秒里最高的；
//   墙高、跳得短到不了 28 的取不撞里最快的：多数是 1.5（最高点只比两头较高的那头高 1.5，`eliteLeap` 的下限）；
//   J4 从 C1 往西要越过土丘北脚那道幽匿坡（(−859～−861, 221)，一格一格往上），4.5 以下都撞。核对.py「7-1 跳」查同一条弧
export const leapApex = { J1: 1.5, J2: 3.25, J3: 1.5, J4: 4.5, H1: 1.5, H2: 1.5, H3: 1.5 };
// 站着起跑、跑 dist 米刹住要几秒（先加速、到全速匀速、再刹车；距离不够就加速到一半就刹）
export const wardenTravelSec = (dist: number) => {
  const rampDist = (wardenSpeed * wardenSpeed) / wardenAccel;
  return dist <= rampDist ? 2 * Math.sqrt(dist / wardenAccel) : (2 * wardenSpeed) / wardenAccel + (dist - rampDist) / wardenSpeed;
};
export const flatDist = (a: V3, b: V3) => Math.hypot(b[0] - a[0], b[1] - a[1]);

// ---------- 落脚点（场景脚底） ----------
export const spots = {
  hillTop: footOf(scene71.丘顶),
  eastWallRidge: footOf(scene71.东墙脊),
  C1: footOf(scene71.C1),
  C2: footOf(scene71.C2),
  huangPlatform: footOf(scene71.黄台),
  southPlatformTop: footOf(scene71.南台顶),
  huangPanPerch: footOf(huangPanPerch),
  belowWardenPlatform: footOf(scene71.监守者台下),
  shieldPoint: shieldPoint,
  上墙起跳: wallJumpTakeoff,
  wallEntry: 上墙点4x,
};
// 监守者追人时停下来的地方（够得着就挥臂）：东墙脚（刘心忠在墙脊上，它够不着）、C2 东边 2.5 格
// 东墙脚取墙里侧离墙根一格：再靠外会站进羊毛墙里；x −840 那列是墙根深板岩柱子，贴着站 7-1-5 镜 3 从墙外往下看会挡住下半身；往南一格避开北边石柱（工具/机位核对/核对.py 的「陷」「挡」）
export const eastWallFoot: V3 = G4(-842.5, -51, 226.5);
export const lungeAtLiuPoint: V3 = G4(-873.0, -51, 220.5);
// 监守者爬上土丘一半就听到刘心忠落在东墙上：丘脚。取东北边 2 格的平地：(-859.5, -51, 232.0) 是高出地面一格的幽匿块，它照场子地面走不上台阶，会半身陷进去
export const moundFoot: V3 = G4(-857.5, -51, 230.5);
export const platformNE: V3 = G4(-862.5, -51, 224.0);
// 召唤骏马：施法者脚下 + 朝向（北）× 1.5（铁魔法 SummonHorseSpell）
export const horseSpawnPos: V3 = [shieldPoint[0], shieldPoint[1] + 1.5, floorZ];
export const horseLeapApex = 2.5;
// 护盾在刘心忠眼前 3 格（往东，朝着扑过来的监守者）；监守者拍盾时站在盾前 1.1 格
export const plannedShieldCenter: V3 = [shieldPoint[0] + 3, shieldPoint[1], floorZ];
export const shieldFront: V3 = [plannedShieldCenter[0] + 1.1, plannedShieldCenter[1], floorZ];
// 护盾碎了以后循着马蹬地的振动追到马起跳的墙脚下 = 7-1-7 末帧（衔接.七三首.监守者），第 3 场从这里接着追
export const belowHorse: V3 = handoffs.七三首.监守者;
// 6-4-8 钻出以后先往东扑刘心忠那一步停在这里
export const firstLungeStep: V3 = G4(-867.5, -51, 219.8);

// ---------- 火把（箭插在地上变成的火把方块） ----------
// TorchBlock 的 cell 是场景整数格的最小角：游戏方块 (x, y, z) → (x + 720, 239 − z, y + 50)
export const torchBlocks: V3[] = scene71.火把格.map(([x, y, z]: BlockPos) => [x + 720, 239 - z, y + 50] as V3);

