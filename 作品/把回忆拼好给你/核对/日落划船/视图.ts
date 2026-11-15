// 日落划船核对的视图表（纯数据，段.ts 也读）：一帧一个视图。第 0 帧是第 8 句第二张照片要的那一帧（干净：不带歌词、浪），
// 其余是匹配剪辑前后几帧（眼珠和太阳对不对得上）、拉远到位、浪盖到一半，都不带歌词。
import { segmentWindow, events as mainCutEvents } from '../../分镜/正片第4句.ts';

export type View = {
  名: string;
  /** 歌曲帧 */
  帧: number;
  /** 整片后期，不给 = 开 */
  withPost?: boolean;
  /** 画不画浪，不给 = 画 */
  waveOn?: boolean;
};

const events = mainCutEvents;
export const views: readonly View[] = [
  { 名: '照片-日落划船（干净）', 帧: events.photoSunsetRowing.帧, waveOn: false },
  { 名: '照片-日落划船（后期关）', 帧: events.photoSunsetRowing.帧, waveOn: false, withPost: false },
  { 名: '眼化日前一帧（推到底）', 帧: events.eyeToSun.帧 - 1 },
  { 名: '叠化一半', 帧: Math.round((events.eyeToSun.帧 + events.horizon.帧) / 2) },
  { 名: '海平线（叠化完）', 帧: events.horizon.帧 },
  { 名: '拉远到位', 帧: events.pullBackDone.帧 },
  { 名: '浪盖到一半', 帧: Math.round((events.waveRises.帧 + segmentWindow('2-日落划船').止帧) / 2) },
];
