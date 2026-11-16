import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AssetCue } from '@engine/段/段定义.ts';
import { canvasDpr } from '@engine/core/渲染级别.ts';
import { makeRigCamera } from '@engine/三渲二/机位.tsx';
import { projectToPage, zUpToThree } from '@库/界面/投影.ts';
import { makePixelFont } from '@库/界面/像素字表.ts';
import { bytesPath, readWorkAssetLock } from '../../../../pipeline/资产/资产锁.ts';
import groupPhotoSeg from '../../段/2-合照/段.ts';
import reassembleSeg from '../../段/2-拼回/段.ts';
import { fps, segMainCutEventFrames, SegmentWindow, aspect, mainCutEvents } from '../../分镜.ts';
import { mainCutOriginalGain } from '../../配乐/正片.ts';
import { clipToSegment } from '../../声音/跨段音效.ts';
import { mainCutLyricLine } from '../../界面/符文歌词数据.ts';
import { shoulderRig, leanProgress } from './合照动作.ts';
import { groupPhotoClickSound, clickSoundFile } from './合照声音.ts';
import { groupPhotoStand, groupPhotoShot, lineBubbleHandedOver } from './合照参数.ts';
import { lineBubble } from './重逢参数.ts';
import { toFrameCue, toFrameCues, frameCountOf, sceneWindowFrames } from '../../声音/回帧.ts';

const events = mainCutEvents;
const toSec = (songFrame: number) => songFrame / fps;
const findCue = (name: string, seg = groupPhotoSeg) => toFrameCues(seg).find((c) => c.name === name);

describe('15 尾（2-合照）：窗口和事件', () => {
  it('窗口 [3177, 3279)：接在 2-重逢 后面，止在咔哒（54.65，第 32 小节下拍，2-拼回 从这里起）', () => {
    expect(SegmentWindow('2-合照')).toMatchObject({ 起帧: 3177, 止帧: 3279, frameCount: 102 });
    expect(SegmentWindow('2-重逢').止帧).toBe(SegmentWindow('2-合照').起帧);
    expect(Math.round(54.65 * fps)).toBe(3279);
    expect(frameCountOf(groupPhotoSeg)).toBe(102);
  });

  it('和前后两段交接的时刻是同一刻：靠肩起 = 2-重逢 止；咔哒 = 片尾歌词收；段尾 = 片尾白光 = 2-拼回 起', () => {
    expect(events.leanStart.frame).toBe(events.cutToTail.frame);
    expect(events.leanStart.frame).toBe(SegmentWindow('2-重逢').止帧);
    expect(events.groupPhotoClick.frame).toBe(events.outroLyricsOut.frame);
    expect(SegmentWindow('2-合照').止帧).toBe(events.outroFlash.frame);
    expect(SegmentWindow('2-合照').止帧).toBe(SegmentWindow('2-拼回').起帧);
  });

  it('段内帧：靠肩起 0、靠好 51、咔哒 102；照片就是咔哒那一帧', () => {
    const mainEvents = segMainCutEventFrames('2-合照');
    expect([mainEvents.leanStart, mainEvents.leanOnShoulder, mainEvents.groupPhotoClick, mainEvents.photoGroupShot]).toEqual([0, 51, 102, 102]);
  });

  it('15 尾只一个镜头：靠肩从段头到咔哒（不短于 1.5 秒），咔哒那一帧就是片尾第一帧（闪白在片尾里）', () => {
    expect(toSec(events.groupPhotoClick.frame - events.leanStart.frame)).toBeGreaterThanOrEqual(1.5);
    expect(SegmentWindow('2-合照').止帧).toBe(events.groupPhotoClick.frame);
  });

  it('她从段头那个笑缓缓靠过去：靠肩起 0、一路往上、靠肩 那一帧起到位', () => {
    expect(leanProgress(events.leanStart.frame)).toBe(0);
    for (let frame = events.leanStart.frame + 1; frame <= events.leanOnShoulder.frame; frame++) expect(leanProgress(frame), `帧 ${frame}`).toBeGreaterThan(leanProgress(frame - 1));
    for (let frame = events.leanOnShoulder.frame; frame < events.groupPhotoClick.frame; frame++) expect(leanProgress(frame), `帧 ${frame}`).toBe(1);
  });
});

