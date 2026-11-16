// 正片第 9–11 句（段 2-明年六月见、2-烟花、2-截图下线）的事件和段窗口；第 11 句碎裂在 歌词.ts。
// 分镜按串拆开的一份（用户 11-06 定按句拆，改一句只过期那几段）；时刻、排段的写法见 ./时间.ts。纯模块，不许 import react、three、remotion。
import { originalDurSec } from '../配乐/网格.ts';
import { chainLookup, segmentFrames, resolveEvents, arrangeSegs, type EventDef } from './时间.ts';
import * as lyrics from './歌词.ts';

export const eventDefs = {
  // 第 9 句（门这个机位，夜里，暑假最后一晚）：同一机位匹配剪到夜里，先停一下种树苗（牌子已经立着、空白），镜头再推到牌子上，一个词一个词写下两行字（字在 场/2-门口/参数.ts 的 告示牌词们）
  nightfall: { 在: { 句: 9, points: '起' }, basis: '三稿 28.62：同一机位从第 8 句的白天匹配剪到夜里（房子、人、镜头都不动，只换天和调子），你手里拿着樱花树苗' },
  plantSapling: {
    在: { beat: 68 },
    basis: '29.08（「我」）：匹配剪进来停一下，镜头往左让出树苗那格（开场那一镜它有一半在画框外），你朝西种下樱花树苗（树苗在门外离墙四格、头顶没有屋檐的空地上）（Agent 暂定；核查 10-24 嫌开头没有停顿、树苗在画框边上）',
  },
  pushToSign: {
    在: { beat: 68.25 },
    basis: '29.19：种下以后往牌子上推，推 0.9 秒（核查 10-24：原来 29.30 起推、0.55 秒就推完，你的头从画面上一扫而过；提前四分之一拍，N 16 照样停够 0.6 秒，Agent 暂定）',
  },
  writeLine1Word1: {
    在: { beat: 70.5 },
    basis: '30.15：推到牌子上，写下第一行的第一个词。落在半拍上，和歌词的字（「的」29.92、「情」30.33）错开，不同一帧换两处字（Agent 暂定）。用户 10-24 定一拍一个字写不完就按词写、两三拍一行：一行两个词，两行隔两拍',
  },
  writeLine1Word2: { 在: { beat: 71.25 }, basis: '30.47：第一行第二个词，在「情」（30.33）和「话」（30.79）中间（核查 10-24：原来一行一下整行冒出来；Agent 暂定）' },
  writeLine2Word1: { 在: { beat: 72.5 }, basis: '31.00：第二行第一个词，落在「话」（30.79）和第 10 句前导（31.26）中间，离第一行两拍' },
  writeLine2Word2: {
    在: { beat: 73 },
    basis: '31.21：第二行第二个词，写完的两行在特写里留到 31.58 镜头拉开（0.37 秒，拉开头几帧还看得清；按词写只留得出这么多，Agent 暂定）',
  },
  // 第 10 句（用户 10-24：「像转瞬即逝的烟花 镜头没有集中看烟花 跟随烟花上升」）：你在牌子和树苗中间放烟花火箭（原版合成的最低 1 级飞行，演绎成 Flight 0：
  // 飞 n 刻就炸，见 库/特效/烟花.ts），镜头从牌子上拉开、跟着火箭往上走，烟花在画面中间炸开；炸开落在拍上，发射往前推 n 刻
  pullBackFromSign: { 在: { 句: 10, points: '起' }, basis: '31.58（「像」）：两行字写完在特写里留 0.37 秒，镜头从牌子上往后拉开，露出你和放烟花的那格（Agent 暂定）' },
  switchToRockets: {
    在: { after: 'firework1Launch', addSec: -0.15 },
    basis: '你手里换上烟花火箭：镜头已经拉开到 N 30 上下、你整个人在画里（核查 10-24：拿早了，火箭从牌子特写的右边戳进来）',
  },
  firework1Launch: { 在: { after: 'firework1Burst', addSec: -15 / 20 }, basis: '32.17：你右键放出第一发（飞 15 刻），镜头一边拉开一边跟着它往上走' },
  firework1Burst: {
    在: { beat: 77 },
    basis: '32.92（「即」）：第一发在画面中间炸开（Agent 暂定）。原来在「瞬」（32.49），离牌子特写太近：火箭得在特写里就拿到手上；挪后一拍，镜头先拉开再换火箭',
  },
  firework3Launch: { 在: { after: 'firework3Burst', addSec: -16 / 20 }, basis: '飞 16 刻，从画面下边升上来。名字留着「三」：歌词的「烟花」字效颜色照这一发（界面/歌词字效.ts）' },
  firework3Burst: {
    在: { beat: 80 },
    basis: '34.20（「花」后的拍）：第二发（带闪烁，炸完噼啪响），歌词「烟花」唱到「花」（34.08）拼齐、炸出一圈同色火花，天上这一发紧跟着在拍上炸开（五个关键词跟画面一起动），离第一发三拍，一发看清一发。原来第 10 句有三发，用户 10-24 定画面转太快就删，只留两发（Agent 暂定）',
  },
  finalFireworkLaunch: {
    在: { after: 'bigFireworkBurst', addSec: -13 / 20 },
    basis: '三稿 35.90「最后一发火箭升空」：35.68（第 83.5 拍）右键放出，35.90 正离地往上蹿，飞 13 刻炸在「绽」上。镜头这时已经落回门口，第 10 句第二发的闪烁火花快落完，火箭不埋在火花里（核查 10-24）',
  },
  bigFireworkBurst: { 在: { beat: 85 }, basis: '三稿 36.33「绽」：最大的一发（大型球状）炸开，大炸声和咔哒同一帧（三稿「最大一发烟花和定格放在同一拍」）' },
  screenshotFreeze: {
    在: { beat: 85 },
    basis: '三稿 36.33「绽」：咔哒、闪白、画面定格成拍立得，就是你按 F2 截下的那张照片（第 0 镜的图标、第 14 句里都用它）。闪白那一帧整屏全白，底下换上的定格画面取 5 帧以后的世界（门口之夜参数.ts 的 照片帧）：刚炸那一刻火花全挤在一点，拍下来只是个亮点',
  },
  logOff: {
    在: { after: 'worldShatters', addSec: 0 },
    basis: '37.61（三稿 38.03 提前一拍，和碎裂同一拍）：世界碎掉那一下就是你下线：聊天栏黄字「Steve退出了游戏」，照片缩成褪色蒙灰的方形图标（8 帧缩好，37.94）。提前是为了接缝前最后半秒图标和聊天行都定住（38.43 切第 12 句），一个动作看得清（Agent 暂定）',
  },
} as const satisfies Record<string, EventDef>;

