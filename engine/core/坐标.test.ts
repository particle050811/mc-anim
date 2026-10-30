// 坐标正本：三套坐标来回换的自洽，和旧副本（toThree、fromMc、Z朝上转three）在同一批点上对。
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { 取函数, 规范 } from '../../pipeline/检查/副本识别.ts';
import * as C from './坐标.ts';

const 根 = path.resolve(import.meta.dirname, '../..');
const 副本 = (文件: string, 名: string) => 取函数(文件, fs.readFileSync(path.join(根, 文件), 'utf8'), 名);
const 点们: [number, number, number][] = [[0, 0, 0], [1, 2, 3], [-4.5, 0.25, 7], [100, -64, 320.5]];
const 原点: C.原点 = [-700, 64, 1200];
const 近 = (a: readonly number[], b: readonly number[]) => a.forEach((x, i) => expect(x).toBeCloseTo(b[i]!, 12));

describe('坐标正本', () => {
  it('场景 ↔ three：x 东不变、场景 z（上）是 three y、场景 y（北）是 three −z', () => {
    expect(C.场景到three([1, 2, 3]).toArray()).toEqual([1, 3, -2]);
    for (const p of 点们) expect(C.three到场景(C.场景到three(p))).toEqual(p.map((x) => x + 0));
  });
  it('游戏 ↔ 场景：东、北、上；带原点时来回不变', () => {
    expect(C.游戏到场景([1, 2, 3])).toEqual([1, -3, 2]);
    // 游戏 (gx, gy, gz) 换到 three 就是去掉原点后的 (gx, gy, gz)：游戏和 three 的轴本来就一样
    for (const g of 点们) 近(C.场景到three(C.游戏到场景(g, 原点)).toArray(), [g[0] - 原点[0], g[1] - 原点[1], g[2] - 原点[2]]);
    for (const g of 点们) 近(C.场景到游戏(C.游戏到场景(g, 原点), 原点), g);
  });
  it('方块 ↔ 场景格：方块 (x, y, z) 占游戏 [x, x+1)×[y, y+1)×[z, z+1)，场景格是它在场景里的最小角', () => {
    const b = [10, 70, -5];
    const 格 = C.方块到场景格(b, 原点);
    // 方块的八个角换到场景，最小角就是场景格
    const 角们 = [0, 1].flatMap((dx) => [0, 1].flatMap((dy) => [0, 1].map((dz) => C.游戏到场景([b[0]! + dx, b[1]! + dy, b[2]! + dz], 原点))));
    近(格, [0, 1, 2].map((i) => Math.min(...角们.map((c) => c[i]!))));
    近(C.场景格到方块(格, 原点), b);
    近(C.方块中心(b, 原点), C.游戏到场景([b[0]! + 0.5, b[1]! + 0.5, b[2]! + 0.5], 原点));
  });
  it('游戏朝向：yaw 0 朝南、90 朝西、−90 朝东、180 朝北，pitch 90 朝下', () => {
    近(C.游戏朝向到场景(0, 0), [0, -1, 0]);
    近(C.游戏朝向到场景(90, 0), [-1, 0, 0]);
    近(C.游戏朝向到场景(-90, 0), [1, 0, 0]);
    近(C.游戏朝向到场景(180, 0), [0, 1, 0]);
    近(C.游戏朝向到场景(0, 90), [0, 0, -1]);
    for (const [yaw, pitch] of [[0, 0], [37, -20], [-120, 45], [180, 10], [90, -89]] as const) {
      const r = C.场景到游戏朝向(C.游戏朝向到场景(yaw, pitch));
      expect(r.yaw).toBeCloseTo(yaw, 9);
      expect(r.pitch).toBeCloseTo(pitch, 9);
    }
    expect(C.场景到游戏朝向([0, 0, 5])).toEqual({ yaw: 0, pitch: -90 });
  });
});

describe('坐标正本和旧副本对得上', () => {
  it('toThree（engine/三渲二/机位.tsx、库/界面/箱子界面.tsx、应力转动 飞行镜头）', () => {
    for (const [文件, 名] of [['engine/三渲二/机位.tsx', 'toThree'], ['库/界面/箱子界面.tsx', 'toThree'], ['作品/应力转动/地点/飞行镜头.tsx', 'toThree']] as const) {
      const f = 副本(文件, 名);
      for (const p of 点们) expect(规范(f(p))).toEqual(规范(C.场景到three(p)));
    }
  });
  it('fromMc（库/生物/九头蛇.tsx）= 不带原点的 游戏到场景；Z朝上转three（库/界面/投影.ts）= 不带原点的 场景到游戏', () => {
    const fromMc = 副本('库/生物/九头蛇.tsx', 'fromMc');
    const 转 = 副本('库/界面/投影.ts', 'Z朝上转three');
    for (const p of 点们) {
      近(fromMc(p) as number[], C.游戏到场景(p));
      近(转(p) as number[], C.场景到游戏(p));
    }
  });
});
