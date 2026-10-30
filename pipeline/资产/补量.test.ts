import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { 量音频文件 } from '../段框架/音频数.ts';
import { 字节路径, 写资产锁, 读资产锁, type 资产锁, type 锁条目 } from './资产锁.ts';
import { 并缺的, 缺音频元数据, 补音频元数据 } from './补量.ts';
import { 量音频数 } from './音频量.ts';

const 条 = (c: string, 后缀 = '.ogg', 库: 锁条目['库'] = 'store'): 锁条目 => ({ sha256: c.repeat(64), 大小: 3, 库, 后缀 });
const 有ffmpeg = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;

describe('assets measure 补音频元数据', () => {
  let 根: string;
  beforeEach(() => {
    根 = fs.mkdtempSync(path.join(os.tmpdir(), '补量-'));
  });
  afterEach(() => fs.rmSync(根, { recursive: true, force: true }));
  const 放字节 = (e: 锁条目) => {
    const f = 字节路径(e, 根);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, 'x');
  };

  it('只挑音频条目里缺字段的；不是音频的、三项齐的不动', () => {
    expect(缺音频元数据(条('a', '.png'))).toBe(false);
    expect(缺音频元数据({ ...条('a'), 时长: 1, 峰值: -1, 响度: -20 })).toBe(false);
    expect(缺音频元数据({ ...条('a', '.OGG'), 时长: 1, 响度: -20 })).toBe(true);
  });

  it('只并进原来没有的字段，已有的数不被新量的盖掉', () => {
    expect(并缺的({ ...条('a'), 时长: 2 }, { 时长: 2.5, 峰值: -3, 响度: -18 })).toEqual({ ...条('a'), 时长: 2, 峰值: -3, 响度: -18 });
  });

  it('补缺的、跳过没字节的、报量不出和量完仍缺的；sha、大小、库、后缀不变，原锁对象不改', () => {
    const 锁: 资产锁 = {
      '音效/有': 条('a'),
      '配乐/私有没字节': 条('b', '.flac', '私有'),
      '音效/静音': 条('c', '.wav'),
      '音效/坏': 条('d'),
      '贴图/图': 条('e', '.png'),
      '音效/齐': { ...条('f'), 时长: 1, 峰值: -1, 响度: -20 },
    };
    for (const id of ['音效/有', '音效/静音', '音效/坏', '贴图/图']) 放字节(锁[id]!);
    const 原 = structuredClone(锁);
    const 量过: string[] = [];
    const r = 补音频元数据(锁, {
      数据根: 根,
      量: (f) => {
        量过.push(path.basename(f));
        if (f.endsWith('d'.repeat(64))) throw new Error('ffmpeg 量不了\n细节');
        return f.endsWith('c'.repeat(64)) ? { 时长: 0.5, 响度: -70 } : { 时长: 1.5, 峰值: -2.25, 响度: -19.5 };
      },
    });
    expect(锁).toEqual(原);
    expect(r.音频).toBe(5);
    expect(r.缺).toEqual(['配乐/私有没字节', '音效/坏', '音效/有', '音效/静音']);
    expect(r.没字节).toEqual(['配乐/私有没字节']);
    expect(r.量不出).toEqual([{ id: '音效/坏', 原因: 'ffmpeg 量不了' }]);
    expect(r.补了).toEqual(['音效/有', '音效/静音']);
    expect(r.仍缺).toEqual([{ id: '音效/静音', 字段: ['峰值'] }]);
    expect(量过).toHaveLength(3);
    expect(r.锁['音效/有']).toEqual({ ...条('a'), 时长: 1.5, 峰值: -2.25, 响度: -19.5 });
    for (const id of Object.keys(锁)) {
      const { sha256, 大小, 库, 后缀 } = r.锁[id]!;
      expect({ sha256, 大小, 库, 后缀 }).toEqual({ sha256: 锁[id]!.sha256, 大小: 锁[id]!.大小, 库: 锁[id]!.库, 后缀: 锁[id]!.后缀 });
    }
    expect(r.锁['配乐/私有没字节']).toBe(锁['配乐/私有没字节']);
    expect(r.锁['贴图/图']).toBe(锁['贴图/图']);
  });

  it('只查：不量、不改，照样报缺和没字节', () => {
    const 锁: 资产锁 = { '音效/有': 条('a'), '音效/没': 条('b') };
    放字节(锁['音效/有']!);
    const r = 补音频元数据(锁, { 数据根: 根, 只查: true, 量: () => { throw new Error('只查不该量'); } });
    expect(r.缺).toEqual(['音效/有', '音效/没']);
    expect(r.没字节).toEqual(['音效/没']);
    expect(r.补了).toEqual([]);
    expect(r.锁).toEqual(锁);
  });

  it('补完写回的锁：除了加的字段逐字节和原来一样（键序照旧排）', () => {
    const f = path.join(根, '资产锁.json');
    const 锁: 资产锁 = { 'z/后': { ...条('a', '.png') }, '音效/有': 条('b') };
    写资产锁(锁, f);
    放字节(锁['音效/有']!);
    const r = 补音频元数据(读资产锁(f), { 数据根: 根, 量: () => ({ 时长: 1, 峰值: -1, 响度: -20 }) });
    写资产锁(r.锁, f);
    const 读 = 读资产锁(f);
    expect(Object.keys(读)).toEqual(['z/后', '音效/有'].sort());
    expect(Object.keys(读['音效/有']!)).toEqual(['响度', '后缀', '大小', '峰值', '库', '时长', 'sha256'].sort());
  });

  // 和 anim cues 现量（段框架/音频数.ts）是同一个量法：锁里补的数和 放() 现量的逐位一样
  it.skipIf(!有ffmpeg)('真量：默认量法、cue 现量、量音频数 三者结果一样', () => {
    const e = 条('9', '.flac');
    const f = 字节路径(e, 根);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    const 临时 = path.join(根, '正弦.flac');
    spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.8:sample_rate=48000', 临时]);
    fs.renameSync(临时, f);
    const r = 补音频元数据({ '音效/正弦': e }, { 数据根: 根 });
    const 补 = r.锁['音效/正弦']!;
    expect(补.时长).toBeCloseTo(0.8, 2);
    expect({ 时长: 补.时长, 峰值: 补.峰值, 响度: 补.响度 }).toEqual(量音频文件(f));
    expect(量音频文件(f)).toEqual(量音频数(f));
  });
});
