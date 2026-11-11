// 袍摆让腿：算式和 engine 的骨骼正解对得上；站着不动时不改袍摆；忘情牛肉面每 1/60 秒腿都不穿出袍子。
// 模型字节在数据根 store（作品资产锁）；没有就整组跳过。
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { 骨骼矩阵 } from '@engine/model/基岩正解.ts';
import type { BedrockBone } from '@engine/model/基岩模型.tsx';
import { 字节路径, 读资产锁 } from '../../../pipeline/资产/资产锁.ts';
import { 一遍秒, 忘情牛肉面姿势 } from './动作/忘情牛肉面.ts';
import { 相对矩阵, 袍摆穿出明细, 袍摆让腿 } from './袍摆让腿.ts';

const 锁 = 读资产锁(path.join(import.meta.dirname, '..', '资产锁'));
const 文件 = 锁['模型/角色/娘化亚波伦'] && 字节路径(锁['模型/角色/娘化亚波伦']!);
const 几何 = 文件 && fs.existsSync(文件) ? (JSON.parse(fs.readFileSync(文件, 'utf8')) as { bones: BedrockBone[] }) : undefined;

describe.skipIf(!几何)('袍摆让腿', () => {
  const g = 几何!;

  it('自己的骨骼算式和 engine 的 骨骼矩阵 一样（带转角、平移、横向缩放）', () => {
    const t = { ...忘情牛肉面姿势(7.8), FrontSkirt: { rot: [-20, 0, 0] }, bone27: { scale: [1.4, 1, 1], pos: [0.6, 0, 0] } };
    const 根 = 骨骼矩阵(g, 'Skirt', t, 1);
    for (const 名 of ['bone29', 'bone153', 'LeftLowerLeg']) {
      const 祖 = 名 === 'LeftLowerLeg' ? 'DownBody' : 'Skirt';
      const 要 = (祖 === 'Skirt' ? 根 : 骨骼矩阵(g, 祖, t, 1)).clone().multiply(相对矩阵(g, 祖, 名, t));
      const 实 = 骨骼矩阵(g, 名, t, 1);
      for (let i = 0; i < 16; i++) expect(要.elements[i]).toBeCloseTo(实.elements[i]!, 9);
    }
  });

  it('站着不动（空姿势表）不改袍摆', () => {
    const r = 袍摆让腿(g, {});
    expect(r.姿势).toEqual({});
    expect(r.剩).toBe(0);
  });

  it('改过的骨骼喂回 骨骼矩阵 也有限（scale、pos 的写法 engine 认）', () => {
    const t = 忘情牛肉面姿势(7.8);
    const r = 袍摆让腿(g, t);
    const m = 骨骼矩阵(g, 'bone29', { ...t, ...r.姿势 });
    expect(m.elements.every(Number.isFinite)).toBe(true);
    expect(new THREE.Vector3().setFromMatrixPosition(m).length()).toBeGreaterThan(0);
  });

  it('忘情牛肉面每 1/60 秒：腿不穿出袍子，各组甩的角度逐帧连续', () => {
    let 上: ReturnType<typeof 袍摆让腿>['角'] | undefined;
    const 最大 = { 前: 0, 后: 0, 左: 0, 右: 0 };
    let 最大跳 = 0;
    for (let f = 0; f <= Math.ceil(一遍秒 * 60); f++) {
      const r = 袍摆让腿(g, 忘情牛肉面姿势(f / 60));
      if (r.剩) expect.fail(`第 ${f} 帧还有点露在外面：${JSON.stringify(袍摆穿出明细(g, 忘情牛肉面姿势(f / 60)))}`);
      for (const k of ['前', '后', '左', '右'] as const) {
        最大[k] = Math.max(最大[k], r.角[k]);
        if (上) 最大跳 = Math.max(最大跳, Math.abs(r.角[k] - 上[k]));
      }
      上 = r.角;
    }
    expect(最大跳).toBeLessThan(8);
  });
});
