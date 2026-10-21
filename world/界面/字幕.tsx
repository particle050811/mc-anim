// 台词字幕：黑底半透明框 + 白色游戏像素字，一屏一行，下方居中（用户 10-10 要的，样式参考 设定/界面/字幕样式参考.png，B 站一部 MC 动画的截图）。
// 字幕只进第 6 章完整参考视频（工具/合成第六章.py 拼整片时当透明层叠上去），不进给 Seedance 的单段参考：字交给视频模型会被画坏（同思索界面）。
//
// 照参考图量的（截图被裁过，只量得出框和字自己的比例）：
// - 字：纯白的像素点阵字，没有阴影。这里用游戏自己的像素字（像素字.ts：原版 1.20.1 默认字体的 ascii 位图 + unifont），和思索界面同一套字；
//   汉字步进照游戏是 9 个界面像素（18 点）。参考图的汉字步进 16 点，是它自己的字体，不照搬。
// - 底：纯黑、不透明度 0.5（框里亮度 = 背景 × (1 − 不透明度)，量得 0.49～0.53）。
// - 边距：1 个界面像素（= 2 个 unifont 点）。参考图右边多出 11 个点，是它自己按别的字宽算的框，不照搬，左右对称：框宽 = 1 + `textWidth`（含最后一个字后面 1 个界面像素的字距，正好当右边距）。
// - 大小：参考图字高约占画面高 10%。这里取 1 个界面像素 = 画面高 / 90（720p 8、1080p 12、1440p 16 像素，一个点落在整像素上，不糊），字高 8 个界面像素 = 画面高的 8.9%。要改大小只改 `screenHeightGui`。
// - 位置：下方居中，框底离画面底 6 个界面像素。思索界面开着的时候（6-3-2、6-4-3a 思索）画面下方是思索的按钮和进度条，框挪到按钮上沿以上 1 个界面像素，不压游戏界面（位置 '思索上'）。
// - 一屏只放一行，最宽 0.86 × 画面宽（1440p 上 15 个汉字）。放不下的长句由下面的 `splitScreens` 按语义切成几屏，不缩字、不折成两行。
import React, { useLayoutEffect, useRef } from 'react';
import { type CalculateMetadataFunction, useCurrentFrame, useVideoConfig } from 'remotion';
import lineTable from 'asset:数据/配音/台词表';
import { drawText, textWidth } from './像素字.ts';
import { ponderScreen as 思索界面 } from './思索界面.tsx';

export const screenHeightGui = 90; // 画面高 = 90 个界面像素
const bgColor = 'rgba(0, 0, 0, 0.5)';
const textColor = '#ffffff';
const paddingGui = 1; // 界面像素
const textHeightGui = 8; // 一行：汉字 16 点 × 0.5、ascii 8 行
const boxHeightGui = textHeightGui + 2 * paddingGui;
const bottomMarginGui = 6;
const maxWidthRatio = 0.86;
// 思索的按钮（思索界面.tsx 的 `drawButtons`：y = 高 − 20 − 31，`PonderUI.init`）连框往外扩 3 像素，上沿在思索界面像素 高 − 54 处，换成画面高的比例
const ponderButtonTopRatio = (思索界面.H - 20 - 31 - 3) / 思索界面.H;

export type SubtitlePosition = '下' | '思索上';
// 1 个界面像素是几个画面像素
export const subtitleScale = (screenHeight: number) => screenHeight / screenHeightGui;
// 一屏的字宽（界面像素）最多多少：框宽 1 + 字宽 不超过 最宽比 × 画面宽
export const subtitleMaxWidth = (aspectRatio = 16 / 9) => Math.floor(maxWidthRatio * screenHeightGui * aspectRatio) - 1;

// 框在画面上的位置（画面像素，整数）
export const subtitleBox = (text: string, position: SubtitlePosition, screenWidth: number, screenHeight: number) => {
  const scale = subtitleScale(screenHeight);
  const boxWidth = Math.round((paddingGui + textWidth(text)) * scale);
  const boxHeight = Math.round(boxHeightGui * scale);
  const x = Math.round((screenWidth - boxWidth) / 2);
  const boxBottom = position === '思索上' ? Math.floor(ponderButtonTopRatio * screenHeight - scale) : Math.round(screenHeight - bottomMarginGui * scale);
  return { x, y: boxBottom - boxHeight, w: boxWidth, h: boxHeight, s: scale };
};

