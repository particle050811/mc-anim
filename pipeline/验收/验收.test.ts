// 用 ffmpeg 现造的小母版（64×36、2 秒、带正弦音）测抽帧、签名、认可记录、和认可版或基线比，还有 YUV 换 RGB、块平均差、并排图；不碰数据根和真母版。
// 样例用无损 x264（qp 0）：有损编码时后面帧的改动会让前面没改的帧也差几个灰阶，那是真母版的噪声底，阈值另定。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { 配置 } from '../环境/配置.ts';
import { 跑出 } from '../环境/子进程.ts';
import { decode, encode } from 'fast-png';
import { 包络, 找起音, 比块均值, 比起音, 读阈值, 起音串, 解起音串, 转rgb, 算块差, 判块差, 要看的块, 并排, 块边, type 阈值 } from './比较.ts';
import { 基线参照 } from './基线.ts';
import { 帧流, 读流, 块均值, 抽样帧, 选帧批次, 选帧表达式, 每批帧数 } from './帧流.ts';
import { 读认可, 写认可, 认可文件, type 认可记录 } from './认可.ts';
import { 变了, 扫母版 } from './验收.ts';

const 阈: 阈值 = { 块8门槛: 24, 块16门槛: 10, 块64门槛: 4, 看一眼门槛: 6, 块均值容差: 1, 响度容差LU: 0.5, 起音容差帧: 1 };
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
  目录 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-验收样例-'));
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

