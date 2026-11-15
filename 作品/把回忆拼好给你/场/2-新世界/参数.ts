// 第 1 句新世界这一场的数：地形、樱花林、远山远林、天色和雾、夜和星星、剖面、机位、你的走法（第 2 句 2-第一晚 也在这片地上，接着同一个镜头）。
// 除注明出处的以外都是 Agent 暂定，用户没看过；用户改了只改这里。纯数据。
// 坐标：x 东、y 北、z 上（格），出生点那格地面顶在 (0, 0, 0)；时刻从 分镜 的正片事件来，这里只放比例、时长（秒）。
import type { V3 } from '@engine/model/parts.tsx';
import { fps, legacyFrameSec } from '../../分镜/时间.ts';

/** 平原（群系 plains）：起伏一两格；短草成片、高草夹在草丛里、花零星；橡树零星。
 *  花照原版 1.20.1 的 flower_plain（NoiseThresholdProvider）：一大片一大片地分区，噪声低于 郁金香阈 的地方出四种郁金香（橙、红、粉、白），
 *  别处三分之一出虞美人、蓝花美耳草、滨菊、矢车菊，其余是蒲公英。原版噪声尺度 0.005（一片两百来格），这里 郁金香尺度 取同一个量级、阈是 Agent 挑的，
 *  让出生点到樱花林这一路上有一片郁金香 */
export const plainsParams = {
  种子: 20230607,
  起伏: 2.4,
  undulationScale: 64,
  fineUndulation: 0.5,
  fineUndulationScale: 16,
  /** 出生点附近多大一块压平（你站的那块地是平的） */
  spawnFlatRadius: 4,
  grassRate: 0.3,
  tallGrassShare: 0.16,
  flowerRate: 0.02,
  tulipScale: 160,
  tulipThreshold: -0.22,
  /** 零星几棵橡树 [x, y, 树干高]：摆在镜头往樱花林那条视线两边，不挡粉色 */
  oaks: [
    [-22, 30, 5],
    [-37, 71, 6],
    [31, 46, 5],
    [64, 92, 5],
    [-58, 118, 4],
    [7, 96, 5],
  ] as const,
};

/** 樱花林（群系 cherry_grove，原版 1.20 樱花林长在山坡上）：一座缓坡小山，山顶一片樱花树、地上铺粉红花簇。
 *  离出生点约 165 格，是地平线上一点粉。渲染距离 12 区块（192 格）的雾从 172.8 格起：落定的镜头在你身后 23 格，林子朝镜头这一边在雾前面、
 *  后半片照原版淡进雾里；镜头往前推，整片林子从雾里清出来。
 *  山的轮廓按噪声扭：山脚、山顶的半径各处乘 1 ± 山扰（核查 10-24：原来是同心圆，一圈圈台阶一看就是人造的），坡上、顶上再加一点起伏。
 *  树长法照原版 CherryTrunkPlacer、CherryFoliagePlacer（地形.ts），这里只管种多密 */
export const cherryGrove = {
  心: [40, 160] as const,
  mountainHeight: 9,
  /** 山脚、山顶平台的半径（格）：山从 山半径 处开始起坡，到 顶半径 以内不再升 */
  mountainRadius: 42,
  topRadius: 15,
  mountainJitter: 0.32,
  mountainJitterScale: 34,
  /** 坡上、顶上的起伏（格） */
  slopeUndulation: 1.6,
  slopeUndulationScale: 11,
  forestRadius: 24,
  treeSpacing: 7,
  treeRate: 0.85,
  petalClusterRate: 0.35,
};

/** 远山：出生点 起 格以外地面慢慢抬起一道道缓坡（低频噪声，坡顶高到 高 格），远处的地平线有起伏，不是一条直线（用户 10-24「超平坦背景 合理吗？」；
 *  核查 10-24：原来平原起伏 ±2.4 格，从镜头那么高往远处看还是一条平线）。原版平原挨着别的群系，远处常有山坡；这几道坡按原版 12 区块的雾淡出。
 *  樱花林方向（从出生点看偏东 让林角 以内）不抬，坡在林子两边，不挡那一点粉。演绎，Agent 暂定 */
export const farHills = { 起: 70, full: 150, 高: 14, scale: 52, offset: 0.2, forestYieldDeg: [8, 18] as const };

