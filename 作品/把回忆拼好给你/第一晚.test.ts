import { describe, expect, it } from 'vitest';
import type { SoundCue, AssetCue } from '@engine/段/段定义.ts';
import seg from './段/2-第一晚/段.ts';
import {
  events, brightFullFrame, zombieState, zombiePassHoleFrame, stripAt, pitStateAt, skyTick, fastForwardStart, pickupFrame, dropItems, digHand, holeDark, shards, crackState, shotAt, topWallDark, dawnStart, SteveState, dropPath,
} from './段/2-第一晚/编排.ts';
import { mainCutEvents, SegmentWindow, lineAt, fps, beatAt } from './分镜.ts';
import { skyBrightness } from './地点/天体.ts';
import { zombie, roarLeadSec, groundLayers, headAngles, fastForward, digFacing, holeDarkParams, soundFx } from './场/2-第一晚/参数.ts';
import { crossSection, sectionOrigin, cameraRigs } from './场/2-新世界/参数.ts';
import { crossSectionBlocks } from './场/2-新世界/地形.ts';
import { youAt, skyTickAt, cameraRigAt } from './场/2-新世界/编排.ts';
import { starBrightness } from './场/2-新世界/星.ts';
import { toFrameCues, frameCountOf, sceneWindowFrames } from './声音/回帧.ts';

const frameCount = frameCountOf(seg);
const startFrame = SegmentWindow('2-第一晚').起帧;

