// 第 14 句（段 2-归隐）、第 15 句开头（2-摇铃）的符文歌词怎么摆：第 1～14 句照全片在顶上，第 15 句「爱炙热的你却忘了爱自己」放到底部（三稿第 15 句的特例，同 2-重逢、2-合照 的底部歌词）。
// 核查 10-24：原来第 15 句在顶上进场，合屏那 9 帧压在太阳和树冠上（合屏画面同 2-摇铃 开头，太阳不能挪）。
// 第 14 句什么时候退、第 15 句什么时候进照 界面/符文歌词数据.ts 的 让聊天（中间让给聊天栏「Steve加入了游戏」）。纯模块（测试也读）。
import { runeLyricDefault, type RuneLyricStyle } from '../../界面/符文排版.ts';
import { mainCutLyricLine } from '../../界面/符文歌词数据.ts';

/** 底部那一句的样式：只把位置换成「下」，边距、字点、颜色、进出同全片 */
export const line15RuneStyle: Readonly<RuneLyricStyle> = { ...runeLyricDefault, 位置: '下' };

/** 两套歌词（帧都是段内帧）：顶上第 1～14 句，底部第 15 句 */
export const retreatLyrics = (startFrame: number) => ({
  upperLines: Array.from({ length: 14 }, (_, i) => mainCutLyricLine(i + 1, startFrame)),
  lowerLines: [mainCutLyricLine(15, startFrame)],
});