/** 接 能查到的事件：本串的，加上引来的那几份的（一路引上去） */
export const eventTable: Readonly<Record<string, EventDef>> = { ...lyrics.eventTable, ...eventDefs };
/** 本串事件在歌上的秒数和歌曲帧 */
export const events = resolveEvents(eventDefs, eventTable);

/** 正片第 9–11 句：门这个机位的夜里，按歌词行切三段（段界在第 10、11 句的前导音）；以后接上前后的段再并成一整串 */
export const mainCutSentences9to11 = arrangeSegs(
  {
    name: '正片第9至11句',
    duration: originalDurSec,
    segments: [
      {
        key: '2-明年六月见',
        start: { 句: 9, points: '起' },
        end: { 句: 10, points: '前导' },
        basis: '起：第 9 句首字（28.62），接 2-收集快乐，同一机位白天匹配剪到夜里；止：第 10 句前导音（31.26），镜头还停在写好两行字的牌子上',
      },
      { key: '2-烟花', end: { 句: 11, points: '前导' }, basis: '止：第 11 句前导音（34.80），镜头正从天上落回门口，第二发的闪烁火花还在往下落' },
      { key: '2-截图下线', end: { 句: 12, points: '起' }, basis: '止：第 12 句首字（38.43），照片已经缩成褪色的方形图标' },
    ],
  },
  eventTable,
);

/** 只查本串的段（段.ts、画面用：帧数、场窗口、原声 cue 的入点） */
export const { segmentWindow, segClock } = chainLookup(mainCutSentences9to11);
/** 本串各事件在这一段里的段内帧（不在这段里的也照算，会是负数或不小于帧数） */
export const segEventFrames = (segKey: string) => segmentFrames(segmentWindow(segKey).起帧, events);
