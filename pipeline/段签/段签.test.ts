// 段签：从 ffmpeg 现造的小母版（有损 x264，和真母版一样有编码噪声）派生，查签名和 verify 逐位相同、FLAC 和 FFV1 无损、
// 重渲自查、扫段签 和 扫母版 结论一样、认可参考。数据根是临时目录，不碰真数据。
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const 数据根 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-段签测试-'));
process.env.ANIM_DATA = 数据根;

const { 配置, 认可参考文件 } = await import('../环境/配置.ts');
const { 跑出 } = await import('../环境/子进程.ts');
const { 灰度帧 } = await import('../合成/接缝.ts');
const { 出段签, 读段签, 段签齐, 对得上母版, 声音路径, 抽样路径, 小图, 段签文件, 历史文件名 } = await import('./段签.ts');
const { 扫母版, 扫段签, 抽样里没有 } = await import('../验收/验收.ts');
const { 抽样流, 音频流, sha } = await import('../验收/帧流.ts');
const { 备参考 } = await import('../验收/参考.ts');
type 认可记录 = import('../验收/认可.ts').认可记录;

const 阈 = { 差像素门槛: 16, 差像素占比: 1e-3, 块均值容差: 1, 响度容差LU: 0.5, 起音容差帧: 1 };
const 目录 = path.join(数据根, '样例');

/** 2 秒 48 帧、64×36，声音比画面长一截且样本数不是整帧（FLAC 要原样保住） */
const 造 = (名: string, 视频滤镜 = 'null') => {
  const f = path.join(目录, 名);
  跑出([
    配置('ffmpeg'), '-v', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc2=size=64x36:rate=24:duration=2',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2.1234:sample_rate=48000',
    '-vf', 视频滤镜, '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le', '-ac', '2', f,
  ]);
  return f;
};
const pcm = async (f: string) => {
  const h = crypto.createHash('sha256');
  for await (const c of 音频流(f)) h.update(c);
  return h.digest('hex');
};
const 指纹 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

let 原 = '';
let 后半变 = '';
beforeAll(() => {
  fs.mkdirSync(目录, { recursive: true });
  原 = 造('原.mkv');
  后半变 = 造('后半变.mkv', "drawbox=x=0:y=0:w=32:h=18:color=red:t=fill:enable='gte(n,30)'");
});
afterAll(() => fs.rmSync(数据根, { recursive: true, force: true }));

const 认可 = async (母版: string, 指: string): Promise<认可记录> => ({
  段: '核对-段签', 指纹: 指, 平台: 'test', 渲染级别: '视频', 认可于: '2026-10-30T00:00:00Z', 提交: 'abc', 理由: '测试', 上一版指纹: null,
  ...(await 扫母版(母版)).签名,
});

