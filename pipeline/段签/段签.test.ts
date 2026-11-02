// 段签：从 ffmpeg 现造的小母版（有损 x264，和真母版一样有编码噪声）派生，查签名和 verify 逐位相同、FLAC 无损、版本 2 不存抽样帧、
// 首尾小图和 灰度帧 一样、版本 1（带 抽样.mkv）照读、重渲自查（旧的一套挪进 历史/）、母版转存改记；
// 扫段签 和 扫母版 结论一样；认可参考（accept 时从认可那版的压缩母版抽、旁记核 yuv；老参考核 rgb 哈希、补旁记）。数据根是临时目录，不碰真数据。
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const 数据根 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-段签测试-'));
process.env.ANIM_DATA = 数据根;

const { 配置 } = await import('../环境/配置.ts');
const { 跑出 } = await import('../环境/子进程.ts');
const { 灰度帧 } = await import('../合成/接缝.ts');
const { 出段签, 读段签, 读历史段签, 记转码, 段签齐, 对得上母版, 声音路径, 小图, 段签文件, 历史文件名, 文件sha } = await import('./段签.ts');
const { 取段签, 同指纹重渲过 } = await import('./补.ts');
const { 扫母版, 扫段签, 母版像素, 签名里没有, 缺母版, 参考对不上 } = await import('../验收/验收.ts');
const { 抽样流, 音频流, sha } = await import('../验收/帧流.ts');
const { 备参考, 补旁记, 找认可母版, 参考文件 } = await import('../验收/参考.ts');
const { 参考像素, 旁记文件, 读旁记 } = await import('../验收/参考像素.ts');
const { 原母版路径, 压缩母版路径 } = await import('../渲/母版.ts');
const { 转码 } = await import('../渲/转码.ts');
const { 同一版 } = await import('../验收/认可.ts');
type 认可记录 = import('../验收/认可.ts').认可记录;

const 阈 = { 块8门槛: 24, 块16门槛: 10, 块64门槛: 4, 看一眼门槛: 6, 块均值容差: 1, 响度容差LU: 0.5, 起音容差帧: 1 };
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
const 签路径 = (签: { 作品: string; 段: string; 指纹: string }) => 段签文件(签, '签.json');
const 收 = async (g: AsyncGenerator<Buffer>) => {
  const 出: Buffer[] = [];
  for await (const b of g) 出.push(Buffer.from(b));
  return 出;
};

let 原 = '';
let 后半变 = '';
beforeAll(() => {
  fs.mkdirSync(目录, { recursive: true });
  原 = 造('原.mkv');
  后半变 = 造('后半变.mkv', "drawbox=x=0:y=0:w=32:h=18:color=red:t=fill:enable='gte(n,30)'");
});
afterAll(() => fs.rmSync(数据根, { recursive: true, force: true }));

const 认可 = async (母版: string, 指: string, 段 = '核对-段签'): Promise<认可记录> => ({
  段, 指纹: 指, 平台: 'test', 渲染级别: '视频', 认可于: '2026-10-30T00:00:00Z', 提交: 'abc', 理由: '测试', 上一版指纹: null,
  ...(await 扫母版(母版)).签名,
});

/** 在数据根放一份这个段、这个指纹的 CRF1 母版并派生段签；转码 就再转存成压缩母版、记转码 */
const 放母版 = async (段: string, 指: string, 源: string, o: { 转码?: boolean } = {}) => {
  const 母版 = 原母版路径(段, 指);
  fs.mkdirSync(path.dirname(母版), { recursive: true });
  fs.copyFileSync(源, 母版);
  const 前 = (await 出段签(母版, { 段键: 段, 指纹: 指, 级别: '视频', 派生: '回填' })).签;
  if (!o.转码) return { 母版, 签: 前 };
  const 压 = 压缩母版路径(段, 指);
  const 法 = await 转码(母版, 压);
  return { 母版, 压, 签: await 记转码(段, 指, 压, { 原字节sha: 前.母版.字节sha, 存法: 法 }) };
};

