// 路令在排队循环里抛 调度让路：调用方把它当普通失败吞掉的话，重任务继续跑、退出码也不是 75。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { 调度让路 } from './指令.ts';
const 假 = vi.hoisted(() => ({ 原: '', 段签错: null as (() => Error) | null }));
vi.mock('../段签/补.ts', () => ({ 取段签: async () => { throw 假.段签错!(); } }));
vi.mock('../缓存/当前指纹.ts', () => ({ 当前母版们: async () => [{ 作品: '作', 键: '段', 指纹: 'f', 级别: '视频' }] }));
vi.mock('../渲/母版.ts', async orig => ({ ...(await orig<object>()), 原母版路径: () => 假.原, 压缩母版路径: () => 假.原 + '.不存在' }));
vi.mock('../段签/段签.ts', async orig => ({ ...(await orig<object>()), 读段签: () => null, 段签齐: () => false }));
vi.mock('../闸/闸.ts', async orig => ({ ...(await orig<object>()), 过渲染闸: async () => { throw new 调度让路('先交产出'); } }));
const 记录 = () => ({ 记: vi.fn() }) as never;
afterEach(() => { vi.restoreAllMocks(); });

it('film 取段签：路令透传，别的错还是只警告', async () => {
  const { 取段签们 } = await import('../合成/成片.ts'), 截们 = [{ 段: { 键: '段' }, 指纹: 'f' }] as never;
  假.段签错 = () => new 调度让路('先交产出');
  await expect(取段签们(截们, '视频' as never, 记录())).rejects.toBeInstanceOf(调度让路);
  假.段签错 = () => Error('坏文件');
  const r = 记录();
  await 取段签们(截们, '视频' as never, r);
  expect((r as { 记: ReturnType<typeof vi.fn> }).记.mock.calls[0]![1]).toContain('坏文件');
});

it('cache 转存：路令透传，不算成 N 个失败', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-让路-'));
  假.原 = path.join(dir, '母版.mkv');
  fs.writeFileSync(假.原, '');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    const { 迁移转存 } = await import('../缓存/迁移转存.ts');
    await expect(迁移转存(['作'], { 执行: true, 详细: false, 记录: 记录() })).rejects.toBeInstanceOf(调度让路);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
