// 同一指纹被几路同时碰：后台转存占着时 备好母版、取段签、--只派生、gc、删旧 都不能坏；CRF1 被抢先删了不算错。真 ffmpeg，数据根是临时目录。
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

const 数据根 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-占用测试-'));
process.env.ANIM_DATA = 数据根;
const 闸 = vi.hoisted(() => ({ 进闸次数: 0, 进闸前: null as null | (() => Promise<void>) }));
vi.mock('../闸/闸.ts', async (原) => ({
  ...(await 原<typeof import('../闸/闸.ts')>()),
  过渲染闸: async <T>(fn: () => Promise<T>) => {
    闸.进闸次数++;
    await 闸.进闸前?.();
    return fn();
  },
}));
vi.mock('../环境/路径.ts', async (原) => ({ ...(await 原<typeof import('../环境/路径.ts')>()), 在主检出: () => true }));
vi.mock('../指纹/指纹.ts', async (原) => {
  const { createHash } = await import('node:crypto');
  return { ...(await 原<typeof import('../指纹/指纹.ts')>()), 算全部段指纹: async (任务: { 段: { 键: string } }[]) => 任务.map((t) => ({ 指纹: createHash('sha256').update(t.段.键).digest('hex') })) };
});

const { 占用文件, 占着, 被占着, 等占用放开 } = await import('./母版占用.ts');
const { 存成压缩, 备好母版, 存成压缩内层 } = await import('./转存.ts');
const { 压缩母版路径, 原母版路径, 写指纹 } = await import('./母版.ts');
const { 文件sha, 读段签, 出段签 } = await import('../段签/段签.ts');
const { 取段签, 补段签 } = await import('../段签/补.ts');
const { 扫一键, 删旧, 删已取代 } = await import('../缓存/钉.ts');
const { 是临时名 } = await import('../缓存/回收.ts');
const { 母版目录 } = await import('../环境/配置.ts');

afterAll(() => fs.rmSync(数据根, { recursive: true, force: true }));

const 指纹 = (键: string) => crypto.createHash('sha256').update(键).digest('hex');
const 造 = (f: string, 频率 = 440) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const r = spawnSync('ffmpeg', [
    '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=24:duration=2', '-f', 'lavfi', '-i', `sine=frequency=${频率}:duration=2.1:sample_rate=48000`,
    '-c:v', 'libx264', '-crf', '1', '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le', '-ac', '2', f,
  ]);
  if (r.status !== 0) throw new Error(String(r.stderr));
  return f;
};
const 有ffmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
const 目录里 = (键: string) => fs.readdirSync(母版目录(键));
const 睡 = (ms: number) => new Promise((r) => setTimeout(r, ms));
const 等转码开始 = async (键: string) => {
  for (let i = 0; i < 2000 && !目录里(键).some((n) => n.includes('.转码中-')); i++) await 睡(2);
};

