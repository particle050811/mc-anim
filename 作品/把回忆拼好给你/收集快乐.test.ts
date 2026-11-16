import { describe, expect, it, vi } from 'vitest';
import type { AssetCue } from '@engine/段/段定义.ts';
import seg from './段/2-收集快乐/段.ts';
import { LiYingState, framing, wallPhotoCount, bubbleState, photoState, creeperPose, gradeAt, clearingProgress } from './段/2-收集快乐/编排.ts';
import { mainCutEvents, segMainCutEventFrames, SegmentWindow, lineAt, fps, legacyFrameSec } from './分镜.ts';
import { cabinSkyCloud, cloudCells, scatterRadius } from './地点/原版云.ts';
import { photoWallCellPos, photoCellCorner } from './地点/照片墙格.ts';
import { hissStandPos, line8Tone, line8Shot, line8ShotCount } from './场/2-门口/第8句.ts';
import { cloudRemain, line8ShadingScene } from './场/2-门口/第8句云.ts';
import { endRainCloud } from './场/2-雷雨/末态.ts';
import {
  cloudHoleRadius,
  hangPhotoSound,
  photoHoldAngle,
  photoHoldEdge,
  photoFrameAngle,
  line8EndState,
  creeperFront,
  creeperWalkSpeed,
  creeperFleeMult,
  creeperTurnSec,
  originalSoundDuck,
  hangReachSec,
} from './场/2-门口/第8句参数.ts';
import { line8Photos } from './特效/照片画.ts';
import { orthoTop } from './画风.ts';
import { palette } from './色板.ts';
import { toFrameCues, frameCountOf, sceneWindowFrames } from './声音/回帧.ts';

