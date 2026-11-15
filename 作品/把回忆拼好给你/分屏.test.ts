import { describe, expect, it } from 'vitest';
import { fps, legacyFrameSec, mainCutEvents } from './分镜.ts';
import {
  splitScreenCount,
  SplitState,
  splitLayout,
  formShift,
  shapeOffsetAt,
  poseSwapFrames,
  calendarWindow,
  serverFraming,
  realFraming,
  doorGrowFrame,
  forestGrowth,
} from './场/2-门口/分屏参数.ts';
import { endVelocity } from './段/2-空床/编排.ts';
import { midBlocks, midTrees, popOut, farBlocks, farTrees } from './地点/樱花林.ts';
import { cherryTreeBlocks } from './地点/樱花树.ts';
import { orthoTop } from './画风.ts';
import { calendarSize, fullPages } from './现实/日历.ts';
import { placement, timetableFrame } from './现实/课桌布局.ts';

const events = mainCutEvents;
const startFrame = events.splitScreenStart.帧;
const splitFrame = events.splitSceneChange.帧;
const treeRoot = [-5, 1, 0] as const; // 地点/门口小木屋.tsx 门口.树苗 那一格（那边是 tsx，测试不引）
/** 24 fps 的一帧（旧帧(1) 秒）是几帧 */
const oldFrameStep = legacyFrameSec(1) * fps;

// 成片像素：服务器画布 0～1280、现实画布 1280～2560；一格 16N 个像素，往里一格画面上升 斜 格
const pxPerCell = 16 * splitScreenCount;
const oblique = orthoTop / splitScreenCount;
const serverX = (x: number) => splitLayout.serverWidth + (x - serverFraming.中心[0]) * pxPerCell;
const realX = (x: number) => splitLayout.serverWidth * 2 + splitLayout.realWidth + (x - realFraming.中心[0]) * pxPerCell;
/** 剖面上 (z, 深 y) 那一点在画面上离顶边几像素 */
const toScreenY = (z: number, y: number) => 720 - (z + oblique * y - realFraming.中心[1]) * pxPerCell;

