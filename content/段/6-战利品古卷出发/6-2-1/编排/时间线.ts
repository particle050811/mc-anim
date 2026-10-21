// 段表、台词开口、各动作的时刻和界面的开关。三段是一条连续的戏、共用一条时间轴（全局帧 G，6-2-1 首帧 = 0），
// 段起点由段长累加；各时刻相对所在段的起点写（`seg22`、`seg23` 是 6-2-2、6-2-3 的起点，秒），改哪段的长度，后面的段跟着顺延。
// 这里的段是旧段号的窗口（编排、声音按它分），成片的段界（拼成哪几个 Composition）见 ../6-2至6-3段界/段表.ts。
import { ss } from '../动作.ts';

export const FPS = 24;

// ---------- 段表（下一段首帧 = 上一段末帧） ----------
export type SegmentName = '6-2-1' | '6-2-2' | '6-2-3';
// 段长（帧）按台词和界面停留的时间定（用户：段长可以调）：每个界面至少停 2.5 秒，标注一条一条出来，读得完。
// 6-2-3 含结构罗盘界面的 66 帧
const segmentLengths: [SegmentName, number, string][] = [
  ['6-2-1', 288, '战利品'],
  ['6-2-2', 158, '还差什么'],
  ['6-2-3', 464, '古卷'],
];
export const segmentTable = Object.fromEntries(
  segmentLengths.map(([name, length, title], i) => {
    const start = segmentLengths.slice(0, i).reduce((sum, [, l]) => sum + l, 0);
    return [name, { 起: start, 止: start + length, 名: title }];
  }),
) as Record<SegmentName, { 起: number; 止: number; 名: string }>;
export const segmentFrames = (segment: SegmentName) => segmentTable[segment].止 - segmentTable[segment].起 + 1;
export const lastFrame = segmentTable['6-2-3'].止; // = 6-2-4 第 0 帧
const seg22 = segmentTable['6-2-2'].起 / FPS;
const seg23 = segmentTable['6-2-3'].起 / FPS;

// 台词开口（全局帧）照用户在剪映里放字幕的位置（配音见 src/配音/台词表.json）。「熔炼温度」比用户放的往后 5 帧：上一句 7.81 秒才说完，留 0.4 秒转头看血。
// 夸克古卷那句有声 8.43 秒，从 6-2-2 说进 6-2-3：古卷页等这句说到「提升到80%」才收，拿指南针、「走吧九胡……」和后面的戏都排在它后面。
// 这句开口、「对了」一拍手（`cues.slap`）、铁砧页浮出是同一拍（用户 10-20：界面浮出和这句话对齐，不先开界面干等）：抬眼（`cues.lookUi`）一完就扬手开口
// 「不过，这一趟也不算白跑。」接着上一段的「还是没有最终boss！」，边走进来边说，填开场走到桌边这几秒的空（用户 10-20）
export const lineStarts = {
  notWasted: 8,
  chainBase: 90,
  smeltTemp: 197,
  sediment: segmentTable['6-2-2'].起 + 7,
  quarkTome: segmentTable['6-2-2'].起 + 116,
};
const quarkSec = lineStarts.quarkTome / FPS;
// 「走吧九胡，我们现在去古城寻宝！」开口（全局帧）。说这句时李樱端着指南针（拿针、端平见 `cues`）
export const ancientCityLineStart = segmentTable['6-2-3'].起 + 189;
// 结构罗盘界面（模型/界面/结构罗盘.tsx，游戏里录的 66 帧）：李樱端稳指南针、镜头推成俯拍以后打开，开着时戏停住，关掉以后接着演（`uiClose` 起算）
export const compassUiOpenFrame = segmentTable['6-2-3'].起 + 221;
const compassUiFrames = 66;
const uiClose = (compassUiOpenFrame + compassUiFrames) / FPS;
export const segmentStartSec = { seg22, seg23, uiClose };