describe('2-第一晚：第 2 句「祈愿小世界里不只有挫败」', () => {
  it('窗口从第 2 句首字到第 3 句首字（60 fps 歌曲帧 297～503）', () => {
    const w = SegmentWindow('2-第一晚');
    expect([w.起帧, w.止帧]).toEqual([297, 503]);
    expect(w.起帧 / fps).toBeCloseTo(lineAt(2).起, 1);
    expect(w.止帧 / fps).toBeCloseTo(lineAt(3).起, 1);
    expect(frameCount).toBe(206);
  });

  it('只拍挖三填一：挖一、挖二、挖三、填土一拍一下（第 12～15 拍），挖开天窗在第 18 拍，段尾留够半秒阳光照进洞里（第 3 句从这里接）', () => {
    const expected = [[mainCutEvents.digFirst, 12], [mainCutEvents.digSecond, 13], [mainCutEvents.digThird, 14], [mainCutEvents.fillHole, 15], [mainCutEvents.digSkylight, 18]] as const;
    for (const [e, n] of expected) expect(e.sec).toBeCloseTo(beatAt(n), 6);
    expect(frameCount - events.digSkylight).toBeGreaterThanOrEqual(Math.round(0.5 * fps));
    for (let f = events.digSkylight; f < frameCount; f++) {
      expect(pitStateAt(f)).toEqual({ dugCount: 3, dirtCovered: false });
      expect(skyBrightness(skyTick(f))).toBe(1);
      expect(topWallDark(f)).toBe(holeDarkParams.topWall);
    }
    // 天光两格照到底以后到段尾洞里全亮，至少留三分之一秒
    const lightEndFrame = events.digSkylight + 2 * holeDarkParams.lightDownSec * fps;
    expect(frameCount - lightEndFrame).toBeGreaterThanOrEqual(Math.round(fps / 3));
    for (let f = lightEndFrame; f < frameCount; f++) expect(holeDark(f)).toEqual([{ 前: 0, 后: 0 }, { 前: 0, 后: 0 }]);
  });

  it('cue：原声铺满整段；音效是挖三填一、僵尸低吼和挖开天窗，挖、放在碎、放的那一帧，按实测峰值配到目标 dBFS', () => {
    const soundCues = toFrameCues(seg).filter((c) => c.lines === undefined);
    const originalTrack = soundCues.find((c) => c.name === '原声')!;
    expect([originalTrack.frame, originalTrack.frameCount]).toEqual([0, frameCount]);
    const assets = soundCues.filter((c) => c.name !== '原声');
    expect(assets.map((c) => c.name)).toEqual(['挖一', '挖二', '挖三', '填土', '僵尸', '挖开天窗']);
    for (const c of assets) {
      expect(c.frame + c.frameCount).toBeLessThanOrEqual(frameCount);
      const expectedLevels = soundFx[c.name as keyof typeof soundFx];
      expect(20 * Math.log10(c.增益 as number) + expectedLevels.peakDb).toBeCloseTo(expectedLevels.dest, 3);
      expect(expectedLevels.dest).toBeLessThanOrEqual(-15);
    }
    expect(assets.map((c) => c.frame)).toEqual([events.digFirst, events.digSecond, events.digThird, events.fillHole, zombiePassHoleFrame - Math.round(roarLeadSec * fps), events.digSkylight]);
  });

  it('接 2-初入 一镜不切：同一个剖面机位、撤完了排；你站在坑那一格、朝东低头，段首就开始挥手挖', () => {
    for (let f = 0; f < frameCount; f++) {
      shotAt(f).眼.forEach((v, i) => expect(v).toBeCloseTo(cameraRigs.剖面.眼[i]!, 9));
      expect(stripAt(f)).toBe(crossSection.stripRows);
    }
    expect(shotAt(0)).toEqual(cameraRigAt(1, startFrame - 1));
    const prevFrame = youAt(startFrame - 1);
    const s = SteveState(0);
    expect(prevFrame.feet[0] - sectionOrigin[0]).toBeCloseTo(s.x, 2);
    expect(prevFrame.feet[1] - sectionOrigin[1]).toBeCloseTo(0.5, 2);
    expect([prevFrame.facing, prevFrame.头]).toEqual([s.yaw, s.头]);
    expect([s.yaw, s.头]).toEqual([digFacing, headAngles.digAngleDeg]);
    expect(SteveState(1).swing).toBeGreaterThan(0);
    expect(crackState(Math.ceil((5 * fps) / 24))).not.toBeNull();
  });

  it('天：接着 2-初入 的下午，边挖边黑、填土那一拍黑透；快进翻到破晓，黎明铺开好几帧（不从黑跳到白），挖开天窗前就亮满；天上的刻不往回走', () => {
    expect(skyTick(0)).toBe(skyTickAt(startFrame));
    expect(skyTick(0)).toBeGreaterThan(skyTickAt(startFrame - 1));
    expect(skyBrightness(skyTick(0))).toBe(1);
    expect(skyBrightness(skyTick(events.digFirst))).toBeGreaterThan(0.8);
    expect(skyBrightness(skyTick(events.fillHole))).toBe(0);
    for (let f = events.fillHole; f <= dawnStart; f++) expect(skyBrightness(skyTick(f))).toBe(0);
    // 快进里星星满亮
    expect(starBrightness(skyTick(Math.round((fastForwardStart + dawnStart) / 2)))).toBeCloseTo(0.5, 2);
    // 黎明：每帧天亮最多涨两成，中间那帧一半左右
    for (let f = dawnStart + 1; f <= brightFullFrame; f++) expect(skyBrightness(skyTick(f)) - skyBrightness(skyTick(f - 1))).toBeLessThan(0.2);
    expect(skyBrightness(skyTick(dawnStart + (fastForward.dawnSec * fps) / 2))).toBeCloseTo(0.5, 1);
    expect(skyBrightness(skyTick(brightFullFrame))).toBe(1);
    expect(brightFullFrame).toBeLessThan(events.digSkylight);
    expect(starBrightness(skyTick(events.digSkylight)) ** 2).toBeLessThan(1 / 255);
    for (let f = 1; f < frameCount; f++) expect(skyTick(f)).toBeGreaterThanOrEqual(skyTick(f - 1));
  });

  it('僵尸：快进里从画面左边外面匀速走到右边外面，踩过洞顶时洞是封着的，天亮满以前走掉', () => {
    expect(zombieState(fastForwardStart - 1)).toBeNull();
    expect(zombieState(fastForwardStart)?.x).toBe(zombie.startX);
    expect(pitStateAt(zombiePassHoleFrame).dirtCovered).toBe(true);
    expect(Math.abs(zombieState(zombiePassHoleFrame)!.x)).toBeLessThan(1);
    const walkDone = events.digSkylight - zombie.stopBeforeSec * fps;
    expect(zombieState(walkDone)?.x).toBe(zombie.endX);
    expect(zombieState(Math.floor(walkDone) + 1)).toBeNull();
    expect(walkDone).toBeLessThanOrEqual(brightFullFrame);
  });

  it('挖三填一：三拍各挖掉一格、掉一格，填土以后头顶有土、两格高的洞装得下你，挖开天窗那一帧土没了', () => {
    expect(pitStateAt(events.digFirst - 1)).toEqual({ dugCount: 0, dirtCovered: false });
    expect(pitStateAt(events.digThird)).toEqual({ dugCount: 3, dirtCovered: false });
    expect(pitStateAt(events.fillHole)).toEqual({ dugCount: 3, dirtCovered: true });
    expect(pitStateAt(events.digSkylight)).toEqual({ dugCount: 3, dirtCovered: false });
    expect(SteveState(events.fillHole - 1).z).toBe(-3);
    // 站在坑底那格泥土上
    const pitColumn = crossSectionBlocks(pitStateAt(events.fillHole - 1)).filter((b) => b.位[0] === sectionOrigin[0] - 0.5 && b.位[1] === sectionOrigin[1]);
    expect(Math.max(...pitColumn.map((b) => b.位[2]))).toBe(groundLayers.pitBottom);
    expect(pitColumn.find((b) => b.位[2] === groundLayers.pitBottom)?.state).toBe('minecraft:dirt');
    // 头顶 z −3 + 1.8 低于填上的土的底面（z −1）
    expect(SteveState(events.fillHole).z + 1.8).toBeLessThan(groundLayers.grassLayer);
    // 裂纹：碎之前长满，碎的那一帧没有
    expect(crackState(events.digSecond - 1)?.级).toBe(9);
    expect(crackState(events.digSecond)).toBeNull();
    expect(crackState(events.digSkylight - 1)?.cell).toEqual(shards[3]!.cell);
    // 挖的出手：0 → ½ 三刻、½ → 1 一刻
    expect([0, 1, 2, 3, 3.5, 4].map(digHand)).toEqual([0, 1 / 6, 2 / 6, 0.5, 0.75, 0]);
    // 原版下落一格约 4.6 刻
    expect(dropPath(1).length - 1).toBe(5);
  });

  it('掉落物：碎了就掉，10 刻后捡起、3 刻飞完；你从捡起第一块起手里拿着土', () => {
    expect(pickupFrame(0)).toBe(events.digFirst + 0.5 * fps);
    expect(dropItems(events.digFirst).length).toBe(1);
    expect(dropItems(pickupFrame(0) + (4 * fps) / 24).length).toBe(1); // 捡起后 1/6 秒（约 3.3 刻）：第一块飞完了，第二块还在
    expect(SteveState(pickupFrame(0) - 1).holdingDirt).toBe(false);
    expect(SteveState(pickupFrame(0)).holdingDirt).toBe(true);
    // 都在坑里那一列（x −0.5～0.5）、剖面以里（y ≥ 0）
    for (let f = events.digFirst; f < frameCount; f++)
      for (const p of dropItems(f)) {
        expect(Math.abs(p.位[0])).toBeLessThanOrEqual(0.5);
        expect(p.位[1]).toBeGreaterThanOrEqual(0);
      }
  });

  it('洞里的暗：封顶那段两格都暗、后墙比你暗；挖开天窗后天光从上往下一格一格照下去；后墙顶上那格洞顶开着时压暗', () => {
    for (let f = 0; f < frameCount; f++) {
      const darkness = holeDark(f);
      if (f < events.fillHole) {
        expect(darkness).toEqual([{ 前: 0, 后: 0 }, { 前: 0, 后: 0 }]);
        continue;
      }
      if (f < events.digSkylight) {
        for (const { 前: front, 后: after } of darkness) {
          expect(front).toBeGreaterThan(0.2);
          expect(after).toBeGreaterThan(0.4);
          expect(1 - (1 - front) * (1 - after)).toBeLessThan(1);
        }
        continue;
      }
      // 上面那格先亮
      expect(darkness[0]!.前).toBeLessThanOrEqual(darkness[1]!.前);
    }
    const litPastFrame = Math.ceil(events.digSkylight + holeDarkParams.lightDownSec * fps);
    expect(holeDark(litPastFrame)[0]).toEqual({ 前: 0, 后: 0 });
    expect(holeDark(litPastFrame)[1]!.前).toBeGreaterThan(0);
    expect(topWallDark(events.digFirst - 1)).toBe(0);
    expect(topWallDark(events.digFirst)).toBe(holeDarkParams.topWall);
    expect(topWallDark(events.fillHole)).toBe(0);
  });
});
