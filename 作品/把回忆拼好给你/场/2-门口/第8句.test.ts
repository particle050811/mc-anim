import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { magicalWineFoxExMotion } from '@库/角色/魔法酒狐新动作.ts';
import { 侧投影 } from '../../地点/侧剖面.tsx';
import { 正片事件 } from '../../分镜.ts';
import { 整屏镜头, 整屏镜头N, 正交顶面 } from './参数.ts';
import { 你的头, 史蒂夫倍数, 哈气头, 哈气朝向, 哈气站位, 苦力怕停步 } from './第8句.ts';

// 地点/门口小木屋.tsx 的门洞、开着的门板、箱子、箱子右边站人的地方（那边是 tsx，测试不引）
const 门洞 = { x0: -0.5, x1: 0.5, z1: 2 };
const 箱子x = 1;
const 箱子右 = 2;
const 史蒂夫正面半宽 = (16 * 史蒂夫倍数) / 16 / 2; // 身子 8、两臂各 4 个贴图像素
/** 她炸开的尾巴尖往身后伸出多少格（按 核对-门口哈气 定稿第 0 帧量的：尾巴最右的描边内侧离她脚底中心约 0.9 格） */
const 尾巴伸出 = 0.95;
/** 苦力怕侧面（身子朝东）前脚伸出脚底中心多少格：前后腿各 4 像素、中心离身子中心 4 像素 */
const 苦力怕前伸 = 6 / 16;

const 度 = Math.PI / 180;
/** 基岩模型.tsx 的骨骼转角 → 四元数（同它的 euler：x、y 取反，ZYX） */
const 骨骼转 = (r: number[]) => new THREE.Quaternion().setFromEuler(new THREE.Euler(-r[0]! * 度, -r[1]! * 度, r[2]! * 度, 'ZYX'));

describe('第 8 句哈气那一拍（主会话 10-24 定的站位）', () => {
  it('你在屋里、箱子右边；她在门洞里、门框框得住；苦力怕在门外、离你四五格；三个都在画里', () => {
    const { 你, 她, 苦力怕 } = 哈气站位;
    expect(你).toBe(箱子右);
    expect(你 - 史蒂夫正面半宽).toBeGreaterThan(箱子x);
    expect(她).toBeGreaterThanOrEqual(门洞.x0);
    expect(她).toBeLessThanOrEqual(门洞.x1);
    expect(苦力怕 + 苦力怕前伸).toBeLessThan(门洞.x0);
    expect(你 - 苦力怕).toBeGreaterThanOrEqual(4);
    expect(你 - 苦力怕).toBeLessThanOrEqual(5);
    const 半宽格 = 1280 / 整屏镜头.取景.每格;
    expect(苦力怕 - 0.5).toBeGreaterThan(-半宽格 + 1);
    expect(你 + 0.5).toBeLessThan(半宽格 - 1);
  });

  it('她的尾巴碰不到你：尾巴尖和你的胳膊之间至少隔半格', () => {
    expect(哈气站位.你 - 史蒂夫正面半宽 - (哈气站位.她 + 尾巴伸出)).toBeGreaterThanOrEqual(0.5);
  });

  it('她头顶（戴帽 1.79 格，斜投影抬 0.1 格）不碰门楣', () => {
    expect(1.79 + (0.5 * 正交顶面) / 整屏镜头N).toBeLessThan(门洞.z1);
  });

  it('身子都取 90° 的整数倍，你的头、苦力怕的头也转整 90°', () => {
    for (const y of Object.values(哈气朝向)) expect(Math.abs(y) % 90).toBe(0);
    expect(Math.abs(你的头) % 90).toBe(0);
    expect(Math.abs(苦力怕停步.headYaw) % 90).toBe(0);
    expect(苦力怕停步.stride).toBe(0);
  });

  it('她的头：抵掉哈气姿势上身的前倾，正好往左转 90°（脸平对镜头、不歪），下巴抬 10°', () => {
    const 上身 = magicalWineFoxExMotion({ 姿势: '哈气', 眨眼: 0 }).骨骼.UpBody!.rot!;
    const 世界 = 骨骼转(上身).multiply(骨骼转(哈气头.Head.rot));
    const 要 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -10 * 度)).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 90 * 度, 0)));
    expect(世界.angleTo(要)).toBeLessThan(0.01 * 度);
    // 模型里脸朝 −Z、上是 +Y：脸转到侧面（±X）、往上抬 10°
    const 脸 = new THREE.Vector3(0, 0, -1).applyQuaternion(世界);
    expect(Math.abs(脸.x)).toBeCloseTo(Math.cos(10 * 度), 4);
    expect(脸.y).toBeCloseTo(Math.sin(10 * 度), 4);
    expect(脸.z).toBeCloseTo(0, 4);
  });

  it('时刻取自分镜：哈气在三稿 27.80，片子里是歌曲帧 667', () => {
    expect(正片事件.哈气.秒).toBeCloseTo(27.8, 1);
    expect(正片事件.哈气.帧).toBe(667);
  });
});
