// 正片 15 句逐句的排版表（用户 10-24：每句按意思单独排版，不是一律一行顶在上面）和五个关键词。纯数据，按句号查；段不用改，正片歌词行 自己带上。
// 一句的 版 里写了位置、边距、字点、行距就盖掉段传进来的样式（段里的 样式 是全片默认加这一镜的描边色）；不写就照段的。
// 空着的句（顶上居中一行）是看过那一镜定的：别处放不下（第 3 句近景两行压她的帽子，第 11 句定格的拍立得占满整屏）。
// 挪了位置的句，那一场的测试用 歌词框 量让没让开。都是 Agent 暂定（核查 10-24 逐句对着成片定）。
import { glyphCell, layoutLine, mergeStyle, runeLyricDefault, type LineLayout, type WordEffect, type TypesetStyle } from './符文排版.ts';

/** 分屏两句的两段各离分屏线几点（半个字）：分屏线在画面正中（场/2-门口/分屏参数.ts 分屏版式 左右各 640 页面像素），不切字 */
export const splitYield = 8;

/** 分屏线占画面宽的哪一截（成）：页面 x 640～644（同 分屏版式：服务器宽 640、线宽 4，线压在现实那半最左一列） */
export const splitLine = [640 / 1280, 644 / 1280] as const;

/** 第 7 句被光柱劈开的缝（点）：两段字格之间 14 点 = 页面 49 像素；光柱（页面十来像素宽）镜头一路往上抬时在画面中线左右晃十来像素，从缝里过、不碰描边（Agent 暂定） */
export const pushGap = 14;

/** 分屏句：前 k 个字放左屏、靠着分屏线右对齐，其余放右屏、靠着分屏线左对齐，同一行；两段各自只画在自己那一屏（右边飞来的符文从分屏线里出来，不从现实那半飞过线） */
const splitLayout = (k: number): LineLayout => ({
  lineBreaks: [k],
  segments: [
    { 行: 0, horizontal: 0.5, anchor: '右', offset: -splitYield, 界: [0, splitLine[0]] },
    { 行: 0, horizontal: 0.5, anchor: '左', offset: splitYield, 界: [splitLine[1], 1] },
  ],
});

