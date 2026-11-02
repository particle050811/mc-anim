// 一段渲完的收尾：次序、失败语义（段签没成不转、转存没成留 CRF1，都只警告）、别人抢先。真 ffmpeg，数据根是临时目录。
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { 阶段记录 } from '../运行记录/阶段.ts';

const 数据根 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-后处理测试-'));
process.env.ANIM_DATA = 数据根;
vi.mock('../闸/闸.ts', async (原) => ({ ...(await 原<typeof import('../闸/闸.ts')>()), 过渲染闸: <T>(fn: () => Promise<T>) => fn() }));
vi.mock('../环境/路径.ts', async (原) => ({ ...(await 原<typeof import('../环境/路径.ts')>()), 在主检出: () => true }));

const { 后处理一段 } = await import('./后处理.ts');
const { 压缩母版路径, 原母版路径 } = await import('./母版.ts');
const { 被占着 } = await import('./母版占用.ts');
const { 文件sha, 读段签 } = await import('../段签/段签.ts');
const { 作品名 } = await import('../环境/作品.ts');

afterAll(() => fs.rmSync(数据根, { recursive: true, force: true }));

const 指纹 = (键: string) => crypto.createHash('sha256').update(键).digest('hex');
const 造 = (f: string) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const r = spawnSync('ffmpeg', [
    '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=24:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2.1:sample_rate=48000',
    '-c:v', 'libx264', '-crf', '1', '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le', '-ac', '2', f,
  ]);
  if (r.status !== 0) throw new Error(String(r.stderr));
  return f;
};
const 有ffmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
const 参数 = (键: string, 多: { 留CRF1?: boolean } = {}) => ({ 键, 指纹: 指纹(键), 级别: '视频', 作品: 作品名(), 留CRF1: false, 标签: `render:测/${键}:视频`, ...多 });
const 钩 = () => {
  const 收: 阶段记录[] = [];
  const 警告们: string[] = [];
  return { 收, 警告们, 记录: { 记: (_: string, s: string) => void 警告们.push(s) } };
};

describe.skipIf(!有ffmpeg)('后处理一段', () => {
  it('次序：段签 → 转存 → 删 CRF1 → 删旧；放了占用', async () => {
    const 原 = 造(原母版路径('全程', 指纹('全程')));
    const 原sha = await 文件sha(原);
    const h = 钩();
    const r = await 后处理一段(参数('全程'), h);
    expect(r).toEqual({ 母版: 压缩母版路径('全程', 指纹('全程')), 结局: '压缩' });
    expect(fs.existsSync(原)).toBe(false);
    expect(h.警告们).toEqual([]);
    expect(h.收.map((x) => x.阶段).filter((x) => !x.startsWith('段签：'))).toEqual(['派生段签', '转存', '删旧']);
    expect(h.收.map((x) => x.阶段)).toContain('段签：扫母版');
    const 签 = 读段签('全程', 指纹('全程'))!;
    expect(签.派生).toBe('渲染');
    expect(签.母版.转码自!.字节sha).toBe(原sha);
    expect(被占着('全程', 指纹('全程'))).toBe(false);
  });

  it('留CRF1：转了不删', async () => {
    const 原 = 造(原母版路径('留', 指纹('留')));
    const r = await 后处理一段(参数('留', { 留CRF1: true }), 钩());
    expect(r.结局).toBe('压缩');
    expect(fs.existsSync(原)).toBe(true);
    expect(fs.existsSync(压缩母版路径('留', 指纹('留')))).toBe(true);
  });

  it('段签没成：警告，不转，CRF1 留着，不抛', async () => {
    const 原 = 原母版路径('坏签', 指纹('坏签'));
    fs.mkdirSync(path.dirname(原), { recursive: true });
    fs.writeFileSync(原, '不是视频');
    const h = 钩();
    const r = await 后处理一段(参数('坏签'), h);
    expect(r).toEqual({ 母版: 原, 结局: '留CRF1' });
    expect(fs.existsSync(原)).toBe(true);
    expect(h.警告们.join()).toMatch(/坏签 渲好了，段签没派生成.*--只派生 再补/);
    expect(h.收.map((x) => x.阶段)).toContain('派生段签');
    expect(h.收.map((x) => x.阶段)).not.toContain('转存');
    expect(h.收.map((x) => x.阶段)).toContain('删旧');
  });

  it('转存没成：警告，CRF1 留着，段签在，不抛', async () => {
    const 原 = 造(原母版路径('坏转', 指纹('坏转')));
    fs.mkdirSync(压缩母版路径('坏转', 指纹('坏转')));
    const h = 钩();
    const r = await 后处理一段(参数('坏转'), h);
    fs.rmdirSync(压缩母版路径('坏转', 指纹('坏转')));
    expect(r).toEqual({ 母版: 原, 结局: '留CRF1' });
    expect(fs.existsSync(原)).toBe(true);
    expect(读段签('坏转', 指纹('坏转'))).not.toBeNull();
    expect(h.警告们.join()).toMatch(/坏转 渲好了，转存压缩母版没成.*CRF1 留着/);
  });

  it('CRF1 已被别人转走删了：不抛不警告，用压缩母版', async () => {
    const 压 = 压缩母版路径('抢走', 指纹('抢走'));
    fs.mkdirSync(path.dirname(压), { recursive: true });
    fs.writeFileSync(压, '压缩');
    const h = 钩();
    expect(await 后处理一段(参数('抢走'), h)).toEqual({ 母版: 压, 结局: '别人转了' });
    expect(h.警告们).toEqual([]);
  });

  it('CRF1 和压缩母版都没了：警告要重渲，算丢了，不抛', async () => {
    const h = 钩();
    expect(await 后处理一段(参数('丢'), h)).toEqual({ 母版: null, 结局: '丢了' });
    expect(h.警告们.join()).toMatch(/丢 的 CRF1 不见了.*要重渲/);
  });
});
