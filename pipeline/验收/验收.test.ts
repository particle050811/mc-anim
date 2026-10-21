// 用 ffmpeg 现造的小母版（64×36、2 秒、带正弦音）测抽帧、签名、认可记录、和认可版或基线比；不碰数据根和真母版。
// 样例用无损 x264（qp 0）：有损编码时后面帧的改动会让前面没改的帧也差几个灰阶，那是真母版的噪声底，阈值另定。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { 配置 } from '../环境/配置.ts';
import { 跑出 } from '../环境/子进程.ts';
import { encode } from 'fast-png';
import { 包络, 找起音, 比像素, 比块均值, 比起音, 读阈值, 起音串, 解起音串, type 阈值 } from './比较.ts';
import { 基线参照 } from './基线.ts';
import { 帧流, 块均值, 抽样帧 } from './帧流.ts';
import { 读认可, 写认可, 认可文件, type 认可记录 } from './认可.ts';
import { 变了, 扫母版 } from './验收.ts';

const 阈: 阈值 = { 差像素门槛: 16, 差像素占比: 1e-3, 块均值容差: 1, 响度容差LU: 0.5, 起音容差帧: 1 };
let 目录 = '';
// 声音：静 0.5 秒后起一声 440 Hz（延后、音量可调），起音落在 0.5 秒 + 延后
const 造 = (名: string, 视频滤镜: string, 声: { 延后毫秒?: number; 音量dB?: number } = {}) => {
  const f = path.join(目录, 名);
  跑出([
    配置('ffmpeg'), '-v', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc2=size=64x36:rate=24:duration=2',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1.2:sample_rate=48000',
    '-vf', 视频滤镜, '-af', `volume=${声.音量dB ?? -6}dB,adelay=${500 + (声.延后毫秒 ?? 0)}:all=1,apad=whole_dur=2`,
    '-c:v', 'libx264', '-qp', '0', '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le', '-ac', '2', f,
  ]);
  return f;
};
let 原 = '';
let 后半变 = '';
let 小点 = '';
let 晚一帧内 = '';
let 晚很多 = '';
let 响了 = '';

