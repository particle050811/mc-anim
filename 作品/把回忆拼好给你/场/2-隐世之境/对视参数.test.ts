import { describe, expect, it } from 'vitest';
import { makePerspectiveCamera, projectToPage, zUpToThree } from '@库/界面/投影.ts';
import { pixelFont } from '../../界面/像素字.ts';
import { mainHallDoors } from '../../地点/隐世之境主厅门数据.ts';
import { coverBoxFits, coverPointFits, coverChatBox } from './封面.ts';
import { liYing, headTurnRange, bubbleText } from './参数.ts';
import { eyeContactFraming, eyeContactBubble, eyeContactFoot, eyeContactFov, coverLine, coverBigText, movieChatWidth, chatAgeTick, type EyeContactVersion } from './对视参数.ts';
import { laugh } from './重逢参数.ts';
import { views as groupPhotoViews } from '../../核对/合照/视图.ts';

const eye: [number, number, number] = [eyeContactFoot[0], eyeContactFoot[1], eyeContactFoot[2] + 1.62];

describe('49.96 对视的站位', () => {
  it('还在西门门洞那一格里（x 6～7、y −11～−10），碰撞箱（0.6 宽）碰不到开着的西门门扇', () => {
    expect(eyeContactFoot[0]).toBeGreaterThan(6);
    expect(eyeContactFoot[0]).toBeLessThan(7);
    expect(eyeContactFoot[1]).toBeGreaterThan(-11);
    // 门扇开到底：关着时的盒（取到 1/16 格就是门扇本身）绕转轴转 开角
    const { boxes: box, axis, openAngle } = mainHallDoors.westDoor.leaves[0]!;
    const toSixteenth = (v: number) => Math.round(v * 16) / 16;
    const [c, s] = [Math.cos((openAngle * Math.PI) / 180), Math.sin((openAngle * Math.PI) / 180)];
    const corners = [
      [toSixteenth(box[0]), toSixteenth(box[1])],
      [toSixteenth(box[3]), toSixteenth(box[4])],
    ].map(([x, y]) => [axis[0] + c * (x! - axis[0]) - s * (y! - axis[1]), axis[1] + s * (x! - axis[0]) + c * (y! - axis[1])]);
    const wing = {
      x0: Math.min(...corners.map((p) => p[0]!)),
      x1: Math.max(...corners.map((p) => p[0]!)),
      y0: Math.min(...corners.map((p) => p[1]!)),
      y1: Math.max(...corners.map((p) => p[1]!)),
    };
    expect(wing.y0).toBeCloseTo(-10.1875);
    const feetBox = { x0: eyeContactFoot[0] - 0.3, x1: eyeContactFoot[0] + 0.3, y0: eyeContactFoot[1] - 0.3, y1: eyeContactFoot[1] + 0.3 };
    const overlap = feetBox.x0 < wing.x1 && wing.x0 < feetBox.x1 && feetBox.y0 < wing.y1 && wing.y0 < feetBox.y1;
    expect(overlap).toBe(false);
  });
  it('她身子侧着（和朝你差 65～95°），头转到上限以后脸离正对你差不到 20°，抬头看你过 15°', () => {
    const [dx, dy] = [eye[0] - liYing.feet[0], eye[1] - liYing.feet[1]];
    const facingYou = (Math.atan2(-dx, dy) * 180) / Math.PI;
    const facingDiff = Math.abs(facingYou - liYing.bodyFacing);
    expect(facingDiff).toBeGreaterThanOrEqual(65);
    expect(facingDiff).toBeLessThanOrEqual(95);
    expect(facingDiff - Math.min(facingDiff, headTurnRange[1])).toBeLessThanOrEqual(20);
    expect((Math.atan2(eye[2] - 1.152, Math.hypot(dx, dy)) * 180) / Math.PI).toBeGreaterThanOrEqual(15);
  });
  it('视角在原版视角设置能拉到的范围里（30～110）', () => {
    expect(eyeContactFov).toBeGreaterThanOrEqual(30);
    expect(eyeContactFov).toBeLessThanOrEqual(110);
  });
  it('聊天栏那行到这一帧约 27 刻，还没开始淡（原版 180 刻后才淡）', () => {
    expect(chatAgeTick).toBeGreaterThan(25);
    expect(chatAgeTick).toBeLessThan(180);
  });
  it('气泡缩放都是偶数，片那一版一个气泡像素是画幅高的 1/90；封面黄字也是偶数倍', () => {
    for (const edition of ['片', 'B站封面', '竖版'] as const) expect(eyeContactBubble.scale[edition] % 2).toBe(0);
    expect(eyeContactBubble.scale.片 * 90).toBe(eyeContactFraming.片.height * 2);
    for (const edition of ['B站封面', '竖版'] as const) expect(coverBigText[edition].scale % 2).toBe(0);
  });
  it('封面两张（B站封面、竖版）气泡里是「您的手艺，一如既往呢」（用户 10-25 定），片那一版还是哭脸', () => {
    expect(coverLine).toBe('您的手艺，一如既往呢');
    expect(eyeContactBubble.char.B站封面).toBe(coverLine);
    expect(eyeContactBubble.char.竖版).toBe(coverLine);
    expect(eyeContactBubble.char.片).toBe(bubbleText);
  });
  it('片里聊天栏的宽是原版设置「聊天栏宽度」调得出的（floor(设置 × 280 + 40)，设置 0～1）', () => {
    const setting = (movieChatWidth - 40) / 280;
    expect(setting).toBeGreaterThanOrEqual(0);
    expect(setting).toBeLessThanOrEqual(1);
    expect(Math.floor(setting * 280 + 40)).toBe(movieChatWidth);
  });
});

