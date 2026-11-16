// 正片第 8 句「将快乐全都收集将不开心全都淘汰」：门这个机位整句一个镜头（从第 7 句末同一个朝向切进来，取景不动）。墙上已经挂着三张照片，她把最新那张挂进最后一只荧光框，
// 苦力怕摸过来，她挡在你身前冲它哈气、把它吓跑。
// 帧数、场窗口、原声和各音效 cue 的帧都从 分镜 推，增益在场参数，段里不写数字。
import { defineSeg } from '@engine/段/段定义.ts';
import { fps, legacyFrameSec, aspect } from '../../分镜/时间.ts';
import { segClock, segEventFrames as segMainCutEventFrames } from '../../分镜/正片第8句.ts';
import { originalGain, originalSoundDuck, puffSoundGain, hangPhotoSound } from '../../场/2-门口/第8句参数.ts';
import { toAssetCue, type FrameCue } from '../../声音/跨段音效.ts';

const segKey = '2-收集快乐';
const clock = segClock(segKey);
const events = segMainCutEventFrames(segKey);
const clampFramesToSegEnd = (startFrame: number, durSec: number) => Math.min(Math.ceil(durSec * fps), clock.frameCount - startFrame);

// 照片挂进框：原版荧光框放东西的声音，起音（文件一开头就最响）落在 挂照片 那一帧（照片进框同一帧）
const hangPhoto: FrameCue = { frame: events.hangPhoto, asset: hangPhotoSound.asset, name: '挂照片', frameCount: clampFramesToSegEnd(events.hangPhoto, hangPhotoSound.sec), 增益: hangPhotoSound.增益 };

// 猫的哈气声（entity.cat.hiss.1，1.17 秒，前 0.1 秒渐起、0.35 秒最响、0.6 秒后只剩尾音）：比哈气那一帧早 1/12 秒（24 fps 时 2 帧）起放，劲头落在她摆好架势之后；
// 段尾截掉的是尾音，最后 1/6 秒（24 fps 时 4 帧）淡掉
const hissStart = events.hiss - Math.round(legacyFrameSec(2) * fps);
const hissCue: FrameCue = { frame: hissStart, asset: '音效/把回忆拼好给你/entity.cat.hiss.1', name: '哈气', frameCount: clampFramesToSegEnd(hissStart, 1.169), 增益: puffSoundGain, fadeOutFrames: Math.round(legacyFrameSec(4) * fps) };

// 原声：固定增益，哈气最响那一截让一让（按秒线性渐变进出）。段在一串歌中间，不淡入
const { preSec, afterSec, rampSec } = originalSoundDuck;
const sighMix = (f: number) => {
  const s = (f - events.hiss) / fps;
  return Math.min(1, Math.max(0, (s + preSec + rampSec) / rampSec), Math.max(0, (afterSec + rampSec - s) / rampSec));
};
const originalGainFrames = Array.from({ length: clock.frameCount }, (_, f) => Math.round((originalGain + (originalSoundDuck.增益 - originalGain) * sighMix(f)) * 1e6) / 1e6);

export default defineSeg({
  scene: '2-门口',
  sec: clock.sec,
  width: aspect.width,
  height: aspect.height,
  terrain: [],
  sceneWindow: clock.sceneWindow,
  sound: [{ ...clock.origTrack, asset: '配乐/把回忆拼好给你-无男声DJ', name: '原声', 增益: { perSec: fps, value: originalGainFrames } }, toAssetCue(hangPhoto), toAssetCue(hissCue)],
});
