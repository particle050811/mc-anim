// sr film 的多段拼接：两段小母版（48 帧、37 帧，声音都比画面长）接成一条，查总帧数、拼接表、manifest、声音按样本截。
// 母版用 ffmpeg 现造在临时数据根里，指纹按段键现编（算段指纹 要打包画面闭包，这里不测它）。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { 段信息 } from '../清单/清单.ts';
import type { 运行记录 } from '../运行记录/记录.ts';

// 配置读得懒，在下面动态 import 之前设好数据根就行
const 数据根 = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-成片测试-'));
process.env.SR_DATA = 数据根;

const 指纹 = (键: string) => crypto.createHash('sha256').update(键).digest('hex');
vi.mock('../指纹/指纹.ts', () => ({ 算段指纹: async (s: { 键: string }) => ({ 段: s.键, 指纹: 指纹(s.键), 项: {} }) }));

const { 合成成片 } = await import('./成片.ts');
const { 母版路径 } = await import('../渲/母版.ts');
const { 视频信息 } = await import('../渲/探测.ts');
const { 代码根 } = await import('../环境/路径.ts');

const 有ffmpeg = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;

const 段 = (键: string, 帧数: number, fps = 24): 段信息 =>
  ({
    键,
    章: 0,
    编号: null,
    段名: 键,
    目录: path.join(代码根(), 'content', '核对', 键),
    画面: path.join(代码根(), 'content', '核对', 键, '画面.tsx'),
    段文件: path.join(代码根(), 'content', '核对', 键, '段.ts'),
    段: { 场: '测试', 帧数, fps, 宽: 320, 高: 180, 地形: [] },
  }) as unknown as 段信息;

/** 母版：testsrc2 画面 帧数 帧，正弦音比画面长 0.5 秒（成片要按样本截掉多的） */
const 造母版 = (键: string, 帧数: number, 频率: number) => {
  const f = 母版路径(键, 指纹(键));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const r = spawnSync('ffmpeg', [
    '-v', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=24',
    '-f', 'lavfi', '-t', String(帧数 / 24 + 0.5), '-i', `sine=frequency=${频率}:sample_rate=48000`,
    '-frames:v', String(帧数), '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le', '-ac', '2', f,
  ]);
  if (r.status !== 0) throw new Error(String(r.stderr));
};

const 记录 = () => ({ 记: () => {}, 产物: [] as string[] }) as unknown as 运行记录;

describe.skipIf(!有ffmpeg)('合成成片', () => {
  beforeAll(() => {
    造母版('甲', 48, 440);
    造母版('乙', 37, 660);
  });
  afterAll(() => fs.rmSync(数据根, { recursive: true, force: true }));

  it('两段接成一条：总帧数是各段之和，拼接表、manifest 记对全片起帧，声音长度按帧数截', async () => {
    const { dir, 成片, manifest } = await 合成成片([段('甲', 48), 段('乙', 37)], { 级别: '预览', 名: '两段', 范围: ['甲', '乙'], 记录: 记录() });
    expect(视频信息(成片).帧数).toBe(85);
    expect(manifest.总帧数).toBe(85);
    expect(manifest.段.map((s) => [s.键, s.帧数, s.全片起帧])).toEqual([
      ['甲', 48, 0],
      ['乙', 37, 48],
    ]);
    const 表 = fs.readFileSync(path.join(dir, '拼接表.tsv'), 'utf8').trim().split('\n').slice(1).map((l) => l.split('\t'));
    expect(表.map((r) => [r[1], r[4], r[5]])).toEqual([
      ['甲', '48', '0'],
      ['乙', '37', '48'],
    ]);
    const 音长 = Number(
      spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=duration', '-of', 'csv=p=0', 成片], { encoding: 'utf8' }).stdout.trim(),
    );
    expect(Math.abs(音长 - 85 / 24)).toBeLessThan(0.03);
    expect(Math.abs(manifest.响度.成片LUFS - -16)).toBeLessThan(0.5);
    expect(fs.existsSync(path.join(dir, '_工作'))).toBe(false);
  });

  it('帧率不一样、母版帧数和段.ts 对不上都拒绝', async () => {
    await expect(合成成片([段('甲', 48), 段('乙', 37, 1)], { 级别: '预览', 名: '帧率', 范围: [], 记录: 记录() })).rejects.toThrow(/各段帧率不一样/);
    await expect(合成成片([段('甲', 49)], { 级别: '预览', 名: '帧数', 范围: [], 记录: 记录() })).rejects.toThrow(/母版 48 帧，段.ts 写的是 49 帧/);
  });
});
