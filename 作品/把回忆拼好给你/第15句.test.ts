import { describe, expect, it } from 'vitest';
import type { AssetCue } from '@engine/段/段定义.ts';
import shakeBellSegment from './段/2-摇铃/段.ts';
import reunionSegment from './段/2-重逢/段.ts';
import { fps, beatAt, legacyFrameSec, segMainCutEventFrames, SegmentWindow, mainCutEvents } from './分镜.ts';
import { mainCutOriginalGain } from './配乐/正片.ts';
import { sakuraWindDefaults, makeWindWall, wallPetalAt, windWallEdge, windWallBottom, windWallCovered } from './特效/樱花风参数.ts';
import { filmScale } from '@engine/三渲二/像素.ts';
import { bellSound, bellFile, windSound } from './场/2-门口/第15句声音.ts';
import { doorOpenSound } from './场/2-隐世之境/重逢声音.ts';
import { eyeContactFraming, eyeContactBubble, eyeContactFoot, eyeContactFov } from './场/2-隐世之境/对视参数.ts';
import { linePop, turnBackProgress, eyeContactFrameSec, hasLaughed, chatLineOpacity, reunionRig } from './场/2-隐世之境/重逢动作.ts';
import { liYing } from './场/2-隐世之境/参数.ts';
import { lineBubble, pushShot, windScatterHeight } from './场/2-隐世之境/重逢参数.ts';
import { makePerspectiveCamera, projectToPage, zUpToThree } from '@库/界面/投影.ts';
import { pixelFont } from './界面/像素字.ts';
import { toFrameCues, frameCountOf, sceneWindowFrames } from './声音/回帧.ts';

const events = mainCutEvents;
const windMoments = { start: events.ringBell.sec, full: events.windClears.sec };
const toSec = (songFrame: number) => songFrame / fps;
const findCue = (seg: typeof shakeBellSegment, name: string) => toFrameCues(seg).find((c) => c.name === name);

describe('正片第 15 句：两段的窗口和事件', () => {
  it('2-摇铃 [2895, 2985)（48.25–49.75 秒）、2-重逢 [2985, 3177)，首尾相接', () => {
    expect(SegmentWindow('2-摇铃')).toMatchObject({ 起帧: 2895, 止帧: 2985, frameCount: 90 });
    expect(SegmentWindow('2-重逢')).toMatchObject({ 起帧: 2985, 止帧: 3177, frameCount: 192 });
    expect(frameCountOf(shakeBellSegment)).toBe(90);
    expect(frameCountOf(reunionSegment)).toBe(192);
  });

  it('段内帧：上线 13、摇铃 64；风散开 0、回头 0（风散开时已经在转）、对视 25（封面帧）、换上蛋糕 40、驯服 89（她同一帧笑、冒台词气泡）、段尾 192', () => {
    expect([segMainCutEventFrames('2-摇铃').rejoinGame, segMainCutEventFrames('2-摇铃').ringBell]).toEqual([13, 64]);
    const mainEvents = segMainCutEventFrames('2-重逢');
    expect([mainEvents.windClears, mainEvents.turnBack, mainEvents.reunionGaze, mainEvents.switchToCake, mainEvents.tameAgain, mainEvents.reunionSmile, mainEvents.speechBubbleIn, mainEvents.cutToTail]).toEqual([0, 0, 25, 40, 89, 89, 89, 192]);
  });

  it('门在风里推开，开门声落在风散开那一拍', () => {
    expect(events.doorPush.frame).toBe(events.windClears.frame);
  });

  it('对视（封面帧）干净地停 0.25 秒再换上蛋糕，蛋糕升上来（0.4 秒）再举着停 0.35 秒以上才右键；右键在驯服前一刻；驯服落在第 120 拍，她笑、冒台词气泡同一帧', () => {
    expect(events.switchToCake.sec - events.reunionGaze.sec).toBeGreaterThanOrEqual(0.25);
    expect(events.cakeRightClick.sec - events.switchToCake.sec).toBeGreaterThanOrEqual(0.75);
    expect((events.tameAgain.sec - events.cakeRightClick.sec) * 20).toBeCloseTo(1, 9);
    expect(events.tameAgain.sec).toBeCloseTo(beatAt(120), 9);
    expect([events.reunionSmile.frame, events.speechBubbleIn.frame]).toEqual([events.tameAgain.frame, events.tameAgain.frame]);
    expect(hasLaughed(toSec(events.speechBubbleIn.frame))).toBe(true);
    expect(hasLaughed(toSec(events.speechBubbleIn.frame - 1))).toBe(false);
  });

  it('台词气泡（用户 10-25「唱到段尾插不进气泡 不能提前一点放吗？」）：在画面上 2.5 秒以上、2-重逢 里 1.7 秒以上；接进 2-合照、她靠好那一帧收，咔哒那张新合照里没有', () => {
    expect((events.speechBubbleOut.frame - events.speechBubbleIn.frame) / fps).toBeGreaterThanOrEqual(2.5);
    expect((events.cutToTail.frame - events.speechBubbleIn.frame) / fps).toBeGreaterThanOrEqual(1.7);
    expect(events.speechBubbleOut.frame).toBe(events.leanOnShoulder.frame);
    expect(events.speechBubbleOut.frame).toBeLessThan(events.photoGroupShot.frame);
  });
});

