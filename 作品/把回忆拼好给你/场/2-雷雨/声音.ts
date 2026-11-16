// 第 6、7 句的声音：雨声（第 6 句首字前一点从 2-抢龙蛋 末尾淡进来，两段一直下，破云起收掉）、第 6 句两声雷、第 7 句光柱撞云时的信标声。按歌曲帧排，段.ts 用 声音/跨段音效.ts 切出落在自己窗口里的那一截。
// 纯数据。增益、文件长度在 参数.ts。
import { fps, oneFrameSec } from '../../分镜/时间.ts';
import { events as mainCut6to7Events } from '../../分镜/正片第6到7句.ts';
import { events as mainCut8Events } from '../../分镜/正片第8句.ts';
import type { SongSound } from '../../声音/跨段音效.ts';
import * as params from './参数.ts';
import { clamp01 } from '@engine/core/数学.ts';

const mainCutEvents = { ...mainCut6to7Events, ...mainCut8Events };

/** 雨量（0～1，歌曲帧）：破云前满，破云到阳光铺地之间收到 0（演绎：原版雨停要 5 秒，雨量每刻减 0.01） */
export const rainAmount = (frame: number) => clamp01((mainCutEvents.sunlightSpreads.frame - frame) / (mainCutEvents.sunlightSpreads.frame - mainCutEvents.cloudBreaks.frame));

/** 雨声从哪一帧起：比第 6 句首字早 雨声提前秒，先在 2-抢龙蛋 末尾淡进来；按秒淡入，起那一帧已经淡进一帧 */
export const rainSoundStartFrame = mainCutEvents.line6VocalIn.frame - Math.round(params.rainSoundLeadSec * fps);
const rainFadeIn = (frame: number) => clamp01(((frame - rainSoundStartFrame) / fps + oneFrameSec) / ((mainCutEvents.line6VocalIn.frame - rainSoundStartFrame) / fps));

/** 雨声：rain 1～4 首尾相接，从第 6 句首字前一点起一直接到雨停 */
export const rainSounds: readonly SongSound[] = (() => {
  const out: SongSound[] = [];
  const endFrame = mainCutEvents.sunlightSpreads.frame;
  for (let startFrame = rainSoundStartFrame, k = 0; startFrame < endFrame; k++) {
    const rainSoundFile = params.rainSounds[k % params.rainSounds.length]!;
    const frameCount = Math.min(Math.round(rainSoundFile.sec * fps), endFrame - startFrame);
    out.push({ asset: rainSoundFile.asset, name: `雨声${k + 1}`, 起帧: startFrame, frameCount: frameCount, durationSec: rainSoundFile.sec, 增益: (frame) => params.rainSoundGain * rainAmount(frame) * rainFadeIn(frame) });
    startFrame += frameCount;
  }
  return out;
})();

/** 一声雷：滚雷和闪光同时到；她站起来放法术（第 7 句首字）之前淡掉，只落在 2-雷雨 里 */
const thunderEndFrame = mainCutEvents.liYingStandsUp.frame;
const thunderClap = (flashFrame: number, name: string): SongSound => {
  const startFrame = flashFrame - Math.round(params.thunderSound.leadSec * fps);
  return { asset: params.thunderSound.asset, name: name, 起帧: startFrame, frameCount: thunderEndFrame - startFrame, durationSec: params.thunderSound.sec, 增益: (frame) => params.thunderSound.增益 * clamp01((thunderEndFrame - frame) / fps / params.thunderSound.fadeOutSec) };
};
/** 切点那一道闪电的闷雷 */
export const thunder = thunderClap(mainCutEvents.distantThunder.frame, '闷雷');
/** 推到缺口那一道闪电的雷（原版每道闪电都响一声雷；同一个文件，叠在第一声滚雷的尾巴上） */
export const nearThunder = thunderClap(mainCutEvents.lightningRevealsBreach.frame, '近雷');

/** 信标声：「拨」那一帧起放，接第 8 句时截掉，截之前淡掉 */
const beaconStartFrame = mainCutEvents.beamHitsCloud.frame;
const beaconEndFrame = mainCutEvents.line8VocalIn.frame;
export const beaconSound: SongSound = {
  asset: params.beaconSoundParams.asset,
  name: '信标激活',
  起帧: beaconStartFrame,
  frameCount: beaconEndFrame - beaconStartFrame,
  durationSec: params.beaconSoundParams.sec,
  增益: (frame) => params.beaconSoundParams.增益 * clamp01((beaconEndFrame - frame) / fps / params.beaconSoundParams.fadeOutSec),
};