/** 远林：远山坡上两片橡树林（树干 4～6 格，照原版 TreeFeatures.OAK），在雾里是一团团深绿，地平线不光秃。心 [x, y]、半径、树距（格），演绎，Agent 暂定 */
export const farGroves = [
  { 心: [-58, 118] as const, radius: 18, treeSpacing: 6 },
  { 心: [84, 136] as const, radius: 15, treeSpacing: 6 },
] as const;

/** 铺地形的范围：镜头一直朝北偏东看，只铺前方一扇。扇心往北张开，离 远心（推镜终点附近）半径 以内；
 *  半径取 200 > 雾止 192，推到最前面时地平线上也是雾里的地，不露地形的边 */
export const terrainRange = { south: -34, north: 236, west: -150, east: 210, fanCenter: [6, -42] as const, fanWidth: 34, fanSpread: 0.95, rangeCenter: [6, 30] as const, radius: 200, plantRadius: 120 };

// ---------- 天色、雾（原版 1.20.1 的算法，平原白天） ----------

/** 原版平原的天色（sky_color 7907327）、雾色（fog_color 12638463）；白天亮度 1 */
export const skyColor = '#78a7ff';
const baseFogColor = [0xc0, 0xd8, 0xff];
const skyRgb = [0x78, 0xa7, 0xff];
/** 渲染距离 12 区块 = 192 格（原版默认） */
export const renderDistance = 192;
/** 原版 FogRenderer.setupColor：雾色往天色拉 1 − (0.25 + 0.75 × 区块数 / 32)^0.25（12 区块时 0.146） */
const skyPull = 1 - (0.25 + (0.75 * renderDistance) / 16 / 32) ** 0.25;
export const fogColor = '#' + baseFogColor.map((c, i) => Math.round(c + (skyRgb[i]! - c) * skyPull).toString(16).padStart(2, '0')).join('');
/** 地形的雾（原版 FogRenderer.setupFog 的 FOG_TERRAIN，柱形）：起 = 距离 − clamp(距离 / 10, 4, 64)，止 = 距离；中间按 smoothstep 混雾色 */
export const terrainFog = { 起: renderDistance - Math.min(64, Math.max(4, renderDistance / 10)), 止: renderDistance };
/** 天的雾（FOG_SKY，球形，起 0、止 = 渲染距离）：天幕在眼睛上方 16 格 */
export const skyDomeHeight = 16;

// ---------- 夜（第 2 句：边挖边天黑，封顶以后熬一夜） ----------

/** 夜里的天：照抄 场/2-第一晚 原来的夜色（地平 #141c33、天顶 #04060e，主会话暂定的深蓝；原版夜里天顶是黑的、地平是雾色 × 0.06），白天的天、雾按原版天亮程度往它插 */
export const nightSky = { horizon: '#141c33', topColor: '#04060e' };

/** 星星照原版 1.20.1 LevelRenderer.createStars：种子 10842 的 LegacyRandomSource 撒 1500 个方向，离眼睛 100 格、半边长 0.15～0.25；
 *  亮度照 ClientLevel.getStarBrightness（(1 − (cos(天球角·2π)·2 + 0.25))² × 0.5，夹 0～1），按 SRC_ALPHA、ONE 加到天上。
 *  演绎：原版一颗星 6～10 成片像素、夜里只加 0.25 的亮，手机 390 宽上不到一个像素，快进一夜时看不出满天星星在转（核查 10-24）；
 *  这里一颗画成 画格 × 画格 个天格（12 成片像素见方，手机上 2 像素），亮度按原版的 亮倍 倍加上去（夜里加 0.75）。撒在哪、怎么转、什么时候出来照原版 */
export const starField = { 种子: 10842, starCount: 1500, 距离: 100, starCellPx: 2, brightnessMult: 3 };

// ---------- 剖面（第 1 句尾到 2-第一晚：你挖坑的那一格） ----------

/** 你第一晚挖坑的那一格（格 i, j，地面顶 z 0）：出生点朝樱花林走 4 格多就到（方向和樱花林差不到 1°），四周平地。
 *  剖面切在 y = j（坑这一排的南面），镜头在南边贴着地往北看；2-第一晚 的东西按 剖面原点（坑那一格南面的中点）摆 */
export const pit = { i: 1, j: 4, depth: 3 };
export const sectionOrigin = [pit.i + 0.5, pit.j, 0] as const;