describe('樱花风转场', () => {
  it('转场前 1/24 秒到转场那一帧（2-摇铃 末尾、2-重逢 段头）风墙整屏盖住', () => {
    const sceneTransitionFrame = SegmentWindow('2-重逢').起帧;
    expect(SegmentWindow('2-摇铃').止帧).toBe(sceneTransitionFrame);
    for (let frame = sceneTransitionFrame - Math.floor(legacyFrameSec(1) * fps); frame <= sceneTransitionFrame; frame++) expect(windWallCovered(toSec(frame), windMoments), `帧 ${frame}`).toBe(true);
    expect(windWallCovered(toSec(sceneTransitionFrame) - legacyFrameSec(1), windMoments)).toBe(true);
  });

  it('摇铃那一帧风墙还没进画；对视（封面帧）之前风墙的每一片花瓣、风流都吹出画', () => {
    const [W, H] = [1280 * filmScale, 720 * filmScale];
    expect(windWallEdge(events.ringBell.sec, windMoments, sakuraWindDefaults, W).rightEdge).toBeLessThanOrEqual(0);
    const t = toSec(events.reunionGaze.frame - 1);
    expect(windWallBottom(t, windMoments, sakuraWindDefaults, W)).toBeNull();
    for (const q of makeWindWall(sakuraWindDefaults, W, H)) {
      const { x, y } = wallPetalAt(q, t, windMoments, sakuraWindDefaults, W, H);
      const side = q.档 * 3;
      expect(x + side <= 0 || x >= W || y + side <= 0 || y >= H).toBe(true);
    }
    expect(events.windClears.sec + sakuraWindDefaults.windFlow.scatterDoneSec).toBeLessThan(t);
  });

  it('她的背影那块先散开：散心方圆 200 页面像素，转场后 0.125 秒（24 fps 时第 3 帧）起一片花瓣都没有', () => {
    const [W, H] = [1280 * filmScale, 720 * filmScale];
    const rig = reunionRig(events.windClears.frame / fps);
    const cam = makePerspectiveCamera({ 眼: zUpToThree(rig.眼), 看: zUpToThree(rig.看), fov: rig.fov, width: 1280, height: 720 });
    const c = projectToPage(cam, zUpToThree([liYing.feet[0], liYing.feet[1], liYing.feet[2] + windScatterHeight]), 1280, 720);
    const center: [number, number] = [c.x * filmScale, c.y * filmScale];
    const wallPetals = makeWindWall(sakuraWindDefaults, W, H);
    const nearby = (t: number) =>
      wallPetals.filter((q) => {
        const { x, y } = wallPetalAt(q, t, windMoments, sakuraWindDefaults, W, H, center);
        const side = q.档 * 3;
        const [nx, ny] = [Math.max(x, Math.min(center[0], x + side)), Math.max(y, Math.min(center[1], y + side))];
        return Math.hypot(nx - center[0], ny - center[1]) < 200 * filmScale;
      }).length;
    expect(nearby(toSec(events.windClears.frame))).toBeGreaterThan(0);
    const clearedAt = toSec(events.windClears.frame) + legacyFrameSec(3);
    expect(nearby(clearedAt)).toBe(0);
    for (let frame = events.windClears.frame; frame <= events.reunionGaze.frame; frame++) if (toSec(frame) >= clearedAt) expect(nearby(toSec(frame)), `帧 ${frame}`).toBe(0);
  });

  it('风散开时她已经在转：散心那块散完（转场后 0.125 秒）时头转了不到一半、身子不到三成，之后每一帧都在转，到对视那一帧才转完', () => {
    const clearedAt = toSec(events.windClears.frame) + legacyFrameSec(3);
    const k = turnBackProgress(clearedAt);
    expect(k.头).toBeGreaterThan(0);
    expect(k.头).toBeLessThan(0.5);
    expect(k.bodyTurn).toBeLessThan(0.3);
    for (let frame = events.windClears.frame + 1; frame <= events.reunionGaze.frame; frame++) expect(turnBackProgress(toSec(frame)).bodyTurn, `帧 ${frame}`).toBeGreaterThan(turnBackProgress(toSec(frame - 1)).bodyTurn);
    expect(turnBackProgress(toSec(events.reunionGaze.frame - 1)).bodyTurn).toBeLessThan(1);
  });

  it('风散开那一下不是一下散光：转场后 0.125 秒（24 fps 时第 3 帧）还有一半以上的花瓣在画里', () => {
    const [W, H] = [1280 * filmScale, 720 * filmScale];
    const wallPetals = makeWindWall(sakuraWindDefaults, W, H);
    const inPicture = (t: number) =>
      wallPetals.filter((q) => {
        const { x, y } = wallPetalAt(q, t, windMoments, sakuraWindDefaults, W, H);
        const side = q.档 * 3;
        return x + side > 0 && x < W && y + side > 0 && y < H;
      }).length;
    expect(inPicture(toSec(events.windClears.frame) + legacyFrameSec(3))).toBeGreaterThan(inPicture(toSec(events.windClears.frame)) / 2);
  });
});