describe('段签', () => {
  it('回填的签名和 verify（扫母版）算的逐位相同；FLAC 解回来 PCM 一样；版本 2 不存抽样帧；首尾小图和母版的一样', async () => {
    const fp = 指纹('原');
    const { 签, 自查 } = await 出段签(原, { 段键: '核对-段签', 指纹: fp, 级别: '视频', 派生: '回填' });
    expect(自查).toBeNull();
    expect(签.版本).toBe(2);
    expect(签.抽样).toBeUndefined();
    expect(签.签名).toEqual((await 扫母版(原)).签名);
    expect(读段签('核对-段签', fp)).toEqual(签);
    expect(段签齐(签)).toBe(true);
    expect(await 对得上母版(签, 原)).toBe(true);
    expect(await pcm(声音路径(签)!)).toBe(await pcm(原));
    expect(await pcm(声音路径(签)!)).toBe(签.签名.音频sha);
    expect(签.签名.帧.map((f) => f.帧)).toEqual([0, 24, 47]);
    expect(小图(签, '首帧').equals(灰度帧(原, 0))).toBe(true);
    expect(小图(签, '末帧').equals(灰度帧(原, 47))).toBe(true);
    expect(fs.readdirSync(path.dirname(签路径(签))).sort()).toEqual(['声音.flac', '签.json']);
  });

  it('一帧的母版：首尾小图是同一帧', async () => {
    const 一帧 = path.join(目录, '一帧.mkv');
    跑出([配置('ffmpeg'), '-v', 'error', '-y', '-i', 原, '-frames:v', '1', '-an', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', 一帧]);
    const { 签 } = await 出段签(一帧, { 段键: '核对-一帧', 指纹: 指纹('一帧'), 级别: '静帧', 派生: '回填' });
    expect(小图(签, '首帧').equals(灰度帧(一帧, 0))).toBe(true);
    expect(小图(签, '末帧').equals(小图(签, '首帧'))).toBe(true);
  });

  it('版本 1 的段签（带 抽样.mkv）照读：抽样.mkv 丢了也算齐；重渲时连它挪进 历史/，新的是版本 2', async () => {
    const fp = 指纹('版本一');
    const 母版 = path.join(目录, '版本一.mkv');
    fs.copyFileSync(原, 母版);
    const 新 = (await 出段签(母版, { 段键: '核对-版本一', 指纹: fp, 级别: '视频', 派生: '渲染' })).签;
    const 旧式 = { ...新, 版本: 1, 抽样: { 文件: '抽样.mkv', sha: 'a'.repeat(64), 大小: 3, 帧: [0, 24, 47] } };
    fs.writeFileSync(签路径(新), JSON.stringify(旧式));
    expect(读段签('核对-版本一', fp)).toEqual(旧式);
    expect(段签齐(读段签('核对-版本一', fp))).toBe(true);
    fs.writeFileSync(段签文件(新, '抽样.mkv'), 'abc');
    fs.copyFileSync(后半变, 母版);
    const 再 = (await 出段签(母版, { 段键: '核对-版本一', 指纹: fp, 级别: '视频', 派生: '渲染' })).签;
    expect(再.版本).toBe(2);
    expect(fs.existsSync(段签文件(再, '抽样.mkv'))).toBe(false);
    const [史] = 读历史段签('核对-版本一', fp);
    expect(史!.签.版本).toBe(1);
    expect(fs.readFileSync(path.join(史!.目录, '抽样.mkv'), 'utf8')).toBe('abc');
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
    // 重渲前的两套原样挪进 历史/，现在的是后半变那份
    const 历史 = 读历史段签('核对-重渲', fp);
    expect(历史.map((h) => h.签.母版.字节sha).sort()).toEqual([史[0].上次字节sha, 史[1].上次字节sha].sort());
    for (const h of 历史) expect(fs.readdirSync(h.目录).sort()).toEqual(['声音.flac', '签.json']);
    expect(史.map((x) => x.存于)).toEqual(史.map((x) => `历史/${x.上次字节sha.slice(0, 16)}`));
    expect(读段签('核对-重渲', fp)!.母版.字节sha).toBe(await 文件sha(母版));
  });

  it('转存：记转码 后段签留着转码前从 CRF1 算的签名，记下存法，取段签 不重新派生；转码前不是这份母版派生的不改', async () => {
    const fp = 指纹('转码');
    const 母版 = 原母版路径('核对-转码', fp);
    fs.mkdirSync(path.dirname(母版), { recursive: true });
    fs.copyFileSync(原, 母版);
    const 前 = (await 出段签(母版, { 段键: '核对-转码', 指纹: fp, 级别: '视频', 派生: '回填' })).签;
    const 原sha = 前.母版.字节sha;
    const 压 = 压缩母版路径('核对-转码', fp);
    const 法 = await 转码(母版, 压);
    await expect(记转码('核对-转码', fp, 压, { 原字节sha: 'f'.repeat(64) })).rejects.toThrow(/对不上/);
    const 后 = await 记转码('核对-转码', fp, 压, { 原字节sha: 原sha, 存法: 法 });
    expect(后.母版.转码自!.字节sha).toBe(原sha);
    expect(后.母版.字节sha).toBe(await 文件sha(压));
    expect(后.母版.存法!.标签).toBe('x264-crf16-medium-t4');
    expect({ ...后, 母版: null }).toEqual({ ...前, 母版: null });
    expect(await 对得上母版(后, 压)).toBe(true);
    // CRF1 删了也照样取（CRF1 不在、压缩母版对得上），签名没换
    fs.rmSync(母版);
    const 取 = await 取段签('核对-转码', fp, '视频', { 等放行: async () => {} });
    expect(取).toEqual(后);
    expect(读历史段签('核对-转码', fp)).toEqual([]);
    // 转码后的像素和签名不一样（压缩过），段签没被它冲掉
    expect((await 扫母版(压)).签名.帧.map((f) => f.哈希)).not.toEqual(前.签名.帧.map((f) => f.哈希));
  });

  it('只剩压缩母版、段签丢了：取段签 返回 null，不从压缩母版派生；出段签 也拒收压缩母版', async () => {
    const fp = 指纹('丢段签');
    const { 母版, 压, 签 } = await 放母版('核对-丢段签', fp, 原, { 转码: true });
    fs.rmSync(母版);
    fs.rmSync(签路径(签));
    expect(await 取段签('核对-丢段签', fp, '视频', { 等放行: async () => {} })).toBeNull();
    await expect(出段签(压!, { 段键: '核对-丢段签', 指纹: fp, 级别: '视频', 派生: '补' })).rejects.toThrow(/压缩母版/);
    // 改了名的压缩母版看文件里的标签也认得出来
    const 改名 = path.join(目录, '改名.mkv');
    fs.copyFileSync(压!, 改名);
    await expect(出段签(改名, { 段键: '核对-丢段签', 指纹: fp, 级别: '视频', 派生: '补' })).rejects.toThrow(/压缩母版/);
  });
});

describe('扫段签：和 扫母版 结论一样', () => {
  const 结论 = (r: Awaited<ReturnType<typeof 扫母版>>) => ({ 帧: r.帧结论, 音频: [r.音频结论, r.音频说明], 尺寸: r.尺寸变了, 比法: r.比法 });

  it('认可那版母版在（块差）、不在（块均值）都和 扫母版 一样；要看像素、段签记的母版不在抛 缺母版', async () => {
    const 认 = await 认可(原, 指纹('认可原'));
    const 新 = (await 出段签(后半变, { 段键: '核对-后半变', 指纹: 指纹('后半变'), 级别: '视频', 派生: '回填' })).签;
    const 来源 = { 签名: 新.签名, 母版: 后半变 };
    const 母块差 = await 扫母版(后半变, { 认可: 认, 旧母版: 原, 阈值: 阈 });
    expect(母块差.比法).toBe('块差');
    expect(母块差.帧结论.map((f) => f.结论)).toEqual(['一样', '容差内', '变了']); // 第 24 帧没改，有损编码的噪声在容差内
    expect(结论(await 扫段签(来源, { 认可: 认, 旧母版: 原, 阈值: 阈 }))).toEqual(结论(母块差));
    const 母块 = await 扫母版(后半变, { 认可: 认, 旧母版: null, 阈值: 阈 });
    expect(母块.比法).toBe('块均值');
    // 只比块均值、不出预览：不用解母版
    expect(结论(await 扫段签({ ...来源, 母版: null }, { 认可: 认, 旧母版: null, 阈值: 阈 }))).toEqual(结论(母块));
    await expect(扫段签({ ...来源, 母版: null }, { 认可: 认, 旧母版: 原, 阈值: 阈 })).rejects.toBeInstanceOf(缺母版);
    // 哈希都一样就不要像素，母版不在也行
    expect((await 扫段签({ 签名: 认, 母版: null }, { 认可: 认, 旧母版: 原, 阈值: 阈 })).帧结论.every((f) => f.结论 === '一样')).toBe(true);
  });

  it('认可记录的抽样间隔不一样：段签的签名里没有要的帧，抛 签名里没有（verify 退回解母版）', async () => {
    const 认 = { ...(await 认可(原, 指纹('间隔12'))), 间隔: 12 };
    const 新 = 读段签('核对-后半变', 指纹('后半变'))!;
    await expect(扫段签({ 签名: 新.签名, 母版: 后半变 }, { 认可: 认, 阈值: 阈 })).rejects.toBeInstanceOf(签名里没有);
  });
});

describe('认可参考', () => {
  it('accept 时从认可那版的压缩母版抽：旁记记各帧 yuv sha；像素和压缩母版按固定换算的一样；verify 用它比、和 扫母版 一样', async () => {
    const fp = 指纹('参考');
    const { 压 } = await 放母版('核对-参考', fp, 原, { 转码: true });
    const 认 = await 认可(原, fp, '核对-参考');
    expect((await 找认可母版(认, 'CRF1'))!.来源).toBe('CRF1');
    expect(await 找认可母版(认, '压缩母版')).toEqual({ 文件: 压, 来源: '压缩母版', 字节sha: await 文件sha(压!) });
    expect(await 备参考(认, 'test')).toBe('从压缩母版');
    expect(await 备参考(认, 'test')).toBe('已有');
    const 参考 = 参考文件(认, 'test');
    const 记 = 读旁记(参考)!;
    expect(记).toMatchObject({ 帧: [0, 24, 47], 来源: '压缩母版', 母版字节sha: await 文件sha(压!) });
    expect(fs.readdirSync(path.dirname(参考)).filter((n) => n.includes('写入中'))).toEqual([]);
    const 参考帧 = await 收(参考像素(参考, 认, [0, 24, 47]));
    const 母版帧 = await 收(母版像素(压!, [0, 24, 47], 64, 36, '固定'));
    参考帧.forEach((b, i) => expect(b.equals(母版帧[i]!)).toBe(true));
    // 抽样流只交要的帧；要没存的帧就报错
    expect((await 收(抽样流(参考, 记.帧, [24], 64, 36, 'yuv420p'))).map(sha)).toEqual([记.yuv[1]]);
    await expect(收(抽样流(参考, 记.帧, [12], 64, 36, 'yuv420p'))).rejects.toThrow(/没有原片第 12 帧/);

    const 来源 = { 签名: (await 扫母版(后半变)).签名, 母版: 后半变 };
    const 段参考 = await 扫段签(来源, { 认可: 认, 旧母版: null, 参考, 阈值: 阈 });
    expect(段参考.像素来源).toBe('认可参考');
    expect(段参考.帧结论.map((f) => f.结论)).toEqual(['一样', '容差内', '变了']);
    const 母参考 = await 扫母版(后半变, { 认可: 认, 旧母版: null, 参考, 阈值: 阈 });
    expect(段参考.帧结论).toEqual(母参考.帧结论);

    // 旁记的 yuv 哈希对不上（参考坏了）：抛 参考对不上
    const 好 = fs.readFileSync(旁记文件(参考), 'utf8');
    fs.writeFileSync(旁记文件(参考), JSON.stringify({ ...记, yuv: 记.yuv.map((h, i) => (i === 1 ? '0'.repeat(64) : h)) }));
    await expect(扫段签(来源, { 认可: 认, 参考, 阈值: 阈 })).rejects.toBeInstanceOf(参考对不上);
    // 没有旁记：当老参考核认可记录的 rgb 哈希，压缩母版抽的核不上；补旁记 也不收
    fs.rmSync(旁记文件(参考));
    await expect(扫段签(来源, { 认可: 认, 参考, 阈值: 阈 })).rejects.toBeInstanceOf(参考对不上);
    expect(await 补旁记(认, 'test')).toBe('对不上');
    expect(fs.existsSync(旁记文件(参考))).toBe(false);
    fs.writeFileSync(旁记文件(参考), 好);
  });

  it('还没转码的从 CRF1 抽；换比法以前的老参考（没有旁记）核 rgb 哈希能用，补旁记 补上；记录对不上的不收、不留文件', async () => {
    const fp = 指纹('参考一');
    await 放母版('核对-参考一', fp, 原);
    const 认 = await 认可(原, fp, '核对-参考一');
    expect(await 备参考(认, 'test')).toBe('从CRF1');
    const 参考 = 参考文件(认, 'test');
    // 老参考是段签无损抽样克隆的：和从 CRF1 抽的逐位一样，只是没有旁记
    fs.rmSync(旁记文件(参考));
    const 来源 = { 签名: (await 扫母版(后半变)).签名, 母版: 后半变 };
    const 老 = await 扫段签(来源, { 认可: 认, 参考, 阈值: 阈 });
    expect(老.像素来源).toBe('认可参考');
    expect(老.帧结论.map((f) => f.结论)).toEqual(['一样', '容差内', '变了']);
    expect(await 补旁记(认, 'test')).toBe('补了');
    expect(读旁记(参考)).toMatchObject({ 来源: '段签抽样', 母版字节sha: null, 帧: [0, 24, 47] });
    expect(await 补旁记(认, 'test')).toBe('已有');
    expect((await 扫段签(来源, { 认可: 认, 参考, 阈值: 阈 })).帧结论).toEqual(老.帧结论);
    expect(await 补旁记({ ...认, 指纹: 指纹('没参考') }, 'test')).toBe('没有参考');

    const 坏 = { ...认, 帧: 认.帧.map((f, i) => (i === 1 ? { ...f, 哈希: '0'.repeat(64) } : f)) };
    expect(await 备参考(坏, 'test')).toBe('没有来源'); // 段签和它不是同一版
    expect(fs.existsSync(参考文件(坏, 'test'))).toBe(false);
    expect(await 备参考({ ...认, 指纹: 指纹('都不在') }, 'test')).toBe('没有来源');
    expect(fs.readdirSync(path.dirname(参考)).filter((n) => n.includes('写入中'))).toEqual([]);
  });

  it('同一指纹重渲后再认可：新记录对应新参考文件（不拿旧参考冒充）；重渲前没备的旧认可备不上了；参考和记录配错抛 参考对不上', async () => {
    const fp = 指纹('再认可');
    const { 母版 } = await 放母版('核对-再认可', fp, 原);
    const 认一 = await 认可(母版, fp, '核对-再认可');
    expect(await 备参考(认一, 'test')).toBe('从CRF1'); // accept 时就备好
    // 同一指纹重渲成后半变（字节、画面都变），再认可
    fs.copyFileSync(后半变, 母版);
    const 新 = (await 出段签(母版, { 段键: '核对-再认可', 指纹: fp, 级别: '视频', 派生: '渲染' })).签;
    const 认二 = { ...认一, ...新.签名 };
    expect(同一版(新.签名, 认一)).toBe(false);
    expect(同一版(新.签名, 认二)).toBe(true);
    // verify 同一指纹：段签和认可记录不一样要真比（漂移提示让跑 verify，不能直接打 ✓）；一样就不比；母版又换了字节、段签没跟上也要比
    expect(同指纹重渲过(新, 认一, 母版)).toBe('段签的签名和认可记录不一样');
    expect(同指纹重渲过(新, 认二, 母版)).toBeNull();
    expect(同指纹重渲过(null, 认一, 母版)).toBeNull();
    const t = new Date(Date.now() + 5000);
    fs.utimesSync(母版, t, t);
    expect(同指纹重渲过(新, 认二, 母版)).toBe('母版和段签记的不是同一份');
    // 压缩母版和段签对得上，但又重渲出了新 CRF1（段签记的 转码自 不是它）
    const 另一份 = path.join(目录, '再认可-另一份.mkv');
    fs.copyFileSync(后半变, 另一份);
    const 现在的样子 = { ...新.母版, 大小: fs.statSync(母版).size, 改于: fs.statSync(母版).mtimeMs };
    const 跟上的 = { ...新, 母版: { ...现在的样子, 转码自: 新.母版 } };
    expect(同指纹重渲过(跟上的, 认二, 母版)).toBeNull();
    expect(同指纹重渲过(跟上的, 认二, 母版, 另一份)).toBe('母版和段签记的不是同一份');
    expect(await 备参考(认二, 'test')).toBe('从CRF1');
    expect(参考文件(认二, 'test')).not.toBe(参考文件(认一, 'test'));
    expect(await 备参考(认一, 'test')).toBe('已有');
    const 来源 = { 签名: 新.签名, 母版 };
    const 和认一 = await 扫段签(来源, { 认可: 认一, 旧母版: null, 参考: 参考文件(认一, 'test'), 阈值: 阈 });
    expect(和认一.像素来源).toBe('认可参考');
    expect(和认一.帧结论.map((f) => f.结论)).toEqual(['一样', '容差内', '变了']);
    const 和认二 = await 扫段签(来源, { 认可: 认二, 旧母版: null, 参考: 参考文件(认二, 'test'), 阈值: 阈 });
    expect(和认二.帧结论.every((f) => f.结论 === '一样')).toBe(true);
    // 参考和记录配错（以前同名时就会这样）：旁记记的不是这条记录，抛 参考对不上，verify 只记这一段不过
    await expect(扫段签(来源, { 认可: 认一, 旧母版: null, 参考: 参考文件(认二, 'test'), 阈值: 阈 })).rejects.toBeInstanceOf(参考对不上);
    // 认一那版的段签挪进了 历史/，母版却已是后半变：重渲前没备参考就备不上了（verify 退回块均值）
    fs.rmSync(参考文件(认一, 'test'));
    expect(await 备参考(认一, 'test')).toBe('没有来源');
  });
});
