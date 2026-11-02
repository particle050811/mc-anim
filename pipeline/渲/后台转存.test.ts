// 后台转存的子进程：字节和内联一样、被杀不留孤儿和临时文件、父进程被 SIGKILL 子进程也退、重做字节相同；调度日志和复盘。真 ffmpeg、真子进程，数据根是临时目录。
import crypto from 'node:crypto';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { 阶段记录 } from '../运行记录/阶段.ts';

// realpath：macOS 的 /var → /private/var，ffmpeg 命令行里是哪个要一致（下面按路径找残留进程）
const 数据根 = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'anim-后台转存测试-'));
process.env.ANIM_DATA = 数据根;
vi.mock('../环境/路径.ts', async (原) => ({ ...(await 原<typeof import('../环境/路径.ts')>()), 在主检出: () => true }));

const { 跑后台子进程, 建后台转存 } = await import('./后台转存.ts');
const { 后处理一段 } = await import('./后处理.ts');
const { 压缩母版路径, 原母版路径 } = await import('./母版.ts');
const { 被占着 } = await import('./母版占用.ts');
const { 是临时名 } = await import('../缓存/回收.ts');
const { 文件sha, 读段签 } = await import('../段签/段签.ts');
const { 作品名 } = await import('../环境/作品.ts');
const { 母版目录 } = await import('../环境/配置.ts');
const { 取调度环境 } = await import('../闸/任务.ts');
const { 读调度 } = await import('../闸/调度日志.ts');
const { 复盘 } = await import('../闸/复盘.ts');

afterAll(() => fs.rmSync(数据根, { recursive: true, force: true }));

const 指纹 = (键: string) => crypto.createHash('sha256').update(键).digest('hex');
const 样本 = path.join(数据根, '样本.mkv');
const 有ffmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
beforeAll(() => {
  if (!有ffmpeg) return;
  // 够大才来得及在转码途中杀
  const r = spawnSync('ffmpeg', [
    '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=24:duration=8', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8:sample_rate=48000',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '1', '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le', '-ac', '2', 样本,
  ]);
  if (r.status !== 0) throw new Error(String(r.stderr));
});
const 放样本 = (键: string) => {
  const f = 原母版路径(键, 指纹(键));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.copyFileSync(样本, f);
  return f;
};
const 参数 = (键: string) => ({ 键, 指纹: 指纹(键), 级别: '视频', 作品: 作品名(), 留CRF1: false, 标签: `render:测/${键}:视频` });
const 钩 = () => {
  const 阶段们: 阶段记录[] = [];
  const 警告们: string[] = [];
  return { 阶段们, 警告们, h: { 阶段: (rs: 阶段记录[]) => void 阶段们.push(...rs), 警告: (s: string) => void 警告们.push(s) } };
};
const 睡 = (ms: number) => new Promise((r) => setTimeout(r, ms));
const 等到 = async (条件: () => boolean, 说: string, 最长 = 20_000) => {
  const 起 = Date.now();
  while (!条件()) {
    if (Date.now() - 起 > 最长) throw new Error(`等不到：${说}`);
    await 睡(5);
  }
};
/** 这个键相关的进程（子进程入口的 JSON 参数、ffmpeg 的路径都带键名）；pgrep 找不到退 1 */
const 还活着的 = (键: string) => {
  const r = spawnSync('pgrep', ['-fl', 键], { encoding: 'utf8' });
  return r.stdout.split('\n').filter(Boolean);
};
const 目录里 = (键: string) => fs.readdirSync(母版目录(键));
const 段签临时 = (键: string) => {
  const d = path.join(数据根, 'cache', '段签', 作品名(), 键);
  return fs.existsSync(d) ? fs.readdirSync(d, { recursive: true }).map(String).filter(是临时名) : [];
};
const 等退 = (c: ChildProcess) => new Promise<number | null>((r) => (c.exitCode !== null ? r(c.exitCode) : c.once('close', (code) => r(code))));