/** 剖面这一截地：坑这一排和后面一排（后墙）左右各 半宽 列按坑挖到哪一步重铺，铺到 底；坑和镜头之间的 剥排 排（左右各 剥半宽 列）在第 1 句剖开 起
 *  从镜头脚下往坑那边每 剥秒 撤一排，露出剖面（同样铺到 底，撤到一半时看得见下一排的切面）。坑左右 让草 列内不长草、不开花（不挡你）。
 *  后墙：坑后面那一排、草方块以下那几格压暗，从剖面看得出是个洞（原版平滑光照在一格宽的竖井里，后墙两边挨着实心方块，环境光遮蔽把它压到 0.6 左右、贴底的一格 0.4）；
 *  顶上那格草方块的顶面在地面上看得见，不压（它朝洞里那面 2-第一晚 另压）。演绎，Agent 暂定 */
export const crossSection = { 半宽: 12, bottom: -8, stripRows: 11, stripHalfWidth: 10, grassClearDist: 1, backWallLight: 0.5 };

// ---------- 机位（透视三渲二） ----------

export type CameraRigFrame = { 眼: V3; 看: V3; fov: number };

/** 剖面机位：在坑南边 11.5 格、离地 2.4 格（高过高草，看得到后面那片地），正北看、往下俯 10°，视角 42°。剖面那里一格约 163 成片像素（手机 390 宽上你 45 像素高），
 *  地平线在画面上 27%（顶上的歌词压在天上），剖面的地面线在 54%，往下露出 4 格多：坑底（3 格深）和你都在画里；
 *  地面线和地平线之间是剖面后面那片起伏的平原，远处樱花林那座山、橡树按原版的雾淡出（用户 10-24「背景都不能是超平坦」） */
const sectionEye: V3 = [pit.i + 0.5, pit.j - 11.5, 2.4];
const sectionPitch = (10 * Math.PI) / 180;

/** 钻进图标时新世界从图标框里露出来：镜头从 钻起 一路往前冲、越来越慢，钻完（场/2-选择世界 参数.ts 的 钻入.秒）落定在 落定；
 *  你起步以后从 落定 缓起缓停地往前、往下落到 剖面（第 1 句剖开 那一拍到位）。
 *  落定：在你身后 23 格、高 6.5 格，顺着你看樱花林的方向，往下俯 4.3°：地平线在画面上 42%（顶上的歌词压在天上），
 *  你在 72%（下三分之一，聊天栏在左下不压你），你约 120 成片像素高（「渺小」）；樱花林在地平线上一小片粉 */
export const cameraRigs = {
  钻起: { 眼: [-7.4, -31.5, 10.4], 看: [33.4, 133.5, -6], fov: 50 },
  落定: { 眼: [-5, -21.8, 7.4], 看: [33.4, 133.5, -4.6], fov: 50 },
  剖面: { 眼: sectionEye, 看: [sectionEye[0], sectionEye[1] + 100, sectionEye[2] - 100 * Math.tan(sectionPitch)], fov: 42 },
} as const satisfies Record<string, CameraRigFrame>;

/** 撤一排地用几秒：2 帧一排。原来 24 fps 时 1 帧一排，60 fps 下 2.5 帧取整成 2、3 帧交替，一顿一顿（用户 11-03「统统改成 60 帧」） */
export const stripSec = 2 / fps;

// ---------- 你（史蒂夫） ----------

/** 你站的地方（出生点）：起步朝坑那一格（樱花林方向）走过去 */
export const you = { feet: [0.5, 0.5, 0] as V3 };

/** 起步后的走速（米/秒）：原版走路 4.317 */
export const walkSpeed = 4.317;

/** 走到了以后：转身朝东（剖面里看得见右手挥）用 转身秒，再低头看脚下（低头秒；两个都是 24 fps 时 3 帧）；原版挖脚下那格要低头。朝向同 stevePose 的 yaw（−90 朝东），头俯仰负 = 低头 */
export const arrived = { facing: -90, turnSec: legacyFrameSec(3), headDownSec: legacyFrameSec(3), 头: -90 };

/** 聊天栏缩放（一个界面像素几个成片像素）：原版 2560×1440 自动选的界面尺寸 6，同第 15 句的「Steve加入了游戏」：
 *  同一行聊天字跨镜头不能突然变大变小（主会话 10-24 美术定稿）。聊天宽也同第 15 句（界面/聊天栏宽.ts，110）。
 *  淡秒：「Steve加入了游戏」原版最后 20 刻淡掉，这里铺在剖开前这 1/3 秒里（24 fps 时 8 帧；编排.ts 聊天刻在） */
export const chatOverlay = { 缩放: 6, fadeSec: legacyFrameSec(8) };