describe('anim verify', () => {
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
    expect(file).toBe(path.join(目录, '认可', 'test', '核对-样例.toml'));
    expect(读认可(file)).toEqual(r);
  });

  it('合规样例放行：和认可版一模一样', async () => {
    const r = await 扫母版(原, { 认可: await 认可(原), 旧母版: 原, 阈值: 阈 });
    expect(r.帧结论.map((f) => f.结论)).toEqual(['一样', '一样', '一样']);
    expect(r.音频结论).toBe('一样');
    expect(变了(r)).toBe(false);
  });

  it('画面变了被拦：有旧母版比块平均差，没有就比块均值；变了的帧写 旧|新|差 并排图进预览', async () => {
    const 认 = await 认可(原);
    const 预览 = fs.mkdtempSync(path.join(目录, '预览-'));
    const 块差 = await 扫母版(后半变, { 认可: 认, 旧母版: 原, 阈值: 阈, 预览: { 目录: () => 预览, 前缀: '核对-样例' } });
    expect(块差.比法).toBe('块差');
    expect(块差.帧结论.map((f) => f.结论)).toEqual(['一样', '一样', '变了']);
    expect(块差.帧结论[2]!.说明).toMatch(/块平均差 16×16 \d+\.\d（门槛 10）/);
    expect(块差.音频结论).toBe('一样');
    expect(变了(块差)).toBe(true);
    expect(fs.readdirSync(预览).sort()).toEqual(['核对-样例-第0047帧-变了-认可-现在-差.png']);
    const 图 = decode(fs.readFileSync(path.join(预览, '核对-样例-第0047帧-变了-认可-现在-差.png')));
    expect([图.width, 图.height]).toEqual([64 * 3, 36 * 2]);

    const 块 = await 扫母版(后半变, { 认可: 认, 旧母版: path.join(目录, '不在.mkv'), 阈值: 阈 });
    expect(块.比法).toBe('块均值');
    expect(块.帧结论[2]).toMatchObject({ 结论: '变了', 说明: expect.stringMatching(/只比了块均值/) });
  });

  it('只差四个像素的小点在容差内（块平均差小），不出图；8×8 门槛压低就拦', async () => {
    const 预览 = fs.mkdtempSync(path.join(目录, '预览-'));
    const r = await 扫母版(小点, { 认可: await 认可(原), 旧母版: 原, 阈值: 阈, 预览: { 目录: () => 预览, 前缀: '核对-小点' } });
    expect(r.帧结论[2]).toMatchObject({ 结论: '容差内', 说明: expect.stringMatching(/块平均差/) });
    expect(r.帧结论[2]!.看一眼).toBeUndefined();
    expect(变了(r)).toBe(false);
    expect(fs.readdirSync(预览)).toEqual([]);
    expect((await 扫母版(小点, { 认可: await 认可(原), 旧母版: 原, 阈值: { ...阈, 块8门槛: 0.5 } })).帧结论[2]!.结论).toBe('变了');
  });

  it('16×16 在看一眼门槛和块16门槛之间：不判失败，出「看一眼」并排图', async () => {
    const 预览 = fs.mkdtempSync(path.join(目录, '预览-'));
    const 宽松 = { ...阈, 块8门槛: 1e4, 块16门槛: 1e4, 块64门槛: 1e4, 看一眼门槛: 1 };
    const r = await 扫母版(后半变, { 认可: await 认可(原), 旧母版: 原, 阈值: 宽松, 预览: { 目录: () => 预览, 前缀: '核对-样例' } });
    expect(r.帧结论[2]).toMatchObject({ 结论: '容差内', 看一眼: true });
    expect(变了(r)).toBe(false);
    expect(fs.readdirSync(预览)).toEqual(['核对-样例-第0047帧-看一眼-认可-现在-差.png']);
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

  it('和基线比：基线 PNG 比块平均差（新这一版也用 ffmpeg rgb24）、基线 wav 比声音，帧号照 段.json', async () => {
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
    expect(同.比法).toBe('块差');
    const 异 = await 扫母版(后半变, { 参照: await 基线参照(基), 阈值: 阈 });
    expect(异.帧结论.map((f) => f.结论)).toEqual(['一样', '一样', '一样', '变了']); // 红框从第 30 帧起
    const 少帧 = { ...(await 基线参照(基)), 帧数: 49 };
    expect((await 扫母版(原, { 参照: 少帧, 阈值: 阈 })).尺寸变了).toMatch(/基线的是 64×36 49 帧/);
  });

  it('抽一百多帧只起一个 ffmpeg：帧号、字节和整段解一遍取到的一样；中间的帧、跳着抽也对', async () => {
    const 长 = path.join(目录, '长.mkv');
    跑出([配置('ffmpeg'), '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=64x36:rate=24:duration=8', '-c:v', 'libx264', '-qp', '0', '-pix_fmt', 'yuv420p', 长]);
    const 全部: Buffer[] = [];
    for await (const rgb of 读流([配置('ffmpeg'), '-v', 'error', '-nostdin', '-i', 长, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], 64 * 36 * 3)) 全部.push(Buffer.from(rgb));
    expect(全部.length).toBe(192);
    const 跳着 = 全部.map((_, f) => f).filter((f) => f % 7 === 0 || f % 11 === 3 || f === 100);
    const 前半 = 跳着.filter((f) => f < 96);
    for (const 帧们 of [全部.map((_, f) => f), 跳着, 前半, [0], [191], [90, 91]]) {
      expect(选帧批次(帧们).length).toBe(1);
      const 出: Buffer[] = [];
      for await (const rgb of 帧流(长, 帧们, 64, 36)) 出.push(Buffer.from(rgb));
      expect(出.length).toBe(帧们.length);
      帧们.forEach((f, i) => expect(出[i]!.equals(全部[f]!), `第 ${f} 帧`).toBe(true));
    }
    const 没有的帧: Buffer[] = [];
    for await (const rgb of 帧流(长, [190, 191, 192], 64, 36)) 没有的帧.push(Buffer.from(rgb));
    expect(没有的帧.length).toBe(2); // 调用方（扫母版）按帧号要，少了报「抽不出」
  });

  it('超过一批的上限才多起一个 ffmpeg：跨批的帧照样按序，整批帧数的表达式 ffmpeg 收得下、长度不超过 Windows 命令行上限', async () => {
    const 帧们 = Array.from({ length: 每批帧数 + 3 }, (_, f) => f);
    expect(选帧批次(帧们).map((批) => 批.length)).toEqual([每批帧数, 3]);
    const 大号帧 = 帧们.slice(0, 每批帧数).map((f) => f + 100000);
    expect(选帧表达式(大号帧).length).toBeLessThan(32000);
    const 长 = path.join(目录, '超长.mkv');
    跑出([配置('ffmpeg'), '-v', 'error', '-y', '-f', 'lavfi', '-i', `testsrc2=size=16x16:rate=24:duration=${(每批帧数 + 3) / 24}`, '-c:v', 'libx264', '-qp', '0', '-pix_fmt', 'yuv420p', 长]);
    const 全部: Buffer[] = [];
    for await (const rgb of 读流([配置('ffmpeg'), '-v', 'error', '-nostdin', '-i', 长, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], 16 * 16 * 3)) 全部.push(Buffer.from(rgb));
    let i = 0;
    for await (const rgb of 帧流(长, 帧们, 16, 16)) expect(rgb.equals(全部[i++]!)).toBe(true);
    expect(i).toBe(每批帧数 + 3);
  }, 120_000);

  it('帧数尺寸不一样直接算变了', async () => {
    const 认 = { ...(await 认可(原)), 帧数: 49 };
    const r = await 扫母版(原, { 认可: 认, 旧母版: 原, 阈值: 阈 });
    expect(r.尺寸变了).toMatch(/认可的是 64×36 49 帧，现在是 64×36 48 帧/);
    expect(变了(r)).toBe(true);
  });

  it('比较函数和阈值文件', () => {
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
    expect(读阈值()).toEqual({ 块8门槛: 24, 块16门槛: 10, 块64门槛: 4, 看一眼门槛: 6, 块均值容差: 1, 响度容差LU: 0.5, 起音容差帧: 1 });
  });
});