describe('15 尾：靠肩的取景（新合照，片尾取正中的正方形做原版选择世界界面的世界图标）', () => {
  it('N、顶面是偶数，顶面不超过 N', () => {
    expect(groupPhotoShot.N % 2).toBe(0);
    expect(groupPhotoShot.topDepth % 2).toBe(0);
    expect(groupPhotoShot.topDepth).toBeLessThanOrEqual(groupPhotoShot.N);
  });

  it('两个人从脚到头顶都在画面正中的正方形里（页面 x 280～1000），头顶不出上沿', () => {
    const cam = makeRigCamera(shoulderRig, aspect.width, aspect.height, canvasDpr(1));
    const project = (p: readonly [number, number, number]) => projectToPage(cam, zUpToThree([p[0], p[1], p[2]]), aspect.width, aspect.height);
    const squareSpan = { left: (aspect.width - aspect.height) / 2, right: (aspect.width + aspect.height) / 2 };
    for (const feet of [groupPhotoStand.liYingPos, groupPhotoStand.你]) {
      for (const height of [0, 1, 2]) {
        for (const horizontal of [-0.5, 0.5]) {
          const q = project([feet[0], feet[1] + horizontal, feet[2] + height]);
          expect(q.x).toBeGreaterThan(squareSpan.left);
          expect(q.x).toBeLessThan(squareSpan.right);
          expect(q.y).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('15 尾：声音、歌词', () => {
  it('原声放满窗口，增益固定', () => {
    expect(findCue('原声')).toMatchObject({ frame: 0, frameCount: 102, 入点秒: 3177 / fps, 增益: mainCutOriginalGain });
  });

  it('咔哒主音离闪白那一帧不到半帧；段里放到段尾，剩下的一截从片尾那段段头接着放', () => {
    expect(Math.abs(toSec(groupPhotoClickSound.起帧) + clickSoundFile.onsetSec - toSec(events.groupPhotoClick.frame))).toBeLessThan(0.5 / fps);
    const a = findCue('咔哒')!;
    expect(a.frame).toBe(groupPhotoClickSound.起帧 - SegmentWindow('2-合照').起帧);
    expect(a.frame + a.frameCount).toBe(102);
    expect(a.入点秒).toBeUndefined();
    const b = toFrameCue(clipToSegment({ startSec: SegmentWindow('2-合照').止帧 / fps, endSec: SegmentWindow('2-合照').止帧 / fps + 2 }, groupPhotoClickSound)!);
    expect(b.frame).toBe(0);
    expect(b.入点秒).toBeCloseTo(a.frameCount / fps, 12);
    expect(a.frameCount + b.frameCount).toBe(Math.ceil(clickSoundFile.durationSec * fps));
  });

  it('剩下那截（卷片声）真的放在 2-拼回 段头，增益同一个', () => {
    const a = findCue('咔哒')!;
    const b = findCue('咔哒', reassembleSeg)!;
    expect(b).toMatchObject({ frame: 0, asset: clickSoundFile.asset });
    expect(b.入点秒).toBeCloseTo(a.frameCount / fps, 12);
    expect(a.frameCount + b.frameCount).toBe(Math.ceil(clickSoundFile.durationSec * fps));
    expect(new Set([...(a.增益 as number[]), ...(b.增益 as number[])])).toEqual(new Set([groupPhotoClickSound.增益(0)]));
  });

  it('「爱炙热的你却忘了爱自己」段头已经在场，咔哒前最后一个字已经唱出', () => {
    const lyricLine = mainCutLyricLine(15, SegmentWindow('2-合照').起帧);
    expect(lyricLine.入).toBeLessThan(0);
    expect(Math.max(...lyricLine.charTimes)).toBeLessThan(segMainCutEventFrames('2-合照').groupPhotoClick);
  });
});

describe('15 尾：接过来的台词气泡（用户 10-25 要「您的手艺，一如既往呢」多留一会儿）', () => {
  it('段头起挂着，她靠好那一帧（段内 51）收，咔哒那张新合照里没有；和 2-重逢 里一样大（12）', () => {
    expect(segMainCutEventFrames('2-合照').speechBubbleOut).toBe(51);
    expect(events.speechBubbleOut.frame).toBe(events.leanOnShoulder.frame);
    expect(events.speechBubbleOut.frame).toBeLessThan(events.groupPhotoClick.frame);
    expect([lineBubbleHandedOver.scale, lineBubble.scale]).toEqual([12, 12]);
  });
});

// 气泡框：像素字表在数据根里，没有就跳过（同 对视参数.test.ts）
const workRoot = path.resolve(import.meta.dirname, '../..');
const fontLockEntry = readWorkAssetLock(workRoot)['字体/把回忆拼好给你/像素字'];
const hasTable = !!fontLockEntry && fs.existsSync(bytesPath(fontLockEntry));

describe.skipIf(!hasTable)('15 尾：接过来的台词气泡的落点', () => {
  const pixelFont = makePixelFont(JSON.parse(fs.readFileSync(bytesPath(fontLockEntry!), 'utf8')), '字体/把回忆拼好给你/像素字');
  it('整个在画里（离上沿至少 14、左右至少 16），尾巴尖在底部歌词（页面 y 623 起）上面', () => {
    const cam = makeRigCamera(shoulderRig, aspect.width, aspect.height, canvasDpr(1));
    // 锚点同 合照.tsx 的 靠肩气泡锚：脚底 + 女仆气泡锚高()（= 2，库/界面/女仆气泡.tsx 带贴图，这里不引）
    const anchor = projectToPage(cam, zUpToThree([groupPhotoStand.liYingPos[0], groupPhotoStand.liYingPos[1], groupPhotoStand.liYingPos[2] + 2]), aspect.width, aspect.height);
    const [halfScale, bubbleWidth] = [lineBubbleHandedOver.scale / 2, pixelFont.textWidth(lineBubble.char) + 10];
    expect(anchor.y - 19 * halfScale).toBeGreaterThanOrEqual(14);
    expect(anchor.x - (bubbleWidth / 2) * halfScale).toBeGreaterThanOrEqual(16);
    expect(anchor.x + (bubbleWidth / 2) * halfScale).toBeLessThanOrEqual(aspect.width - 16);
    expect(anchor.y + 8 * halfScale).toBeLessThan(623);
  });
});
