// 正片第 2 句「祈愿小世界里不只有挫败」：你的第一晚。接着 2-初入 的地面剖面一镜不切，只拍「挖三填一」（用户 10-24「死多次表现不好 只留挖三填一就行」）、快进一夜（僵尸从洞顶走过）、挖开头顶。
// 帧数、场窗口、原声和各音效 cue 的帧都从 分镜 推，增益按 场/2-第一晚/参数.ts 的实测峰值配，段里不写数字。
import { defineSeg } from '@engine/段/段定义.ts';
import { fps, aspect } from '../../分镜/时间.ts';
import { segClock, segEventFrames as segMainCutEventFrames } from '../../分镜/正片第2句.ts';
import { roarLeadSec, originalGain, soundFx } from '../../场/2-第一晚/参数.ts';
import { zombiePassHoleFrame } from './编排.ts';
import { toAssetCue, type FrameCue } from '../../声音/跨段音效.ts';

const segKey = '2-第一晚';
const clock = segClock(segKey);
const events = segMainCutEventFrames(segKey);
const clampFramesToSegEnd = (startFrame: number, durSec: number) => Math.min(Math.ceil(durSec * fps), clock.frameCount - startFrame);

type SfxName = keyof typeof soundFx;
/** 一个音效：在第 帧 帧起放，增益把文件峰值配到 参数.ts 的 到（dBFS），放到文件完或段尾 */
const playCue = (soundName: SfxName, startFrame: number): FrameCue => {
  const sound = soundFx[soundName];
  const gain = Math.round(10 ** ((sound.dest - sound.peakDb) / 20) * 1e6) / 1e6;
  return { frame: startFrame, asset: sound.asset, name: soundName, frameCount: clampFramesToSegEnd(startFrame, sound.sec), 增益: gain };
};

// 挖、放土在方块碎、方块出现的那一帧；僵尸低吼最响那一下落在它走到洞顶正上方的时候
const sfxCues: readonly FrameCue[] = [
  playCue('挖一', events.digFirst),
  playCue('挖二', events.digSecond),
  playCue('挖三', events.digThird),
  playCue('填土', events.fillHole),
  playCue('僵尸', zombiePassHoleFrame - Math.round(roarLeadSec * fps)),
  playCue('挖开天窗', events.digSkylight),
];

export default defineSeg({
  scene: '2-第一晚',
  sec: clock.sec,
  width: aspect.width,
  height: aspect.height,
  terrain: [],
  sceneWindow: clock.sceneWindow,
  sound: [{ ...clock.origTrack, asset: '配乐/把回忆拼好给你-无男声DJ', name: '原声', 增益: originalGain }, ...sfxCues.map(toAssetCue)],
});