describe('换算和块差', () => {
  /** 宽×高 的 yuv420p，Y、U、V 各给一个函数 */
  const yuv = (宽: number, 高: number, Y: (x: number, y: number) => number, U: (x: number, y: number) => number, V: (x: number, y: number) => number) => {
    const b = Buffer.alloc((宽 * 高 * 3) / 2);
    for (let y = 0; y < 高; y++) for (let x = 0; x < 宽; x++) b[y * 宽 + x] = Y(x, y);
    for (let y = 0; y < 高 / 2; y++) {
      for (let x = 0; x < 宽 / 2; x++) {
        b[宽 * 高 + y * (宽 / 2) + x] = U(x, y);
        b[宽 * 高 + (宽 * 高) / 4 + y * (宽 / 2) + x] = V(x, y);
      }
    }
    return b;
  };

  it('转rgb：BT.601 有限范围的黑、白、灰、红（手算 Q16），色度 2×2 共用', () => {
    const 像素 = (Y: number, U: number, V: number) => [...转rgb(yuv(2, 2, () => Y, () => U, () => V), 2, 2).subarray(0, 3)];
    expect(像素(16, 128, 128)).toEqual([0, 0, 0]);
    expect(像素(235, 128, 128)).toEqual([255, 255, 255]);
    expect(像素(126, 128, 128)).toEqual([128, 128, 128]);
    expect(像素(81, 90, 240)).toEqual([254, 0, 0]); // 1.164383×65 + 1.596027×112 = 254.4
    expect(像素(0, 0, 0)).toEqual([0, 136, 0]); // 越界截到 0～255
    // 色度：左边 2×2 用 U=128，右边 2×2 用 U=200（偏蓝）
    const rgb = 转rgb(yuv(4, 2, () => 126, (x) => (x === 0 ? 128 : 200), () => 128), 4, 2);
    for (const [x, y] of [[0, 0], [1, 1]]) expect(rgb[(y! * 4 + x!) * 3 + 2]).toBe(128);
    for (const [x, y] of [[2, 0], [3, 1]]) expect(rgb[(y! * 4 + x!) * 3 + 2]).toBeGreaterThan(200);
    expect(() => 转rgb(Buffer.alloc(6), 3, 2)).toThrow(/偶数/);
    expect(() => 转rgb(Buffer.alloc(5), 2, 2)).toThrow(/字节/);
  });

  it('转rgb 和 ffmpeg 解成 rgb24 只差一两级（swscale 各版本取整不一样，所以 verify 不用它）', async () => {
    const y: Buffer[] = [];
    const r: Buffer[] = [];
    for await (const f of 帧流(原, [0, 30], 64, 36, { 格式: 'yuv420p' })) y.push(Buffer.from(f));
    for await (const f of 帧流(原, [0, 30], 64, 36)) r.push(Buffer.from(f));
    for (const [i, f] of y.entries()) {
      const 换 = 转rgb(f, 64, 36);
      let 最大 = 0;
      for (let k = 0; k < 换.length; k++) 最大 = Math.max(最大, Math.abs(换[k]! - r[i]![k]!));
      expect(最大).toBeLessThanOrEqual(2);
    }
  });

  /** 照定义逐个窗口算，核 算块差 的积分图 */
  const 笨算 = (新: Buffer, 旧: Buffer, 宽: number, 高: number, w: number) => {
    let 最大 = 0;
    let 位 = [0, 0];
    for (let y0 = 0; y0 + w <= 高; y0 += 4) {
      for (let x0 = 0; x0 + w <= 宽; x0 += 4) {
        for (let c = 0; c < 3; c++) {
          let s = 0;
          for (let y = y0; y < y0 + w; y++) for (let x = x0; x < x0 + w; x++) s += 新[(y * 宽 + x) * 3 + c]! - 旧[(y * 宽 + x) * 3 + c]!;
          if (Math.abs(s) / (w * w) > 最大) [最大, 位] = [Math.abs(s) / (w * w), [x0, y0]];
        }
      }
    }
    return { 差: 最大, x: 位[0]!, y: 位[1]! };
  };

  it('算块差和逐窗口笨算一样（窗口在 4 像素网格上；正负差在窗口里抵消；比窗口小的画面是 0）', () => {
    let 种 = 7;
    const 随 = () => ((种 = (种 * 1103515245 + 12345) & 0x7fffffff) >> 16) & 255;
    const [宽, 高] = [134, 74]; // 不是 4 的倍数：右边、下边不满一格的像素不进窗口
    const 旧 = Buffer.alloc(宽 * 高 * 3);
    for (let i = 0; i < 旧.length; i++) 旧[i] = 随();
    const 新 = Buffer.from(旧);
    for (let i = 0; i < 新.length; i++) 新[i] = Math.max(0, Math.min(255, 新[i]! + (随() % 9) - 4));
    for (let y = 30; y < 50; y++) for (let x = 70; x < 90; x++) 新[(y * 宽 + x) * 3 + 1] = Math.min(255, 旧[(y * 宽 + x) * 3 + 1]! + 40);
    const d = 算块差(新, 旧, 宽, 高);
    for (const w of 块边) {
      const 笨 = 笨算(新, 旧, 宽, 高, w);
      expect(d[w].差).toBeCloseTo(笨.差, 9);
      expect([d[w].x, d[w].y]).toEqual([笨.x, 笨.y]);
    }
    expect(d[16].差).toBeGreaterThan(20);
    // 棋盘格 ±50：单个像素差很大，块平均是 0
    const 灰 = Buffer.alloc(旧.length, 128);
    const 棋盘 = Buffer.from(灰.map((_, i) => (Math.floor(i / 3) + Math.floor(i / 3 / 宽)) % 2 ? 78 : 178));
    expect(算块差(棋盘, 灰, 宽, 高)[16].差).toBe(0);
    expect(算块差(Buffer.alloc(32 * 18 * 3, 9), Buffer.alloc(32 * 18 * 3), 32, 18)).toMatchObject({ 8: { 差: 9 }, 16: { 差: 9 }, 64: { 差: 0 } });
    expect(() => 算块差(Buffer.alloc(3), Buffer.alloc(6), 1, 1)).toThrow();
  });

  it('判块差：三档门槛任一条超就变了，16×16 在看一眼门槛和块16门槛之间看一眼；要看的块挑超得最多的那档', () => {
    const d = (a: number, b: number, c: number) => ({ 8: { 差: a, x: 0, y: 0 }, 16: { 差: b, x: 4, y: 4 }, 64: { 差: c, x: 8, y: 8 } });
    expect(判块差(d(16.8, 8.77, 2.5), 阈)).toBe('看一眼'); // 实测噪声最高的三个值（不在同一帧）
    expect(判块差(d(16.8, 5.9, 2.5), 阈)).toBe('容差内');
    expect(判块差(d(16.8, 6, 2.5), 阈)).toBe('容差内'); // 等于门槛不算超
    expect(判块差(d(10, 10, 4), 阈)).toBe('看一眼');
    expect(判块差(d(10, 10.01, 1), 阈)).toBe('变了');
    expect(判块差(d(10, 3, 4.01), 阈)).toBe('变了');
    expect(判块差(d(24.01, 3, 1), 阈)).toBe('变了');
    expect(要看的块(d(10, 3, 1), 阈)).toBe(16);
    expect(要看的块(d(30, 11, 1), 阈)).toBe(8); // 30/24 > 11/10
    expect(要看的块(d(30, 11, 6), 阈)).toBe(64);
  });

  it('并排图：上排 旧|新|差，下排放大裁切；窗口外画红框', () => {
    const [宽, 高] = [96, 54];
    const 旧 = Buffer.alloc(宽 * 高 * 3, 100);
    const 新 = Buffer.from(旧);
    for (let y = 20; y < 36; y++) for (let x = 40; x < 56; x++) 新[(y * 宽 + x) * 3] = 140;
    const 图 = 并排(新, 旧, 宽, 高, { x: 40, y: 20, 边: 16 });
    expect(图.length).toBe(宽 * 3 * 高 * 2 * 3);
    const 取 = (x: number, y: number) => [...图.subarray((y * 宽 * 3 + x) * 3, (y * 宽 * 3 + x) * 3 + 3)];
    expect(取(45, 25)).toEqual([100, 100, 100]); // 旧
    expect(取(宽 + 45, 25)).toEqual([140, 100, 100]); // 新
    expect(取(宽 * 2 + 45, 25)).toEqual([160, 160, 160]); // 差 40×4
    expect(取(宽 * 2 + 10, 10)).toEqual([0, 0, 0]);
    expect(取(宽 + 37, 25)).toEqual([255, 0, 0]); // 框在窗口外 3 像素
  });
});
