// 坐标正本和旧副本（fromMc、Z朝上转three）在同一批点上对：副本从源码里单独取出来编（副本识别.ts），不执行它所在的模块。正本自身的测试在 engine/core/坐标.test.ts。
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getFunction } from '../副本识别.ts';
import * as C from '../../../engine/core/坐标.ts';

const root = path.resolve(import.meta.dirname, '../../..');
const copyFn = (file: string, fnName: string) => getFunction(file, fs.readFileSync(path.join(root, file), 'utf8'), fnName);
const points: [number, number, number][] = [[0, 0, 0], [1, 2, 3], [-4.5, 0.25, 7], [100, -64, 320.5]];
const expectNear = (a: readonly number[], b: readonly number[]) => a.forEach((x, i) => expect(x).toBeCloseTo(b[i]!, 12));

describe('坐标正本和旧副本对得上', () => {
  it('fromMc（库/生物/九头蛇.tsx）= 不带原点的 游戏到场景；Z朝上转three（库/界面/投影.ts）= 不带原点的 场景到游戏', () => {
    const fromMc = copyFn('库/生物/九头蛇.tsx', 'fromMc');
    const convert = copyFn('库/界面/投影.ts', 'zUpToThree');
    for (const p of points) {
      expectNear(fromMc(p) as number[], C.gameToScene(p));
      expectNear(convert(p) as number[], C.sceneToGame(p));
    }
  });
});
