// 用 ffmpeg 现造的小母版（64×36、2 秒、带正弦音）测抽帧、签名、认可记录和比较；不碰数据根和真母版。
// 样例用无损 x264（qp 0）：有损编码时后面帧的改动会让前面没改的帧也差几个灰阶，那是真母版的噪声底，阈值另定。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { 配置 } from '../环境/配置.ts';
import { 跑出 } from '../环境/子进程.ts';
import { 比像素, 比块均值, 残差, 读阈值, type 阈值 } from './比较.ts';
import { 块均值, 抽样帧 } from './帧流.ts';
import { 读认可, 写认可, 认可文件, type 认可记录 } from './认可.ts';
import { 变了, 扫母版 } from './验收.ts';

const 阈: 阈值 = { 像素容差: 2, 差像素占比: 0.0005, 块均值容差: 1, 音频残差dBFS: -90 };
let 目录 = '';
const 造 = (名: string, 视频滤镜: string, 频率 = 440) => {
  const f = path.join(目录, 名);
  跑出([
    配置('ffmpeg'), '-v', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc2=size=64x36:rate=24:duration=2',
    '-f', 'lavfi', '-i', `sine=frequency=${频率}:duration=2:sample_rate=48000`,
    '-vf', 视频滤镜, '-c:v', 'libx264', '-qp', '0', '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le', f,
  ]);
  return f;
};
let 原 = '';
let 后半变 = '';
let 换声 = '';

beforeAll(() => {
  目录 = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-验收样例-'));
  原 = 造('原.mkv', 'null');
  后半变 = 造('后半变.mkv', "drawbox=x=0:y=0:w=32:h=18:color=red:t=fill:enable='gte(n,30)'");
  换声 = 造('换声.mkv', 'null', 880);
});
afterAll(() => fs.rmSync(目录, { recursive: true, force: true }));

const 认可 = async (母版: string): Promise<认可记录> => ({
  段: '核对-样例', 指纹: 'f'.repeat(64), 平台: 'test', 渲染级别: '视频', 认可于: '2026-10-21T00:00:00Z', 提交: 'abc', 理由: '测试', 上一版指纹: null,
  ...(await 扫母版(母版)).签名,
});

describe('sr verify', () => {
  it('抽样：首帧、每 24 帧、末帧', () => {
    expect(抽样帧(48)).toEqual([0, 24, 47]);
    expect(抽样帧(50)).toEqual([0, 24, 48, 49]);
    expect(抽样帧(1)).toEqual([0]);
    expect(() => 抽样帧(0)).toThrow();
  });

  it('签名可重复：同一母版扫两次一样；认可记录写出去读回来不变', async () => {
    const a = await 扫母版(原);
    const b = await 扫母版(原);
    expect(a.签名).toEqual(b.签名);
    expect(a.签名).toMatchObject({ 宽: 64, 高: 36, 帧数: 48, 间隔: 24 });
    expect(a.签名.帧.map((f) => f.帧)).toEqual([0, 24, 47]);
    expect(a.签名.帧[0]!.块均值).toHaveLength(9);
    expect(a.签名.音频sha).toMatch(/^[0-9a-f]{64}$/);
    const r = await 认可(原);
    const file = 认可文件('核对-样例', 'test', 目录);
    写认可(file, r);
    expect(file).toBe(path.join(目录, 'verify', 'accepted', 'test', '核对-样例.toml'));
    expect(读认可(file)).toEqual(r);
  });

  it('合规样例放行：和认可版一模一样', async () => {
    const r = await 扫母版(原, { 认可: await 认可(原), 旧母版: 原, 阈值: 阈 });
    expect(r.帧结论.map((f) => f.结论)).toEqual(['一样', '一样', '一样']);
    expect(r.音频结论).toBe('一样');
    expect(变了(r)).toBe(false);
  });

  it('画面变了被拦：有旧母版逐像素比，没有就比块均值；变了的帧写进预览', async () => {
    const 认 = await 认可(原);
    const 预览 = fs.mkdtempSync(path.join(目录, '预览-'));
    const 逐像素 = await 扫母版(后半变, { 认可: 认, 旧母版: 原, 阈值: 阈, 预览: { 目录: 预览, 前缀: '核对-样例' } });
    expect(逐像素.比法).toBe('逐像素');
    expect(逐像素.帧结论.map((f) => f.结论)).toEqual(['一样', '一样', '变了']);
    expect(逐像素.音频结论).toBe('一样');
    expect(变了(逐像素)).toBe(true);
    expect(fs.readdirSync(预览).sort()).toEqual(['核对-样例-第0047帧-现在.png', '核对-样例-第0047帧-认可.png']);

    const 块 = await 扫母版(后半变, { 认可: 认, 旧母版: path.join(目录, '不在.mkv'), 阈值: 阈 });
    expect(块.比法).toBe('块均值');
    expect(块.帧结论[2]).toMatchObject({ 结论: '变了', 说明: expect.stringMatching(/只比了块均值/) });
  });

  it('声音变了被拦：有旧母版算残差，没有只能比 sha', async () => {
    const 认 = await 认可(原);
    const r = await 扫母版(换声, { 认可: 认, 旧母版: 原, 阈值: 阈 });
    expect(r.帧结论.every((f) => f.结论 === '一样')).toBe(true);
    expect(r.音频结论).toBe('变了');
    expect(r.音频说明).toMatch(/残差 -?\d+\.\d dBFS/);
    expect((await 扫母版(换声, { 认可: 认, 阈值: 阈 })).音频说明).toMatch(/算不了残差/);
  });

  it('帧数尺寸不一样直接算变了', async () => {
    const 认 = { ...(await 认可(原)), 帧数: 49 };
    const r = await 扫母版(原, { 认可: 认, 旧母版: 原, 阈值: 阈 });
    expect(r.尺寸变了).toMatch(/认可的是 64×36 49 帧，现在是 64×36 48 帧/);
    expect(变了(r)).toBe(true);
  });

  it('比较函数和阈值文件', () => {
    const a = Buffer.alloc(30, 100);
    const b = Buffer.from(a);
    b[0] = 103;
    expect(比像素(a, b, 2)).toEqual({ 差像素占比: 0.1, 最大差: 3 });
    expect(比像素(a, b, 3).差像素占比).toBe(0);
    expect(比块均值(块均值(Buffer.alloc(16 * 9 * 3, 10), 16, 9), 块均值(Buffer.alloc(16 * 9 * 3, 12), 16, 9))).toBe(2);
    const r = new 残差();
    const x = Buffer.alloc(4);
    const y = Buffer.alloc(4);
    r.加(x, y);
    expect(r.dBFS).toBe(-Infinity);
    y.writeInt16LE(32767, 0);
    r.加(x, y);
    expect(r.dBFS).toBeGreaterThan(-10);
    expect(读阈值()).toMatchObject({ 像素容差: expect.any(Number), 音频残差dBFS: expect.any(Number) });
  });
});
