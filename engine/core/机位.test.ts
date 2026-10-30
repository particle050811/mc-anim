// 机位正本：焦距 ↔ 视角、插值、摆相机，和旧副本（aimCamera、lerpCam、fovOf、2-新世界 的 插机位）在同一批输入上对。
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { 取函数, type 编选项 } from '../../pipeline/检查/副本识别.ts';
import { lerpV, rad } from './数学.ts';
import * as J from './机位.ts';

const 根 = path.resolve(import.meta.dirname, '../..');
type 函 = (...a: unknown[]) => unknown;
const 副本 = (文件: string, 名: string, 选项?: 编选项) => 取函数(文件, fs.readFileSync(path.join(根, 文件), 'utf8'), 名, { 允许循环: true, ...选项 }) as 函;
const 近 = (a: readonly number[], b: readonly number[], 位 = 10) => {
  expect(a.length).toBe(b.length);
  a.forEach((x, i) => expect(x).toBeCloseTo(b[i]!, 位));
};
const 甲: J.Cam = { pos: [5.5, -7.3, 2.5], tgt: [5.5, -1, 1.7], lens: 26 };
const 乙: J.Cam = { pos: [-3, 4, 10], tgt: [0, 0, 0], lens: 60 };

describe('机位正本', () => {
  it('焦距 ↔ 视角：36 mm 横向画幅，16:9 时 lens 18 的竖直视角', () => {
    expect(J.焦距到视角(18, 1)).toBeCloseTo(90, 12);
    expect(J.焦距到视角(18, 16 / 9)).toBeCloseTo((2 * Math.atan(9 / 16) * 180) / Math.PI, 12);
    for (const lens of [12, 26, 50, 135]) expect(J.视角到焦距(J.焦距到视角(lens, 16 / 9), 16 / 9)).toBeCloseTo(lens, 9);
  });
  it('插机位：两头、线性、对数焦距、roll 只在给了时带', () => {
    expect(J.插机位(甲, 乙, 0)).toEqual(甲);
    // a + (b − a)·1 有末位舍入，k = 1 时只是近似等于 乙
    const 到 = J.插机位(甲, 乙, 1);
    近(到.pos, 乙.pos, 12);
    近(到.tgt, 乙.tgt, 12);
    const 中 = J.插机位(甲, 乙, 0.5);
    近(中.pos, lerpV(甲.pos, 乙.pos, 0.5));
    expect(中.lens).toBe(43);
    expect('roll' in 中).toBe(false);
    expect(J.插机位(甲, 乙, 0.5, { 焦距: '对数' }).lens).toBeCloseTo(Math.sqrt(26 * 60), 12);
    expect(J.插机位({ ...甲, roll: 180 }, 乙, 0.25).roll).toBe(135);
  });
  it('插机位 球面转向：视线方向匀角速转，看点距离线性插', () => {
    const a: J.Cam = { pos: [0, 0, 0], tgt: [10, 0, 0], lens: 30 };
    const b: J.Cam = { pos: [0, 0, 0], tgt: [0, 20, 0], lens: 30 };
    const c = J.插机位(a, b, 0.5, { 转向: '球面' });
    近(c.tgt, [15 * Math.SQRT1_2, 15 * Math.SQRT1_2, 0]);
  });
  it('机位轨：端点外停住、缓动作用在段内进度上', () => {
    const 轨: [number, J.Cam][] = [[10, 甲], [20, 乙]];
    expect(J.机位轨(轨, 0)).toBe(甲);
    expect(J.机位轨(轨, 30)).toBe(乙);
    expect(J.机位轨(轨, 15, (t) => t * t).lens).toBeCloseTo(26 + 34 * 0.25, 12);
  });
  it('摆相机 + 投到画面：看点投在画面正中，相机朝 −Z（three）看向看点', () => {
    const cam = J.做相机(甲, 1920, 1080);
    const p = J.投到画面(cam, 甲.tgt, 1920, 1080);
    expect(p.x).toBeCloseTo(960, 6);
    expect(p.y).toBeCloseTo(540, 6);
    expect(p.深).toBeGreaterThan(0);
    expect(cam.fov).toBeCloseTo(J.焦距到视角(26, 16 / 9), 12);
    // 场景上方（+z）的点在画面上半
    expect(J.投到画面(cam, [甲.tgt[0], 甲.tgt[1], 甲.tgt[2] + 1], 1920, 1080).y).toBeLessThan(540);
  });
  it('转透视参数、从透视参数来回不变；roll 非 0 报错', () => {
    const p = J.转透视参数(甲, 16 / 9);
    expect(p.种).toBe('透视');
    const 回 = J.从透视参数(p, 16 / 9);
    expect(回.lens).toBeCloseTo(26, 9);
    expect(() => J.转透视参数({ ...甲, roll: 90 }, 1)).toThrow(/roll/);
    expect(() => J.转透视参数({ ...甲, roll: 360 }, 1)).not.toThrow();
  });
  it('从游戏机位：眼睛在场景里的位置、看向 yaw 方向', () => {
    const c = J.从游戏机位({ 眼: [10, 70, -5], yaw: 90, pitch: 0, 视角: 70 }, [0, 64, 0], 16 / 9);
    近(c.pos, [10, 5, 6]);
    近(c.tgt, [0, 5, 6]);
    expect(J.焦距到视角(c.lens, 16 / 9)).toBeCloseTo(70, 9);
  });
});