/** 假的父进程：调 跑后台子进程，打印结果。要的是真杀它，所以要单独一个进程 */
const 起父进程 = (键: string, 自成一组 = false) => {
  const 脚本 = path.join(数据根, `父-${键}.mjs`);
  fs.writeFileSync(脚本, `const { 跑后台子进程 } = await import(${JSON.stringify(path.join(import.meta.dirname, '后台转存.ts'))});
const 登记 = await import(${JSON.stringify(path.join(import.meta.dirname, '../闸/收尾.ts'))});
// 和 anim render 一样：闸的收尾钩子装在信号上，收到信号就退出
登记.登记收尾(() => {});
const r = await 跑后台子进程(${JSON.stringify(参数(键))}, { 阶段() {}, 警告(s) { console.error(s); } });
console.log(JSON.stringify(r));
`);
  return spawn(process.execPath, [脚本], { stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env }, detached: 自成一组 });
};

describe.skipIf(!有ffmpeg)('后台转存子进程', () => {
  it('转出来和内联（同进程）字节相同，段签、阶段、CRF1 都对', async () => {
    const 后 = 放样本('子进程');
    const k = 钩();
    const r = await 跑后台子进程(参数('子进程'), k.h);
    expect(r).toEqual({ 母版: 压缩母版路径('子进程', 指纹('子进程')), 结局: '压缩' });
    expect(k.警告们).toEqual([]);
    expect(fs.existsSync(后)).toBe(false);
    expect(k.阶段们.map((x) => x.阶段)).toEqual(expect.arrayContaining(['派生段签', '段签：扫母版', '转存', '删旧']));
    放样本('内联');
    await 后处理一段(参数('内联'), { 收: [], 记录: { 记: () => {} } });
    expect(await 文件sha(r!.母版!)).toBe(await 文件sha(压缩母版路径('内联', 指纹('内联'))));
    expect(读段签('子进程', 指纹('子进程'))!.签名).toEqual(读段签('内联', 指纹('内联'))!.签名);
    expect(目录里('子进程').filter(是临时名)).toEqual([]);
  });

  it('作品显式传给子进程：cwd 不在作品里也写进同一个目录', async () => {
    放样本('带作品');
    const k = 钩();
    const 原cwd = process.cwd();
    process.chdir(os.tmpdir());
    try {
      expect((await 跑后台子进程(参数('带作品'), k.h))?.结局).toBe('压缩');
    } finally {
      process.chdir(原cwd);
    }
  });

  it('子进程起来就崩（入口不存在）：返回 null，不抛', async () => {
    const k = 钩();
    const 报 = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    expect(await 跑后台子进程(参数('崩'), k.h, path.join(数据根, '没有这个入口.ts'))).toBeNull();
    报.mockRestore();
  });

  it('父进程 SIGTERM：子进程和 ffmpeg 都没了，临时文件、占用都清掉，CRF1 还在；重做一遍字节相同', async () => {
    const 键 = '杀父';
    const 原 = 放样本(键);
    const 父 = 起父进程(键);
    await 等到(() => 目录里(键).some((n) => n.includes('.转码中-')), '转码开始');
    父.kill('SIGTERM');
    expect(await 等退(父)).toBe(143);
    await 等到(() => 还活着的(键).length === 0, `进程都退了（还有 ${还活着的(键).join('；')}）`);
    expect(目录里(键).filter(是临时名)).toEqual([]);
    expect(被占着(键, 指纹(键))).toBe(false);
    expect(fs.existsSync(原)).toBe(true);
    expect(fs.existsSync(压缩母版路径(键, 指纹(键)))).toBe(false);
    const k = 钩();
    const r = await 跑后台子进程(参数(键), k.h);
    expect(r?.结局).toBe('压缩');
    放样本('杀父对照');
    await 后处理一段(参数('杀父对照'), { 收: [], 记录: { 记: () => {} } });
    expect(await 文件sha(r!.母版!)).toBe(await 文件sha(压缩母版路径('杀父对照', 指纹('杀父对照'))));
  });

  it.each([
    ['SIGHUP', 129, false],
    ['SIGINT', 130, false],
    // 终端里 Ctrl-C：整个前台进程组一起收到，子进程和 ffmpeg 不等父进程发信号也会自己退
    ['Ctrl-C', 130, true],
  ] as const)('父进程 %s：同样收尾', async (名, 码, 整组) => {
    const 键 = `杀父${名}`;
    const 原 = 放样本(键);
    const 父 = 起父进程(键, 整组);
    await 等到(() => 目录里(键).some((n) => n.includes('.转码中-')), '转码开始');
    if (整组) process.kill(-父.pid!, 'SIGINT');
    else 父.kill(名 as NodeJS.Signals);
    expect(await 等退(父)).toBe(码);
    await 等到(() => 还活着的(键).length === 0, `进程都退了（还有 ${还活着的(键).join('；')}）`);
    expect(目录里(键).filter(是临时名)).toEqual([]);
    expect(fs.existsSync(原)).toBe(true);
  });

  it('父进程被 SIGKILL（收不到信号）：子进程靠 IPC 断开发现，也收尾退出', async () => {
    const 键 = '杀死父';
    const 原 = 放样本(键);
    const 父 = 起父进程(键);
    await 等到(() => 目录里(键).some((n) => n.includes('.转码中-')), '转码开始');
    父.kill('SIGKILL');
    await 等退(父);
    await 等到(() => 还活着的(键).length === 0, `进程都退了（还有 ${还活着的(键).join('；')}）`);
    expect(目录里(键).filter(是临时名)).toEqual([]);
    expect(fs.existsSync(原)).toBe(true);
  });

  it('派生段签途中被杀：段签的临时文件也清掉', async () => {
    const 键 = '杀派生';
    放样本(键);
    const 父 = 起父进程(键);
    // 占用一出现就在扫母版（读流的 ffmpeg 开着）
    await 等到(() => 目录里(键).some((n) => n.endsWith('.占用')), '开始后处理');
    await 睡(150);
    父.kill('SIGTERM');
    expect(await 等退(父)).toBe(143);
    await 等到(() => 还活着的(键).length === 0, `进程都退了（还有 ${还活着的(键).join('；')}）`);
    expect(目录里(键).filter(是临时名)).toEqual([]);
    expect(段签临时(键)).toEqual([]);
  });
});

