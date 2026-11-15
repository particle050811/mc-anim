// 第 15 句摇铃起的两个声音：寻风之铃的铃声、樱花风的风声。都从门口那段放起、拖过转场进隐世之境那段（声音/跨段音效.ts 切成每段一截）。
// 纯数据（段.ts 读）。增益是 Agent 暂定（三稿「克制」：压在歌下面，听得出来就行），文件本身的数是 ffmpeg 解码量的。
import { clamp01 } from '@engine/anim/anim.ts';
import { fps, toSongFrame } from '../../分镜/时间.ts';
import { events as lyricEvents } from '../../分镜/歌词.ts';
import { events as mainCutLine15Events } from '../../分镜/正片第15句.ts';
import type { SongSound } from '../../声音/跨段音效.ts';

const mainCutEvents = { ...lyricEvents, ...mainCutLine15Events };

/** 寻风之铃（音效/万法皆通/wind_seeking_bell）：文件 2.07 秒，开头 0.04 秒近乎静音，铃一响就到 −13 dBFS 上下、0.5 秒最响（−6）、两秒里慢慢收 */
export const bellFile = { onsetSec: 0.04, 时长秒: 2.069 } as const;
/** 铃声增益：一个数，整声都一样 */
export const bellSoundGain = 0.35;

/** 风声借原版鞘翅飞行的风（音效/item.elytra.flying，10.2 秒的循环，平均 −27.5 dB）：摇铃起 0.25 秒淡进来，盖满（转场）后 0.35 秒淡掉 */
export const windSoundParams = { 增益: 0.6, fadeInSec: 0.25, fadeOutSec: 0.35 } as const;

/** 铃声：起音落在摇铃那一帧 */
export const bellSound: SongSound = {
  资产: '音效/万法皆通/wind_seeking_bell',
  名: '寻风之铃',
  起帧: mainCutEvents.ringBell.帧 - Math.round(bellFile.onsetSec * fps),
  时长秒: bellFile.时长秒,
  增益: () => bellSoundGain,
};

const windStart = mainCutEvents.ringBell.帧;
const windEnd = toSongFrame(mainCutEvents.windClears.秒 + windSoundParams.fadeOutSec);

/** 风声：摇铃那一帧起，转场后淡完 */
export const windSound: SongSound = {
  资产: '音效/item.elytra.flying',
  名: '樱花风',
  起帧: windStart,
  帧数: windEnd - windStart,
  时长秒: 10.22,
  增益: (frame) => {
    const fadeIn = clamp01((frame - windStart + 1) / (windSoundParams.fadeInSec * fps));
    const fadeOut = clamp01((windEnd - frame) / (windSoundParams.fadeOutSec * fps));
    return windSoundParams.增益 * fadeIn * fadeOut;
  },
};