export const drawSubtitle = (ctx: CanvasRenderingContext2D, text: string, position: SubtitlePosition, screenWidth: number, screenHeight: number) => {
  if (!text) return;
  const box = subtitleBox(text, position, screenWidth, screenHeight);
  ctx.fillStyle = bgColor;
  ctx.fillRect(box.x, box.y, box.w, box.h);
  // 画字 的坐标是界面像素：框左上角 + 边距
  drawText(ctx, text, box.x / box.s + paddingGui, box.y / box.s + paddingGui, textColor, box.s);
};

// 一屏字幕，铺满整个画面（透明底），字和框画在下方
export const Subtitle: React.FC<{ text: string; position?: SubtitlePosition }> = ({ text: text, position: position = '下' }) => {
  const { width, height } = useVideoConfig();
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const ctx = ref.current!.getContext('2d')!;
    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = false;
    drawSubtitle(ctx, text, position, width, height);
  }, [text, position, width, height]);
  return <canvas ref={ref} width={width} height={height} style={{ position: 'absolute', left: 0, top: 0, width, height }} />;
};

// 字幕卡：第 i 帧画第 i 屏（透明底）。工具/合成第六章.py 把要用到的屏渲成 PNG 序列（画面大小 = 整片大小，字不再缩放），再按每屏的起止帧叠到整片上。Studio 里看到的是全章台词切出来的所有屏（不带时间，只看样式和断句）。
export type SubtitleCardProps = { 宽: number; 高: number; 屏们: { 字: string; 位置: SubtitlePosition }[] };
export const SubtitleCard: React.FC<SubtitleCardProps> = ({ 屏们: screens }) => {
  const screen = screens[useCurrentFrame()];
  return screen ? <Subtitle text={screen.字} position={screen.位置} /> : null;
};
export const subtitleCardMetadata: CalculateMetadataFunction<SubtitleCardProps> = ({ props }) => ({
  durationInFrames: Math.max(1, props.屏们.length),
  width: props.宽,
  height: props.高,
});

// ---------- 断屏：一句放不下一行时按语义切成几屏 ----------
// 只在标点后面、词和词之间断（词用 `Intl.Segmenter` 的中文分词），不在 ascii 单词中间断，标点不放到一屏开头；每屏宽度不超过 `subtitleMaxWidth`。代价：每多一屏 10；
// 断在句末标点后 0、句中标点后 1、空格 2；词和词之间 13 起（比多切一屏还贵：能在标点处多切一屏，就不在分句中间断），离分句正中越远越贵（最多再加 4）；
// 下一屏以「的、了、吗」这类虚词开头再加 20，词中间 40；一屏以单独的「的、地、得」收尾再加 6（定语和中心语不拆开）；一屏不到 3 个音节再加 6（碎屏）。
// 同样代价时让后面的屏长一点（句子的重心一般在后半句）。
// 显示的字去掉屏尾的 ，。、；：（字幕习惯），！？…—留着。`原` 是这屏对应的原句片段（带标点），给算时间用。
const sentenceEnds = new Set(['。', '！', '？', '…', '!', '?']);
const clauseBreaks = new Set(['，', '、', '；', '：', '—', ',', ';', ':']);
const noScreenStart = new Set([...sentenceEnds, ...clauseBreaks, '”', '’', '）', '》', ')']);
const trailingPunctRe = /[，。、；：,;:]+$/;
// 单独成词的虚词不放到一屏开头（「…重锤 / 的高度…」），再加 20
const functionWords = new Set(['的', '了', '着', '过', '地', '得', '吗', '呢', '吧', '啊', '呀', '哒', '么']);
const structuralParticles = new Set(['的', '地', '得']);
const asciiAlnumRe = /[A-Za-z0-9]/;
const hanziRe = /[㐀-鿿豈-﫿]/;

// 粗估音节数（只用来在一句里按比例分时间、判断碎屏）：一个汉字一个，ascii 单词按元音组数（没有元音的按字母数，如 mc），符号 0
export const syllableCount = (text: string) => {
  let count = 0;
  for (const ch of text) if (hanziRe.test(ch)) count++;
  for (const word of text.match(/[A-Za-z]+/g) ?? []) count += (word.match(/[aeiouy]+/gi) ?? []).length || word.length;
  return count;
};

