// CRF12 转存（用户 10-30 定）：同一份 CRF1 转两次逐位相同（x264 版本、线程固定时）；文件自带存法标签；声音原样拷；断在中间 CRF1 还在；
// 只有 CRF1 的旧母版用的时候先转存。数据根是临时目录。
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const 数据根 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-转码测试-'));
process.env.ANIM_DATA = 数据根;
vi.mock('../闸/闸.ts', async (原) => ({ ...(await 原<typeof import('../闸/闸.ts')>()), 过渲染闸: <T>(fn: () => Promise<T>) => fn() }));

const { 转码, 转码视频参数, 存法标签, 是压缩母版, 读存法标签, 读x264版本 } = await import('./转码.ts');
const { 存成压缩, 备好母版 } = await import('./转存.ts');
const { 压缩母版路径, 原母版路径, 用过于 } = await import('./母版.ts');
const { 母版目录 } = await import('../环境/配置.ts');
const { 文件sha, 读段签 } = await import('../段签/段签.ts');
const { 音频流 } = await import('../验收/帧流.ts');

const 指纹 = (键: string) => crypto.createHash('sha256').update(键).digest('hex');
const 目录 = path.join(数据根, '样例');
const 造 = (f: string) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const r = spawnSync('ffmpeg', [
    '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=24:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2.1:sample_rate=48000',
    '-c:v', 'libx264', '-crf', '1', '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le', '-ac', '2', f,
  ]);
  if (r.status !== 0) throw new Error(String(r.stderr));
  return f;
};
const pcm = async (f: string) => {
  const h = crypto.createHash('sha256');
  for await (const c of 音频流(f)) h.update(c);
  return h.digest('hex');
};
const 有ffmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

describe.skipIf(!有ffmpeg)('转码', () => {
  let 原 = '';
  beforeAll(() => {
    原 = 造(path.join(目录, '原.mkv'));
  });
  afterAll(() => fs.rmSync(数据根, { recursive: true, force: true }));

  it('同一输入转两次逐位相同，线程数写死，文件带存法标签，声音 PCM 一样，变小', async () => {
    const a = path.join(目录, 'a.crf12.mkv');
    const b = path.join(目录, 'b.crf12.mkv');
    const 法 = await 转码(原, a);
    await 转码(原, b);
    expect(await 文件sha(a)).toBe(await 文件sha(b));
    expect(转码视频参数.join(' ')).toContain('-threads 4');
    expect(法.标签).toBe(存法标签);
    expect(法.x264).toBe(读x264版本(a));
    expect(法.x264).toMatch(/^x264 - core \d+/);
    expect(读存法标签(a)).toBe(存法标签);
    expect(读存法标签(原)).toBeNull();
    expect(await pcm(a)).toBe(await pcm(原));
    expect(fs.statSync(a).size).toBeLessThan(fs.statSync(原).size);
  });

  it('改过名的也认得出，不压第二代', async () => {
    const a = path.join(目录, 'a.crf12.mkv');
    const 改名 = path.join(目录, '改名.mkv');
    fs.copyFileSync(a, 改名);
    expect(是压缩母版(a)).toBe(true);
    expect(是压缩母版(改名)).toBe(true);
    expect(是压缩母版(原)).toBe(false);
    await expect(转码(改名, path.join(目录, 'c.crf12.mkv'))).rejects.toThrow(/已经是 CRF12/);
  });

  it('存成压缩：先派生段签，记下存法和转码前的样子；CRF1 不删；重跑同一份 CRF1 转出同样的字节、段签不变', async () => {
    const fp = 指纹('存');
    const 文件 = 造(原母版路径('存', fp));
    const r = await 存成压缩('存', fp, '视频');
    expect(r.文件).toBe(压缩母版路径('存', fp));
    expect(fs.existsSync(文件)).toBe(true);
    const 签 = 读段签('存', fp)!;
    expect(签.母版.存法!.标签).toBe(存法标签);
    expect(签.母版.字节sha).toBe(await 文件sha(r.文件));
    expect(签.母版.转码自!.字节sha).toBe(await 文件sha(文件));
    await 存成压缩('存', fp, '视频');
    const 再 = 读段签('存', fp)!;
    expect(再.母版.字节sha).toBe(签.母版.字节sha);
    expect(再.抽样.sha).toBe(签.抽样.sha);
  });

  it('转码断在中间：CRF1 在，CRF12 名字下没有半截文件', async () => {
    const fp = 指纹('断');
    const 文件 = 造(原母版路径('断', fp));
    // 改名那一步失败（CRF12 的名字被目录占着）
    fs.mkdirSync(压缩母版路径('断', fp));
    await expect(存成压缩('断', fp, '视频')).rejects.toThrow();
    fs.rmdirSync(压缩母版路径('断', fp));
    expect(fs.existsSync(文件)).toBe(true);
    expect(fs.readdirSync(path.dirname(文件)).filter((n) => n.includes('转码中'))).toEqual([]);
  });

  it('备好母版：只有 CRF1 的先转存再用，没人钉的 CRF1 删掉，记用过；已有 CRF12 不再转', async () => {
    const fp = 指纹('备');
    const 文件 = 造(原母版路径('备', fp));
    const 得 = await 备好母版('备', fp, '视频');
    expect(得).toBe(压缩母版路径('备', fp));
    expect(fs.existsSync(得!)).toBe(true);
    expect(用过于(母版目录('备'), fp)).not.toBeNull();
    const 字节 = fs.statSync(得!).mtimeMs;
    expect(await 备好母版('备', fp, '视频')).toBe(得);
    expect(fs.statSync(得!).mtimeMs).toBe(字节);
    expect(await 备好母版('备', 指纹('没有'), '视频')).toBeNull();
    // 记用过以前调的 删已取代：已被取代的 CRF1，这个键没有别的理由留就没了
    expect(fs.existsSync(文件)).toBe(false);
  });
});
