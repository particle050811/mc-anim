// 认指纹：抽哪几帧、哪些差异静帧证明不了、一帧怎么比（新 PNG 和有损压缩的切片：画面一样在噪声内，改了一块判不同）、
// 找旧版、登记沿用（克隆切片和 wav、照抄段签记 沿用；旧指纹的东西删了新指纹照用；cache gc 扫到的是这个指纹自己的切片）。
// 切片用 Remotion 自带的 ffmpeg 照真切片一样压（PNG 帧 → bt709 zscale → x264），放在临时数据根里，不碰真数据，不开浏览器。
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const 数据根 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-认指纹测试-'));
process.env.ANIM_DATA = 数据根;

const { 配置 } = await import('../环境/配置.ts');
const { 跑出, 跑出字节 } = await import('../环境/子进程.ts');
const { 读段签, 段签齐, 对得上母版, 对得上切片 } = await import('../段签/段签.ts');
const { 写指纹, 历史指纹 } = await import('../渲/母版.ts');
const { 段画面路径, 段声音路径, 配对声音指纹 } = await import('../渲/段产物.ts');
const { 跑自带ffmpeg } = await import('../渲/自带ffmpeg.ts');
const { 扫一键 } = await import('../缓存/钉.ts');
const { 抽帧, 静帧证明不了, 比一帧, 帧转yuv, 切片转yuv滤镜, 找旧版, 登记沿用, 新指纹已有, 旧帧们, 克隆 } = await import('./认指纹.ts');
type 段指纹 = import('./指纹.ts').段指纹;
type 指纹项 = import('./指纹.ts').指纹项;

const 作品 = '测试作品';
const 键 = '核对-认指纹';
const 阈 = { 块8门槛: 24, 块16门槛: 10, 块64门槛: 4, 看一眼门槛: 6 };
const 宽 = 128;
const 高 = 72;
const 目录 = path.join(数据根, '样例');
const 指纹 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const 放行 = async () => {};

const 项 = (o: Partial<指纹项> = {}): 指纹项 => ({
  代码: { 画面根: 'a', 段根: 'b', 设置根: 'c', 外壳根: 'd' },
  地形: {},
  渲染设置: { inputProps: { 级别: '视频', 输出fps: 60 }, codec: 'h264', crf: 18, scale: 3, gl: 'angle', 帧数: 48, fps: 60, 宽: 64, 高: 36 },
  依赖版本: { three: '0.186.1' },
  打包规则: { tsconfig: 't', 'pipeline/资产/webpack.ts': 'w', 'pipeline/资产/ogg解码.cjs': 'o' },
  平台: 'darwin-arm64',
  ...o,
});
const 段fp = (名: string, 代码 = 名): 段指纹 => ({ 段: 键, 指纹: 指纹(名), 算法: 'merkle-v1', 项: 项({ 代码: { 画面根: 代码, 段根: 'b', 设置根: 'c', 外壳根: 'd' } }), 明细: { 模块: {}, 资产: {} } });
/** 和 段产物 一样的一对：画面指纹、配的声音指纹（声音那遍只差渲染设置） */
const 产物 = (名: string) => {
  const 画面指纹 = 段fp(名);
  const 声 = 配对声音指纹(画面指纹);
  const 声音指纹: 段指纹 = { ...画面指纹, 指纹: 声, 项: { ...画面指纹.项, 渲染设置: { codec: 'wav' } } };
  return { 画面指纹, 声音指纹, 画面: 段画面路径(键, 画面指纹.指纹, 作品), 声音: 段声音路径(键, 声, 作品) };
};

/** 源画面（无损 PNG 流）；单帧取第 n 帧，改 就在左上画一块红 */
const 源png = (n: number | null, 改 = false) =>
  跑出字节([
    配置('ffmpeg'), '-v', 'error', '-f', 'lavfi', '-i', `testsrc2=size=${宽}x${高}:rate=24:duration=2`,
    ...(n === null ? [] : ['-vf', `select=eq(n\\,${n})${改 ? ',drawbox=x=0:y=0:w=24:h=24:color=red:t=fill' : ''}`, '-frames:v', '1']), '-f', 'image2pipe', '-c:v', 'png', '-',
  ]);

/** 和真切片一样：PNG 帧经 Remotion 的 ffmpeg、bt709 zscale、x264 CRF18 压成 mp4；配一份 wav；写两份 .指纹.json（不派生段签，找旧版 会补） */
const 放旧版 = async (名: string) => {
  const r = 产物(名);
  fs.mkdirSync(path.dirname(r.画面), { recursive: true });
  await 跑自带ffmpeg(['-v', 'error', '-y', '-r', '24', '-f', 'image2pipe', '-vcodec', 'png', '-i', '-', '-vf', 切片转yuv滤镜, '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', r.画面], 源png(null));
  跑出([配置('ffmpeg'), '-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2:sample_rate=48000', '-c:a', 'pcm_s16le', '-ac', '2', r.声音]);
  写指纹(r.画面指纹, path.dirname(r.画面));
  写指纹(r.声音指纹, path.dirname(r.画面));
  return r;
};

