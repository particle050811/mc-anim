// 正片第 6、7 句（段 2-雷雨、2-拨开阴霾）的事件和段窗口。
// 分镜按串拆开的一份（用户 11-06 定按句拆，改一句只过期那几段）；时刻、排段的写法见 ./时间.ts。纯模块，不许 import react、three、remotion。
import { originalDurSec } from '../配乐/网格.ts';
import { chainLookup, segmentFrames, resolveEvents, arrangeSegs, type EventDef } from './时间.ts';

export const eventDefs = {
  // 第 6 句「在最灰暗的日子你陪着我发呆」（19.08–22.30，没有前导音）：雷雨，炸开一角的门口小木屋，从两人身后透视看过去，全景慢慢推近。拍点 45 = 19.28 … 52 = 22.27
  line6VocalIn: { 在: { 句: 6, points: '开口' }, basis: '三稿第 6 句：雷雨，你们那座小木屋（第 8 句门口那座）西南角被苦力怕炸开、门边的箱子炸没了（用户 10-24「应该是炸掉房子一角 爆掉箱子」），她和你坐在坑边看雨发呆；从两人身后朝北的全景起，整句一个镜头慢慢推近' },
  distantThunder: { 在: { after: 'line6VocalIn', addSec: 0 }, basis: '第 6 句首字、末地硬切过来的那一帧：远处一道闪电，天和地亮两刻、补闪一下，一声闷雷；闪白落在切点上，把亮的末地和暗的雷雨接起来（核查 10-24「转场要丝滑」；原来在 45 拍，晚 5 帧）。爆炸只靠炸开的屋角交代（演绎，Agent 暂定）' },
  liYingLooksAtYou: { 在: { beat: 48.5 }, basis: '「你」20.81 前后：她从看屋子转过头看你（帽子不举、气泡不冒：用户 10-24「戴帽子多余」，Agent 暂定）' },
  youLookAtLiYing: { 在: { beat: 50 }, basis: '你也转过头看她，两个人就这么在雨里坐着，到第 6 句完（演绎，Agent 暂定）' },
  lightningRevealsBreach: {
    在: { beat: 51 },
    basis: '21.84：镜头推到两人和缺口的近景停住，同一刻又打一道闪电，把炸开的屋角、坑里浮着的东西照亮一下（核查 10-24：原来只有切点那一闪，推到近景时缺口黑着、看不出炸的是屋角；Agent 暂定）',
  },
  // 第 7 句「你让我学会如何拨开阴霾」（22.50–25.18，没有前导音）。拍点 53 = 22.69 … 59 = 25.25
  liYingStandsUp: { 在: { 句: 7, points: '起' }, basis: '第 7 句首字：她站起来、两手举向天（不拿法术书、不开女仆界面：用户 10-24「给法术书多余 直接放法术不就好了吗？」），镜头开始往后退、往上抬（同一个镜头）' },
  magicCircleUp: { 在: { beat: 53 }, basis: '22.69：她脚下展开魔法阵（演绎，Agent 暂定）' },
  beamRises: { 在: { beat: 55 }, basis: '23.54：一道光柱从她举着的手上往天上冲（演绎，Agent 暂定）' },
  beamHitsCloud: { 在: { beat: 56 }, basis: '三稿 23.97「拨」：光柱撞上云底，撞的那一片云底亮起来' },
  cloudBreaks: { 在: { beat: 57 }, basis: '三稿 24.40：光柱顶上的云一格一格散开，开出一个洞，光柱穿过去；雨开始收' },
  cloudHoleWidens: { 在: { beat: 58 }, basis: '三稿 24.82：洞一圈一圈开大，透出蓝天，阳光从洞里照到地上' },
  sunlightSpreads: { 在: { beat: 58.3 }, basis: '阳光铺过整座屋子、雨停（三稿 25.25 提前到 24.95：第 8 句之前留半秒看雨停、阳光照在炸开的屋子上，Agent 暂定）' },
  photoBeamBreaksCloud: { 在: { beat: 58.5 }, basis: '第 8 句挂上照片墙的第四张照片（光柱破云）取这一帧：光柱、云洞、阳光、她和屋子都在画里（不带歌词，见 场/2-雷雨/画面.tsx 的 光柱破云画面）' },
  beamFades: { 在: { beat: 59 }, basis: '25.25：法术放完，光柱淡掉，剩阳光照在屋子上（演绎，Agent 暂定）' },
} as const satisfies Record<string, EventDef>;

/** 接 能查到的事件：本串的，加上引来的那几份的（一路引上去） */
export const eventTable: Readonly<Record<string, EventDef>> = { ...eventDefs };
/** 本串事件在歌上的秒数和歌曲帧 */
export const events = resolveEvents(eventDefs, eventTable);

/** 正片第 6、7 句：两段。同 正片第5句、正片第8句，前后的段做出来以后并进同一串（窗口首尾相接） */
export const mainCutSentences6to7 = arrangeSegs(
  {
    name: '正片第6到7句',
    duration: originalDurSec,
    segments: [
      {
        key: '2-雷雨',
        start: { 句: 6, points: '起' },
        end: { 句: 7, points: '起' },
        basis: '起：第 6 句首字（19.08，没有前导音），第 5 句末地那一镜硬切过来、闷雷一闪；止：第 7 句首字（22.50），她站起来放法术。两段是同一个镜头（从两人身后朝北看炸开一角的屋子），按句分段',
      },
      {
        key: '2-拨开阴霾',
        end: { 句: 8, points: '起' },
        basis: '止：第 8 句首字（25.46），切到门这个机位（2-收集快乐 的起，屋子已经补好）。镜头往后退、往上抬，魔法阵、光柱撞云、云一圈圈散开、阳光铺到屋子上，最后半秒停在阳光照着炸开的屋角',
      },
    ],
  },
  eventTable,
);

/** 只查本串的段（段.ts、画面用：帧数、场窗口、原声 cue 的入点） */
export const { segmentWindow, segClock } = chainLookup(mainCutSentences6to7);
/** 本串各事件在这一段里的段内帧（不在这段里的也照算，会是负数或不小于帧数） */
export const segEventFrames = (segKey: string) => segmentFrames(segmentWindow(segKey).起帧, events);
