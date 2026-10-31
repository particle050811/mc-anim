// anim film 的多段拼接：两段小母版（48 帧、37 帧，声音都比画面长）接成一条，查总帧数、拼接表、manifest、声音按样本截；
// 再查透明叠层叠在对的帧和位置、接缝首帧重复只报警不丢帧、分享版。
// 母版、叠层用 ffmpeg 现造在临时数据根里，指纹按键现编（算指纹要打包画面闭包，这里不测它）。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { 段信息 } from '../清单/清单.ts';
import type { 运行记录 } from '../运行记录/记录.ts';

// 配置读得懒，在下面动态 import 之前设好数据根就行
const 数据根 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-成片测试-'));
process.env.ANIM_DATA = 数据根;

const 指纹 = (键: string) => crypto.createHash('sha256').update(键).digest('hex');
// 只有主检出才删 CRF1：测试在 worktree 里跑也按主检出算
vi.mock('../环境/路径.ts', async (原) => ({ ...(await 原<typeof import('../环境/路径.ts')>()), 在主检出: () => true }));
vi.mock('../指纹/指纹.ts', () => {
  const 叠层键 = (段键: string, l: { 名: string }) => `${段键}-${l.名}`;
  const 算段指纹 = async (s: { 键: string }, _: unknown, l?: { 名: string }) => ({ 段: l ? 叠层键(s.键, l) : s.键, 指纹: 指纹(l ? 叠层键(s.键, l) : s.键), 项: {} });
  const 算全部段指纹 = (任务: { 段: { 键: string }; 渲染设置: unknown; 叠层?: { 名: string } }[]) => Promise.all(任务.map((t) => 算段指纹(t.段, t.渲染设置, t.叠层)));
  return { 叠层键, 算段指纹, 算全部段指纹 };
});

// 派生段签要过放行闸：测试不碰真的锁目录
vi.mock('../闸/闸.ts', async (原) => ({ ...(await 原<typeof import('../闸/闸.ts')>()), 懒放行闸: () => async () => {}, 过放行闸: <T>(fn: () => Promise<T>) => fn(), 过渲染闸: <T>(fn: () => Promise<T>) => fn() }));

const { 合成成片 } = await import('./成片.ts');
const { 做剪辑画面 } = await import('../适配器/剪映/剪辑包.ts');
const { 读交付manifest, 未拉响度文件, 剪辑画面文件 } = await import('./交付.ts');
const { 读段签, 声音路径 } = await import('../段签/段签.ts');
const { 音频流 } = await import('../验收/帧流.ts');
const { 原母版路径, 压缩名, 压缩母版路径, 叠层路径, 指纹文件 } = await import('../渲/母版.ts');
const { 文件sha } = await import('../段签/段签.ts');
const { 视频信息 } = await import('../渲/探测.ts');
const { 代码根 } = await import('../环境/路径.ts');

const 有ffmpeg = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;

const 段 = (键: string, 帧数: number, fps = 24, 叠层?: { 名: string; 入口: string }[]): 段信息 =>
  ({
    键,
    章: 0,
    编号: null,
    段名: 键,
    目录: path.join(代码根(), '作品', '应力转动', '核对', 键),
    画面: path.join(代码根(), '作品', '应力转动', '核对', 键, '画面.tsx'),
    段文件: path.join(代码根(), '作品', '应力转动', '核对', 键, '段.ts'),
    段: { 场: '测试', 帧数, fps, 宽: 320, 高: 180, 地形: [], 叠层 },
  }) as unknown as 段信息;

/** film 用完 CRF1 就转存 CRF12、删 CRF1：比对、造别的段要 CRF1 的读这份 */
const 留底 = (键: string) => path.join(数据根, '留底', `${键}.mkv`);