beforeAll(() => fs.mkdirSync(目录, { recursive: true }));
afterAll(() => fs.rmSync(数据根, { recursive: true, force: true }));

describe('抽帧', () => {
  it('首、尾加中间均匀，共 n 帧；段比 n 短全取；少于 2 帧拒', () => {
    const f = 抽帧(188);
    expect(f).toHaveLength(12);
    expect(f[0]).toBe(0);
    expect(f.at(-1)).toBe(187);
    expect([...f].sort((a, b) => a - b)).toEqual(f);
    expect(抽帧(5)).toEqual([0, 1, 2, 3, 4]);
    expect(抽帧(47, 3)).toEqual([0, 23, 46]);
    expect(抽帧(1, 2)).toEqual([0]);
    expect(() => 抽帧(10, 1)).toThrow();
  });
});

describe('静帧证明不了', () => {
  it('只改代码不拦；渲染设置、私有配乐、ogg 解码、缺字节拦', () => {
    expect(静帧证明不了(项(), 项({ 代码: { 画面根: 'x', 段根: 'b', 设置根: 'c', 外壳根: 'd' }, 依赖版本: { three: '0.186.2' }, 打包规则: { ...项().打包规则, 'pipeline/资产/webpack.ts': 'w2' } }))).toEqual([]);
    expect(静帧证明不了(项(), 项({ 渲染设置: { ...项().渲染设置, crf: 2 } }))[0]).toContain('crf');
    expect(静帧证明不了(项(), 项({ 私有配乐: { 配乐甲: 'sha' } }))[0]).toContain('私有配乐');
    expect(静帧证明不了(项(), 项({ 打包规则: { ...项().打包规则, 'pipeline/资产/ogg解码.cjs': 'o2' } }))[0]).toContain('ogg解码');
    expect(静帧证明不了(项(), 项({ 缺字节: ['甲'] }))[0]).toContain('缺字节');
  });
});

describe('比一帧', () => {
  it('同一画面的 PNG 和有损压缩的切片：逐字节不一样，在噪声内；改了一块判不同；逐字节一样就是一样', async () => {
    const r = await 放旧版('比一帧');
    const { 旧 } = await 找旧版(键, 段fp('比一帧之后'), { 帧数: 48, 等放行: 放行, 作品 });
    expect(旧!.母版).toBe(r.画面);
    const 旧帧 = await 旧帧们(旧!, [0, 30, 47]);
    for (const n of [0, 30, 47]) {
      const 新 = await 帧转yuv(源png(n), 宽, 高);
      expect(新.equals(旧帧.get(n)!)).toBe(false);
      expect(比一帧(n, 新, 旧帧.get(n)!, 宽, 高, 阈).结论).toBe('噪声内');
      const 改 = 比一帧(n, await 帧转yuv(源png(n, true), 宽, 高), 旧帧.get(n)!, 宽, 高, 阈);
      expect(改.结论).toBe('不同');
      expect(改.说明).toContain('16×16');
      expect(比一帧(n, 旧帧.get(n)!, 旧帧.get(n)!, 宽, 高, 阈).结论).toBe('一样');
    }
    await expect(帧转yuv(源png(0), 宽 * 2, 高)).rejects.toThrow('尺寸对不上');
  });
});

