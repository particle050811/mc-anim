// 第 9–11 句的声音（原版音效，作品资产表里的）：种树苗、三发烟花的发射、炸开、噼啪，「绽」那一下的相机咔哒。
// 都按歌曲帧排，跨段的由 声音/跨段音效.ts 切成每段一截；三段的 段.ts 用 本段音效 取自己那几截。纯数据。
// 文件长度是 ffprobe 量的；火箭、炸开的文件开头就起音。咔哒照 场/1-隐世之境一楼/参数.ts 的 咔哒声（起音 0.13 秒，同一个文件）。
import type { AssetCue } from '@engine/段/段定义.ts';
import { fireworkSounds } from '@库/特效/烟花.ts';
import { fps, toSongFrame } from '../../分镜/时间.ts';
import { events as mainCutEvents } from '../../分镜/正片第9至11句.ts';
import { clipToSegment, type SongSound } from '../../声音/跨段音效.ts';
import { fireworks, soundGain, plantSec } from './门口之夜参数.ts';
import { clamp01 } from '@engine/core/数学.ts';

export const doorNightSfxAssets = {
  种树苗: '音效/把回忆拼好给你/block.cherry_sapling.place.1',
  发射: '音效/把回忆拼好给你/entity.firework_rocket.launch',
  炸: '音效/把回忆拼好给你/entity.firework_rocket.blast',
  大炸: '音效/把回忆拼好给你/entity.firework_rocket.large_blast',
  噼啪: '音效/把回忆拼好给你/entity.firework_rocket.twinkle',
  咔哒: '音效/车万女仆/item.camera_use',
} as const;
const fileSec = { 种树苗: 0.403, 发射: 1.625, 炸: 1.0, 大炸: 2.0, 噼啪: 1.334, 咔哒: 0.88 } as const;
const clickOnsetSec = 0.13;

/** 「绽」咔哒定格以后，世界里还在响的（最大那发的炸声）0.25 秒里收掉：照片定住了，声音也停在那一下 */
const freezeFadeSec = 0.25;
const freezeFrame = mainCutEvents.screenshotFreeze.frame;
const freezeFade = (frame: number) => clamp01(1 - (frame - freezeFrame) / (freezeFadeSec * fps));

const cue = (soundKind: keyof typeof doorNightSfxAssets, name: string, sec: number, onsetSec = 0, followFreeze = true): SongSound => {
  const g = soundGain[soundKind];
  return {
    asset: doorNightSfxAssets[soundKind],
    name: name,
    起帧: toSongFrame(sec - onsetSec),
    durationSec: fileSec[soundKind],
    增益: followFreeze ? (frame) => g * freezeFade(frame) : () => g,
  };
};

export const doorNightSounds: readonly SongSound[] = [
  cue('种树苗', '种樱花树苗', plantSec),
  ...fireworks.flatMap((firework) => fireworkSounds(firework).map((s) => cue(s.kind, `烟花${firework.name}${s.kind}`, s.sec))),
  cue('咔哒', '咔哒', mainCutEvents.screenshotFreeze.sec, clickOnsetSec, false),
];

/** 落在这一段窗口（秒）里的那几截 */
export const segSounds = (span: { startSec: number; endSec: number }): AssetCue[] =>
  doorNightSounds.map((cue) => clipToSegment(span, cue)).filter((c): c is AssetCue => c !== null);