describe('隐世之境一镜到底：回头', () => {
  it('对视那一帧她回头转完，风散开那一帧还背对着门', () => {
    expect(eyeContactFrameSec).toBeCloseTo(events.reunionGaze.frame / fps, 12);
    expect(turnBackProgress(toSec(events.reunionGaze.frame))).toEqual({ bodyTurn: 1, 头: 1 });
    expect(turnBackProgress(toSec(events.windClears.frame))).toEqual({ bodyTurn: 0, 头: 0 });
  });
});

describe('隐世之境一镜到底：接过来的聊天行', () => {
  it('接缝那一帧（风散开）同 2-摇铃 末帧满亮，跟着风散开一路淡，对视那一帧以前淡完', () => {
    expect(chatLineOpacity(toSec(events.windClears.frame))).toBe(1);
    for (let frame = events.windClears.frame + 1; frame < events.reunionGaze.frame; frame++) {
      const [prev, curAlpha] = [chatLineOpacity(toSec(frame - 1)), chatLineOpacity(toSec(frame))];
      expect(curAlpha < prev || curAlpha === 0, `帧 ${frame}`).toBe(true);
    }
    expect(chatLineOpacity(toSec(events.reunionGaze.frame - 1))).toBe(0);
  });
});

describe('声音：跨段的那几截首尾相接', () => {
  it('原声：两段各放满自己的窗口，入点接上，增益固定（不淡）', () => {
    const a = findCue(shakeBellSegment, '原声')!;
    const b = findCue(reunionSegment, '原声')!;
    expect(a).toMatchObject({ frame: 0, frameCount: 90, 入点秒: 2895 / fps, 增益: mainCutOriginalGain });
    expect(b).toMatchObject({ frame: 0, frameCount: 192, 入点秒: 2985 / fps, 增益: mainCutOriginalGain });
  });

  it('铃声、风声：摇铃段放前一截，重逢段从段头接着放，入点 = 已放的帧数 ÷ fps，增益逐帧连得上', () => {
    for (const cue of [bellSound, windSound]) {
      const a = findCue(shakeBellSegment, cue.name)!;
      const b = findCue(reunionSegment, cue.name)!;
      expect(a.frame).toBe(cue.起帧 - 2895);
      expect(a.frame + a.frameCount).toBe(90);
      expect(a.入点秒).toBeUndefined();
      expect(b.frame).toBe(0);
      expect(b.入点秒).toBeCloseTo(a.frameCount / fps, 12);
      const totalFrames = cue.frameCount ?? Math.ceil(cue.durationSec * fps);
      expect(a.frameCount + b.frameCount).toBe(totalFrames);
      const gain = [...(a.增益 as readonly number[]), ...(b.增益 as readonly number[])];
      expect(gain).toEqual(Array.from({ length: totalFrames }, (_, i) => Math.round(cue.增益(cue.起帧 + i) * 1e6) / 1e6));
    }
  });

  it('铃声起音离摇铃那一拍不到半帧；风声淡进淡出，两头是 0 附近、转场前最后一帧最响、转场起淡、0.35 秒淡完', () => {
    expect(Math.abs(bellSound.起帧 / fps + bellFile.onsetSec - events.ringBell.sec)).toBeLessThan(0.5 / fps);
    const g = windSound.增益;
    expect(g(windSound.起帧)).toBeLessThan(0.2);
    expect(g(windSound.起帧 + windSound.frameCount! - 1)).toBeLessThan(0.1);
    expect(g(events.windClears.frame - 1)).toBeCloseTo(0.6, 6);
    // 60 fps 时 风止 取整后淡出正好从转场那一帧起（24 fps 时早 0.4 帧，转场那一帧已经在淡）
    expect(g(events.windClears.frame)).toBeLessThanOrEqual(0.6);
    expect(g(events.windClears.frame + 1)).toBeLessThan(g(events.windClears.frame));
  });

  it('推门声在重逢段里从推门那一帧（段头）起、放满文件', () => {
    const c = findCue(reunionSegment, '推门')!;
    expect(c.frame).toBe(segMainCutEventFrames('2-重逢').doorPush);
    expect(c.frame).toBe(0);
    expect(c.frameCount / fps).toBeGreaterThanOrEqual(doorOpenSound.durationSec);
    expect(findCue(shakeBellSegment, '推门')).toBeUndefined();
  });
});