/** 母版：testsrc2 画面 帧数 帧，正弦音比画面长 0.5 秒（成片要按样本截掉多的） */
const 造母版 = (键: string, 帧数: number, 频率: number) => {
  const f = 原母版路径(键, 指纹(键));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const r = spawnSync('ffmpeg', [
    '-v', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=24',
    '-f', 'lavfi', '-t', String(帧数 / 24 + 0.5), '-i', `sine=frequency=${频率}:sample_rate=48000`,
    '-frames:v', String(帧数), '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le', '-ac', '2', f,
  ]);
  if (r.status !== 0) throw new Error(String(r.stderr));
  fs.mkdirSync(path.dirname(留底(键)), { recursive: true });
  fs.copyFileSync(f, 留底(键));
};

/** 母版 丁：从 甲 的最后一帧起截 10 帧（画面、声音都和 甲 末帧一样），造一个首帧重复的接缝 */
const 造重复母版 = () => {
  const f = 原母版路径('丁', 指纹('丁'));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const r = spawnSync('ffmpeg', [
    '-v', 'error', '-y', '-i', 留底('甲'),
    '-vf', 'trim=start_frame=47,setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop=9', '-af', 'atrim=start_sample=94000,asetpts=PTS-STARTPTS', '-frames:v', '10',
    '-c:v', 'libx264', '-crf', '0', '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le', f,
  ]);
  if (r.status !== 0) throw new Error(String(r.stderr));
};

/** 叠层：1280×720 透明底，左上角 (100, 50) 一块 200×100 的纯红，帧数 帧（ProRes 4444 带透明，同 anim render 出的） */
const 盒 = 'between(X,100,299)*between(Y,50,149)';
const 造叠层 = (键: string, 帧数: number) => {
  const f = 叠层路径(键, 指纹(键));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const r = spawnSync('ffmpeg', [
    '-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=black:size=1280x720:rate=24,format=rgba,geq=r='${盒}*255':g=0:b=0:a='${盒}*255'`,
    '-frames:v', String(帧数), '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', f,
  ]);
  if (r.status !== 0) throw new Error(String(r.stderr));
};

/** 逐帧解码后的 md5（-f framemd5），比两份视频画面是否逐位相同 */
const 帧md5 = (file: string) =>
  spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:v:0', '-f', 'framemd5', '-'], { encoding: 'utf8' })
    .stdout.split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(',').at(-1)!.trim());

const pcm = async (file: string) => {
  const h = crypto.createHash('sha256');
  for await (const c of 音频流(file)) h.update(c);
  return h.digest('hex');
};

/** 成片第 n 帧 (x, y) 的 RGB */
const 取像素 = (file: string, n: number, x: number, y: number) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `select=eq(n\\,${n}),format=rgb24,crop=1:1:${x}:${y}`, '-vframes', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  return [...r.stdout];
};

