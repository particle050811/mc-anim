import { describe, expect, it } from 'vitest';
import { 正片事件 } from '../../分镜.ts';
import { 正交顶面 } from './参数.ts';
import { 你的头, 史蒂夫倍数, 哈气看, 哈气朝向, 哈气站位, 第8句镜头, 第8句镜头N, 第8句镜头地面离底, 苦力怕停步 } from './第8句.ts';

// 地点/门口小木屋.tsx 的门洞、开着的门板、箱子（那边是 tsx，测试不引）
const 门洞 = { x0: -0.5, x1: 0.5, z1: 2 };
const 箱子x = 1;
const 史蒂夫正面半宽 = (16 * 史蒂夫倍数) / 16 / 2; // 身子 8、两臂各 4 个贴图像素
/** 苦力怕侧面（身子朝东）前脚伸出脚底中心多少格：前后腿各 4 像素、中心离身子中心 4 像素 */
const 苦力怕前伸 = 6 / 16;

describe('第 8 句的镜头（主会话 10-24 美术定稿：推近，N 取 14～16）', () => {
  it('N = 16（偶数，预览级里贴图像素也是整像素），描边一个贴图像素宽；地面线离底四分之三格，落在贴图像素上', () => {
    expect(第8句镜头N).toBeGreaterThanOrEqual(14);
    expect(第8句镜头N).toBeLessThanOrEqual(16);
    expect(第8句镜头N % 2).toBe(0);
    expect(第8句镜头.取景.每格).toBe(16 * 第8句镜头N);
    expect(第8句镜头.描边宽).toBe(第8句镜头N);
    expect(Number.isInteger(第8句镜头地面离底 * 16)).toBe(true);
    // 门那一格在画面正中；画面中心的高度换成成片像素是整的
    expect(第8句镜头.取景.中心[0]).toBe(0);
    expect(Number.isInteger(第8句镜头.取景.中心[1] * 第8句镜头.取景.每格)).toBe(true);
  });

  it('天和屋顶（屋檐 z 3 往上）不到画面一半', () => {
    const 屏高 = 1440 / 第8句镜头.取景.每格;
    expect((屏高 - 第8句镜头地面离底 - 3) / 屏高).toBeLessThan(0.5);
  });
});

describe('第 8 句哈气那一拍', () => {
  it('你在屋里、箱子右边；她在门洞里、门框框得住；苦力怕在门外、离你四五格；三个都在画里', () => {
    const { 你, 她, 苦力怕 } = 哈气站位;
    expect(你 - 史蒂夫正面半宽).toBeGreaterThan(箱子x + 7 / 16);
    expect(她).toBeGreaterThanOrEqual(门洞.x0);
    expect(她).toBeLessThanOrEqual(门洞.x1);
    expect(苦力怕 + 苦力怕前伸).toBeLessThan(门洞.x0);
    expect(你 - 苦力怕).toBeGreaterThanOrEqual(4);
    expect(你 - 苦力怕).toBeLessThanOrEqual(5);
    const 半宽格 = 1280 / 第8句镜头.取景.每格;
    expect(苦力怕 - 苦力怕前伸).toBeGreaterThan(-半宽格 + 1);
    expect(你 + 史蒂夫正面半宽).toBeLessThan(半宽格 - 1);
  });

  it('她头顶（戴帽 1.79 格，斜投影抬一点）不碰门楣', () => {
    expect(1.79 + (0.5 * 正交顶面) / 第8句镜头N).toBeLessThan(门洞.z1);
  });

  it('有方向：她侧身朝左（苦力怕），苦力怕侧身朝右；她的头转三分之四朝镜头，你的头转向她', () => {
    expect(哈气朝向.她).toBe(90);
    expect(哈气朝向.苦力怕).toBe(-90);
    expect(苦力怕停步.headYaw).toBe(0);
    expect(苦力怕停步.stride).toBe(0);
    expect(哈气看[1]).toBeGreaterThanOrEqual(30);
    expect(哈气看[1]).toBeLessThanOrEqual(50);
    expect(你的头).toBeLessThan(0);
  });

  it('时刻取自分镜：哈气在三稿 27.80，片子里是歌曲帧 667', () => {
    expect(正片事件.哈气.秒).toBeCloseTo(27.8, 1);
    expect(正片事件.哈气.帧).toBe(667);
  });
});
