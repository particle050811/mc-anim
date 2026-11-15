// 验证片唯一的一段：第一人称固定机位，递蛋糕、驯服、微笑推镜、咔哒定格。帧数、场窗口、原声 cue 的帧和入点、咔哒的帧从 分镜 推，增益从场参数推，段里不写数字。
import { defineSeg } from '@engine/段/段定义.ts';
import { fps, legacyFrameSec, aspect } from '../../分镜/时间.ts';
import { segEventFrames, segClock } from '../../分镜/验证片.ts';
import { originalGain, originalFadeInSec, clickGain, clickSound } from '../../场/1-隐世之境一楼/参数.ts';
import { toAssetCue } from '../../声音/跨段音效.ts';

const segKey = '1-一如既往';
const clock = segClock(segKey);

// 原声：固定增益，开头淡入（第 f 帧乘 (f 帧的秒 + 1/24 秒) / 淡入秒，到满为止：第 0 帧算已经走了 1/24 秒，同 24 fps 时）。定义画面 照这条 cue 出声
const originalGainFrames = Array.from({ length: clock.帧数 }, (_, f) => Math.round(originalGain * Math.min(1, (f / fps + legacyFrameSec(1)) / originalFadeInSec) * 1e6) / 1e6);

// 咔哒：女仆相机的快门声，比定格那一帧早 起音秒 起放，主音落在定格（闪白）那一帧；放满整个文件。定义画面 照这条 cue 出声
const clickStartFrame = segEventFrames(segKey).咔哒定格 - Math.round(clickSound.onsetSec * fps);
const clickFrameCount = Math.min(Math.ceil(clickSound.时长秒 * fps), clock.帧数 - clickStartFrame);

export default defineSeg({
  场: '1-隐世之境一楼',
  秒: clock.秒,
  宽: aspect.宽,
  高: aspect.高,
  地形: [],
  sceneWindow: clock.sceneWindow,
  声音: [
    { ...clock.origTrack, 资产: '配乐/把回忆拼好给你-无男声DJ', 名: '原声', 增益: { 每秒: fps, 值: originalGainFrames } },
    toAssetCue({ 帧: clickStartFrame, 资产: '音效/车万女仆/item.camera_use', 名: '咔哒', 帧数: clickFrameCount, 增益: clickGain }),
  ],
});
