// anim film 的拼接（拼成片.ts）：两段现造的成片切片（60 帧输出）直接拷流接成一条，查总帧数、拼接表、manifest、
// 声音按段长按样本截、拉到 −16 LUFS，--分享版 另出 1080p60 AV1。渲染那步（渲/渲段.ts）mock 掉，切片和声音用 ffmpeg 现造。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { 段信息 } from '../清单/清单.ts';
import type { 运行记录 } from '../运行记录/记录.ts';

const 数据根 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-拼成片测试-'));
process.env.ANIM_DATA = 数据根;

const 假 = vi.hoisted(() => ({ 段们: [] as unknown[], 产物们: [] as unknown[] }));
vi.mock('../渲/渲段.ts', () => ({ 渲染段们: async () => 假.产物们 }));
vi.mock('../清单/清单.ts', async (原) => ({ ...(await 原<object>()), 全部段: async () => 假.段们 }));
vi.mock('../环境/作品.ts', async (原) => ({ ...(await 原<object>()), 作品名: () => '测试' }));

const { 拼成片 } = await import('./拼成片.ts');
const { 视频信息 } = await import('../渲/探测.ts');
const { 代码根 } = await import('../环境/路径.ts');

const 有ffmpeg = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;
const 有av1 = 有ffmpeg && /libsvtav1/.test(spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' }).stdout);

const 段 = (键: string, 秒: number): 段信息 =>
  ({
    键,
    章: 0,
    编号: null,
    段名: 键,
    段文件: path.join(代码根(), '作品', '测试', '段', 键, '段.ts'),
    段: { 场: '测试', 秒, 宽: 320, 高: 180, 地形: [] },
  }) as unknown as 段信息;

const 跑 = (args: string[]) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args]);
  if (r.status !== 0) throw new Error(String(r.stderr));
};

/** 一段成片切片：60 帧 输出帧数 帧（和 渲/设置.ts 同一套 x264 参数），声音从全片第 输出起帧 帧起、比段长多 0.5 秒（要按样本截掉） */
const 造产物 = (键: string, 输出帧数: number, 输出起帧: number, 频率: number) => {
  const d = path.join(数据根, '切片', 键);
  fs.mkdirSync(d, { recursive: true });
  const 画面 = path.join(d, '画面.mp4');
  const 声音 = path.join(d, '声音.wav');
  跑(['-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=60', '-frames:v', String(输出帧数), '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', 画面]);
  跑(['-f', 'lavfi', '-t', String(输出帧数 / 60 + 0.5), '-i', `sine=frequency=${频率}:sample_rate=48000`, '-ac', '2', '-c:a', 'pcm_s16le', 声音]);
  const 指纹 = (k: string) => ({ 段: 键, 指纹: k.repeat(64).slice(0, 64), 项: {} });
  return { 段: 段(键, 输出帧数 / 60), 画面指纹: 指纹('a'), 声音指纹: 指纹('b'), 画面, 声音, 输出帧数, 输出起帧, 声音起秒: 输出起帧 / 60, 声音止秒: (输出起帧 + 输出帧数) / 60 };
};

const 记录 = () => ({ 记: vi.fn(), 产物: [] as string[], 阶段: [] }) as unknown as 运行记录;

describe.skipIf(!有ffmpeg)('拼成片', () => {
  beforeAll(() => {
    // 2 秒 + 1.55 秒，60 帧输出的窗是 [0, 120)、[120, 213)
    假.产物们 = [造产物('甲', 120, 0, 440), 造产物('乙', 93, 120, 660)];
    假.段们 = (假.产物们 as { 段: 段信息 }[]).map((r) => r.段);
  });
  afterAll(() => fs.rmSync(数据根, { recursive: true, force: true }));

  it('两段拷流接成一条：总帧数是各段输出帧之和，拼接表、manifest 记全片起帧（B 站时间轴按它切段），声音按段长截、拉到 −16 LUFS', async () => {
    const { dir, 成片, manifest } = await 拼成片(假.段们 as 段信息[], { 级别: '预览', 名: '两段', 范围: ['甲', '乙'], 记录: 记录() });
    expect(视频信息(成片).帧数).toBe(213);
    expect(manifest.总帧数).toBe(213);
    expect(manifest.段.map((s) => [s.键, s.帧数, s.全片起帧])).toEqual([
      ['甲', 120, 0],
      ['乙', 93, 120],
    ]);
    const 表 = fs.readFileSync(path.join(dir, '拼接表.tsv'), 'utf8').trim().split('\n').slice(1).map((l) => l.split('\t'));
    expect(表.map((r) => [r[1], r[4], r[5]])).toEqual([
      ['甲', '120', '0'],
      ['乙', '93', '120'],
    ]);
    const 音长 = Number(spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=duration', '-of', 'csv=p=0', 成片], { encoding: 'utf8' }).stdout.trim());
    expect(Math.abs(音长 - 213 / 60)).toBeLessThan(0.03);
    expect(Math.abs(manifest.响度.成片LUFS - -16)).toBeLessThan(0.5);
    expect(manifest.响度.真峰值dBTP).toBeLessThanOrEqual(-1);
    expect(fs.existsSync(path.join(dir, '全片-未拉响度.flac'))).toBe(true);
    expect(fs.existsSync(path.join(dir, '_工作'))).toBe(false);
    expect(manifest.分享版).toBeNull();
  });

  it.skipIf(!有av1)('--分享版：另出 1080p60 AV1、2750 kbps，文件名带 -分享版1080p60，真峰值不超 −1 dBTP', async () => {
    const { dir, manifest } = await 拼成片(假.段们 as 段信息[], { 级别: '预览', 名: '分享', 范围: [], 分享版: true, 记录: 记录() });
    expect(manifest.文件.分享版).toBe('分享-分享版1080p60.mp4');
    const f = path.join(dir, manifest.文件.分享版!);
    expect(视频信息(f)).toMatchObject({ 宽: 1920, 高: 1080 });
    expect(manifest.分享版?.视频kbps).toBe(2750);
    expect(manifest.分享版?.真峰值dBTP).toBeLessThanOrEqual(-1);
  });
});
