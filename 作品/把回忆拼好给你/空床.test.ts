import { describe, expect, it } from 'vitest';
import type { AssetCue } from '@engine/段/段定义.ts';
import seg from './段/2-空床/段.ts';
import { lightTier, lightState, LiYingState, herTone, frameCount, smoothPose, endVelocity, shotAt, slideProgress, events, turnStart, postGrade, outdoorState, toSongFrame } from './段/2-空床/编排.ts';
import { serverToneAt } from './场/2-门口/分屏参数.ts';
import { fps, legacyFrameSec, mainCutEvents, SegmentWindow, lineAt } from './分镜.ts';
import { sideProjection } from './地点/侧剖面.tsx';
import { bedroom, bedroomWalls } from './地点/小木屋卧室布局.ts';
import * as params from './场/2-卧室/参数.ts';
import { sitBedEdgeSkeleton, smoothHandPose } from './场/2-卧室/姿势.ts';
import { lightSpot, bedroomLitSurfaces, bedroomOpenings } from './场/2-卧室/光斑.ts';
import { mainCutOriginalGain } from './配乐/正片.ts';
import { bedSurfaceHeight } from './物品/床尺寸.ts';
import { lyricLayoutTable, lyricBox } from './界面/歌词排版表.ts';
import { mainCutLyricLine } from './界面/符文歌词数据.ts';
import { charStates, runeLyricDefault } from './界面/符文排版.ts';
import { toFrameCues, frameCountOf, sceneWindowFrames } from './声音/回帧.ts';

/** 24 fps 的一帧（旧帧(1) 秒）是几帧 */
const oldFrameStep = legacyFrameSec(1) * fps;
/** 横移开始动以前的最后一帧（横移起 那一帧已经走了一帧） */
const beforeSlide = Math.floor(events.横移起 - 1);

