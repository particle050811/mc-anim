import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { 读温度并行 } from '../环境/温度.ts';
import { 明细收集, 明细报告, 明细一览 } from './渲染明细.ts';

vi.mock('../环境/温度.ts', () => ({ 读温度并行: vi.fn(), 无温度: () => ({ 芯片最高温: null, 发热等级: null }) }));
let dir: string;
const 读 = vi.mocked(读温度并行);
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-thermal-detail-'));
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(1_000_000);
  读.mockReset().mockResolvedValue({ 芯片最高温: 71, 发热等级: 0 });
});
afterEach(() => { vi.useRealTimers(); fs.rmSync(dir, { recursive: true, force: true }); });

it('复用机器采样时钟，开始、过程、结束与帧耗时同起点，最高值不是结束值', async () => {
  读.mockResolvedValueOnce({ 芯片最高温: 70, 发热等级: 0 })
    .mockResolvedValueOnce({ 芯片最高温: 91, 发热等级: 2 })
    .mockResolvedValueOnce({ 芯片最高温: 82, 发热等级: 1 });
  const c = new 明细收集('render:作/温度:视频');
  await c.包(async () => {
    await vi.advanceTimersByTimeAsync(10_000);
    c.帧完成(1);
    await vi.advanceTimersByTimeAsync(2000);
    c.帧完成(2);
  });
  expect(vi.getTimerCount()).toBe(0);
  const { 文件, 明细: d } = await c.写出([], {}, dir);
  expect(读).toHaveBeenCalledTimes(3);
  expect(d.系统.map(s => [s.秒, s.时点, s.芯片最高温, s.发热等级])).toEqual([[0, '开始', 70, 0], [10, '采样', 91, 2], [12, '结束', 82, 1]]);
  expect(d.帧.map(f => f.毫秒)).toEqual([10_000, 2000]);
  expect(d.温度).toEqual({ 开始: { 芯片最高温: 70, 发热等级: 0 }, 结束: { 芯片最高温: 82, 发热等级: 1 }, 最高: { 芯片最高温: 91, 发热等级: 2 } });
  expect(JSON.parse(fs.readFileSync(文件!, 'utf8')).温度).toEqual(d.温度);
  for (const out of [明细报告(d), 明细一览([{ 明细: d }])]) expect(out).toContain('最高芯温 91.0°C，最高发热等级 2');
});

it('不足一个周期的短渲染仍有开始结束，正常等级 0 不会消失', async () => {
  const c = new 明细收集('render:作/短渲:视频');
  await c.包(async () => { await vi.advanceTimersByTimeAsync(50); c.帧完成(1); });
  const { 明细: d } = await c.写出([], {}, dir);
  expect(d.系统.map(s => [s.秒, s.时点])).toEqual([[0, '开始'], [0.05, '结束']]);
  expect(d.温度?.最高).toEqual({ 芯片最高温: 71, 发热等级: 0 });
  expect(明细报告(d)).toContain('最高发热等级 0');
});

it.each(['拒绝', '抛错'])('读数函数%s时渲染照常，null 不冒充零，也不影响写明细', async 种 => {
  if (种 === '拒绝') 读.mockRejectedValue(new Error('无权限'));
  else 读.mockImplementation(() => { throw new Error('读不到'); });
  const c = new 明细收集('render:作/失败退化:视频');
  expect(await c.包(async () => { c.帧完成(1); return '渲完'; })).toBe('渲完');
  const { 文件, 明细: d } = await c.写出([], {}, dir);
  expect(文件).not.toBeNull();
  expect(d.帧).toHaveLength(1);
  expect(d.系统).toHaveLength(2);
  for (const s of d.系统) expect(s).toMatchObject({ 芯片最高温: null, 发热等级: null });
  for (const x of Object.values(d.温度!)) expect(x).toEqual({ 芯片最高温: null, 发热等级: null });
  expect(明细报告(d)).not.toMatch(/最高芯温|最高发热等级/);
});

it('一项缺失独立保留另一项；旧明细不伪造温度', async () => {
  读.mockResolvedValue({ 芯片最高温: null, 发热等级: 2 });
  const c = new 明细收集('render:作/部分读数:视频');
  await c.包(async () => {});
  const { 明细: d } = await c.写出([], {}, dir);
  expect(d.温度?.最高).toEqual({ 芯片最高温: null, 发热等级: 2 });
  expect(明细报告(d)).toContain('最高发热等级 2');
  expect(明细报告(d)).not.toContain('最高芯温');
  delete d.温度;
  expect(明细报告(d)).not.toMatch(/最高芯温|最高发热等级/);
});

it('不收日志时不采样、不写温度，不把未采伪装成读不到', async () => {
  const c = new 明细收集('bench:作/不收日志:视频');
  c.帧完成(1);
  const { 文件, 明细: d } = await c.写出([], {}, dir);
  expect(读).not.toHaveBeenCalled();
  expect(d.系统).toEqual([]);
  expect(d.温度).toBeUndefined();
  expect(JSON.parse(fs.readFileSync(文件!, 'utf8'))).not.toHaveProperty('温度');
  expect(明细报告(d)).not.toMatch(/最高芯温|最高发热等级/);
});
