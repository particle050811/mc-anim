// 认指纹：抽哪几帧、哪些差异静帧证明不了、一帧怎么比（新 PNG 和有损压缩母版：画面一样在噪声内，改了一块判不同）、
// 找旧版、登记沿用（克隆母版、复制段签记 沿用；旧指纹的东西删了新指纹照用；cache gc 扫到的是这个指纹自己的母版）。
// 母版、PNG 用 ffmpeg 现造在临时数据根里，不碰真数据，不开 Remotion。
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const 数据根 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-认指纹测试-'));
process.env.ANIM_DATA = 数据根;

const { 配置 } = await import('../环境/配置.ts');
const { 跑出, 跑出字节 } = await import('../环境/子进程.ts');
const { 出段签, 读段签, 记转码, 段签齐, 对得上母版 } = await import('../段签/段签.ts');
const { 原母版路径, 压缩母版路径, 写指纹, 有母版, 历史指纹 } = await import('../渲/母版.ts');
const { 转码 } = await import('../渲/转码.ts');
const { 扫一键 } = await import('../缓存/钉.ts');
const { 抽帧, 静帧证明不了, 比一帧, png转yuv, 找旧版, 登记沿用, 新指纹已有, 旧帧们, 克隆 } = await import('./认指纹.ts');
type 段指纹 = import('./指纹.ts').段指纹;
type 指纹项 = import('./指纹.ts').指纹项;

const 作品 = '测试作品';
const 键 = '核对-认指纹';
const 阈 = { 块8门槛: 24, 块16门槛: 10, 块64门槛: 4, 看一眼门槛: 6 };
const 宽 = 128;
const 高 = 72;
const 目录 = path.join(数据根, '样例');
const 指纹 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

const 项 = (o: Partial<指纹项> = {}): 指纹项 => ({
  代码: { 画面根: 'a', 段根: 'b', 设置根: 'c', 外壳根: 'd' },
  地形: {},
  渲染设置: { inputProps: { 级别: '视频' }, crf: 1, 帧数: 48, fps: 24, 宽: 64, 高: 36 },
  依赖版本: { three: '0.186.1' },
  打包规则: { tsconfig: 't', 'pipeline/资产/webpack.ts': 'w', 'pipeline/资产/ogg解码.cjs': 'o' },
  平台: 'darwin-arm64',
  ...o,
});
const 段fp = (名: string, 代码 = 名): 段指纹 => ({ 段: 键, 指纹: 指纹(名), 算法: 'merkle-v1', 项: 项({ 代码: { 画面根: 代码, 段根: 'b', 设置根: 'c', 外壳根: 'd' } }), 明细: { 模块: {}, 资产: {} } });

/** 源画面的第 n 帧（无损 PNG）；改 就在左上画一块红 */
const 源png = (n: number, 改 = false) =>
  跑出字节([
    配置('ffmpeg'), '-v', 'error', '-f', 'lavfi', '-i', `testsrc2=size=${宽}x${高}:rate=24:duration=2`,
    '-vf', `select=eq(n\\,${n})${改 ? ',drawbox=x=0:y=0:w=24:h=24:color=red:t=fill' : ''}`, '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', '-',
  ]);

/** 和真母版一样：CRF1 渲出来（这里用 x264 CRF 1），派生段签，再转存压缩母版（CRF16）、记转码 */
const 放旧版 = async (名: string) => {
  const fp = 段fp(名);
  const 原 = 原母版路径(键, fp.指纹, 作品);
  fs.mkdirSync(path.dirname(原), { recursive: true });
  跑出([
    配置('ffmpeg'), '-v', 'error', '-y', '-f', 'lavfi', '-i', `testsrc2=size=${宽}x${高}:rate=24:duration=2`,
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2:sample_rate=48000',
    '-c:v', 'libx264', '-crf', '1', '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le', '-ac', '2', 原,
  ]);
  const 前 = (await 出段签(原, { 段键: 键, 指纹: fp.指纹, 级别: '视频', 派生: '渲染', 作品 })).签;
  const 压 = 压缩母版路径(键, fp.指纹, 作品);
  const 法 = await 转码(原, 压);
  await 记转码(键, fp.指纹, 压, { 原字节sha: 前.母版.字节sha, 存法: 法, 作品 });
  fs.rmSync(原);
  写指纹(fp, path.dirname(原));
  return { fp, 压 };
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
  it('同一画面的 PNG 和有损压缩母版：逐字节不一样，在噪声内；改了一块判不同；逐字节一样就是一样', async () => {
    const { fp, 压 } = await 放旧版('比一帧');
    const 签 = 读段签(键, fp.指纹, 作品)!;
    const 旧 = await 旧帧们({ 指纹: fp.指纹, 项: fp.项, 记录: fp, 签, 母版: 压 }, [0, 30, 47]);
    for (const n of [0, 30, 47]) {
      const 新 = png转yuv(源png(n), 宽, 高);
      expect(新.equals(旧.get(n)!)).toBe(false);
      expect(比一帧(n, 新, 旧.get(n)!, 宽, 高, 阈).结论).toBe('噪声内');
      const 改 = 比一帧(n, png转yuv(源png(n, true), 宽, 高), 旧.get(n)!, 宽, 高, 阈);
      expect(改.结论).toBe('不同');
      expect(改.说明).toContain('16×16');
      expect(比一帧(n, 旧.get(n)!, 旧.get(n)!, 宽, 高, 阈).结论).toBe('一样');
    }
    expect(() => png转yuv(源png(0), 宽 * 2, 高)).toThrow('尺寸对不上');
  });
});