/** 别的进程拿着占用，直到被杀（开 stdin 关：杀掉就是持有者死了） */
const 别的进程占 = async (file: string) => {
  const 脚本 = `import fs from 'node:fs';fs.mkdirSync(${JSON.stringify(path.dirname(file))},{recursive:true});fs.writeFileSync(${JSON.stringify(file)},process.pid+'\\n',{flag:'wx'});console.log('拿到');setInterval(()=>{},1000);`;
  const c = spawn(process.execPath, ['--input-type=module', '-e', 脚本], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise<void>((r) => c.stdout!.once('data', () => r()));
  return c;
};
const 杀 = (c: ReturnType<typeof spawn>) => new Promise<void>((r) => { c.once('close', () => r()); c.kill('SIGKILL'); });

describe('占用标记', () => {
  it('一次一个；放了下一个才进', async () => {
    const fp = 指纹('一次一个');
    const 次序: string[] = [];
    let 放甲!: () => void;
    const 甲 = 占着('一次一个', fp, undefined, () => new Promise<void>((r) => { 次序.push('甲进'); 放甲 = () => { 次序.push('甲出'); r(); }; }));
    await 睡(5);
    expect(被占着('一次一个', fp)).toBe(true);
    const 乙 = 占着('一次一个', fp, undefined, async () => void 次序.push('乙进'), 5);
    await 睡(20);
    expect(次序).toEqual(['甲进']);
    放甲();
    await Promise.all([甲, 乙]);
    expect(次序).toEqual(['甲进', '甲出', '乙进']);
    expect(被占着('一次一个', fp)).toBe(false);
    expect(目录里('一次一个').filter(是临时名)).toEqual([]);
  });

  it('fn 抛错也放', async () => {
    const fp = 指纹('抛错');
    await expect(占着('抛错', fp, undefined, async () => { throw new Error('坏'); })).rejects.toThrow('坏');
    expect(被占着('抛错', fp)).toBe(false);
  });

  it('持有者死了：不算占着，下一个来的人回收', async () => {
    const fp = 指纹('死人');
    const file = 占用文件('死人', fp);
    const c = await 别的进程占(file);
    expect(被占着('死人', fp)).toBe(true);
    await 杀(c);
    expect(被占着('死人', fp)).toBe(false);
    await 等占用放开('死人', fp);
    let 进了 = false;
    await 占着('死人', fp, undefined, async () => void (进了 = true));
    expect(进了).toBe(true);
    expect(目录里('死人').filter(是临时名)).toEqual([]);
  });

  it('标记和旁文件都算临时名；媒体扫描里算正在写，不进「不认识」', () => {
    const 名 = 'aaaaaaaaaaaaaaaa';
    for (const 后 of ['.占用', '.占用.123.主机', '.占用.回收', '.占用.过期-1-ab']) expect(是临时名(名 + 后)).toBe(true);
    expect(是临时名(`${名}.用过`)).toBe(false);
    const fp = 指纹('扫');
    造(原母版路径('扫', fp));
    fs.writeFileSync(占用文件('扫', fp), `${process.pid}\n`);
    fs.writeFileSync(`${占用文件('扫', fp)}.${process.pid}.主机`, 'x\n');
    const r = 扫一键('母版', '扫');
    expect(r.媒体.find((f) => f.路径 === 原母版路径('扫', fp))!.正在写).toBe(true);
    expect(r.不认识).toEqual([]);
    expect(r.临时.length).toBe(2);
    fs.rmSync(占用文件('扫', fp));
    fs.rmSync(`${占用文件('扫', fp)}.${process.pid}.主机`);
  });
});

describe.skipIf(!有ffmpeg)('后台转存占着同一指纹', () => {
  it('备好母版 等它转完直接用压缩母版，不进闸、不重转', async () => {
    const fp = 指纹('等转完');
    造(原母版路径('等转完', fp));
    let 备好完 = false;
    const 进闸 = 闸.进闸次数;
    let 备好: Promise<string | null> | undefined;
    await 占着('等转完', fp, undefined, async () => {
      备好 = 备好母版('等转完', fp, '视频').then((x) => ((备好完 = true), x));
      await 睡(100);
      expect(备好完).toBe(false);
      await 存成压缩内层('等转完', fp, '视频');
      fs.rmSync(原母版路径('等转完', fp));
    });
    const sha = await 文件sha(压缩母版路径('等转完', fp));
    expect(await 备好).toBe(压缩母版路径('等转完', fp));
    expect(闸.进闸次数).toBe(进闸);
    expect(await 文件sha(压缩母版路径('等转完', fp))).toBe(sha);
  });

  it('备好母版 等闸的时候别人转完删了 CRF1：进闸后重查，不抛，返回压缩母版', async () => {
    const fp = 指纹('抢先');
    const 原 = 造(原母版路径('抢先', fp));
    闸.进闸前 = async () => {
      闸.进闸前 = null;
      await 存成压缩('抢先', fp, '视频');
      fs.rmSync(原);
    };
    expect(await 备好母版('抢先', fp, '视频')).toBe(压缩母版路径('抢先', fp));
    expect(fs.existsSync(原)).toBe(false);
  });

  it('存成压缩 转的途中 CRF1 被别人删了：转得完，段签、大小都对（别人抢先不算错）', async () => {
    const fp = 指纹('途中删');
    const 原 = 造(原母版路径('途中删', fp));
    const 原大小 = fs.statSync(原).size;
    const 原sha = await 文件sha(原);
    await 出段签(原, { 段键: '途中删', 指纹: fp, 级别: '视频', 派生: '渲染' });
    const 转 = 存成压缩('途中删', fp, '视频');
    await 等转码开始('途中删');
    fs.rmSync(原, { force: true });
    const r = await 转;
    expect(r.原大小).toBe(原大小);
    expect(fs.existsSync(r.文件)).toBe(true);
    expect(读段签('途中删', fp)!.母版.转码自!.字节sha).toBe(原sha);
    expect(读段签('途中删', fp)!.母版.字节sha).toBe(await 文件sha(r.文件));
  });

  it('存成压缩 转的途中 CRF1 被同一指纹的重渲换了：这份不收，没有半截文件；再转就是新字节', async () => {
    const fp = 指纹('途中换');
    const 原 = 造(原母版路径('途中换', fp));
    await 出段签(原, { 段键: '途中换', 指纹: fp, 级别: '视频', 派生: '渲染' });
    const 新 = 造(path.join(数据根, '途中换新.mkv'), 880);
    const 转 = 存成压缩('途中换', fp, '视频');
    await 等转码开始('途中换');
    fs.renameSync(新, 原);
    await expect(转).rejects.toThrow(/重渲换了/);
    expect(目录里('途中换').filter(是临时名)).toEqual([]);
    expect(fs.existsSync(压缩母版路径('途中换', fp))).toBe(false);
    const 得 = await 备好母版('途中换', fp, '视频');
    expect(读段签('途中换', fp)!.母版.字节sha).toBe(await 文件sha(得!));
  });

  it('取段签 等它放开、重查：CRF1 被转走了就用段签，不再派生', async () => {
    const fp = 指纹('取签');
    const 原 = 造(原母版路径('取签', fp));
    let 取到: Promise<unknown> | undefined;
    await 占着('取签', fp, undefined, async () => {
      取到 = 取段签('取签', fp, '视频', { 等放行: async () => {} });
      await 睡(50);
      await 存成压缩内层('取签', fp, '视频');
      fs.rmSync(原);
    });
    const 签 = (await 取到) as { 母版: { 转码自?: unknown } };
    expect(签.母版.转码自).toBeTruthy();
    expect(fs.existsSync(原)).toBe(false);
  });

  it('--只派生 碰到后台正在转：等它放开，CRF1 已转走就算本来就齐，不抛、不重新派生', async () => {
    const fp = 指纹('只派生');
    const 原 = 造(原母版路径('只派生', fp));
    const 记录 = { 记: vi.fn(), 产物: [] as string[] };
    let 补: Promise<void> | undefined;
    await 占着('只派生', fp, undefined, async () => {
      补 = 补段签([{ 键: '只派生' }] as never, ['视频'], { 记录: 记录 as never, 等放行: async () => {} });
      await 睡(50);
      await 存成压缩内层('只派生', fp, '视频');
      fs.rmSync(原);
    });
    await 补;
    expect(记录.记).not.toHaveBeenCalled();
    expect(记录.产物).toEqual([]);
    expect(读段签('只派生', fp)!.母版.转码自).toBeTruthy();
  });

  it('gc、删已取代 绕开占着的指纹；放了就能删', async () => {
    const fp = 指纹('绕开');
    const 原 = 造(原母版路径('绕开', fp));
    await 存成压缩('绕开', fp, '视频');
    await 占着('绕开', fp, undefined, async () => {
      expect(扫一键('母版', '绕开').媒体.find((f) => f.路径 === 原)!.正在写).toBe(true);
      expect(删已取代('绕开', fp)).toBe(0);
      expect(fs.existsSync(原)).toBe(true);
    });
    expect(删已取代('绕开', fp)).toBeGreaterThan(0);
    expect(fs.existsSync(原)).toBe(false);
  });

  it('删旧 不碰占着的别的指纹（同段另一个 render）', async () => {
    const 新 = 指纹('新指纹');
    const 旧 = 指纹('旧指纹');
    const 旧原 = 造(原母版路径('旁段', 旧));
    写指纹({ 段: '旁段', 指纹: 旧, 算法: '测', 项: { 渲染设置: { inputProps: { 级别: '视频' } } }, 明细: {} } as never);
    await 占着('旁段', 旧, undefined, async () => {
      const r = 删旧('母版', '旁段', '视频', 新, { 主检出: true });
      expect(r.删).toEqual([]);
      expect(r.留[0]!.理由).toContain('正在写');
    });
    expect(fs.existsSync(旧原)).toBe(true);
  });
});