// ---------- 时刻（全局秒） ----------
export const cues = {
  // 6-2-1
  atTable: 2.1, // 从东边走进画面（边走边说「不过，这一趟也不算白跑。」），到桌子南边站定、面朝北
  grab: 2.5, // 两手同时抓起两件战利品
  raised: 3.1,
  lookFur: [3.2, 3.8] as const, // 低头看右手的雪怪首领毛皮；左上角弹出匠魂「部件制造台」链甲基底页；3.75 起说「雪怪首领毛皮的保护词条……锁链基底。」（到 7.81）
  lookBlood: [7.6, 8.2] as const, // 那句说完转头看左手的炽热的血液；右上角弹出「冶炼炉燃料」页；8.21 起说「炙热的液体可以提供更高的熔炼温度。」（到 10.72）
  nod: [9.8, 10.3] as const,
  putDown: 10.8,
  putDone: 11.4,
  // 6-2-2
  lookDown: seg22,
  raiseSleeve: seg22 + 0.5,
  tapTable: [seg22 + 1.4, seg22 + 4.0] as const,
  lowerSleeve: seg22 + 2.6,
  lookUi: [seg22 + 3.9, seg22 + 4.6] as const, // 抬眼看向右边（铁砧页一会儿在那儿浮出来）；要在扬手（拍手前 0.4 秒）前做完，李樱.ts 在那一刻换姿态链
  // 右拳砸进左掌，落在夸克古卷那句的「对了」上（开口 + 0.2，配音 0.2 秒起「对」）
  slap: quarkSec + 0.2,
  // 6-2-3：拿指南针时「走吧九胡……」已经端在手里
  grabCompass: seg23 + 7.28, // 抓起桌上的结构指南针
  holdLevel: seg23 + 7.88,
  needleTurn: uiClose + 0.375, // 界面关掉、接回俯拍后，晃完开始转半圈
  needleStop: uiClose + 1.675,
  lookUp: uiClose + 1.475,
  walk: [uiClose + 2.175, uiClose + 5.775] as const, // 绕过桌子西头走到屋子中间
  handOver: [uiClose + 5.475, uiClose + 6.475] as const, // 转向九胡，把平托着的指南针伸到她面前给她看（到 6-2-4 首帧的姿态）
  end: lastFrame / FPS,
  // 九胡：听到他「对了」、拍手回头，转身看着他；他搜完、抬眼时小跑到屋子中间
  jiuhuLookBack: quarkSec + 0.5,
  jiuhuTurn: [quarkSec + 1.1, seg23 + 0.05] as const,
  jiuhuWalk: [uiClose + 0.975, uiClose + 4.175] as const,
};

// ---------- 界面（模型/界面/）：出现、消失、提示框、思索标注，各 0～1 ----------
const fadeIn = (t: number, a: number, b: number) => ss((t - a) / (b - a));
export const uiState = (globalFrame: number) => {
  const t = globalFrame / FPS;
  return {
    // 6-2-1：链甲基底页开着时说「雪怪首领毛皮……锁链基底。」（3.75～7.81），打开 0.6 秒后鼠标停到成品上按住 Ctrl，弹出词条说明；
    // 那句说完才收。燃料页配着「炙热的液体……熔炼温度。」（8.21～10.72），一直开到他放下东西
    maille: fadeIn(t, 3.5, 3.8) * (1 - fadeIn(t, 7.6, 7.9)),
    mailleTooltip: fadeIn(t, 4.4, 4.7),
    fuel: fadeIn(t, 7.8, 8.1) * (1 - fadeIn(t, 10.8, 11.1)),
    // 6-2-2 铁砧页随夸克古卷那句开口浮出来（「对」响起、拍手那一刻显出一半），三条标注随后依次拉出来（说「夸克模组的古卷能够突破」时）；
    // 一直开到 6-2-3 他伸手拿指南针前（这句说到「提升到80%」才收）
    scroll: fadeIn(t, quarkSec, quarkSec + 0.4) * (1 - fadeIn(t, seg23 + 6.48, seg23 + 6.78)),
    labels: [0, 1, 2].map((i) => fadeIn(t, quarkSec + 0.5 + 0.5 * i, quarkSec + 1.3 + 0.5 * i)) as [number, number, number],
    // 6-2-3：结构罗盘界面开着的第几帧（0～65 画，别的不画），游戏里录的、一开一关没有渐变
    compassUiFrame: globalFrame - compassUiOpenFrame,
  };
};