describe('段签', () => {
  it('回填的签名和 verify（扫母版）算的逐位相同；FLAC 解回来 PCM 一样；抽样帧无损；首尾小图和母版的一样', async () => {
    const fp = 指纹('原');
    const { 签, 自查 } = await 出段签(原, { 段键: '核对-段签', 指纹: fp, 级别: '视频', 派生: '回填' });
    expect(自查).toBeNull();
    expect(签.签名).toEqual((await 扫母版(原)).签名);
    expect(读段签('核对-段签', fp)).toEqual(签);
    expect(段签齐(签)).toBe(true);
    expect(await 对得上母版(签, 原)).toBe(true);
    expect(await pcm(声音路径(签)!)).toBe(await pcm(原));
    expect(await pcm(声音路径(签)!)).toBe(签.签名.音频sha);
    expect(签.抽样.帧).toEqual([0, 24, 47]);
    const 哈希: string[] = [];
    for await (const rgb of 抽样流(抽样路径(签), 签.抽样.帧, 签.抽样.帧, 64, 36)) 哈希.push(sha(rgb));
    expect(哈希).toEqual(签.签名.帧.map((f) => f.哈希));
    expect(小图(签, '首帧').equals(灰度帧(原, 0))).toBe(true);
    expect(小图(签, '末帧').equals(灰度帧(原, 47))).toBe(true);
    expect(fs.readdirSync(path.dirname(签路径(签))).filter((n) => n.includes('写入中'))).toEqual([]);
  });

  it('抽样流只交要的帧；要没存的帧就报错', async () => {
    const 签 = 读段签('核对-段签', 指纹('原'))!;
    const 只要 = [];
    for await (const rgb of 抽样流(抽样路径(签), 签.抽样.帧, [24], 64, 36)) 只要.push(sha(rgb));
    expect(只要).toEqual([签.签名.帧[1]!.哈希]);
    await expect(async () => {
      for await (const _ of 抽样流(抽样路径(签), 签.抽样.帧, [12], 64, 36)) void _;
    }).rejects.toThrow(/没有原片第 12 帧/);
  });

  it('同一指纹重渲：画面一样字节不一样是容差内或同画面，画面变了是漂移；都记进 历史.jsonl', async () => {
    const fp = 指纹('重渲');
    const 母版 = path.join(目录, '重渲.mkv');
    fs.copyFileSync(原, 母版);
    await 出段签(母版, { 段键: '核对-重渲', 指纹: fp, 级别: '视频', 派生: '渲染' });
    // 只改容器元数据：字节变了、画面声音逐位一样
    跑出([配置('ffmpeg'), '-v', 'error', '-y', '-i', 原, '-c', 'copy', '-metadata', 'comment=重渲', 母版]);
    const a = await 出段签(母版, { 段键: '核对-重渲', 指纹: fp, 级别: '视频', 派生: '渲染' });
    expect(a.自查!.结论).toBe('同画面');
    fs.copyFileSync(后半变, 母版);
    const b = await 出段签(母版, { 段键: '核对-重渲', 指纹: fp, 级别: '视频', 派生: '渲染' });
    expect(b.自查!.结论).toBe('漂移');
    const 史 = fs.readFileSync(段签文件(b.签, 历史文件名), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(史.map((x) => x.结论)).toEqual([a.自查!.结论, '漂移']);
  });
});

describe('扫段签：和 扫母版 结论一样', () => {
  const 结论 = (r: Awaited<ReturnType<typeof 扫母版>>) => ({ 帧: r.帧结论, 音频: [r.音频结论, r.音频说明], 尺寸: r.尺寸变了, 比法: r.比法 });

  it('认可那版母版在（逐像素）、不在（块均值）、只有认可参考（逐像素）三种都和 扫母版 一样', async () => {
    const 认 = await 认可(原, 指纹('认可原'));
    const 新 = (await 出段签(后半变, { 段键: '核对-后半变', 指纹: 指纹('后半变'), 级别: '视频', 派生: '回填' })).签;
    const 来源 = { 签名: 新.签名, 抽样: 抽样路径(新) };
    const 母逐像素 = await 扫母版(后半变, { 认可: 认, 旧母版: 原, 阈值: 阈 });
    expect(母逐像素.帧结论.map((f) => f.结论)).toEqual(['一样', '容差内', '变了']); // 第 24 帧没改，有损编码的噪声在容差内
    expect(结论(await 扫段签(来源, { 认可: 认, 旧母版: 原, 阈值: 阈 }))).toEqual(结论(母逐像素));
    const 母块 = await 扫母版(后半变, { 认可: 认, 旧母版: null, 阈值: 阈 });
    expect(母块.比法).toBe('块均值');
    expect(结论(await 扫段签(来源, { 认可: 认, 旧母版: null, 阈值: 阈 }))).toEqual(结论(母块));

    const 参考 = 认可参考文件(认.段, 认.指纹, 'test');
    // 认可那版的段签不在，从认可母版抽
    expect(await 备参考(认, 原, 'test')).toBe('从认可母版');
    expect(await 备参考(认, 原, 'test')).toBe('已有');
    const 段参考 = await 扫段签(来源, { 认可: 认, 旧母版: null, 参考, 阈值: 阈 });
    expect(段参考.像素来源).toBe('认可参考');
    expect(结论(段参考)).toEqual(结论(母逐像素));
    expect(结论(await 扫母版(后半变, { 认可: 认, 旧母版: null, 参考, 阈值: 阈 }))).toEqual(结论(母逐像素));
  });

  it('认可记录的抽样间隔不一样：段签里没有要的帧，抛 抽样里没有（verify 退回解母版）', async () => {
    const 认 = { ...(await 认可(原, 指纹('间隔12'))), 间隔: 12 };
    const 新 = 读段签('核对-后半变', 指纹('后半变'))!;
    await expect(扫段签({ 签名: 新.签名, 抽样: 抽样路径(新) }, { 认可: 认, 阈值: 阈 })).rejects.toBeInstanceOf(抽样里没有);
  });

  it('认可参考：认可那版的段签对得上就克隆；认可记录的哈希对不上就不收、不留文件', async () => {
    const fp = 指纹('原');
    const 认 = await 认可(原, fp); // 和第一组派生的段签同一指纹、同一份母版
    expect(await 备参考(认, path.join(目录, '不在.mkv'), 'test')).toBe('从段签');
    const 坏 = { ...认, 指纹: 指纹('坏'), 帧: 认.帧.map((f, i) => (i === 1 ? { ...f, 哈希: '0'.repeat(64) } : f)) };
    expect(await 备参考(坏, 原, 'test')).toBe('对不上');
    expect(fs.existsSync(认可参考文件(坏.段, 坏.指纹, 'test'))).toBe(false);
    expect(fs.readdirSync(path.dirname(认可参考文件(坏.段, 坏.指纹, 'test'))).filter((n) => n.includes('写入中'))).toEqual([]);
    expect(await 备参考({ ...认, 指纹: 指纹('都不在') }, path.join(目录, '不在.mkv'), 'test')).toBe('没有来源');
  });
});

const 签路径 = (签: { 作品: string; 段: string; 指纹: string }) => 段签文件(签, '签.json');