describe('隐世之境一镜到底：机位', () => {
  const rigAt = (frame: number) => reunionRig(toSec(frame));
  it('对视那一帧的机位就是封面帧（片）的：眼、看点、视角', () => {
    const c = rigAt(events.reunionGaze.frame);
    expect(c.眼).toEqual([eyeContactFoot[0], eyeContactFoot[1], eyeContactFoot[2] + 1.62]);
    expect(c.看).toEqual(eyeContactFraming.片.看);
    expect(c.fov).toBe(eyeContactFov);
  });

  it('整镜眼睛不动；对视以前看点就是封面帧的，以后才挪', () => {
    for (let frame = events.windClears.frame; frame < events.cutToTail.frame; frame++) expect(rigAt(frame).眼, `帧 ${frame}`).toEqual(rigAt(events.reunionGaze.frame).眼);
    for (let frame = events.windClears.frame; frame <= events.reunionGaze.frame; frame++) expect(rigAt(frame).看, `帧 ${frame}`).toEqual(eyeContactFraming.片.看);
  });

  it('对视以前（封面帧以前的画面）的机位同 10-24：风散开那一帧视角 41.718°，按 原速末视角 的速度收', () => {
    // 24 fps 时 41.713°：推速按 对视到段尾 的长度算，段尾帧取整到 60 fps 早了 1/120 秒，视角差 0.005°（页面上不到 0.1 像素）
    expect(rigAt(events.windClears.frame).fov).toBeCloseTo(41.7183411514613, 12);
    expect(pushShot.origSpeedEndFov).toBe(30);
  });

  it('推速在对视那一帧前后接得上（对数半正切每帧的步长差不到 5%）', () => {
    const zoomStep = (frame: number) => Math.log(Math.tan((rigAt(frame).fov * Math.PI) / 360) / Math.tan((rigAt(frame - 1).fov * Math.PI) / 360));
    const [before, after] = [zoomStep(events.reunionGaze.frame), zoomStep(events.reunionGaze.frame + 1)];
    expect(Math.abs(after - before) / Math.abs(before)).toBeLessThan(0.05);
  });

  it('视角整镜一直收（一刻不停、不回头），段尾那一刻收到 末视角', () => {
    for (let frame = events.windClears.frame + 1; frame < events.cutToTail.frame; frame++) expect(rigAt(frame).fov, `帧 ${frame}`).toBeLessThan(rigAt(frame - 1).fov);
    expect(rigAt(events.cutToTail.frame - 1).fov).toBeGreaterThan(pushShot.finalFov);
    expect(rigAt(events.cutToTail.frame).fov).toBeCloseTo(pushShot.finalFov, 9);
  });

  it('推完最后 1 秒：她的脸在画面中间三分之一，下巴在底部歌词（页面 y 623 起）上面', () => {
    for (let frame = events.cutToTail.frame - fps; frame < events.cutToTail.frame; frame++) {
      const c = rigAt(frame);
      const cam = makePerspectiveCamera({ 眼: zUpToThree(c.眼), 看: zUpToThree(c.看), fov: c.fov, width: 1280, height: 720 });
      const projectAt = (z: number) => projectToPage(cam, zUpToThree([liYing.feet[0], liYing.feet[1], liYing.feet[2] + z]), 1280, 720);
      expect(projectAt(1.1).y, `帧 ${frame}`).toBeLessThan(600);
      expect(projectAt(1.25).x, `帧 ${frame}`).toBeGreaterThan(1280 / 3);
      expect(projectAt(1.25).x, `帧 ${frame}`).toBeLessThan((1280 * 2) / 3);
    }
  });
});

