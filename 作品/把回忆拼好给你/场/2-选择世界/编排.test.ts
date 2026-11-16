import { describe, expect, it } from 'vitest';
import { fps, legacyFrameSec, aspect, SegmentWindow, mainCutEvents } from '../../分镜.ts';
import { iconEdge } from '../../界面/实例图标.ts';
import { cursor, framingCenter, unit, ui, shardParams, drillIn, endWhite, endPullBack } from './参数.ts';
import { lastPlayedText, cursorAt, iconFrame, pointingAt, boxCursorOn, rowTexts, isSelectedAt, drillInFraming, drillInProgress, drillInAlpha, shards, shardAt, outroWhiteAt, endFraming, normalFraming, reunionRowTexts } from './编排.ts';

const drumFrame = mainCutEvents.drumBeatClick.frame;

describe('存档那一项的字（原版 WorldListEntry、SimpleDateFormat zh_CN 短格式）', () => {
  it('第二行是文件夹名 + 上次游玩时间：月日不补零、十二小时制、上午下午在前', () => {
    expect(rowTexts[1]).toBe('新的世界 (2025/8/10 下午10:47)');
    expect(lastPlayedText({ 年: 2025, month: 8, 日: 1, timestamp: 0, 分: 5 })).toBe('2025/8/1 上午12:05');
    expect(lastPlayedText({ 年: 2025, month: 8, 日: 1, timestamp: 12, 分: 0 })).toBe('2025/8/1 下午12:00');
  });
  it('第三行是模式和版本', () => {
    expect(rowTexts[2]).toBe('生存模式, 版本： 1.20.1');
  });
  it('片尾回色起第二行换成这次重逢玩过的时间（核查 10-24），别的两行不变', () => {
    expect(reunionRowTexts[1]).toBe('新的世界 (2026/6/10 下午9:16)');
    expect([reunionRowTexts[0], reunionRowTexts[2]]).toEqual([rowTexts[0], rowTexts[2]]);
  });
});

describe('第 0 镜：光标、指着、选中', () => {
  it('第一帧没有光标、没选中、搜索框拿着焦点「_」亮着（和片尾最后一帧同构图，能接回开头）', () => {
    expect(cursorAt(0)).toBeNull();
    expect(pointingAt(0)).toBe(0);
    expect(isSelectedAt(0)).toBe(false);
    expect(boxCursorOn(0)).toBe(true);
  });
  it('搜索框光标照原版 6 刻亮、6 刻灭', () => {
    // 两秒里亮的帧占 20/48～28/48
    const onFlags = Array.from({ length: 2 * fps }, (_, f) => boxCursorOn(f));
    expect(onFlags.filter(Boolean).length).toBeGreaterThan((2 * fps * 20) / 48);
    expect(onFlags.filter(Boolean).length).toBeLessThan((2 * fps * 28) / 48);
    expect(boxCursorOn(Math.ceil((6 * fps) / 20))).toBe(false);
  });
  it('光标到了停在图标上（蓝的播放箭头），鼓点那一帧点下去：选中、光标还在、不再蒙灰；下一帧光标没了', () => {
    expect(cursorAt(mainCutEvents.cursorArrives.frame)).toEqual(cursor.停);
    expect(pointingAt(mainCutEvents.cursorArrives.frame)).toBe(2);
    expect(cursorAt(drumFrame)).toEqual(cursor.停);
    expect(isSelectedAt(drumFrame)).toBe(true);
    expect(pointingAt(drumFrame)).toBe(0);
    expect(cursorAt(drumFrame + 1)).toBeNull();
  });
  it('光标一路先擦过那一项的字（灰箭头）再到图标', () => {
    const trail = Array.from({ length: mainCutEvents.cursorArrives.frame - mainCutEvents.cursorEnters.frame + 1 }, (_, k) => pointingAt(mainCutEvents.cursorEnters.frame + k));
    expect(trail.includes(1)).toBe(true);
    expect(trail.indexOf(1)).toBeLessThan(trail.indexOf(2));
  });
  it('光标停的地方在图标里、箭头尖落在半个界面像素上', () => {
    expect(cursor.停.x).toBeGreaterThanOrEqual(iconFrame.x);
    expect(cursor.停.x).toBeLessThan(iconFrame.x + iconFrame.side);
    expect(cursor.停.y).toBeGreaterThanOrEqual(iconFrame.y);
    expect(cursor.停.y).toBeLessThan(iconFrame.y + iconFrame.side);
    for (let f = mainCutEvents.cursorEnters.frame; f <= drumFrame; f++) {
      const c = cursorAt(f)!;
      expect(Number.isInteger(c.x * 2) && Number.isInteger(c.y * 2)).toBe(true);
    }
  });
});

describe('取景', () => {
  it('图标、三行字、选中框的左边和上下边在画面里；画面上沿切在搜索框黑底里（垫在歌词后面）；标题、底下的按钮不进画', () => {
    const halfWidth = aspect.width / unit, halfHeight = aspect.height / unit;
    const left = framingCenter.x - halfWidth, right = framingCenter.x + halfWidth, top = framingCenter.y - halfHeight, bottom = framingCenter.y + halfHeight;
    expect(ui.selectedFrame.left).toBeGreaterThanOrEqual(left);
    expect(ui.selectedFrame.上).toBeGreaterThanOrEqual(top);
    expect(ui.selectedFrame.下).toBeLessThanOrEqual(bottom);
    // 第二行最长：Unifont 汉字步进 9、ASCII 不超过 6，40 个以内的字放得下
    expect(ui.textX + 160).toBeLessThanOrEqual(right);
    expect(top).toBeGreaterThanOrEqual(ui.searchFrame.y);
    expect(top).toBeLessThan(ui.searchFrame.y + ui.searchFrame.height);
    // 原版标题在 y 8，底下按钮从 y 高 − 52 起
    expect(top).toBeGreaterThan(8 + 9);
    expect(bottom).toBeLessThan(ui.height - 52);
  });
});