describe('机位正本和旧副本对得上', () => {
  it('aimCamera（应力转动 古城画面）摆出来的相机和 摆相机 一样（远裁剪面 900）', () => {
    const aim = 副本('作品/应力转动/地点/古城4x/6-4-1/古城画面.tsx', 'aimCamera', { 全局: { THREE }, 额外: { rad } });
    for (const c of [甲, 乙, { ...乙, roll: 180 }] as J.Cam[]) {
      for (const 比 of [16 / 9, 1]) {
        const 旧 = new THREE.PerspectiveCamera();
        aim(旧, c, 比, 900);
        旧.updateMatrixWorld();
        const 新 = J.摆相机(new THREE.PerspectiveCamera(), c, 比);
        近(旧.projectionMatrix.elements, 新.projectionMatrix.elements, 9);
        近(旧.matrixWorld.elements, 新.matrixWorld.elements, 9);
      }
    }
  });
  it('fovOf（6-3-2 转场，16:9）', () => {
    const fovOf = 副本('作品/应力转动/地点/边城/6-3-2/转场.ts', 'fovOf', { 额外: { aspect: 16 / 9 } });
    for (const lens of [12, 26, 50]) expect(fovOf(lens)).toBeCloseTo(J.焦距到视角(lens, 16 / 9), 12);
  });
  it('lerpCam（7-起疑、6-4-3）和 2-新世界 的 插机位 = 线性 插机位', () => {
    const 起疑 = 副本('作品/应力转动/段/7-起疑/编排.ts', 'lerpCam');
    const 古城 = 副本('作品/应力转动/场/6-古城/6-4-3/编排/机位.ts', 'lerpCam', { 额外: { lerpV } });
    const 新世界 = 副本('作品/把回忆拼好给你/场/2-新世界/编排.ts', '插机位');
    for (const k of [0, 0.3, 0.5, 1, 1.2]) {
      const 新 = J.插机位(甲, 乙, k);
      for (const 旧 of [起疑(甲, 乙, k), 古城(甲, 乙, k)] as J.Cam[]) {
        近(旧.pos, 新.pos);
        近(旧.tgt, 新.tgt);
        expect(旧.lens).toBeCloseTo(新.lens, 12);
      }
      const 帧 = 新世界({ 眼: 甲.pos, 看: 甲.tgt, 视角: 甲.lens }, { 眼: 乙.pos, 看: 乙.tgt, 视角: 乙.lens }, k) as { 眼: number[]; 看: number[]; 视角: number };
      近(帧.眼, 新.pos);
      近(帧.看, 新.tgt);
      expect(帧.视角).toBeCloseTo(新.lens, 12);
    }
  });
});