describe('找旧版、登记沿用', () => {
  it('找最近一份段签齐、母版在的；登记后新指纹有母版（克隆）、段签记 沿用；旧的删了新的照用；gc 扫到的是新指纹自己的母版', async () => {
    const { fp: 旧fp, 压: 旧压 } = await 放旧版('甲');
    const 新 = 段fp('乙');
    expect(新指纹已有(键, 新.指纹, 作品)).toBeNull();
    const { 旧 } = await 找旧版(键, 新, { 帧数: 48, 作品 });
    expect(旧!.指纹).toBe(旧fp.指纹);
    expect(旧!.母版).toBe(旧压);
    expect((await 找旧版(键, 新, { 帧数: 47, 作品 })).没用的.join()).toContain('48 帧');

    const r = 登记沿用(键, 旧!, 新, { 理由: '搬函数', 帧: [0, 47], 提交: 'abc', 级别: '视频' }, 作品);
    expect(r.母版).toBe(压缩母版路径(键, 新.指纹, 作品));
    expect(有母版(键, 新.指纹, 作品)).toBe(true);
    expect(新指纹已有(键, 新.指纹, 作品)).toBe('母版在');
    const 签 = 读段签(键, 新.指纹, 作品)!;
    expect(段签齐(签)).toBe(true);
    expect(签.沿用).toMatchObject({ 自: 旧fp.指纹, 原渲: 旧fp.指纹, 理由: '搬函数', 帧: [0, 47], 提交: 'abc' });
    expect(签.签名).toEqual(旧!.签.签名);
    expect(签.母版.转码自).toEqual(旧!.签.母版.转码自);
    expect(await 对得上母版(签, r.母版)).toBe(true);
    expect(历史指纹(键, path.dirname(r.母版))[0]!.指纹).toBe(新.指纹);
    // 没有临时文件留下
    expect(fs.readdirSync(path.dirname(r.母版)).filter((n) => n.includes('写入中'))).toEqual([]);

    // cache gc 的扫描：新指纹的压缩母版是它自己的一份，没被当成别人的
    const 扫 = 扫一键('母版', 键, 作品).媒体.find((m) => m.指纹 === 新.指纹.slice(0, 16));
    expect(扫).toMatchObject({ 存法: 'x264', 已被取代: false });

    // 连着认：原渲 指到真渲的那份
    const 丙 = 段fp('丙');
    const { 旧: 旧2 } = await 找旧版(键, 丙, { 帧数: 48, 作品 });
    expect(旧2!.指纹).toBe(新.指纹);
    const r2 = 登记沿用(键, 旧2!, 丙, { 理由: '再搬', 帧: [0], 提交: 'def', 级别: '视频' }, 作品);
    expect(读段签(键, 丙.指纹, 作品)!.沿用).toMatchObject({ 自: 新.指纹, 原渲: 旧fp.指纹 });

    // 旧指纹的母版、段签删掉（gc 回收旧指纹）：沿用的照样对得上
    fs.rmSync(旧压);
    fs.rmSync(path.join(数据根, '段签', 作品, 键, 旧fp.指纹.slice(0, 16)), { recursive: true });
    expect(await 对得上母版(读段签(键, 丙.指纹, 作品)!, r2.母版)).toBe(true);
    expect(fs.statSync(r2.母版).size).toBe(签.母版.大小);
  });

  it('新指纹渲过（有段签、没 沿用）不算过期；认到一半（段签有 沿用、母版没改名过来）可以重认', async () => {
    const { fp: 旧fp } = await 放旧版('丁');
    const 签 = 读段签(键, 旧fp.指纹, 作品)!;
    fs.rmSync(压缩母版路径(键, 旧fp.指纹, 作品));
    expect(新指纹已有(键, 旧fp.指纹, 作品)).toContain('渲过');
    const 新 = 段fp('戊');
    const 段签目录 = path.join(数据根, '段签', 作品, 键, 新.指纹.slice(0, 16));
    fs.mkdirSync(段签目录, { recursive: true });
    fs.writeFileSync(path.join(段签目录, '签.json'), JSON.stringify({ ...签, 指纹: 新.指纹, 沿用: { 自: 旧fp.指纹 } }));
    expect(新指纹已有(键, 新.指纹, 作品)).toBeNull();
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