describe('钻进图标', () => {
  it('最后一帧有界面的画面：图标铺满画面、照片全透，下一帧去掉界面不跳', () => {
    const lastFrame = Math.ceil(drumFrame + drillIn.sec * fps) - 1;
    const { p, q } = drillInProgress(lastFrame);
    expect(p).toBe(1);
    expect(drillInAlpha(q)).toBe(1);
    const t = drillInFraming(q);
    expect(iconFrame.side * t.unit).toBeGreaterThanOrEqual(aspect.width * 2);
    expect(iconFrame.side * t.unit).toBeGreaterThanOrEqual(aspect.height * 2);
    expect(t.center.x).toBeCloseTo(iconFrame.x + iconFrame.side / 2);
    expect(t.center.y).toBeCloseTo(iconFrame.y + iconFrame.side / 2);
  });
  it('鼓点那一帧还是平常的取景（接 2-选择世界 最后一帧）', () => {
    const t = drillInFraming(drillInProgress(drumFrame).q);
    expect(t.unit).toBe(unit);
    expect(t.center).toEqual(framingCenter);
  });
});

describe('片尾：闪白、拉回、碎片（核查 10-24）', () => {
  const colorBackGap = mainCutEvents.outroRecolor.frame - mainCutEvents.outroFlash.frame;
  it('片尾从咔哒那一帧起（片尾白光 = 合照咔哒 = 2-合照 的止）', () => {
    expect(SegmentWindow('2-拼回').起帧).toBe(mainCutEvents.outroFlash.frame);
    expect(mainCutEvents.outroFlash.frame).toBe(mainCutEvents.groupPhotoClick.frame);
  });
  it('第一帧整屏纯白，同第 11 句截图那一闪几帧就退：白过三成的不超过 1/8 秒（24 fps 时 3 帧），闪白秒 起没有白', () => {
    expect(outroWhiteAt(0)).toBe(1);
    expect(Array.from({ length: fps }, (_, f) => outroWhiteAt(f)).filter((a) => a > 0.3).length / fps).toBeLessThanOrEqual(legacyFrameSec(3));
    expect(outroWhiteAt(Math.ceil(endWhite.whiteFlashSec * fps))).toBe(0);
  });
  it('镜头从图标跟前往外拉（钻入那条路倒着走）：第一帧尺 起尺、越拉越慢，拉回秒 起是平常取景（第 0 镜），回色前已经停住', () => {
    const pullFrames = endPullBack.sec * fps;
    expect(endFraming(0).unit).toBeCloseTo(endPullBack.startZoom, 9);
    for (let f = 1; f <= pullFrames; f++) {
      expect(endFraming(f).unit, `第 ${f} 帧`).toBeLessThan(endFraming(f - 1).unit);
      if (f >= 2) expect(endFraming(f - 1).unit - endFraming(f).unit, `第 ${f} 帧`).toBeLessThanOrEqual(endFraming(f - 2).unit - endFraming(f - 1).unit + 1e-9);
    }
    expect(endFraming(pullFrames)).toEqual(normalFraming);
    expect(pullFrames).toBeLessThan(colorBackGap);
  });
  it('碎片大、飞得够久：起飞那一帧一块不小于 120 页面像素宽，第一块起飞到最后一块到位不短于 0.8 秒；回色后定格不短于 0.5 秒', () => {
    // 起飞那一帧 = 起秒 起的第一个整帧；最后一块到位那一刻再算上 1/24 秒（24 fps 时到位那一帧）
    const flyStartFrame = (b: (typeof shards)[number]) => Math.ceil(b.startSec * fps);
    for (const b of shards) expect((shardAt(b, flyStartFrame(b))!.side * endFraming(flyStartFrame(b)).unit) / 2).toBeGreaterThanOrEqual(120);
    const arrivalSecs = shards.map((b) => b.startSec + shardParams.flySec);
    expect(Math.max(...arrivalSecs) - Math.min(...shards.map((b) => b.startSec)) + legacyFrameSec(1)).toBeGreaterThanOrEqual(0.8);
    expect((SegmentWindow('2-拼回').frameCount - colorBackGap) / fps).toBeGreaterThanOrEqual(0.5);
  });
  it('16 块碎片正好铺满图标，一格一块', () => {
    const tileCount = iconEdge / shardParams.shardEdge;
    expect(shards.length).toBe(tileCount * tileCount);
    expect(shards.length).toBe(16);
    expect(new Set(shards.map((b) => `${b.i},${b.j}`)).size).toBe(shards.length);
  });
  it('回色前一帧全部到位，回色那一帧没有白光', () => {
    for (const b of shards) expect(shardAt(b, colorBackGap - 1)?.dest).toBe(true);
    expect(outroWhiteAt(colorBackGap)).toBe(0);
  });
});