const 记录 = () => {
  const 事件: string[] = [];
  return { 记: (_: string, m: string) => 事件.push(m), 产物: [] as string[], 事件 } as unknown as 运行记录;
};

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
    expect(fs.readFileSync(path.join(dir, '接缝.tsv'), 'utf8')).toBe('前\t后\t判断\n甲\t乙\t正常\n');
  });

  it('交付自足：manifest v2 记段签，存了未拉响度的 FLAC（PCM 和各段母版按样本截、接的一样），应力转动开了剪辑包就同一遍出画面', async () => {
    const { dir, manifest } = await 合成成片([段('甲', 48), 段('乙', 37)], { 级别: '预览', 名: '自足', 范围: [], 记录: 记录() });
    expect(manifest.版本).toBe(2);
    for (const s of manifest.段) {
      expect(s.段签).toMatch(/^段签\//);
      expect(s.字节sha).toMatch(/^[0-9a-f]{64}$/);
      expect('母版' in s).toBe(false);
    }
    const 签甲 = 读段签('甲', 指纹('甲'))!;
    expect(await pcm(声音路径(签甲)!)).toBe(await pcm(留底('甲')));
    // 未拉响度 = 各段母版直接按样本截、接（原来 edit-package 的做法）
    const 对照 = path.join(dir, '对照.wav');
    const r = spawnSync('ffmpeg', [
      '-v', 'error', '-y', '-i', 留底('甲'), '-i', 留底('乙'), '-filter_complex',
      '[0:a]atrim=end_sample=96000,asetpts=PTS-STARTPTS[a];[1:a]atrim=end_sample=74000,asetpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=0:a=1[o]', '-map', '[o]', '-c:a', 'pcm_s16le', 对照,
    ]);
    expect(r.status).toBe(0);
    expect(await pcm(path.join(dir, 未拉响度文件))).toBe(await pcm(对照));
    expect(manifest.文件.未拉响度).toBe(未拉响度文件);
    expect(manifest.文件.剪辑画面).toBe('剪辑包/画面.mp4');
    expect(视频信息(path.join(dir, 剪辑画面文件))).toMatchObject({ 帧数: 85, 宽: 2560, 高: 1440 });
    // 读回来：v2 的原母版路径按作品、段键、指纹现算
    const m = 读交付manifest(dir);
    expect(m.段.map((s) => s.母版)).toEqual([原母版路径('甲', 指纹('甲')), 原母版路径('乙', 指纹('乙'))]);
  });

  it('透明叠层叠在本段对应的帧和位置上，比段短就只叠前面几帧，别的段不受影响', async () => {
    造叠层('甲-层', 30);
    const 甲 = 段('甲', 48, 24, [{ 名: '层', 入口: '叠层.tsx' }]);
    const { 成片, manifest } = await 合成成片([段('乙', 37), 甲], { 级别: '预览', 名: '叠层', 范围: [], 记录: 记录() });
    expect(视频信息(成片).帧数).toBe(85);
    expect(manifest.叠层.map((l) => [l.键, l.全片起帧, l.过期])).toEqual([['甲-层', 37, false]]);
    const 红 = (p: number[]) => p[0]! > 200 && p[1]! < 60 && p[2]! < 60;
    expect(红(取像素(成片, 37 + 5, 200, 100))).toBe(true);
    expect(红(取像素(成片, 37 + 29, 200, 100))).toBe(true);
    expect(红(取像素(成片, 37 + 30, 200, 100))).toBe(false);
    expect(红(取像素(成片, 20, 200, 100))).toBe(false);
    expect(红(取像素(成片, 37 + 5, 400, 300))).toBe(false);
  });

  it('film split 出的剪辑包画面和 edit-package 从母版现做的逐帧相同（叠了段叠层、不带字幕）', async () => {
    造叠层('甲-层', 30);
    const 甲 = 段('甲', 48, 24, [{ 名: '层', 入口: '叠层.tsx' }]);
    const { dir } = await 合成成片([段('乙', 37), 甲], { 级别: '预览', 名: '剪辑画面', 范围: [], 记录: 记录() });
    const 现做 = path.join(dir, '现做.mp4');
    const m = 读交付manifest(dir);
    await 做剪辑画面({ ...m, 段: m.段.map((x) => ({ ...x, 母版: 压缩名(x.母版) })) }, 现做);
    const a = 帧md5(path.join(dir, 剪辑画面文件));
    expect(a).toHaveLength(85);
    expect(a).toEqual(帧md5(现做));
  });

  it('只有 CRF1 的旧母版：film 先转存，画面读 CRF12，manifest 记 CRF12 的字节 sha 和存法，同一指纹再出一次字节 sha 不变', async () => {
    造母版('庚', 24, 880);
    const 原 = 原母版路径('庚', 指纹('庚'));
    expect(fs.existsSync(原)).toBe(true);
    const { manifest } = await 合成成片([段('庚', 24)], { 级别: '预览', 名: '转存', 范围: [], 记录: 记录() });
    const 压 = 压缩母版路径('庚', 指纹('庚'));
    expect(fs.existsSync(压)).toBe(true);
    expect(fs.existsSync(原)).toBe(false);
    expect(manifest.段[0]).toMatchObject({ 字节sha: await 文件sha(压), 存法: 'x264-crf12-veryfast-t4' });
    const 再 = await 合成成片([段('庚', 24)], { 级别: '预览', 名: '转存再出', 范围: [], 记录: 记录() });
    expect(再.manifest.段[0]!.字节sha).toBe(manifest.段[0]!.字节sha);
  });

  it('叠层没渲（指纹对不上）就拒绝，--不叠层 跳过', async () => {
    const 甲 = 段('甲', 48, 24, [{ 名: '没渲', 入口: '叠层.tsx' }]);
    await expect(合成成片([甲], { 级别: '预览', 名: '缺叠层', 范围: [], 记录: 记录() })).rejects.toThrow(/叠层 甲-没渲 没有当前指纹/);
    const { manifest } = await 合成成片([甲], { 级别: '预览', 名: '不叠层', 范围: [], 不叠层: true, 记录: 记录() });
    expect(manifest.叠层).toEqual([]);
  });

  it('接缝：后一段首帧和前一段末帧画面声音都一样，只报警，两帧都留', async () => {
    造重复母版();
    const r = 记录();
    const { dir, 成片, manifest } = await 合成成片([段('甲', 48), 段('丁', 10)], { 级别: '预览', 名: '接缝', 范围: [], 记录: r });
    expect(视频信息(成片).帧数).toBe(58);
    expect(manifest.接缝.首帧重复).toEqual(['甲 → 丁']);
    expect(fs.readFileSync(path.join(dir, '接缝.tsv'), 'utf8')).toContain('甲\t丁\t首帧重复');
    expect((r.事件 as unknown as string[]).some((m) => m.includes('甲 → 丁'))).toBe(true);
  });

  it('分享版：720p、50 MB 以内', async () => {
    const { dir, manifest } = await 合成成片([段('甲', 48), 段('乙', 37)], { 级别: '预览', 名: '分享', 范围: [], 分享版: true, 记录: 记录() });
    const f = path.join(dir, manifest.文件.分享版!);
    expect(视频信息(f)).toMatchObject({ 帧数: 85, 宽: 1280, 高: 720 });
    expect(fs.statSync(f).size).toBeLessThanOrEqual(50e6);
    expect(manifest.分享版?.视频kbps).toBe(760);
    expect(manifest.分享版?.真峰值dBTP).toBeTypeOf('number');
  });

  it('--允许过期 只取同一渲染级别的旧母版：视频级成片不接预览级母版', async () => {
    // 戊 的当前指纹（mock 成 sha(键)）没渲；只有一份预览级的旧母版
    const 旧 = 指纹('戊-旧');
    const 母 = 原母版路径('戊', 旧);
    fs.mkdirSync(path.dirname(母), { recursive: true });
    fs.copyFileSync(留底('甲'), 母);
    fs.writeFileSync(指纹文件('戊', 旧), JSON.stringify({ 段: '戊', 指纹: 旧, 项: { 渲染设置: { inputProps: { 级别: '预览' } } } }));
    await expect(合成成片([段('戊', 48)], { 级别: '视频', 名: '视频接预览', 范围: [], 允许过期: true, 记录: 记录() })).rejects.toThrow(/连视频级的旧母版也没有（只有预览级的/);
    const { manifest } = await 合成成片([段('戊', 48)], { 级别: '预览', 名: '预览接预览', 范围: [], 允许过期: true, 记录: 记录() });
    expect(manifest.段.map((x) => [x.键, x.指纹, x.过期])).toEqual([['戊', 旧, true]]);
  });

  it('帧率不一样、母版帧数和段.ts 对不上都拒绝', async () => {
    await expect(合成成片([段('甲', 48), 段('乙', 37, 1)], { 级别: '预览', 名: '帧率', 范围: [], 记录: 记录() })).rejects.toThrow(/各段帧率不一样/);
    await expect(合成成片([段('甲', 49)], { 级别: '预览', 名: '帧数', 范围: [], 记录: 记录() })).rejects.toThrow(/母版 48 帧，段.ts 写的是 49 帧/);
  });
});
