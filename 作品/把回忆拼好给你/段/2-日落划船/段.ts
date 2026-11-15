// 正片第 4 句「眼睛里看到的都是广袤无垠的大海」：她眼睛的特写匹配剪辑到日落的海，你划着樱花木船、她坐在船上，最后一道浪盖满画面。
// 帧数、场窗口、原声和各音效 cue 的帧都从 分镜、场/2-海上/编排.ts 推，增益在场参数，段里不写数字。
import { defineSeg } from '@engine/段/段定义.ts';
import { fps, aspect } from '../../分镜/时间.ts';
import { segClock, segEventFrames as segMainCutEventFrames } from '../../分镜/正片第4句.ts';
import { originalGain, oarSoundGain, oarSoundFiles, waveSoundGain, waveSoundFadeSec } from '../../场/2-海上/参数.ts';
import { oarSoundSecs, segWindow } from '../../场/2-海上/编排.ts';
import { toAssetCue, type FrameCue } from '../../声音/跨段音效.ts';

const segKey = '2-日落划船';
const clock = segClock(segKey);
const events = segMainCutEventFrames(segKey);

/** 文件实长（秒，ffprobe 量的），cue 不超过段尾 */
const oarSoundDurSec: Readonly<Record<number, number>> = { 1: 0.901, 2: 0.851, 3: 1.001, 4: 1.037, 5: 1.213, 6: 1.051, 7: 0.8, 8: 0.901 };
const waveSoundDurSec = 3.027;
const clampFramesToSegEnd = (startFrame: number, durSec: number) => Math.min(Math.ceil(durSec * fps), clock.帧数 - startFrame);

// 划桨水声：原版桨转过 π/4 的那一刻两支桨各放一声（编排.ts 的 桨声秒们）
const oarSounds: FrameCue[] = oarSoundSecs().flatMap((sec, i) => {
  const startFrame = Math.round(sec * fps) - segWindow.起帧;
  return oarSoundFiles[i % oarSoundFiles.length]!.map((n, j) => ({
    帧: startFrame,
    资产: `音效/把回忆拼好给你/entity.boat.paddle_water.${n}`,
    名: `桨声${i + 1}${j ? '右' : '左'}`,
    帧数: clampFramesToSegEnd(startFrame, oarSoundDurSec[n]!),
    增益: oarSoundGain,
  }));
});

const waveSound: FrameCue = { 帧: events.waveRises, 资产: '音效/entity.player.splash.high_speed', 名: '浪', 帧数: clampFramesToSegEnd(events.waveRises, waveSoundDurSec), 增益: waveSoundGain, fadeOutFrames: Math.round(waveSoundFadeSec * fps) };

export default defineSeg({
  场: '2-海上',
  秒: clock.秒,
  宽: aspect.宽,
  高: aspect.高,
  地形: [],
  sceneWindow: clock.sceneWindow,
  // 原声：固定增益；段在一串歌中间，不淡入
  声音: [{ ...clock.origTrack, 资产: '配乐/把回忆拼好给你-无男声DJ', 名: '原声', 增益: originalGain }, ...oarSounds.map(toAssetCue), toAssetCue(waveSound)],
});