describe('第 13 句分屏', () => {
  it('分屏起：坡上没有樱花树、门口是树苗、日历 100、坐着、不褪色；日历到一：林子长满、树苗长成、停在 1、褪到 0.2', () => {
    const a = SplitState(startFrame);
    expect([a.growth, a.doorGrown, a.calendar, a.poseChangeCount, a.fade]).toEqual([0, false, 100, 0, 0]);
    const b = SplitState(events.calendarAtOne.帧);
    expect([b.growth, b.doorGrown, b.calendar, b.poseChangeCount]).toEqual([1, true, 1, 1]);
    expect(b.fade).toBeCloseTo(0.2, 9);
    expect(SplitState(splitFrame - 1).calendar).toBe(1);
  });

  it('林子跟着日历冒：生长 = 吹走的页数 ÷ 99；日历窗就是 风吹日历 到 日历到一 两拍；门口树苗在 日历到一 那一拍长成', () => {
    expect([forestGrowth(fullPages), forestGrowth(1)]).toEqual([0, 1]);
    expect(popOut.pageCount).toBe(fullPages - 1);
    expect(calendarWindow).toEqual({ 起: events.windBlowsCalendar.帧 / fps, 止: events.calendarAtOne.帧 / fps });
    expect(SplitState(events.windBlowsCalendar.帧 - 1).calendar).toBe(100);
    expect(SplitState(events.windBlowsCalendar.帧).calendar).toBe(99);
    expect(doorGrowFrame).toBe(events.calendarAtOne.帧);
    expect(SplitState(doorGrowFrame - 1).doorGrown).toBe(false);
  });

  it('樱花树一棵棵冒出来、越冒越快（用户 10-25「应该是樱花树越来越多才对」）：起风前一棵没有，起风那一帧头一棵，停在 1 时都在', () => {
    const cherryTrees = [...midTrees, ...farTrees].filter((t) => t.种 === '樱');
    const treeCount = (frame: number, ts = cherryTrees) => ts.filter((t) => SplitState(frame).growth >= t.出).length;
    expect(treeCount(events.windBlowsCalendar.帧 - 1)).toBe(0);
    expect(treeCount(events.windBlowsCalendar.帧)).toBe(1);
    expect(treeCount(events.calendarAtOne.帧)).toBe(cherryTrees.length);
    // 左屏看得见的（出 不到 1；树干在左屏外的都等到 日历到一）一棵棵错开：每 旧帧(1) 秒顶多冒两棵，前半个日历窗冒的比后半个少
    const visible = cherryTrees.filter((t) => t.出 < 1);
    expect(visible.length).toBeGreaterThanOrEqual(20);
    for (let f = events.windBlowsCalendar.帧 - oldFrameStep; f < events.calendarAtOne.帧; f++) expect(treeCount(f + oldFrameStep, visible) - treeCount(f, visible)).toBeLessThanOrEqual(2);
    const midFrame = Math.round((events.windBlowsCalendar.帧 + events.calendarAtOne.帧) / 2);
    expect(treeCount(midFrame, visible) - treeCount(events.windBlowsCalendar.帧, visible)).toBeLessThan(treeCount(events.calendarAtOne.帧 - 1, visible) - treeCount(midFrame, visible));
    expect(treeCount(events.calendarAtOne.帧 - 1, visible)).toBe(visible.length);
    // 起风前、停在 1 后方块不跟着变：0 没有樱花原木和樱花叶，1 和长满（第 14、15 句）是同一份
    const hasCherry = (bs: { 状态: string }[]) => bs.some((b) => /cherry_(log|leaves)/.test(b.状态));
    expect(hasCherry(midBlocks(0)) || hasCherry(farBlocks(0))).toBe(false);
    expect(hasCherry(midBlocks(1)) && hasCherry(farBlocks(1))).toBe(true);
  });

  it('冒出 的近景和 分屏N、树苗 一致；看得见 正是左屏（门贴着分屏线、往左 10 格）', () => {
    expect(popOut.nearCount).toBe(splitScreenCount);
    expect(popOut.saplingX).toBe(treeRoot[0]);
    expect(serverX(popOut.visibleRange[0])).toBe(0);
    expect(serverX(popOut.visibleRange[1])).toBe(splitLayout.serverWidth * 2);
  });

  it('她只换一次姿势，每个姿势至少 1 秒（用户 10-24「画面转太快就删」）', () => {
    const boundaries = [startFrame, ...poseSwapFrames, splitFrame];
    for (let i = 1; i < boundaries.length; i++) expect((boundaries[i]! - boundaries[i - 1]!) / fps).toBeGreaterThanOrEqual(1);
    expect(poseSwapFrames).toHaveLength(1);
  });

  it('服务器那半：门贴着分屏线，长成的樱花树冠整个在画里', () => {
    expect(serverX(0.5)).toBe(splitLayout.serverWidth * 2);
    const treeBlocks = cherryTreeBlocks(true, treeRoot);
    expect(serverX(Math.min(...treeBlocks.map((b) => b.位[0]!)) - 0.5)).toBeGreaterThanOrEqual(0);
  });

  it('两半像素一样大、网格连成一张：现实那半左沿是贴图像素的边', () => {
    expect(serverFraming.pxPerCell).toBe(pxPerCell);
    expect(realFraming.pxPerCell).toBe(pxPerCell);
    const wrapPhase = (v: number) => ((Math.round(v * 1e6) / 1e6) % splitScreenCount + splitScreenCount) % splitScreenCount;
    for (const m of [-200, -77, -1, 0, 5]) expect(wrapPhase(realX(m / 16))).toBe(wrapPhase(serverX(0.5)));
  });

  it('右屏一个镜头：整张课表、日历都在右半屏里，课表顶边在歌词那一行（离顶 1.5 格）下面', () => {
    const timetableRight = placement.timetable.x + timetableFrame.宽 * placement.timetable.scale;
    expect(realX(placement.timetable.x / 16)).toBeGreaterThanOrEqual(splitLayout.serverWidth * 2 + splitLayout.lineWidth * 2);
    expect(realX(timetableRight / 16)).toBeLessThan(realX(placement.calendarPos.x / 16));
    expect(realX((placement.calendarPos.x + calendarSize.宽) / 16)).toBeLessThanOrEqual(2560);
    const timetableTop = toScreenY((placement.timetable.z + timetableFrame.高 * placement.timetable.scale) / 16, placement.timetable.y / 16);
    expect(timetableTop).toBeGreaterThanOrEqual(1.5 * pxPerCell);
    // 桌子前沿（z = 0、y = 0）和服务器那半的地面线同一条横线
    expect(realFraming.中心[1]).toBe(serverFraming.中心[1]);
  });

  it('接入：头一步接上 2-空床 末帧的横移速度，越滑越慢，分屏成形到位 停稳；每帧落在成片像素上', () => {
    const speed = endVelocity();
    const pageStepPerFrame = (speed.rightSpeed * speed.pxPerCell) / 2 / fps;
    expect(shapeOffsetAt(startFrame)).toBe(formShift.horizontalPx);
    expect(Math.abs(shapeOffsetAt(startFrame) - shapeOffsetAt(startFrame + 1) - pageStepPerFrame)).toBeLessThanOrEqual(4);
    let prevOffset = Infinity;
    for (let f = startFrame; f <= events.splitScreenSettled.帧; f++) {
      const offset = shapeOffsetAt(f);
      expect(Number.isInteger(offset * 2)).toBe(true);
      expect(offset).toBeLessThan(prevOffset);
      prevOffset = offset;
    }
    expect(shapeOffsetAt(events.splitScreenSettled.帧)).toBe(0);
  });
});
