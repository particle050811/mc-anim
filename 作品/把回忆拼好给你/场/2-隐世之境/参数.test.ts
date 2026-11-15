import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { makePixelFont } from '@库/界面/像素字表.ts';
import { makePerspectiveCamera, projectToPage, zUpToThree } from '@库/界面/投影.ts';
import { bytesPath, readWorkAssetLock } from '../../../../pipeline/资产/资产锁.ts';
import { coverBoxFits, coverPointFits, coverChatBox } from './封面.ts';
import { liYing, headTurnRange, cameraRig, bubbleText } from './参数.ts';

// 头比身子多转的角：她脚底到你眼睛的水平方向，和她身子朝向差多少（度）。
// 忽略头心离脚底那几厘米的水平偏移（库/角色/魔法酒狐.tsx 的 head.站 约 6 厘米），差不到 2°，所以两头各留 2° 的余量
const facingYawError = () => {
  const [dx, dy] = [cameraRig.feet[0] - liYing.feet[0], cameraRig.feet[1] - liYing.feet[1]];
  const facingYou = (Math.atan2(-dx, dy) * 180) / Math.PI; // 同 骨架.tsx 的 yaw：0 朝北、正往西
  const facingDiff = facingYou - liYing.bodyFacing;
  return ((((facingDiff + 180) % 360) + 360) % 360) - 180;
};

describe('第 15 句重逢的站位', () => {
  it('身子侧着（和朝你差 70～95°），头多转的角夹在上限以后在 45～60° 里，脸离正对你差不到 20°', () => {
    const faceDiff = Math.abs(facingYawError());
    const turnAmount = Math.min(faceDiff, headTurnRange[1]);
    expect(faceDiff).toBeGreaterThanOrEqual(70);
    expect(faceDiff).toBeLessThanOrEqual(95);
    expect(turnAmount).toBeGreaterThanOrEqual(headTurnRange[0] - 2);
    expect(turnAmount).toBeLessThanOrEqual(75);
    expect(faceDiff - turnAmount).toBeLessThanOrEqual(20);
  });
  it('她抬头看你过 15°（再平帽檐就压住眼睛）', () => {
    const headHeight = 1.152; // 库/角色/魔法酒狐.tsx 的 head.站
    const dist = Math.hypot(cameraRig.feet[0] - liYing.feet[0], cameraRig.feet[1] - liYing.feet[1]);
    expect((Math.atan2(cameraRig.feet[2] + 1.62 - headHeight, dist) * 180) / Math.PI).toBeGreaterThanOrEqual(15);
  });
});

// 封面构图：脸、气泡、封面聊天行都在 4:3 里、躲开底边 20% 和右下角。像素字表在数据根里，没有就跳过
const workRoot = path.resolve(import.meta.dirname, '../..');
const fontLockEntry = readWorkAssetLock(workRoot)['字体/把回忆拼好给你/像素字'];
const hasTable = !!fontLockEntry && fs.existsSync(bytesPath(fontLockEntry));

describe.skipIf(!hasTable)('封面构图', () => {
  const pixelFont = makePixelFont(JSON.parse(fs.readFileSync(bytesPath(fontLockEntry!), 'utf8')), '字体/把回忆拼好给你/像素字');
  const [W, H] = [1280, 720];
  const cam = makePerspectiveCamera({ 眼: zUpToThree([cameraRig.feet[0], cameraRig.feet[1], cameraRig.feet[2] + 1.62]), 看: zUpToThree(cameraRig.看), fov: cameraRig.fov, 宽: W, 高: H });
  const projectAt = (z: number) => projectToPage(cam, zUpToThree([liYing.feet[0], liYing.feet[1], z]), W, H);

  it('封面聊天行在 4:3 里、底边 20% 上面，像素格是整数', () => {
    const b = coverChatBox(pixelFont.textWidth('Steve加入了游戏'));
    expect(coverBoxFits(W, H, b)).toBe(true);
    for (const v of [b.x0 * 2, b.y0 * 2, b.x1 * 2, b.y1 * 2]) expect(Number.isInteger(v)).toBe(true);
  });
  it('气泡整个在画面里、在 4:3 里（库/界面/女仆气泡.tsx：锚在脚底 + 2 格，宽 = 字宽 + 10、高 19、尾巴往下 8，一气泡像素 0.025 格）', () => {
    const projection = projectAt(2.0);
    const unitPx = Math.round(projection.pxPerCell * 0.025 * 2) / 2;
    const bubbleWidth = pixelFont.textWidth(bubbleText) + 10;
    const b = { x0: projection.x - (bubbleWidth / 2) * unitPx, x1: projection.x + (bubbleWidth / 2) * unitPx, y0: projection.y - 19 * unitPx, y1: projection.y + 8 * unitPx };
    expect(b.y0).toBeGreaterThan(8);
    expect(b.x0).toBeGreaterThan(160);
    expect(b.x1).toBeLessThan(1120);
  });
  it('脸（头心上下、左右各四分之一格）在 4:3 里、躲开底边和右下角，离 4:3 两边至少 40', () => {
    const headView = projectAt(1.33);
    // 下巴：脸最下沿比颈部转轴（1.152）还低一点，静帧上量的是 1.1 格上下
    const chin = projectAt(1.1);
    const halfWidth = 0.25 * headView.pxPerCell;
    for (const [x, y] of [
      [headView.x - halfWidth, headView.y],
      [headView.x + halfWidth, headView.y],
      [chin.x, chin.y],
    ])
      expect(coverPointFits(W, H, x!, y!)).toBe(true);
    expect(headView.x - halfWidth).toBeGreaterThan(160 + 40);
    expect(headView.x + halfWidth).toBeLessThan(1120 - 40);
    // 右下角禁区从 y 518 起，下巴离它至少 20
    expect(chin.y).toBeLessThan(518 - 20);
  });
});