beforeAll(() => {
  目录 = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-验收样例-'));
  原 = 造('原.mkv', 'null');
  后半变 = 造('后半变.mkv', "drawbox=x=0:y=0:w=32:h=18:color=red:t=fill:enable='gte(n,30)'");
  小点 = 造('小点.mkv', "drawbox=x=0:y=0:w=2:h=2:color=white:t=fill:enable='gte(n,30)'"); // 四个像素，占 4/2304
  晚一帧内 = 造('晚一帧内.mkv', 'null', { 延后毫秒: 30 });
  晚很多 = 造('晚很多.mkv', 'null', { 延后毫秒: 200 });
  响了 = 造('响了.mkv', 'null', { 音量dB: -3 });
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
    expect(a.签名.响度).toBeLessThan(-10);
    expect(a.签名.起音!.map((x) => x.秒)).toEqual([0.5]);
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

  it('画面变了被拦：有旧母版逐像素比，没有就比块均值；变了的帧写 旧|新|差 并排图进预览', async () => {
    const 认 = await 认可(原);
    const 预览 = fs.mkdtempSync(path.join(目录, '预览-'));
    const 逐像素 = await 扫母版(后半变, { 认可: 认, 旧母版: 原, 阈值: 阈, 预览: { 目录: () => 预览, 前缀: '核对-样例' } });
    expect(逐像素.比法).toBe('逐像素');
    expect(逐像素.帧结论.map((f) => f.结论)).toEqual(['一样', '一样', '变了']);
    expect(逐像素.音频结论).toBe('一样');
    expect(变了(逐像素)).toBe(true);
    expect(fs.readdirSync(预览).sort()).toEqual(['核对-样例-第0047帧-认可-现在-差.png']);

    const 块 = await 扫母版(后半变, { 认可: 认, 旧母版: path.join(目录, '不在.mkv'), 阈值: 阈 });
    expect(块.比法).toBe('块均值');
    expect(块.帧结论[2]).toMatchObject({ 结论: '变了', 说明: expect.stringMatching(/只比了块均值/) });
  });

  it('差像素占比在门槛内放行（只差四个像素）', async () => {
    const r = await 扫母版(小点, { 认可: await 认可(原), 旧母版: 原, 阈值: { ...阈, 差像素占比: 2e-3 } });
    expect(r.帧结论[2]).toMatchObject({ 结论: '容差内', 说明: expect.stringMatching(/最大差/) });
    expect(变了(r)).toBe(false);
    expect((await 扫母版(小点, { 认可: await 认可(原), 旧母版: 原, 阈值: 阈 })).帧结论[2]!.结论).toBe('变了');
  });

  it('声音比响度和起音：一帧内的挪动放行，挪多了、响了都拦；只靠认可记录（没有旧母版）也能比', async () => {
    const 认 = await 认可(原);
    const 近 = await 扫母版(晚一帧内, { 认可: 认, 阈值: 阈 });
    expect(近.帧结论.every((f) => f.结论 === '一样')).toBe(true);
    expect(近.音频结论).toBe('容差内');
    const 远 = await 扫母版(晚很多, { 认可: 认, 阈值: 阈 });
    expect(远.音频结论).toBe('变了');
    expect(远.音频说明).toMatch(/0\.5 秒起的声音，现在前后 1 帧内没有/);
    const 响 = await 扫母版(响了, { 认可: 认, 阈值: 阈 });
    expect(响.音频结论).toBe('变了');
    expect(响.音频说明).toMatch(/响度差 3\.\d+ LU/);
    // 早先的认可记录没有响度和起音：有旧母版从母版补，没有就比不了
    const 旧式 = { ...认, 响度: null, 起音: null };
    expect((await 扫母版(晚一帧内, { 认可: 旧式, 旧母版: 原, 阈值: 阈 })).音频结论).toBe('容差内');
    expect((await 扫母版(晚一帧内, { 认可: 旧式, 阈值: 阈 })).音频说明).toMatch(/比不了/);
  });

  it('和基线比：基线 PNG 逐像素、基线 wav 比声音，帧号照 段.json', async () => {
    const 基 = path.join(目录, '基线');
    fs.mkdirSync(path.join(基, '帧'), { recursive: true });
    const 帧们 = [0, 7, 24, 47];
    let i = 0;
    for await (const rgb of 帧流(原, 帧们, 64, 36)) {
      fs.writeFileSync(path.join(基, '帧', `${帧们[i]}.png`), encode({ width: 64, height: 36, data: new Uint8Array(rgb), channels: 3, depth: 8 }));
      i++;
    }
    跑出([配置('ffmpeg'), '-v', 'error', '-y', '-i', 原, '-map', '0:a:0', '-c:a', 'pcm_s16le', path.join(基, '音频.wav')]);
    fs.writeFileSync(path.join(基, '段.json'), JSON.stringify({ 段: '9-9-9', 帧数: 48, 帧: 帧们.map((f) => ({ 帧: f, 文件: `帧/${f}.png` })), 音频: { 文件: '音频.wav' } }));
    const 同 = await 扫母版(原, { 参照: await 基线参照(基), 阈值: 阈 });
    expect(同.帧结论.map((f) => [f.帧, f.结论])).toEqual(帧们.map((f) => [f, '一样']));
    expect(同.音频结论).toBe('一样');
    expect(同.比法).toBe('逐像素');
    const 异 = await 扫母版(后半变, { 参照: await 基线参照(基), 阈值: 阈 });
    expect(异.帧结论.map((f) => f.结论)).toEqual(['一样', '一样', '一样', '变了']); // 红框从第 30 帧起
    const 少帧 = { ...(await 基线参照(基)), 帧数: 49 };
    expect((await 扫母版(原, { 参照: 少帧, 阈值: 阈 })).尺寸变了).toMatch(/基线的是 64×36 49 帧/);
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
    // 起音：静 0.1 秒后一声方波，包络在 0.1 秒跳起；记录写成「秒@强度」读得回来
    const pcm = Buffer.alloc(48000 * 4 * 0.3);
    for (let n = 4800; n < 48000 * 0.3; n++) for (const ch of [0, 2]) pcm.writeInt16LE(n % 100 < 50 ? 8000 : -8000, n * 4 + ch);
    const 包 = new 包络();
    包.加(pcm.subarray(0, 1001));
    包.加(pcm.subarray(1001));
    const 起 = 找起音(包.完());
    expect(起.map((x) => x.秒)).toEqual([0.1]);
    expect(解起音串(起音串(起[0]!))).toEqual(起[0]);
    expect(比起音([{ 秒: 1.04, 强: 20 }], [{ 秒: 1, 强: 20 }], 1 / 24)).toEqual({ 旧有新没有: [], 新有旧没有: [] });
    expect(比起音([{ 秒: 1.1, 强: 20 }], [{ 秒: 1, 强: 20 }], 1 / 24)).toEqual({ 旧有新没有: [1], 新有旧没有: [1.1] });
    expect(比起音([{ 秒: 1.1, 强: 8 }], [], 1 / 24).新有旧没有).toEqual([]); // 弱起音只当对面的凭据，自己不要求对得上
    expect(读阈值()).toEqual({ 差像素门槛: 16, 差像素占比: 1e-3, 块均值容差: 1, 响度容差LU: 0.5, 起音容差帧: 1 });
  });
});
