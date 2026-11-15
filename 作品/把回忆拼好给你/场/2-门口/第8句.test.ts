import { describe, expect, it } from 'vitest';
import { mainCutEvents } from '../../分镜.ts';
import { photoWallCellPos } from '../../地点/照片墙格.ts';
import { orthoTop } from './参数.ts';
import { youHead, steveScale, puffLook, hissFacing, hissStandPos, line8Shot, line8ShotCount, line8ShotGroundFromBottom, creeperStill } from './第8句.ts';

// 地点/门口小木屋.tsx 的门洞（那边是 tsx，测试不引）
const doorOpening = { x0: -0.5, x1: 0.5, z1: 2 };
/** 夏天那四只框最右边的 x（照片墙格位.夏天，一格 x ∈ [i − 0.5, i + 0.5]） */
const photoWallRightEdge = Math.max(...photoWallCellPos.summer.map(([i]) => i)) + 0.5;
const steveFrontHalfWidth = (16 * steveScale) / 16 / 2; // 身子 8、两臂各 4 个贴图像素
/** 苦力怕侧面（身子朝东）前脚伸出脚底中心多少格：前后腿各 4 像素、中心离身子中心 4 像素 */
const creeperReach = 6 / 16;

describe('第 8 句的镜头（主会话 10-24 美术定稿：推近，N 取 14～16）', () => {
  it('N = 16（偶数，预览级里贴图像素也是整像素；4 的倍数，照片墙的地图画按 64 格画）；地面线离底四分之三格，落在贴图像素上', () => {
    expect(line8ShotCount).toBeGreaterThanOrEqual(14);
    expect(line8ShotCount).toBeLessThanOrEqual(16);
    expect(line8ShotCount % 2).toBe(0);
    expect(line8Shot.framing.pxPerCell).toBe(16 * line8ShotCount);
    expect(line8ShotCount % 4).toBe(0);
    expect(Number.isInteger(line8ShotGroundFromBottom * 16)).toBe(true);
    // 门那一格在画面正中；画面中心的高度换成成片像素是整的
    expect(line8Shot.framing.中心[0]).toBe(0);
    expect(Number.isInteger(line8Shot.framing.中心[1] * line8Shot.framing.pxPerCell)).toBe(true);
  });

  it('天和屋顶（屋檐 z 3 往上）不到画面一半', () => {
    const screenHeight = 1440 / line8Shot.framing.pxPerCell;
    expect((screenHeight - line8ShotGroundFromBottom - 3) / screenHeight).toBeLessThan(0.5);
  });
});

describe('第 8 句哈气那一拍', () => {
  it('你在屋里、照片墙右边（不挡照片）；她在门洞里、门框框得住；苦力怕在门外、离你四五格；三个都在画里', () => {
    const { 你: you, liYingX, 苦力怕: creeper } = hissStandPos;
    expect(you - steveFrontHalfWidth).toBeGreaterThanOrEqual(photoWallRightEdge);
    expect(liYingX).toBeGreaterThanOrEqual(doorOpening.x0);
    expect(liYingX).toBeLessThanOrEqual(doorOpening.x1);
    expect(creeper + creeperReach).toBeLessThan(doorOpening.x0);
    expect(you - creeper).toBeGreaterThanOrEqual(4);
    expect(you - creeper).toBeLessThanOrEqual(5);
    const halfWidthCells = 1280 / line8Shot.framing.pxPerCell;
    expect(creeper - creeperReach).toBeGreaterThan(-halfWidthCells + 1);
    expect(you + steveFrontHalfWidth).toBeLessThan(halfWidthCells - 1);
  });

  it('她头顶（戴帽 1.79 格，斜投影抬一点）不碰门楣', () => {
    expect(1.79 + (0.5 * orthoTop) / line8ShotCount).toBeLessThan(doorOpening.z1);
  });

  it('有方向：她侧身朝左（苦力怕），苦力怕侧身朝右；她的头转三分之四朝镜头，你的头转向她', () => {
    expect(hissFacing.liYingYaw).toBe(90);
    expect(hissFacing.苦力怕).toBe(-90);
    expect(creeperStill.headYaw).toBe(0);
    expect(creeperStill.stride).toBe(0);
    expect(puffLook[1]).toBeGreaterThanOrEqual(30);
    expect(puffLook[1]).toBeLessThanOrEqual(50);
    expect(youHead).toBeLessThan(0);
  });

  it('时刻取自分镜：哈气在三稿 27.80，片子里是歌曲帧 1668（60 fps）', () => {
    expect(mainCutEvents.哈气.秒).toBeCloseTo(27.8, 1);
    expect(mainCutEvents.哈气.帧).toBe(1668);
  });
});
