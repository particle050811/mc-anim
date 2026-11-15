// 坐标正本：三套坐标来回换的自洽，和旧副本（toThree、fromMc、Z朝上转three）在同一批点上对。
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getFunction, canonicalValue } from '../../pipeline/检查/副本识别.ts';
import { sceneToThree } from './three换算.ts';
import * as C from './坐标.ts';

const root = path.resolve(import.meta.dirname, '../..');
const copyFn = (file: string, fnName: string) => getFunction(file, fs.readFileSync(path.join(root, file), 'utf8'), fnName);
const points: [number, number, number][] = [[0, 0, 0], [1, 2, 3], [-4.5, 0.25, 7], [100, -64, 320.5]];
const originPos: C.Origin = [-700, 64, 1200];
const expectNear = (a: readonly number[], b: readonly number[]) => a.forEach((x, i) => expect(x).toBeCloseTo(b[i]!, 12));

describe('坐标正本', () => {
  it('场景 ↔ three：x 东不变、场景 z（上）是 three y、场景 y（北）是 three −z', () => {
    expect(sceneToThree([1, 2, 3]).toArray()).toEqual([1, 3, -2]);
    for (const p of points) expect(C.threeToScene(sceneToThree(p))).toEqual(p.map((x) => x + 0));
  });
  it('游戏 ↔ 场景：东、北、上；带原点时来回不变', () => {
    expect(C.gameToScene([1, 2, 3])).toEqual([1, -3, 2]);
    // 游戏 (gx, gy, gz) 换到 three 就是去掉原点后的 (gx, gy, gz)：游戏和 three 的轴本来就一样
    for (const g of points) expectNear(sceneToThree(C.gameToScene(g, originPos)).toArray(), [g[0] - originPos[0], g[1] - originPos[1], g[2] - originPos[2]]);
    for (const g of points) expectNear(C.sceneToGame(C.gameToScene(g, originPos), originPos), g);
  });
  it('方块 ↔ 场景格：方块 (x, y, z) 占游戏 [x, x+1)×[y, y+1)×[z, z+1)，场景格是它在场景里的最小角', () => {
    const b = [10, 70, -5];
    const cellScenePos = C.blockToSceneCell(b, originPos);
    // 方块的八个角换到场景，最小角就是场景格
    const corners = [0, 1].flatMap((dx) => [0, 1].flatMap((dy) => [0, 1].map((dz) => C.gameToScene([b[0]! + dx, b[1]! + dy, b[2]! + dz], originPos))));
    expectNear(cellScenePos, [0, 1, 2].map((i) => Math.min(...corners.map((c) => c[i]!))));
    expectNear(C.sceneCellToBlock(cellScenePos, originPos), b);
    expectNear(C.blockCenter(b, originPos), C.gameToScene([b[0]! + 0.5, b[1]! + 0.5, b[2]! + 0.5], originPos));
  });
  it('游戏朝向：yaw 0 朝南、90 朝西、−90 朝东、180 朝北，pitch 90 朝下', () => {
    expectNear(C.gameFacingToScene(0, 0), [0, -1, 0]);
    expectNear(C.gameFacingToScene(90, 0), [-1, 0, 0]);
    expectNear(C.gameFacingToScene(-90, 0), [1, 0, 0]);
    expectNear(C.gameFacingToScene(180, 0), [0, 1, 0]);
    expectNear(C.gameFacingToScene(0, 90), [0, 0, -1]);
    for (const [yaw, pitch] of [[0, 0], [37, -20], [-120, 45], [180, 10], [90, -89]] as const) {
      const r = C.sceneToGameFacing(C.gameFacingToScene(yaw, pitch));
      expect(r.yaw).toBeCloseTo(yaw, 9);
      expect(r.pitch).toBeCloseTo(pitch, 9);
    }
    expect(C.sceneToGameFacing([0, 0, 5])).toEqual({ yaw: 0, pitch: -90 });
  });
});

describe('坐标正本和旧副本对得上', () => {
  it('toThree（engine/三渲二/机位.tsx、库/界面/箱子界面.tsx、应力转动 飞行镜头）', () => {
    for (const [file, fnName] of [['engine/三渲二/机位.tsx', 'toThree'], ['库/界面/箱子界面.tsx', 'toThree'], ['作品/应力转动/地点/飞行镜头.tsx', 'toThree']] as const) {
      const f = copyFn(file, fnName);
      for (const p of points) expect(canonicalValue(f(p))).toEqual(canonicalValue(sceneToThree(p)));
    }
  });
  it('fromMc（库/生物/九头蛇.tsx）= 不带原点的 游戏到场景；Z朝上转three（库/界面/投影.ts）= 不带原点的 场景到游戏', () => {
    const fromMc = copyFn('库/生物/九头蛇.tsx', 'fromMc');
    const convert = copyFn('库/界面/投影.ts', 'zUpToThree');
    for (const p of points) {
      expectNear(fromMc(p) as number[], C.gameToScene(p));
      expectNear(convert(p) as number[], C.sceneToGame(p));
    }
  });
});
