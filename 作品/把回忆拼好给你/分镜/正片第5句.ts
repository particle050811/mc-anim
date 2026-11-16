// 正片第 5 句（段 2-抢龙蛋）的事件和段窗口。
// 分镜按串拆开的一份（用户 11-06 定按句拆，改一句只过期那几段）；时刻、排段的写法见 ./时间.ts。纯模块，不许 import react、three、remotion。
import { originalDurSec } from '../配乐/网格.ts';
import { chainLookup, segmentFrames, resolveEvents, arrangeSegs, type EventDef } from './时间.ts';

export const eventDefs = {
  // 第 5 句（末地，整句一个镜头）：15.69 = 句起，37 拍 15.87 … 43 拍 18.43；逐字「日」16.51 ≈ 38.5 拍、「子」16.71 ≈ 39 拍、「不」17.13 ≈ 40 拍，「可 能 被 取」落在 40.5～42 的半拍上（差不到 0.03 秒），「代」18.40 ≈ 43 拍
  line5VocalIn: { 在: { 句: 5, points: '开口' }, basis: '三稿第 5 句「有你在的日子不可能被取代」：末地，整句一个镜头，只讲她扑龙蛋扑了个空（龙已经死完，光束、经验球不画：用户 10-24「画面转太快就删」）' },
  buttWiggle: { 在: { beat: 37 }, basis: '她伏低盯着传送门边的龙蛋，37、38 两拍屁股左右扭（猫扑之前那样）（演绎，Agent 暂定）' },
  pounceStart: { 在: { beat: 38.5 }, basis: '「日」16.51 那半拍：她蹬地扑向龙蛋（三稿「她扑在蛋上」）；扑在半空半拍（5 帧，猫扑那样快），落在「子」的拍上（Agent 暂定）' },
  landOnEgg: { 在: { beat: 39 }, basis: '「子」16.71：她整个扑在蛋上，肚子压着蛋顶、两只爪子抱住蛋，蛋从她身子底下露出下半截（三稿「她扑在蛋上」）；抱住一整拍才被你点走（核查 10-24：原来只抱 3 帧，看不出抓到了）' },
  photoEggPounce: { 在: { after: 'landOnEgg', addSec: 0.25 }, basis: '第 8 句收的第三张照片（扑龙蛋）取这一帧：她趴在蛋上抱着蛋、落地那一下已经弹完，你在旁边看。出干净帧见 场/2-末地/镜头.tsx 的 末地镜头（干净）' },
  clickEgg: { 在: { beat: 40 }, basis: '三稿「你点一下，蛋带着紫色粒子从她爪子底下闪走」，落在「不」17.13 的拍上：蛋当刻瞬移（原版 DragonEggBlock.teleport，点、打都瞬移，没有声音）；你的手比它早 2 刻挥（场/2-末地/参数.ts 挥手提前刻）' },
  pounceMiss: { 在: { after: 'clickEgg', addSec: 5.5 / 20 }, basis: '蛋没了，她从蛋顶掉下去摔趴在地上（三稿「她扑了个空」）：照原版重力（每刻先走、再 −0.08、乘 0.98）掉 0.96 格约 5.5 刻；编排.ts 按同一套算，测试核落地差不到一帧' },
  sitUp: { 在: { beat: 41.5 }, basis: '「被」17.81：她脸朝下趴了两个半拍，一下坐起来半朝镜头、扭头冲你噘嘴，一直噘到段尾（演绎，Agent 暂定）；头顶的气泡删了（用户 10-24「画面转太快就删」，文字一时只走歌词一路）' },
} as const satisfies Record<string, EventDef>;

/** 接 能查到的事件：本串的，加上引来的那几份的（一路引上去） */
export const eventTable: Readonly<Record<string, EventDef>> = { ...eventDefs };
/** 本串事件在歌上的秒数和歌曲帧 */
export const events = resolveEvents(eventDefs, eventTable);

/** 正片第 5 句：一段，整句一个镜头（末地抢龙蛋）。同 正片第8句，前后的段做出来以后并进同一串 */
export const mainCutSentences5 = arrangeSegs(
  {
    name: '正片第5句',
    duration: originalDurSec,
    segments: [
      {
        key: '2-抢龙蛋',
        start: { 句: 5, points: '起' },
        end: { 句: 6, points: '起' },
        basis: '起：第 5 句首字（15.69），第 4 句那道浪这时盖满画面，段首接着往上退、露出末地；止：第 6 句首字（19.08），硬切到雷雨，闷雷一闪',
      },
    ],
  },
  eventTable,
);

/** 只查本串的段（段.ts、画面用：帧数、场窗口、原声 cue 的入点） */
export const { segmentWindow, segClock } = chainLookup(mainCutSentences5);
/** 本串各事件在这一段里的段内帧（不在这段里的也照算，会是负数或不小于帧数） */
export const segEventFrames = (segKey: string) => segmentFrames(segmentWindow(segKey).起帧, events);
