// 正片第 3 句「直到遇见你我以为就光明起来」：樱花林边的车万女仆祭坛，两个镜头。接第 2 句的洞切过来，贴地看着祭坛升起成远景，
// 你拿御币点祭坛，材料化成光汇到圈心，她站在光里出现；「光」那一拍切到圈里的近景：你递蛋糕驯服她（爱心），她转过来，镜头推进她的右眼，
// 接第 4 句的眼睛特写。画法见 场/2-祭坛/。
// 帧数、场窗口、原声和各音效 cue 的帧都从 分镜 推，增益在场参数，段里不写数字。
import { defineSeg } from '@engine/段/段定义.ts';
import { fps, aspect } from '../../分镜/时间.ts';
import { segClock, segEventFrames as segMainCutEventFrames } from '../../分镜/正片第3句.ts';
import { originalGain, soundFx } from '../../场/2-祭坛/参数.ts';
import { toAssetCue, type FrameCue } from '../../声音/跨段音效.ts';

const segKey = '2-祭坛召唤';
const clock = segClock(segKey);
const events = segMainCutEventFrames(segKey);
const clampFramesToSegEnd = (startFrame: number, durSec: number) => Math.min(Math.ceil(durSec * fps), clock.frameCount - startFrame);
const gainForPeak = (peakDb: number) => Math.round(10 ** ((soundFx.peakDb - peakDb) / 20) * 1e6) / 1e6;

// 祭坛合成声：文件头对着点祭坛那一帧（一开头就响）
const altarCue: FrameCue = { frame: events.activateAltar, asset: soundFx.祭坛.asset, name: '祭坛合成', frameCount: clampFramesToSegEnd(events.activateAltar, soundFx.祭坛.sec), 增益: gainForPeak(soundFx.祭坛.peakDb) };

export default defineSeg({
  scene: '2-祭坛',
  sec: clock.sec,
  width: aspect.width,
  height: aspect.height,
  terrain: [],
  sceneWindow: clock.sceneWindow,
  sound: [{ ...clock.origTrack, asset: '配乐/把回忆拼好给你-无男声DJ', name: '原声', 增益: originalGain }, toAssetCue(altarCue)],
});