describe('一批的后台：调度日志和复盘', () => {
  it('排、起、止、满、等齐都进日志，复盘算得出后台占了多少、谁没转成', async () => {
    const e = 取调度环境();
    const 起 = 读调度(e.日志目录).length;
    const 放们: ((x: { 母版: string; 结局: '压缩' | '留CRF1' } | null) => void)[] = [];
    const 记录 = { 记: vi.fn(), 阶段: [] as 阶段记录[] };
    const 后台 = 建后台转存({ 级别: '视频', 留CRF1: false, 记录: 记录 as never, 跑: () => new Promise((r) => void 放们.push(r)) });
    const 完们: unknown[] = [];
    for (const 键 of ['甲', '乙', '丙']) 后台.排({ 键, 指纹: 指纹(键), 标签: `标/${键}` }, (x) => void 完们.push(x));
    const 满 = 后台.等空位('丁', '标/丁');
    await 睡(150);
    放们[0]!({ 母版: '甲.x264.mkv', 结局: '压缩' });
    await 满;
    await 等到(() => 放们.length === 2, '第二段开始');
    放们[1]!(null);
    await 等到(() => 放们.length === 3, '第三段开始');
    放们[2]!({ 母版: '丙.mkv', 结局: '留CRF1' });
    await 后台.等齐('批');
    expect(完们).toEqual([{ 母版: '甲.x264.mkv', 结局: '压缩' }, null, { 母版: '丙.mkv', 结局: '留CRF1' }]);
    expect(记录.记).toHaveBeenCalledWith('警告', expect.stringMatching(/乙 的后台转存中断/));
    expect(记录.阶段.map((x) => `${x.标签}:${x.阶段}`)).toEqual(['标/丁:等后台', '批:等后台']);
    const 新 = 读调度(e.日志目录).slice(起);
    expect(新.filter((x) => x.事 === '后台排').map((x) => x.段)).toEqual(['甲', '乙', '丙']);
    expect(新.filter((x) => x.事 === '后台止').map((x) => x.结果)).toEqual(['压缩', '中断', '留CRF1']);
    expect(新.some((x) => x.事 === '后台满' && x.段 === '丁')).toBe(true);
    const r = 复盘(新).后台;
    expect(r.段数).toBe(3);
    expect(r.没转成).toEqual(['乙', '丙']);
    expect(r.限流秒).toBeGreaterThan(0);
    expect(复盘(新).等闸.总秒).toBe(0);
  });
});
