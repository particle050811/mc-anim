// 合照核对的视图表（纯数据，段.ts 也读）：一帧一个视图。第 0 帧是片尾新世界图标要的新合照（干净：不带歌词，不闪白），
// 其余是硬切前后、靠好那一帧、套成第 11 句那样的拍立得，和几张对照（靠肩带不带气泡、背景褪不褪色、窗外画多深、窗里补樱花林的小样），都不带歌词；
// 最后一帧是 B 站多封面 PK 第三张（03-封面 的 C「同机位她笑」）：2-重逢 她笑了以后那一帧的她，换成封面帧（片那一版）的机位，头顶挂「(✿◠‿◠)」（片里不挂气泡）。
// 片里这时挂的是台词气泡（12 倍），这张要封面那样 16 倍的颜文字气泡、和封面同构图，所以换机位。
import type { OrthoRigParams } from '@engine/三渲二/机位.tsx';
import { events as mainCut15TailEvents } from '../../分镜/正片15尾.ts';
import { events as mainCutLine15Events } from '../../分镜/正片第15句.ts';
import { shoulderRig } from '../../场/2-隐世之境/合照动作.ts';
import { laugh } from '../../场/2-隐世之境/重逢参数.ts';

const mainCutEvents = { ...mainCut15TailEvents, ...mainCutLine15Events };

export type View = {
  名: string;
  /** 照片 = 合照照片；拍立得 = 合照拍立得；重逢 = 2-重逢 那一镜（硬切前）；靠肩 = 15 尾那一镜 */
  种: '照片' | '拍立得' | '重逢' | '靠肩';
  /** 歌曲帧（照片、拍立得 不用） */
  帧?: number;
  /** 整片后期，不给 = 开 */
  withPost?: boolean;
  /** 靠肩她头顶的气泡，不给 = 合照参数 的 靠肩气泡 */
  showBubble?: boolean;
  /** 重逢她头顶换挂的气泡字（16 倍），不给 = 同片里（驯服起挂台词气泡） */
  bubbleText?: string;
  fade?: boolean;
  /** 靠肩换一个机位（看大环境） */
  cameraRig?: OrthoRigParams;
  /** 重逢换成封面帧（片那一版）的机位 */
  coverRig?: boolean;
  /** 靠肩窗里补樱花林（合照参数 的 窗景，小样） */
  windowView?: boolean;
};

const events = mainCutEvents;
export const views: readonly View[] = [
  { 名: '照片-合照（干净）', 种: '照片' },
  { 名: '照片-合照（后期关）', 种: '照片', withPost: false },
  { 名: '硬切前：2-重逢 末帧', 种: '重逢', 帧: events.第15句段尾.帧 - 1 },
  { 名: '硬切后：靠肩头一帧', 种: '靠肩', 帧: events.靠肩起.帧 },
  { 名: '靠好', 种: '靠肩', 帧: events.靠肩.帧 },
  { 名: '对比-靠肩带气泡', 种: '靠肩', 帧: events.靠肩.帧, showBubble: true },
  { 名: '对比-靠肩背景褪色', 种: '靠肩', 帧: events.靠肩.帧, fade: true },
  { 名: '新合照套成第 11 句那样的拍立得（片里没露）', 种: '拍立得' },
  { 名: '对比-窗外画到 x 26（窗外的深色木头、樱花树冠）', 种: '靠肩', 帧: events.靠肩.帧, cameraRig: { ...shoulderRig, depth: 12 } },
  { 名: '大环境-东墙全深（N 10，看两个人站在主厅哪里）', 种: '靠肩', 帧: events.靠肩.帧, cameraRig: { 种: '正交', facing: '东', N: 10, topDepth: 2, 看: [shoulderRig.看[0], shoulderRig.看[1], 2.5], section: 1.3 } },
  { 名: '对比-窗里补樱花林（小样，片里不开：窗景）', 种: '靠肩', 帧: events.合照咔哒.帧 - 1, windowView: true },
  { 名: 'B 站多封面第三张：2-重逢 她笑了以后（段尾前一帧），封面帧的机位，挂「(✿◠‿◠)」，不带歌词', 种: '重逢', 帧: events.第15句段尾.帧 - 1, bubbleText: laugh.bubbleText, coverRig: true },
];