export const lyricLayoutTable: Readonly<Record<number, LineLayout>> = {
  // 「我们都是 / 渺小真实存在」：上行先出来（开头的选择世界界面上只有这一行，垫在搜索框黑底里，离光标还有一截）。两行右对齐、整块放在左半：
  // 2-初入 镜头往远处那片樱花林推，林子一路往右上走（成片第 98 帧左沿约页面 670、上沿 110），居中的第二行会压在林子上；块右沿放在页面 627，离林子留四十来像素
  1: { lineBreaks: [4], textAlign: '右', horizontal: 0.345 },
  // 「祈愿小世界里 / 不只有挫败」：挖三填一那一镜下半是土的剖面，两行左对齐放在剖面左下、坑的左边，像写在你躲着的那片土里（天上留给太阳、月亮）
  2: { 位置: '下', lineBreaks: [6], textAlign: '左', horizontal: 0.27 },
  // 祭坛：一行横在鸟居顶上、「光明」正对着下面的光柱；近景那一镜两行会压到她的帽子，照旧
  3: {},
  // 「眼睛里看到的都是 / 广袤无垠的大海」：眼前、远处两层，下一行往右让，像往海那边看过去（日落划船.test 的太阳在两行下面）
  4: { lineBreaks: [8], textAlign: '错落' },
  // 「有你在的日子 / 不可能被取代」：两行错开放在末地的黑天上，她扑蛋在两行下面
  5: { lineBreaks: [6], textAlign: '错落' },
  // 「在最灰暗的日子 / 你陪着我发呆」：放低、放在右下的雨里草地上，两个人坐在左边、炸开的屋角在上面，字和人一起往下沉
  6: { 位置: '下', lineBreaks: [7], textAlign: '错落', horizontal: 0.68 },
  // 「你让我学会 | 如何拨开阴霾」：一行被光柱从中间劈开，两半各靠一边，光柱从缝里冲上去（同分屏句的摆法，缝宽 拨开缝）
  7: {
    lineBreaks: [5],
    segments: [
      { 行: 0, horizontal: 0.5, anchor: '右', offset: -pushGap / 2 },
      { 行: 0, horizontal: 0.5, anchor: '左', offset: pushGap / 2 },
    ],
  },
  // 「将快乐全都收集 / 将不开心全都淘汰」：对仗的两半各一行，上左下右
  8: { lineBreaks: [7], textAlign: '错落' },
  // 「你对我说的情话」：放在底下偏左，像牌子底下的一行注（牌上写的就是那句话）；推近之前的全景里两个人、她脚下的圆石在画面底部正中偏右，字让到左边
  9: { 位置: '下', horizontal: 0.3 },
  // 「像转瞬即逝的 / 烟花」：「烟花」单放一行、往右让，拼齐时炸开的那圈火花不和别的字挤在一起
  10: { lineBreaks: [6], textAlign: '错落' },
  11: {},
  // 「我却已 / 无法自拔」：两行右对齐，放在画面中段、她左边的暗处，挨着她坐的那张空床
  12: { margin: 420, lineBreaks: [3], textAlign: '右', horizontal: 0.27 },
  // 「我们的爱 | 总有时差」：她那边（服务器）一半、你那边（现实）一半，中间隔着分屏线
  13: splitLayout(4),
  // 「也为你 | 骗自己放下」：「放下」在右屏，跟着楼上飘下来的纸往下落；左段在左屏太阳右边（第14句.test：太阳右沿在页面 392 以左）
  14: splitLayout(3),
  // 三稿第 15 句：放在画面底部，让人先读她的气泡（2-归隐、2-合照 本来就传了 位置 下，边距各自给）
  15: { 位置: '下' },
};

/** 五个关键词（三稿「字」一栏）：句号 → 哪个效果、哪个词。帧（刹那的裂、时差的半拍）在 符文歌词数据.ts 的 正片歌词行 里按分镜和网格算 */
export const keywords: Readonly<Record<number, { effect: WordEffect['effect']; word: string }>> = {
  3: { effect: '光明', word: '光明' },
  10: { effect: '烟花', word: '烟花' },
  11: { effect: '刹那', word: '刹那' },
  13: { effect: '时差', word: '时差' },
  14: { effect: '放下', word: '放下' },
};

/**
 * 第 序 句排好以后整块（连描边）占画面的哪一截，按画面宽高的成（0～1）：场的测试拿它量人、光柱有没有被字压着。
 * 汉字步进都是 18 点（符文歌词.test 量过），这里不读字表；段若改了字点、边距，传 样式。
 */
export const lyricBox = (text: string, lineLayout: LineLayout, typesetStyle: TypesetStyle = runeLyricDefault) => {
  const mergedStyle = mergeStyle(typesetStyle, lineLayout);
  const glyphSource = { advance: () => 18, rune: () => { throw new Error('歌词框只算位置'); }, hanChar: () => { throw new Error('歌词框只算位置'); } };
  const { glyphs } = layoutLine(glyphSource, text, mergedStyle, 2560, 1440, lineLayout);
  const dotSize = mergedStyle.glyphScale;
  const left = Math.min(...glyphs.map((g) => g.x)) - 1;
  const right = Math.max(...glyphs.map((g) => g.x)) + glyphCell + 1;
  const top = Math.min(...glyphs.map((g) => g.y)) - 1;
  const bottom = Math.max(...glyphs.map((g) => g.y)) + glyphCell + 1;
  return { left: (left * dotSize) / 2560, right: (right * dotSize) / 2560, 上: (top * dotSize) / 1440, 下: (bottom * dotSize) / 1440 };
};