// 这一屏是不是在标点（或空格）后面断开的：是的话下一屏开头前一般有停顿，合成时到配音里找这个停顿换屏
export const endsAtPunct = (sourceText: string) => {
  const t = [...sourceText];
  const lastChar = t[t.length - 1];
  return lastChar === ' ' || sentenceEnds.has(lastChar) || clauseBreaks.has(lastChar);
};
// 一屏的原句再按标点切成几截（「……」这种连着的标点算一个）：合成时每个标点后都到配音里找停顿当时间锚点，一屏里没有停顿的换屏点（词和词之间断的）就在前后两个锚点之间按音节数分
export const splitClauses = (sourceText: string) => {
  const cs = [...sourceText];
  const out: string[] = [];
  let cur = '';
  cs.forEach((ch, i) => {
    cur += ch;
    const nextChar = cs[i + 1];
    if ((ch === ' ' || sentenceEnds.has(ch) || clauseBreaks.has(ch)) && nextChar !== undefined && !noScreenStart.has(nextChar) && nextChar !== ' ') {
      out.push(cur);
      cur = '';
    }
  });
  if (cur) out.push(cur);
  return out;
};

export type SubtitleScreen = { 字: string; 原: string };
export const splitScreens = (sentence: string, aspectRatio = 16 / 9): SubtitleScreen[] => {
  const maxWidth = subtitleMaxWidth(aspectRatio);
  const cs = [...sentence];
  const charCount = cs.length;
  const wordBounds = new Set<number>();
  const wordStartingAt = new Map<number, string>(); // 第 k 个字起头的词
  const wordEndingAt = new Map<number, string>(); // 在第 k 个字前面结束的词
  let pos = 0;
  for (const seg of new Intl.Segmenter('zh', { granularity: 'word' }).segment(sentence)) {
    wordStartingAt.set(pos, seg.segment);
    pos += [...seg.segment].length;
    wordBounds.add(pos);
    wordEndingAt.set(pos, seg.segment);
  }
  // 第 k 个字所在分句（标点、空格隔开的一截）的头尾
  const isSeparator = (ch: string) => sentenceEnds.has(ch) || clauseBreaks.has(ch) || ch === ' ';
  const clauseBounds = (k: number) => {
    let start = k;
    while (start > 0 && !isSeparator(cs[start - 1])) start--;
    let end = k;
    while (end < charCount && !isSeparator(cs[end])) end++;
    return [start, end];
  };
  // 在第 k 个字前面断的代价
  const breakCost = (k: number) => {
    const prevChar = cs[k - 1];
    const nextChar = cs[k];
    if (noScreenStart.has(nextChar)) return Infinity;
    if (asciiAlnumRe.test(prevChar) && asciiAlnumRe.test(nextChar)) return Infinity;
    if (sentenceEnds.has(prevChar)) return 0;
    if (clauseBreaks.has(prevChar)) return 1;
    if (prevChar === ' ') return 2;
    const [c0, c1] = clauseBounds(k);
    const offCenterCost = 8 * Math.abs((k - c0) / Math.max(1, c1 - c0) - 0.5);
    return (wordBounds.has(k) ? 13 : 40) + offCenterCost + (functionWords.has(wordStartingAt.get(k) ?? '') ? 20 : 0) + (structuralParticles.has(wordEndingAt.get(k) ?? '') ? 6 : 0);
  };
  const screenText = (i: number, j: number) => cs.slice(i, j).join('').trim().replace(trailingPunctRe, '');
  const screenCost = (i: number, j: number) => {
    const t = screenText(i, j);
    if (!t || textWidth(t) > maxWidth) return Infinity;
    return 10 + (syllableCount(t) < 3 ? 6 : 0) + 1e-4 * textWidth(t) * (charCount - j); // 最后一项：同代价时让后面的屏长一点
  };
  const best = new Array<number>(charCount + 1).fill(Infinity);
  const from = new Array<number>(charCount + 1).fill(-1);
  best[0] = 0;
  for (let j = 1; j <= charCount; j++) {
    if (j < charCount && !Number.isFinite(breakCost(j))) continue;
    for (let i = 0; i < j; i++) {
      if (!Number.isFinite(best[i])) continue;
      const cost = best[i] + screenCost(i, j) + (j < charCount ? breakCost(j) : 0);
      if (cost < best[j]) {
        best[j] = cost;
        from[j] = i;
      }
    }
  }
  if (!Number.isFinite(best[charCount])) throw new Error(`断屏：「${sentence}」怎么切都有一屏放不下（最宽 ${maxWidth} 个界面像素）`);
  const screens: SubtitleScreen[] = [];
  for (let j = charCount; j > 0; j = from[j]) screens.unshift({ 字: screenText(from[j], j), 原: cs.slice(from[j], j).join('') });
  return screens;
};

export const subtitleCardSample = (): SubtitleCardProps => ({
  宽: 1920,
  高: 1080,
  屏们: Object.values(lineTable as unknown as Record<string, { 字: string }>).flatMap((x) => splitScreens(x.字).map((p) => ({ 字: p.字, 位置: '下' as const }))),
});