// 构图：气泡、脸、封面大字的落点（像素字表由 vitest 按资产锁读）
describe('49.96 对视的构图', () => {
  const project = (edition: EyeContactVersion, z: number) => {
    const { width: width, height: height, 看: lookAt } = eyeContactFraming[edition];
    const cam = makePerspectiveCamera({ 眼: zUpToThree(eye), 看: zUpToThree(lookAt), fov: eyeContactFov, width: width, height: height });
    return projectToPage(cam, zUpToThree([liYing.feet[0], liYing.feet[1], z]), width, height);
  };
  // 气泡（库/界面/女仆气泡.tsx）：盒子底边在锚点上，宽 = 字宽 + 10、高 19（一行）；中：盒子从 −trunc(宽/2) 起、尾巴在锚点左右各 8；
  // 左：盒子在 −1−宽 ～ −1、尾巴往下指的那一竖在 −2 ～ −1。尾巴往下 8。页面上一个气泡像素 = 缩放 / 2。
  // 锚点：居中的那几版横着挪到让盒子居中（对视.tsx 的 对视气泡锚），高都是帽顶；画的时候再吸到一个气泡像素的格子上（这里不吸，差不到一个气泡像素）
  const bubbleBox = (edition: EyeContactVersion, text = eyeContactBubble.char[edition]) => {
    const halfScale = eyeContactBubble.scale[edition] / 2;
    const width = pixelFont.textWidth(text) + 10;
    const bubblePos = eyeContactBubble.位置[edition];
    const boxX = bubblePos === '中' ? -Math.trunc(width / 2) : -1 - width;
    const projectedPoint = project(edition, eyeContactBubble.anchorHeight);
    const anchorX = eyeContactBubble.centered[edition] ? eyeContactFraming[edition].width / 2 - (boxX + width / 2) * halfScale : projectedPoint.x;
    const tailX = bubblePos === '中' ? anchorX : anchorX - 1.5 * halfScale;
    return { x0: anchorX + boxX * halfScale, x1: anchorX + (boxX + width) * halfScale, y0: projectedPoint.y - 19 * halfScale, y1: projectedPoint.y + 8 * halfScale, tailX };
  };

  it('片、B站封面：气泡整个在画里（离上沿至少 8）、在 4:3 里', () => {
    for (const edition of ['片', 'B站封面'] as const) {
      const { width: W } = eyeContactFraming[edition];
      const b = bubbleBox(edition);
      expect(b.y0).toBeGreaterThan(8 * (W / 1280));
      expect(b.x0).toBeGreaterThan((W * 240) / 1920);
      expect(b.x1).toBeLessThan((W * 1680) / 1920);
    }
  });
  it('B 站多封面第三张（核对-合照 最后一帧）：用封面「片」那一版的机位，笑的气泡整个在画里（离上沿至少 8）、在 4:3 里', () => {
    const v = groupPhotoViews[groupPhotoViews.length - 1]!;
    expect(v.coverRig).toBe(true);
    expect(v.bubbleText).toBe(laugh.bubbleText);
    const b = bubbleBox('片', laugh.bubbleText);
    expect(b.y0).toBeGreaterThan(8);
    expect(b.x0).toBeGreaterThan((1280 * 240) / 1920);
    expect(b.x1).toBeLessThan((1280 * 1680) / 1920);
  });
  // 脸连两边头发宽 0.416 格（模型 x −4.42～5.82，按 0.65/16 缩）
  const faceWidth = (10.24 * 0.65) / 16;
  it('B站封面：脸连头发至少占 16:9 卡片宽的 20%（主会话 10-24 美术定稿）', () => {
    expect(project('B站封面', 1.33).pxPerCell * faceWidth).toBeGreaterThanOrEqual(eyeContactFraming.B站封面.width * 0.2);
  });
  // 封面上气泡是 C 位（用户 10-25 定）：盒子左右居中、尾巴压在她帽顶（帽冠半宽约 0.3 格，静帧上量的）、整个在她眉眼（脚底以上 1.45 格）上面
  const centerSlot = (edition: 'B站封面' | '竖版') => {
    const W = eyeContactFraming[edition].width;
    const g = bubbleBox(edition);
    const headView = project(edition, 1.33);
    expect(Math.abs((g.x0 + g.x1) / 2 - W / 2)).toBeLessThanOrEqual(eyeContactBubble.scale[edition] / 2);
    expect(Math.abs(g.tailX - headView.x)).toBeLessThanOrEqual(0.3 * headView.pxPerCell);
    expect(g.y1).toBeLessThan(project(edition, 1.45).y);
    return g;
  };
  it('B站封面：脸在 4:3 里、躲开底边和右下角；气泡居中、在 4:3 里、尾巴压在帽顶；黄字在左下：4:3 里、离 4:3 左沿至少 60 像素（1920 宽计）、在底边 20% 上面、在脸左边，像素格是整数', () => {
    const [W, H] = [eyeContactFraming.B站封面.width, eyeContactFraming.B站封面.height];
    const headView = project('B站封面', 1.33);
    const chin = project('B站封面', 1.1);
    const halfWidth = (faceWidth / 2) * headView.pxPerCell;
    for (const [x, y] of [
      [headView.x - halfWidth, headView.y],
      [headView.x + halfWidth, headView.y],
      [chin.x, chin.y],
    ])
      expect(coverPointFits(W, H, x!, y!)).toBe(true);
    const g = centerSlot('B站封面');
    expect(g.x0).toBeGreaterThan((W * 240) / 1920);
    expect(g.x1).toBeLessThan((W * 1680) / 1920);
    const b = coverChatBox(pixelFont.textWidth('Steve加入了游戏'), coverBigText.B站封面);
    expect(coverBoxFits(W, H, b)).toBe(true);
    expect(b.x0 - (W * 240) / 1920).toBeGreaterThanOrEqual((60 * W) / 1920);
    expect(b.y0).toBeGreaterThan(H / 2);
    expect(b.x1).toBeLessThan(headView.x - halfWidth);
    for (const v of [b.x0 * 2, b.y0 * 2, b.x1 * 2, b.y1 * 2]) expect(Number.isInteger(v)).toBe(true);
  });
  it('竖版：气泡在画里、居中、尾巴压在帽顶；黄字在左下角（离左边、下边不到画幅的 5%）、在下巴底下', () => {
    const { width: W, height: H } = eyeContactFraming.竖版;
    const g = centerSlot('竖版');
    expect(g.x0).toBeGreaterThan(0);
    expect(g.x1).toBeLessThan(W);
    expect(g.y0).toBeGreaterThan(8);
    const b = coverChatBox(pixelFont.textWidth('Steve加入了游戏'), coverBigText.竖版);
    expect(b.x0).toBeGreaterThan(0);
    expect(b.x0).toBeLessThanOrEqual(W * 0.05);
    expect(b.y1).toBeLessThan(H);
    expect(H - b.y1).toBeLessThanOrEqual(H * 0.05);
    expect(b.y0).toBeGreaterThan(project('竖版', 1.1).y);
  });
});
