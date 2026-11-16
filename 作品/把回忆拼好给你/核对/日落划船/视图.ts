// 日落划船核对的视图表（纯数据，段.ts 也读）：一帧一个视图。第 0 帧是第 8 句第二张照片要的那一帧（干净：不带歌词、浪），
// 其余是匹配剪辑前后几帧（眼珠和太阳对不对得上）、拉远到位、浪盖到一半，都不带歌词。
import { segmentWindow, events as mainCutEvents } from '../../分镜/正片第4句.ts';

export type View = {
  name: string;
  /** 歌曲帧 */
  frame: number;
  /** 整片后期，不给 = 开 */
  withPost?: boolean;
  /** 画不画浪，不给 = 画 */
  waveOn?: boolean;
};

const events = mainCutEvents;
export const views: readonly View[] = [
  { name: '照片-日落划船（干净）', frame: events.photoSunsetRowing.frame, waveOn: false },
  { name: '照片-日落划船（后期关）', frame: events.photoSunsetRowing.frame, waveOn: false, withPost: false },
  { name: '眼化日前一帧（推到底）', frame: events.eyeToSun.frame - 1 },
  { name: '叠化一半', frame: Math.round((events.eyeToSun.frame + events.horizon.frame) / 2) },
  { name: '海平线（叠化完）', frame: events.horizon.frame },
  { name: '拉远到位', frame: events.pullBackDone.frame },
  { name: '浪盖到一半', frame: Math.round((events.waveRises.frame + segmentWindow('2-日落划船').止帧) / 2) },
];