// asset: 资产打包时才有，照片四张在测试里换成 1×1 的图。编排.ts 引的 vanillaWalk、CREEPER、门口.站排y 在 史蒂夫.tsx、苦力怕.tsx、门口小木屋.tsx 里，
// 那几个顶层就读模型、贴图（一路引到方块图集），换成桩：腿怎么摆这里不测；逃的速度照抄 CREEPER.speed.flee（groundSpeed(1.2)），站排y 照抄
const pixelPng = vi.hoisted(() => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==');
const vanillaFleeSpeed = vi.hoisted(() => ((0.3 ** 2 * 0.98) / (1 - 0.6 * 0.91)) * 20);
vi.mock('@库/角色/史蒂夫.tsx', () => ({ vanillaWalk: () => ({ limbSwing: 0, stride: 0 }) }));
vi.mock('@库/生物/苦力怕.tsx', () => ({ CREEPER: { speed: { flee: vanillaFleeSpeed } } }));
vi.mock('./地点/门口小木屋.tsx', () => ({ entrance: { standRowY: 0.5 } }));
vi.mock('asset:贴图/照片/第3句递蛋糕-三版', () => ({ default: pixelPng }));
vi.mock('asset:贴图/照片/第4句日落划船-二版', () => ({ default: pixelPng }));
vi.mock('asset:贴图/照片/第5句扑龙蛋-二版', () => ({ default: pixelPng }));
vi.mock('asset:贴图/照片/第7句光柱破云-三版', () => ({ default: pixelPng }));

const events = segMainCutEventFrames('2-收集快乐');
const halfWidthCells = 1280 / line8Shot.framing.pxPerCell;

describe('2-收集快乐：第 8 句整句一个镜头', () => {
  it('窗口从第 8 句首字到第 9 句首字（60 fps 歌曲帧 1528～1717）', () => {
    const w = SegmentWindow('2-收集快乐');
    expect([w.起帧, w.止帧]).toEqual([1528, 1717]);
    expect(w.起帧 / fps).toBeCloseTo(lineAt(8).起, 1);
    expect(frameCountOf(seg)).toBe(189);
    expect(sceneWindowFrames(seg)).toEqual({ 起帧: 1528, 止帧: 1717 });
  });

  it('拍：晴定 25.99，挂照片 26.53「收」，看见苦力怕 27.38，哈气 27.80，淘 28.23（差不到半帧）；一时一个焦点：调子定了才往框里推照片，挂上了苦力怕才冒头', () => {
    const expected = [
      [mainCutEvents.clearSkySettles, 25.99], [mainCutEvents.hangPhoto, 26.53], [mainCutEvents.liYingSpotsCreeper, 27.38], [mainCutEvents.hiss, 27.8], [mainCutEvents.creeperFlees, 28.23],
    ] as const;
    for (const [e, sec] of expected) expect(Math.abs(e.sec - sec)).toBeLessThan(0.5 / fps + 0.01);
    expect(mainCutEvents.hiss.frame).toBe(1668);
    expect((events.hangPhoto - events.clearSkySettles) / fps).toBeGreaterThanOrEqual(hangReachSec);
    expect(events.hangPhoto).toBeLessThan(events.creeperAppears);
    expect(events.creeperAppears).toBeLessThan(events.liYingSpotsCreeper);
  });

  it('cue：原声铺满整段（哈气那一截让一让）；挂照片声在挂照片那一帧起放；哈气声在哈气前 1/12 秒（24 fps 时 2 帧）起放；没有纸声；都不过段尾', () => {
    const soundCues = toFrameCues(seg);
    const originalTrack = soundCues.find((c) => c.name === '原声')!;
    expect(originalTrack).toMatchObject({ frame: 0, frameCount: 189, 入点秒: 1528 / fps });
    const gain = originalTrack.增益 as number[];
    expect(gain[events.hiss]).toBeCloseTo(originalSoundDuck.增益, 6);
    expect(gain[0]).toBeGreaterThan(originalSoundDuck.增益);
    const hangPhotoCue = soundCues.find((c) => c.name === '挂照片')!;
    expect(hangPhotoCue).toMatchObject({ frame: events.hangPhoto, asset: hangPhotoSound.asset, 增益: hangPhotoSound.增益 });
    expect(hangPhotoCue.frameCount).toBe(Math.ceil(hangPhotoSound.sec * fps));
    expect(soundCues.find((c) => c.name === '哈气')!.frame).toBe(events.hiss - legacyFrameSec(2) * fps);
    expect(soundCues.some((c) => c.asset.startsWith('音效/item.book.page_turn'))).toBe(false);
    for (const c of soundCues) expect(c.frame + c.frameCount).toBeLessThanOrEqual(frameCountOf(seg));
  });

  it('镜头：整句就是 第8句镜头，段首不再从天往下摇（核查 10-24：切过来头几帧是大半屏山墙）；中心落在偶数成片像素上', () => {
    expect(framing).toEqual(line8Shot.framing);
    for (const v of framing.center) expect((v * framing.pxPerCell) % 2).toBe(0);
  });

  it('调子：段首是第 7 句末的雨后暖阳，一路缓到 第8句晴定 起是 第8句调子', () => {
    expect(gradeAt(0)).toEqual(palette.雨后暖阳);
    expect(clearingProgress(events.clearSkySettles)).toBe(1);
    expect(gradeAt(events.clearSkySettles)).toEqual(line8Tone);
    expect(gradeAt(frameCountOf(seg) - 1)).toEqual(line8Tone);
  });

  it('云：段首洞已开到 云洞半径、整段不变，段首前一帧洞里的格一开头就没了；飘进洞的格 散秒 里散完、不回来', () => {
    const anchorFrame = SegmentWindow('2-收集快乐').起帧 - 1;
    expect(line8ShadingScene.cloud?.hole?.[2]).toBe(cloudHoleRadius * endRainCloud.holeRatio);
    const frames = Array.from({ length: frameCountOf(seg) }, (_, f) => SegmentWindow('2-收集快乐').起帧 + f);
    // 铺满的假贴图：每格都有云
    const cells = cloudCells(() => true);
    const firstFrame = frames[0]!, lastFrame = frames.at(-1)!;
    for (const c of cells) {
      const driftAt = (frame: number) => -(frame / fps) * 20 * cabinSkyCloud.driftPerTick;
      const r0 = scatterRadius(c, cabinSkyCloud.holeCenter, driftAt(anchorFrame));
      if (r0 <= cloudHoleRadius) expect(cloudRemain(c, firstFrame)).toBe(0);
      // 整段云飘不到 2 格：段尾离洞心比 云洞半径 远 2 格以上的，一直没被洞够到
      if (scatterRadius(c, cabinSkyCloud.holeCenter, driftAt(lastFrame)) > cloudHoleRadius + 2) expect(cloudRemain(c, lastFrame)).toBe(1);
      for (const [a, b] of frames.slice(1).map((f) => [f - 1, f] as const)) expect(cloudRemain(c, b)).toBeLessThanOrEqual(cloudRemain(c, a));
    }
  });

  it('照片墙：墙上已经挂着前三张、第四只框空着；她举着光柱破云挡在空框前，挂伸秒 里推进框、缩到一格，挂照片那一帧换成墙上那张（不跳）', () => {
    expect(line8Photos.map((p) => p.name)).toEqual(['递蛋糕', '日落划船', '扑龙蛋', '光柱破云']);
    for (let f = 0; f < frameCountOf(seg); f++) {
      expect(wallPhotoCount(f)).toBe(f < events.hangPhoto ? 3 : 4);
      expect(photoState(f) === null).toBe(f >= events.hangPhoto);
    }
    expect(photoState(0)).toEqual({ angle: [...photoHoldAngle], side: photoHoldEdge });
    expect(photoState(events.hangPhoto - hangReachSec * fps)).toEqual(photoState(0));
    // 挂上前一帧已经和框里那张一样（挂上那一帧不跳）
    expect(photoState(events.hangPhoto - 1)).toEqual({ angle: [...photoFrameAngle], side: 1 });
    // 举着的时候在画面上挡住整只空框（框里那一格），不让空框露出来：斜投影里往后一格往上升 正交顶面 ÷ N 格
    const corner = photoCellCorner(...photoWallCellPos.summer[3]!);
    const screenHeight = (p: readonly number[]) => p[2]! + (p[1]! * orthoTop) / line8ShotCount;
    expect(photoHoldAngle[0]).toBeLessThanOrEqual(corner[0]);
    expect(screenHeight(photoHoldAngle)).toBeLessThanOrEqual(screenHeight(corner));
    expect(photoHoldAngle[0] + photoHoldEdge).toBeGreaterThanOrEqual(corner[0] + 1);
    expect(screenHeight(photoHoldAngle) + photoHoldEdge).toBeGreaterThanOrEqual(screenHeight(corner) + 1);
  });

  it('她整句站在门洞里（哈气站位.她）：哈气那一截侧身朝苦力怕哈气，前后都朝镜头', () => {
    for (let f = 0; f < frameCountOf(seg); f++) {
      const liYing = LiYingState(f);
      expect(liYing.loc[0]).toBe(hissStandPos.liYingX);
      const hissing = f >= events.hiss && f < events.creeperFlees;
      expect(liYing.stancePose).toBe(hissing ? '哈气' : '站');
      expect(liYing.yaw).toBe(hissing ? 90 : 180);
    }
    expect(LiYingState(events.liYingSpotsCreeper).expression).toBe('惊讶');
  });

  it('苦力怕：冒头那一帧前脚刚进画框左边，哈气那一拍停在 哈气站位.苦力怕；冒头前不在画里；逃出画框在段尾之前', () => {
    const leftEdge = -halfWidthCells;
    const frontFoot = (f: number) => creeperPose(f).loc[0] + creeperFront;
    expect(frontFoot(events.creeperAppears)).toBeGreaterThanOrEqual(leftEdge);
    expect(frontFoot(events.creeperAppears - 1)).toBeLessThan(leftEdge);
    expect(creeperPose(events.hiss).loc[0]).toBe(hissStandPos.苦力怕);
    // 走速比原版追人（2.70 米/秒）快，但不到一倍半
    const chaseSpeed = (((1 * 0.25) ** 2 * 0.98) / (1 - 0.6 * 0.91)) * 20;
    expect(creeperWalkSpeed / chaseSpeed).toBeGreaterThan(1);
    expect(creeperWalkSpeed / chaseSpeed).toBeLessThan(1.5);
    const fleeSpeed = vanillaFleeSpeed * creeperFleeMult;
    const exitFrame = events.creeperTurnsAway + (creeperTurnSec + (hissStandPos.苦力怕 - (leftEdge - creeperFront)) / fleeSpeed) * fps;
    expect(exitFrame).toBeLessThan(frameCountOf(seg) - 1);
    expect(creeperPose(frameCountOf(seg) - 1).loc[0] + creeperFront).toBeLessThan(leftEdge);
  });

  it('末帧就是 第8句末态（第 9 句同机位匹配剪从这里接）：她朝镜头得意歪头、头顶「(✿◠‿◠)」，四张都在墙上', () => {
    const f = frameCountOf(seg) - 1;
    const liYing = LiYingState(f);
    expect(liYing.yaw).toBe(line8EndState.liYing.yaw);
    expect(liYing.skeleton.Head!.rot).toEqual([-line8EndState.liYing.看[0], -line8EndState.liYing.看[1], line8EndState.liYing.tilt]);
    expect(bubbleState(f)).toEqual({ char: line8EndState.liYing.bubbleText, x: line8EndState.liYing.x });
    expect(wallPhotoCount(f)).toBe(4);
  });
});
