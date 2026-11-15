// 选择世界这一场每一帧的样子（光标在哪、指没指着那一项、选没选中、搜索框光标亮不亮、钻进图标到哪了、片尾碎片飞到哪了），按歌曲帧算：
// 2-选择世界、2-初入 一镜不切，两段都从这里取，接缝那一帧才对得上。纯计算（不 import react、three），测试直接引。
// 时刻从 分镜 的正片事件来，比例、时长在 参数.ts。
import { fps, oneFrameSec } from '../../分镜/时间.ts';
import { events as mainCutEvents } from '../../分镜/正片开场.ts';
import { scatter, iconEdge } from '../../界面/实例图标.ts';
import { cursor, framingCenter, unit, save, ui, shardParams, drillIn, endWhite, endPullBack, colorBackBounce, flashTicks } from './参数.ts';

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smoothStep = (q: number) => q * q * (3 - 2 * q);

/** 存档那一格图标的界面像素框 */
export const iconFrame = { x: ui.行.left, y: ui.行.topY, side: ui.iconEdge };
const iconCenter = { x: iconFrame.x + iconFrame.side / 2, y: iconFrame.y + iconFrame.side / 2 };

/** 平常的取景（第 0 镜、片尾） */
export const normalFraming = { 中心: { ...framingCenter }, unit };

// ---------- 存档那一行的字 ----------

/** 原版 WorldListEntry 的第二行：存档文件夹名 + 「 (」+ 上次游玩时间 + 「)」。时间是 new SimpleDateFormat()（Java 17、zh_CN 的短格式 y/M/d ah:mm：
 *  月日不补零，十二小时制、0 点写 12，上午下午写在前面） */
export const lastPlayedText = (t: { 年: number; 月: number; 日: number; 时: number; 分: number }) => {
  const meridiem = t.时 < 12 ? '上午' : '下午';
  const clockHour = t.时 % 12 === 0 ? 12 : t.时 % 12;
  return `${t.年}/${t.月}/${t.日} ${meridiem}${clockHour}:${String(t.分).padStart(2, '0')}`;
};

/** 三行字：存档名（白）、文件夹名和上次游玩、模式和版本（LevelSummary.getInfo：模式 + 「, 」+ 版本： + 「 」+ 版本号） */
const threeLines = (t: typeof save.lastPlayed | typeof save.reunionPlayed) => [save.名, `${save.名} (${lastPlayedText(t)})`, `${save.gameMode}, 版本： ${save.版本}`] as const;
/** 第 0 镜、片尾回色前：上次游玩是去年 */
export const rowTexts = threeLines(save.lastPlayed);
/** 片尾回色起：上次游玩换成这次重逢 */
export const reunionRowTexts = threeLines(save.reunionPlayed);

// ---------- 第 0 镜：光标、指着、选中 ----------

/** 光标箭头尖（界面像素，取到半个界面像素：光标一个光标像素一个光标像素地走）；开场鼓点那一帧（点下去）还在，之后钻进图标就不画了 */
export const cursorAt = (songFrame: number): { x: number; y: number } | null => {
  const inFrame = mainCutEvents.开场光标入.帧, arriveFrame = mainCutEvents.开场光标到.帧, pressFrame = mainCutEvents.开场鼓点.帧;
  if (songFrame < inFrame || songFrame > pressFrame) return null;
  const q = smoothStep(clamp01((songFrame - inFrame) / (arriveFrame - inFrame)));
  const roundHalf = (v: number) => Math.round(v * 2) / 2;
  return { x: roundHalf(cursor.起.x + (cursor.停.x - cursor.起.x) * q), y: roundHalf(cursor.起.y + (cursor.停.y - cursor.起.y) * q) };
};

/** 指着那一项时图标上蒙灰、画播放箭头：0 没指着；1 指着字那边（灰箭头，world_selection v 0）；2 指着图标（蓝箭头，v 32）。
 *  点下去那一帧起不画（钻进去的是照片，不是蒙着灰的播放键） */
export const pointingAt = (songFrame: number): 0 | 1 | 2 => {
  if (songFrame >= mainCutEvents.开场鼓点.帧) return 0;
  const c = cursorAt(songFrame);
  const r = ui.pointAt;
  if (!c || c.x < r.left || c.x >= r.right || c.y < r.上 || c.y >= r.下) return 0;
  return c.x < ui.行.left + ui.iconEdge ? 2 : 1;
};

/** 点下去以后选中了那一项（原版 setSelected：选中框；列表拿走焦点，搜索框白边变灰、光标不闪了） */
export const isSelectedAt = (songFrame: number) => songFrame >= mainCutEvents.开场鼓点.帧;

/** 搜索框里的「_」亮不亮：拿着焦点时按原版 EditBox 的刻数闪（界面一打开 frame 从 0 数，第 0 帧亮）；段内帧给 起帧 = 这一段界面打开的歌曲帧 */
export const boxCursorOn = (songFrame: number, startFrame = 0) => Math.floor(Math.floor(((songFrame - startFrame) * 20) / fps) / flashTicks) % 2 === 0;

// ---------- 第 1 句开头：钻进图标 ----------

/** 钻入进度 0～1（开场鼓点那一帧是 0，钻入.秒 前一帧是 1：有界面的最后一帧图标已经铺满、照片全透，之后去掉界面不跳）和缓入后的 q */
export const drillInProgress = (songFrame: number) => {
  const p = clamp01((songFrame - mainCutEvents.开场鼓点.帧) / (drillIn.秒 * fps - 1));
  return { p, q: p ** drillIn.easeIn };
};