describe('找旧版、登记沿用', () => {
  it('找最近一份切片和 wav 都在的（段签缺了当场补）；登记后新指纹有切片和 wav（克隆）、段签记 沿用；旧的删了新的照用；gc 扫到的是新指纹自己的切片', async () => {
    const 甲 = await 放旧版('甲');
    const 乙 = 产物('乙');
    expect(新指纹已有(键, 乙, 作品)).toBeNull();
    let 放了 = 0;
    const { 旧 } = await 找旧版(键, 乙.画面指纹, { 帧数: 48, 等放行: async () => void 放了++, 作品 });
    expect(旧!.指纹).toBe(甲.画面指纹.指纹);
    expect(旧!.母版).toBe(甲.画面);
    expect(旧!.声音).toBe(甲.声音);
    expect(放了).toBe(1);
    expect(await 对得上切片(旧!.签, 甲.画面, 甲.声音)).toBe(true);
    expect((await 找旧版(键, 乙.画面指纹, { 帧数: 47, 等放行: 放行, 作品 })).没用的.join()).toContain('48 帧');

    const r = 登记沿用(键, 旧!, 乙, { 理由: '搬函数', 帧: [0, 47], 提交: 'abc', 级别: '视频' }, 作品);
    expect(r.母版).toBe(乙.画面);
    expect(r.声音).toBe(乙.声音);
    expect(新指纹已有(键, 乙, 作品)).toBe('切片在');
    const 签 = 读段签(键, 乙.画面指纹.指纹, 作品)!;
    expect(段签齐(签)).toBe(true);
    expect(签).toMatchObject({ 版本: 3, 声音指纹: 乙.声音指纹.指纹 });
    expect(签.沿用).toMatchObject({ 自: 甲.画面指纹.指纹, 原渲: 甲.画面指纹.指纹, 理由: '搬函数', 帧: [0, 47], 提交: 'abc' });
    expect(签.签名).toEqual(旧!.签.签名);
    expect(await 对得上切片(签, r.母版, r.声音)).toBe(true);
    expect(历史指纹(键, path.dirname(r.母版)).map((h) => h.指纹)).toEqual(expect.arrayContaining([乙.画面指纹.指纹, 乙.声音指纹.指纹]));
    // 没有临时文件留下
    expect(fs.readdirSync(path.dirname(r.母版)).filter((n) => n.includes('写入中'))).toEqual([]);

    // cache gc 的扫描：新指纹的切片是它自己的一份
    const 扫 = 扫一键('母版', 键, 作品).媒体.find((m) => m.指纹 === 乙.画面指纹.指纹.slice(0, 16));
    expect(扫).toMatchObject({ 存法: '切片' });

    // 连着认：原渲 指到真渲的那份
    const 丙 = 产物('丙');
    const { 旧: 旧2 } = await 找旧版(键, 丙.画面指纹, { 帧数: 48, 等放行: 放行, 作品 });
    expect(旧2!.指纹).toBe(乙.画面指纹.指纹);
    const r2 = 登记沿用(键, 旧2!, 丙, { 理由: '再搬', 帧: [0], 提交: 'def', 级别: '视频' }, 作品);
    expect(读段签(键, 丙.画面指纹.指纹, 作品)!.沿用).toMatchObject({ 自: 乙.画面指纹.指纹, 原渲: 甲.画面指纹.指纹 });

    // 旧指纹的切片、wav、段签删掉（gc 回收旧指纹）：沿用的照样对得上
    fs.rmSync(甲.画面);
    fs.rmSync(甲.声音);
    fs.rmSync(path.join(数据根, '段签', 作品, 键, 甲.画面指纹.指纹.slice(0, 16)), { recursive: true });
    expect(await 对得上切片(读段签(键, 丙.画面指纹.指纹, 作品)!, r2.母版, r2.声音)).toBe(true);
    expect(fs.statSync(r2.母版).size).toBe(签.母版.大小);
  });

  it('新指纹渲过（有段签、没 沿用）不算过期；认到一半（段签有 沿用、切片没改名过来）可以重认；切片不在的旧版跳过', async () => {
    const 丁 = await 放旧版('丁');
    await 找旧版(键, 段fp('丁之后'), { 帧数: 48, 等放行: 放行, 作品 });
    const 签 = 读段签(键, 丁.画面指纹.指纹, 作品)!;
    fs.rmSync(丁.画面);
    expect(新指纹已有(键, 丁, 作品)).toContain('渲过');
    const 戊 = 产物('戊');
    const 段签目录 = path.join(数据根, '段签', 作品, 键, 戊.画面指纹.指纹.slice(0, 16));
    fs.mkdirSync(段签目录, { recursive: true });
    fs.writeFileSync(path.join(段签目录, '签.json'), JSON.stringify({ ...签, 指纹: 戊.画面指纹.指纹, 沿用: { 自: 丁.画面指纹.指纹 } }));
    expect(新指纹已有(键, 戊, 作品)).toBeNull();
    // 切片删了的旧版跳过
    const 只看 = await 找旧版(键, 段fp('己'), { 帧数: 48, 等放行: 放行, 作品 });
    expect(只看.旧?.指纹).not.toBe(丁.画面指纹.指纹);
    expect(await 对得上母版(签, 丁.画面).catch(() => false)).toBe(false);
  });

  it('克隆：目标在就拒，不覆盖', () => {
    const a = path.join(目录, '克隆甲');
    const b = path.join(目录, '克隆乙');
    fs.writeFileSync(a, 'x');
    expect(['克隆', '硬链接', '复制']).toContain(克隆(a, b));
    expect(fs.readFileSync(b, 'utf8')).toBe('x');
    expect(() => 克隆(a, b)).toThrow('不覆盖');
  });
});
