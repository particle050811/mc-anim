import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { 读机器快照, 读机器快照并行, type 机器快照 } from './机器.ts';
import { 过渲染闸, 闸记被杀, type 闸环境 } from './闸.ts';
import { 取调度环境 } from './任务.ts';
import { 读发起者 } from './发起者.ts';
import { 列票 } from './票.ts';
vi.mock('./机器.ts', async (原) => ({ ...await 原<typeof import('./机器.ts')>(), 读机器快照: vi.fn(), 读机器快照并行: vi.fn() }));
const 机 = (): 机器快照 => ({ 负载: 1, 核: 10, 闸: 80, 压力: 1, free: 1e9, 压缩: 0, swap: 0, 换出: 0, GPU: 0, 热: 0, 芯片最高温: 50, 发热等级: 0, 盘: 1e11, 孤儿: 0, 进程: '' });
let dir: string;
beforeEach(() => { vi.resetAllMocks(); dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-采样中被杀-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });
it('首轮采样途中被杀：票已删', async () => {
  const e: 闸环境 = { ...取调度环境({ 锁目录: dir, 发起者: 读发起者({}, [], dir, false) }), 内存下限: 30, 读内存: () => ({ 总: 100, 空闲: 80, 空闲百分比: 80, 交换区总: 0, 交换区已用: 0 }), 读压力: () => 1, 一分钟负载: () => 0, 核数: () => 10, 睡: vi.fn(async () => {}), 清孤儿: () => [], 读机器: 读机器快照 };
  vi.mocked(读机器快照).mockReturnValue(机());
  let 放!: () => void, 到采样!: () => void;
  const 采样已开始 = new Promise<void>(r => { 到采样 = r; });
  vi.mocked(读机器快照并行).mockImplementation(() => new Promise<机器快照>(r => {
    放 = () => r(机());
    到采样();
  }));
  const q = path.join(dir, '渲染.排队');
  const 跑 = 过渲染闸(async () => {}, () => {}, e, { 种: 'render' });
  await 采样已开始;
  try {
    expect(列票(q)).toHaveLength(1);
    闸记被杀('SIGTERM');
    expect(列票(q)).toEqual([]);
    expect(fs.existsSync(path.join(dir, '渲染.lock'))).toBe(false);
  } finally {
    放();
    await 跑;
  }
});