describe('2-空床：第 12 句卧室整句一个镜头', () => {
  it('窗口从第 12 句首字到第 13 句前导（歌曲帧 2306～2495），段尾就是分屏起', () => {
    const w = SegmentWindow('2-空床');
    expect([w.起帧, w.止帧]).toEqual([2306, 2495]);
    expect(w.起帧 / fps).toBeCloseTo(lineAt(12).起, 1);
    expect(frameCountOf(seg)).toBe(189);
    expect(frameCount).toBe(189);
    expect(sceneWindowFrames(seg)).toEqual({ 起帧: 2306, 止帧: 2495 });
    expect(mainCutEvents.分屏起.帧).toBe(2495);
  });

  it('三稿的时刻：抚平 38.46、坐床沿 39.31（差不到半帧），天亮转头 提前一拍到 40.59（核查 10-24：横移起 前多停一会）；事件按顺序、都在段里', () => {
    for (const [e, sec] of [[mainCutEvents.抚平被子, 38.46], [mainCutEvents.坐床沿, 39.31], [mainCutEvents.天亮转头, 40.59]] as const)
      expect(Math.abs(e.秒 - sec)).toBeLessThan(0.5 / fps + 0.01);
    const order = [events.抚平被子, events.坐床沿, events.窗光二, events.窗光三, events.月落, events.天亮转头, events.横移起];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(order[0]).toBeGreaterThanOrEqual(0);
    expect(order.at(-1)).toBeLessThan(frameCount);
  });

  it('第 12 句「我却已 / 无法自拔」在她左边（歌词排版表）：字露着的每一帧，她（帽檐左沿约 0.45 格：坐着时静帧量的）都在那块字右边 15 像素以外；横移起那一帧字退完，切进来那一帧才进（让开「Steve退出了游戏」）', () => {
    const lyricLines = Array.from({ length: 15 }, (_, i) => mainCutLyricLine(i + 1, toSongFrame(0)));
    const box = lyricBox(lyricLines[11]!.text, lyricLayoutTable[12]!);
    let exposed = 0;
    for (let f = 0; f < frameCount; f++) {
      if (charStates(lyricLines, 11, f, runeLyricDefault).every((z) => z.shown === 0)) continue;
      exposed++;
      const s = LiYingState(f);
      const project = sideProjection(shotAt(f), 1280, 720, params.bedroomTop);
      expect(project(s.loc[0] - 0.45, s.loc[2], s.loc[1]).x - box.right * 1280, `段内第 ${f} 帧`).toBeGreaterThan(15);
    }
    expect(exposed).toBeGreaterThan(fps * 2);
    expect(lyricLines[11]!.入).toBe(0);
    expect(lyricLines[11]!.收! + runeLyricDefault.exitSec * fps).toBeCloseTo(mainCutEvents.横移起.帧 - toSongFrame(0), 6);
  });

  it('cue：只有原声，铺满整段、固定增益、不淡', () => {
    const soundCues = toFrameCues(seg);
    expect(soundCues).toHaveLength(1);
    expect(soundCues[0]).toMatchObject({ 帧: 0, 帧数: 189, 入点秒: 2306 / fps, 增益: mainCutOriginalGain, 资产: '配乐/把回忆拼好给你-无男声DJ' });
  });

  it('抚平：手心落在你床的被面上（反解再正算回去，差不到 0.01 格），手伸出去离脚底 0.3 格以上（手在她身子外面），抹的幅度手机上看得出（0.25 格以上）', () => {
    const angleRad = ((params.smoothYaw + 90) * Math.PI) / 180;
    const xs: number[] = [];
    for (let f = 0; f < turnStart; f++) {
      const [forward, height] = smoothHandPose(smoothPose(f));
      expect(height).toBeCloseTo(bedSurfaceHeight, 2);
      expect(forward).toBeGreaterThan(0.3);
      const x = params.smoothStandPos[0] + forward * Math.cos(angleRad), y = params.smoothStandPos[1] + forward * Math.sin(angleRad);
      expect(x).toBeGreaterThan(bedroom.yourBed.位[0] - 0.5);
      expect(x).toBeLessThan(bedroom.yourBed.位[0] + 0.5);
      expect(y).toBeGreaterThan(1);
      xs.push(x);
    }
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.25);
    // 尾巴压下来（比腰弯多压 抚平尾压 度），不和上身连成横着的一条
    const bones = smoothPose(0);
    expect((bones.Tail!.rot as number[])[0]).toBeCloseTo(-(bones.UpBody!.rot as number[])[0]! - params.smoothTailPress, 6);
  });

  it('转身、坐下：骨骼一点一点插过去，不在一下里弹直（每 旧帧(1) 秒腰、胸变不到 20°，尾巴、胳膊、腿不到 50°，朝向不到 45°）', () => {
    const rx = (f: number, b: string) => ((LiYingState(f).skeleton[b]?.rot as number[] | undefined)?.[0] ?? 0);
    for (let f = Math.floor(turnStart - oldFrameStep); f <= events.坐床沿; f++) {
      const g = f - oldFrameStep;
      for (const b of ['UpBody', 'UpperBody']) expect(Math.abs(rx(f, b) - rx(g, b))).toBeLessThan(20);
      for (const b of ['Tail', 'RightArm', 'RightForeArm', 'RightLeg', 'LeftLeg', 'RightLowerLeg']) expect(Math.abs(rx(f, b) - rx(g, b))).toBeLessThan(50);
      expect(Math.abs(LiYingState(f).yaw - LiYingState(g).yaw)).toBeLessThan(45);
      const [a, b] = [LiYingState(f).loc, LiYingState(g).loc];
      expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(0.2);
    }
  });

  it('坐床沿到天亮转头之前一动不动；天亮那一拍 转头秒 里转去看门口（过头一下再回来），上身一挺，表情惊讶', () => {
    const expectedState = JSON.stringify(LiYingState(events.坐床沿));
    for (let f = events.坐床沿; f < events.天亮转头; f++) expect(JSON.stringify(LiYingState(f))).toBe(expectedState);
    const sitState = LiYingState(events.坐床沿);
    expect(sitState.skeleton).toBe(sitBedEdgeSkeleton);
    expect(((sitState.yaw % 360) + 360) % 360).toBe(params.seatYaw);
    expect(sitState.看).toEqual(params.nightWatchLook);
    expect(sitState.expression).toBe('无');
    const turnDone = events.天亮转头 + params.turnHeadSec * fps;
    expect(LiYingState(turnDone - 1).看).toEqual(params.lookDoorOver);
    expect(LiYingState(turnDone).看).toEqual(params.lookAtDoor);
    expect(LiYingState(frameCount - 1).看).toEqual(params.lookAtDoor);
    for (let f = events.天亮转头; f < frameCount; f++) expect(LiYingState(f).expression).toBe('惊讶');
    const straighten = (f: number) => (LiYingState(f).skeleton.UpperBody!.rot as number[])[0];
    expect(straighten(turnDone - 1)).toBe(params.turnTorsoOver);
    expect(straighten(frameCount - 1)).toBe(params.turnTorsoUpright);
    // 身子朝门：门洞中心 (0, 0.5) 在她的朝向 ±10° 里
    const [x, y] = params.bedEdgeSeat;
    const doorAngle = (Math.atan2(-(0 - x), 0.5 - y) * 180) / Math.PI;
    expect(Math.abs(doorAngle - params.seatYaw)).toBeLessThan(10);
  });

  it('她的色调比屋里亮（往白里提 她提亮），夜里也分得出她和墙', () => {
    const interiorTint = lightState(0).tone.tint;
    const hexBytes = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    const [a, b] = [hexBytes(interiorTint), hexBytes(herTone(interiorTint))];
    for (let i = 0; i < 3; i++) expect(b[i]! - a[i]!).toBeCloseTo((255 - a[i]!) * params.liYingLift, -0.5);
  });

  it('窗光：月光三档、月落一档没有、天亮一档，档在拍上跳；月光一档地板、二档被面、三档后墙，一档比一档往右、往里；天亮门口那束落在她脚前的地板上', () => {
    expect([0, events.窗光二 - 1, events.窗光二, events.窗光三, events.月落, events.天亮转头 - 1, events.天亮转头, frameCount - 1].map(lightTier)).toEqual([0, 0, 1, 2, 3, 3, 4, 4]);
    expect(lightState(events.月落).光).toEqual([]);
    expect([0, 1, 2, 3, 4].map((i) => params.windowLightLevels[i]!.length)).toEqual([1, 1, 1, 0, 2]);
    expect([0, events.月落, events.天亮转头 - 1, events.天亮转头, frameCount - 1].map((f) => lightState(f).outsideLit)).toEqual([false, false, false, true, true]);
    // 天亮不一帧跳（核查 10-24）：月落那一档里屋里的调子、后窗的天一帧一帧往天亮走，每 旧帧(1) 秒走的不到总差的三成
    const brightnessAt = (f: number) => lightState(f).tone.grade.multiply;
    const hexBrightness = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)).reduce((a, b) => a + b, 0);
    const totalDiff = hexBrightness(brightnessAt(events.天亮转头)) - hexBrightness(brightnessAt(events.月落 - 1));
    expect(totalDiff).toBeGreaterThan(0);
    for (let f = events.月落; f <= events.天亮转头; f++) {
      expect(hexBrightness(brightnessAt(f)) - hexBrightness(brightnessAt(f - 1)), `段内第 ${f} 帧`).toBeGreaterThanOrEqual(0);
      expect(hexBrightness(brightnessAt(f)) - hexBrightness(brightnessAt(f - oldFrameStep)), `段内第 ${f} 帧`).toBeLessThan(0.3 * totalDiff);
    }
    expect(lightState(events.天亮转头).天).toBe(params.skyColors[4]);
    expect(lightState(events.月落).天).toBe(params.skyColors[3]);
    /** 一束光在各受光面上的面积（格²）和场景里的重心 [x, y] */
    const measure = (b: params.LightBeam) => {
      const areaByFace: Record<string, number> = {};
      let s = 0, sx = 0, sy = 0;
      for (const face of bedroomLitSurfaces)
        for (const c of lightSpot(face, b.lightDir, bedroomOpenings[b.从])) {
          const A = (c.a1 - c.a0) * (c.b1 - c.b0);
          areaByFace[face.名] = (areaByFace[face.名] ?? 0) + A;
          s += A;
          sx += ((c.a0 + c.a1) / 2) * A;
          sy += (face.种 === '平' ? (c.b0 + c.b1) / 2 : face.y) * A;
        }
      return { area: areaByFace, s, x: sx / s, y: sy / s };
    };
    const dominantKey = (m: Record<string, number>) => Object.entries(m).sort((p, q) => q[1] - p[1])[0]![0];
    const [firstStage, second, thirdStage] = [0, 1, 2].map((i) => measure(params.windowLightLevels[i]![0]!));
    expect(dominantKey(firstStage!.area)).toBe('地板');
    expect(['你床面', '女仆床面']).toContain(dominantKey(second!.area));
    expect(dominantKey(thirdStage!.area)).toBe('后墙');
    for (const m of [firstStage!, second!, thirdStage!]) expect(m.s).toBeGreaterThan(0.7);
    expect(firstStage!.x).toBeLessThan(second!.x);
    expect(second!.x).toBeLessThan(thirdStage!.x);
    expect(firstStage!.y).toBeLessThan(thirdStage!.y);
    const doorBeam = params.windowLightLevels[4]!.find((b) => b.从 === '门')!;
    const doorMeasure = measure(doorBeam);
    expect(doorMeasure.area.地板 ?? 0).toBeGreaterThan(0.3);
    expect(doorMeasure.x).toBeLessThan(params.bedEdgeSeat[0]);
    // 光斑都在受光面里，不落进后墙的窗洞
    for (const tier of params.windowLightLevels)
      for (const b of tier)
        for (const face of bedroomLitSurfaces)
          for (const strip of lightSpot(face, b.lightDir, bedroomOpenings[b.从])) {
            expect(strip.a0).toBeGreaterThanOrEqual(face.x[0] - 1e-9);
            expect(strip.a1).toBeLessThanOrEqual(face.x[1] + 1e-9);
            if (face.名 === '后墙') {
              const [i, k] = bedroom.backWindow;
              const inWindow = strip.a1 > i - 0.5 && strip.a0 < i + 0.5 && strip.b1 > k && strip.b0 < k + 1;
              expect(inWindow).toBe(false);
            }
          }
  });

  it('镜头：横移起 前一帧以前不动（横移起 那一帧已经走了一帧），之后只往右（东）挪、越挪越快，段的最后一帧走完、还在最快；停着的时候取景中心落在成片偶数像素上；走完那一刻屋里全出画，只剩东墙一格', () => {
    for (let f = 0; f <= beforeSlide; f++) expect(shotAt(f)).toEqual(shotAt(0));
    expect(slideProgress(beforeSlide)).toBe(0);
    expect(slideProgress(events.横移起)).toBeGreaterThan(0);
    expect(slideProgress(frameCount - 1)).toBeCloseTo(1, 9);
    const delta = (f: number) => slideProgress(f) - slideProgress(f - 1);
    for (let f = beforeSlide + 1; f < frameCount; f++) expect(delta(f)).toBeGreaterThan(delta(f - 1));
    for (let f = 0; f < frameCount; f++) expect(shotAt(f).中心[1]).toBe(shotAt(0).中心[1]);
    const distToInt = (x: number) => Math.abs(x - Math.round(x));
    for (let f = 0; f <= beforeSlide; f++) for (const v of shotAt(f).中心) expect(distToInt((v * shotAt(f).pxPerCell) / 2)).toBeLessThan(1e-6);
    const lastShot = shotAt(frameCount - 1), prev = shotAt(frameCount - 2);
    // 最后两帧之间实际挪的，和走完那一刻的瞬时速度（t^幂 的导数）差不到一成
    expect((lastShot.中心[0] - prev.中心[0]) / (endVelocity().rightSpeed / fps)).toBeGreaterThan(0.9);
    // 走完那一刻：东墙内面（x 4.5）在画面左沿外，外面（x 5.5）在画里、离左沿不到一格半
    const lastCam = shotAt(frameCount - 1);
    const project = (camera: typeof lastShot) => sideProjection(camera, 1280, 720, params.bedroomTop);
    expect(project(lastCam)(bedroomWalls.eastWall - 0.5, 0, 0).x).toBeLessThanOrEqual(0);
    expect(project(lastCam)(bedroomWalls.eastWall + 0.5, 0, 0).x).toBeGreaterThan(0);
    expect(project(lastCam)(bedroomWalls.eastWall + 0.5, 0, 0).x).toBeLessThan((1.5 * lastCam.pxPerCell) / 2);
    expect(project(shotAt(0))(bedroomWalls.westWall, 0, 0).y).toBeGreaterThan(600);
    expect(project(shotAt(0))(bedroomWalls.westWall, 0, 0).y).toBeLessThan(720);
    // 开头那帧：门板（x −1.5）的右沿、后窗都在画面里
    expect(project(shotAt(0))(bedroom.门.openDoorPanel.x1, 1).x).toBeGreaterThan(0);
    expect(project(shotAt(0))(bedroom.backWindow[0] + 0.5, bedroom.backWindow[1] + 1, bedroomWalls.backWall).x).toBeLessThan(1280);
    expect(project(shotAt(0))(bedroom.backWindow[0], bedroom.backWindow[1] + 1, bedroomWalls.backWall).y).toBeGreaterThan(0);
  });

  it('屋外（用户 10-24「怎么超平坦背景 合理吗？」）：横移开始动以前不画；横移时后窗那块天色跟着淡掉，末帧淡完；整片后期末帧到 2-时差 第一帧服务器那半的调子（接缝不跳亮度）', () => {
    expect(outdoorState(beforeSlide)).toBeUndefined();
    expect(outdoorState(events.横移起)!.bright).toBeGreaterThan(0);
    expect(outdoorState(frameCount - 1)!.bright).toBe(1);
    expect(postGrade(beforeSlide)).toEqual(lightState(beforeSlide).tone.grade);
    const grade = serverToneAt(mainCutEvents.分屏起.帧).grade;
    const lastGrade = postGrade(frameCount - 1);
    for (const k of ['饱和', '对比', '暗角', '颗粒'] as const) expect(lastGrade[k], k).toBeCloseTo(grade[k], 6);
    expect([lastGrade.multiply, lastGrade.lift]).toEqual([grade.multiply, grade.lift]);
  });
});
