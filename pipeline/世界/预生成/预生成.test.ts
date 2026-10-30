import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { 读声明 } from '../声明.ts';
import { csv文本, 预生成计划们 } from './计划.ts';
import { 外包方形, 矩形区块 } from './范围.ts';
import { 任务文件, 完成行, 是这一块, 读任务, 进度行 } from './看守.ts';

describe('预生成范围', () => {
  it('矩形照 Chunky：中心对齐区块，半边向上取整到区块', () => {
    expect(矩形区块({ 名: 'a', 形状: '矩形', 中心: [39680, -1216], 半边: [2560, 2560] })).toEqual({ cx0: 2320, cx1: 2640, cz0: -236, cz1: 84 });
    expect(矩形区块({ 名: 'a', 形状: '矩形', 中心: [-1, 17.5], 半边: [1, 17] })).toEqual({ cx0: -2, cx1: 0, cz0: -1, cz1: 3 });
  });

  it('主世界-116 三块：岛、边城的区块数，航线走廊的区块列表和旧项目 主世界范围.py csv 逐字节一样', () => {
    const ps = 预生成计划们(读声明('主世界-116'));
    expect(ps.map((p) => [p.块.名, p.区块数])).toEqual([
      ['岛', 321 * 321],
      ['边城', 385 * 385],
      ['航线', 318710],
    ]);
    const 线 = ps[2]!;
    // 旧项目 game/取材服务端-主世界/config/chunky/mcai-d56cda699c.csv（10-05 预生成航线用的那份）的 sha256
    expect(createHash('sha256').update(csv文本(线.区块!)).digest('hex')).toBe('34c725157133b71574582c1c99d3552d6d628337228b9c228ca5b622fb58ef09');
    // 选区和旧任务文件 config/chunky/tasks/minecraft/overworld.properties 记的一样
    expect(线.选区).toEqual({ 形状: 'square', 中心: [24648, -5336], 半边: [12608, 12608] });
    expect(外包方形(线.区块!)).toEqual({ 中心: [24648, -5336], 半边: 12608 });
  });
});

describe('预生成看守', () => {
  it('认得出 Chunky 的进度行、完成行', () => {
    const 进 = 进度行.exec('[12:00:01] [Server thread/INFO] [Chunky/]: [Chunky] Task running for minecraft:overworld. Processed: 1234 chunks (1.20%), ETA: 1:02:03, Rate: 45.6 cps, Current: 10, -3');
    expect(进?.slice(1)).toEqual(['minecraft:overworld', '1234', '1.20', '45.6']);
    const 完 = 完成行.exec('[Chunky] Task finished for minecraft:overworld. Processed: 121 chunks (100.00%), Total time: 0:00:09');
    expect(完?.slice(1)).toEqual(['minecraft:overworld', '121', '100.00', '0:00:09']);
  });

  it('暂停着的任务是不是这一块：中心、半径、图案（csv 还要名字）都对上才算', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), '看守-'));
    const f = 任务文件(d, 'minecraft:overworld');
    expect(f).toBe(path.join(d, 'config', 'chunky', 'tasks', 'minecraft', 'overworld.properties'));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, 'world=minecraft:overworld\ncancelled=false\ncenter-x=24648.0\ncenter-z=-5336.0\nradius=12608.0\nshape=square\npattern=csv\ncsv=anim-d56cda699c\n');
    const [, , 线] = 预生成计划们(读声明('主世界-116'));
    const t = 读任务(f);
    expect(t.cancelled).toBe('false');
    expect(是这一块(t, 线!)).toBe(true);
    expect(是这一块({ ...t, csv: 'mcai-d56cda699c' }, 线!)).toBe(false);
    const 矩 = 预生成计划们(读声明('主世界-116'), undefined, [{ 名: '临时', 形状: '矩形', 两角: [0, 0, 64, 32] }])[0]!;
    expect(是这一块({ 'center-x': '32', 'center-z': '16', radius: '32', 'radius-z': '16', pattern: 'region' }, 矩)).toBe(true);
    expect(是这一块({ 'center-x': '32', 'center-z': '16', radius: '32', 'radius-z': '32', pattern: 'region' }, 矩)).toBe(false);
    fs.rmSync(d, { recursive: true });
  });
});