// 台词气泡的构图（像素字表由 vitest 按资产锁读）
describe('隐世之境一镜到底：台词气泡', () => {
  // 气泡（库/界面/女仆气泡.tsx）：底边在锚点上，宽 = 字宽 + 10、高 19、尾巴往下 8；页面上一个气泡像素 = 缩放 / 2
  const boxAt = (frame: number) => {
    const c = reunionRig(toSec(frame));
    const cam = makePerspectiveCamera({ 眼: zUpToThree(c.眼), 看: zUpToThree(c.看), fov: c.fov, width: 1280, height: 720 });
    const anchor = projectToPage(cam, zUpToThree([liYing.feet[0], liYing.feet[1], liYing.feet[2] + eyeContactBubble.anchorHeight]), 1280, 720);
    const [halfScale, width] = [lineBubble.scale / 2, pixelFont.textWidth(lineBubble.char) + 10];
    return { x0: anchor.x - (width / 2) * halfScale, x1: anchor.x + (width / 2) * halfScale, y0: anchor.y - 19 * halfScale, y1: anchor.y + 8 * halfScale, chin: projectToPage(cam, zUpToThree([liYing.feet[0], liYing.feet[1], liYing.feet[2] + 1.1]), 1280, 720).y };
  };

  it('一行放得下（不折行），缩放是偶数', () => {
    expect(pixelFont.wrapText(lineBubble.char, 200)).toHaveLength(1);
    expect(lineBubble.scale % 2).toBe(0);
  });

  it('对视（封面帧）那一帧不挂；驯服那一帧起 啵秒 弹到原大（驯服那一帧算已经走了一帧），之后一直在', () => {
    expect(linePop(events.reunionGaze.frame)).toBe(0);
    expect(linePop(events.speechBubbleIn.frame - 1)).toBe(0);
    expect(linePop(events.speechBubbleIn.frame)).toBeGreaterThan(0);
    const bubbleEndFrame = events.speechBubbleIn.frame + Math.round(lineBubble.popSec * fps) - 1;
    expect(linePop(bubbleEndFrame - 1)).toBeLessThan(1);
    expect(linePop(bubbleEndFrame)).toBe(1);
    for (let frame = bubbleEndFrame; frame < events.cutToTail.frame; frame++) expect(linePop(frame)).toBe(1);
  });

  it('驯服到段尾每一帧：气泡整个在画里（离上沿至少 14、左右至少 16），尾巴尖在底部歌词（页面 y 623 起）上面，下巴也在 600 上面', () => {
    for (let frame = events.speechBubbleIn.frame; frame < events.cutToTail.frame; frame++) {
      const b = boxAt(frame);
      expect(b.y0, `帧 ${frame}`).toBeGreaterThanOrEqual(14);
      expect(b.x0, `帧 ${frame}`).toBeGreaterThanOrEqual(16);
      expect(b.x1, `帧 ${frame}`).toBeLessThanOrEqual(1280 - 16);
      expect(b.y1, `帧 ${frame}`).toBeLessThan(623);
      expect(b.chin, `帧 ${frame}`).toBeLessThan(600);
    }
  });
});