/** 钻到 q 时的取景：尺 按指数从 尺 涨到 终尺；图标中心在画面上的位置从原来那里线性挪到画面正中 */
export const drillInFraming = (q: number) => {
  const s = unit * (drillIn.endZoom / unit) ** q;
  const dx = (iconCenter.x - framingCenter.x) * unit * (1 - q);
  const dy = (iconCenter.y - framingCenter.y) * unit * (1 - q);
  return { 中心: { x: iconCenter.x - dx / s, y: iconCenter.y - dy / s }, unit: s };
};

const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** 4×4 Bayer 阈值（0～1 之间）：透掉的比例超过它的那个照片像素就透掉（同 界面/符文歌词.tsx 的抖动） */
export const threshold = (i: number, j: number) => (bayer[(j & 3) * 4 + (i & 3)]! + 0.5) / 16;

/** 钻到 q 时图标透掉了多少（0～1） */
export const drillInAlpha = (q: number) => clamp01((q - drillIn.alphaStart) / (drillIn.fullAlpha - drillIn.alphaStart));

/** 钻到 q 时调子从现实（界面）往夏日白天（新世界）走了多少：跟着图标透掉的比例走 */
export const drillInWarm = (q: number) => smoothStep(clamp01(q / drillIn.fullAlpha));

// ---------- 片尾：白一闪、从图标跟前拉回、碎片拼回、回色 ----------

/** 片尾第 f 帧（段内，0 = 片尾白光 = 咔哒那一帧）的取景：钻入取景 倒着走，q 从 起尺 对应的那一点按 (1 − p)^缓出 收到 0（平常取景） */
export const endFraming = (f: number) => {
  const q0 = Math.log(endPullBack.startZoom / unit) / Math.log(drillIn.endZoom / unit);
  const q = q0 * (1 - clamp01(f / (endPullBack.秒 * fps))) ** endPullBack.easeOutPower;
  return q <= 0 ? normalFraming : drillInFraming(q);
};

const tileCount = iconEdge / shardParams.shardEdge;
const blockUiEdge = (iconFrame.side * shardParams.shardEdge) / iconEdge;

/** 一块碎片：第 (i, j) 块（从左上数），从 起 飞进图标框里它那一格 */
export type Shard = { i: number; j: number; 起: { x: number; y: number }; startScale: number; startSec: number };

/** 16 块碎片，起点在图标框四周一圈（离图标中心 碎片.远 界面像素，横向拉宽 1.6 倍贴合宽画面；方向、远近、起飞时刻、大小都按散列定死；
 *  起飞时刻照 24 fps 时落在 1/24 秒的整数倍上） */
export const shards: readonly Shard[] = Array.from({ length: tileCount * tileCount }, (_, n) => {
  const i = n % tileCount, j = Math.floor(n / tileCount);
  const angle = Math.atan2(j - (tileCount - 1) / 2, i - (tileCount - 1) / 2) + (scatter(i, j, 1) - 0.5) * 2.2;
  const far = shardParams.farRange[0] + (shardParams.farRange[1] - shardParams.farRange[0]) * scatter(i, j, 2);
  return {
    i,
    j,
    起: { x: iconCenter.x + Math.cos(angle) * far * 1.6, y: iconCenter.y + Math.sin(angle) * far },
    startScale: shardParams.startScale[0] + (shardParams.startScale[1] - shardParams.startScale[0]) * scatter(i, j, 3),
    startSec: shardParams.firstSec + shardParams.staggerSec * scatter(i, j, 4),
  };
});

export type ShardState = { x: number; y: number; side: number; 到: boolean };

/** 片尾第 f 帧（段内，0 = 片尾白光）这块碎片在哪（左上角，界面像素）、多大；还没起飞的不画（null）、到了的就在格子里 */
export const shardAt = (shard: Shard, f: number): ShardState | null => {
  const startFrame = shard.startSec * fps;
  if (f < startFrame) return null;
  const p = clamp01((f - startFrame) / (shardParams.flySec * fps));
  const q = p ** shardParams.easeIn;
  const target = { x: iconFrame.x + shard.i * blockUiEdge, y: iconFrame.y + shard.j * blockUiEdge };
  const scale = shard.startScale + (1 - shard.startScale) * q;
  const side = blockUiEdge * scale;
  // 中心从起点直线飞到格子中心
  const cx = shard.起.x + (target.x + blockUiEdge / 2 - shard.起.x) * q;
  const cy = shard.起.y + (target.y + blockUiEdge / 2 - shard.起.y) * q;
  return { x: cx - side / 2, y: cy - side / 2, side, 到: p >= 1 };
};

/** 片尾第 f 帧（段内）的白光不透明度：第 0 帧纯白，(1 − 秒/闪白秒)² 闪白秒里退完 */
export const outroWhiteAt = (f: number) => {
  const flashLengthFrames = endWhite.whiteFlashSec * fps;
  return f >= 0 && f < flashLengthFrames ? (1 - f / flashLengthFrames) ** 2 : 0;
};

/** 回色时图标弹出去几个界面像素（回色那一帧起 弹秒 里） */
export const endBounce = (f: number, colorBackFrame: number) => (f >= colorBackFrame && f - colorBackFrame < colorBackBounce.bounceSec * fps ? colorBackBounce.bounce : 0);
