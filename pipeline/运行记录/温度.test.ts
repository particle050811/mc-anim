import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readTempParallel } from '../环境/温度.ts';
import { DetailCollector, detailReport, detailOverview } from './渲染明细.ts';

vi.mock('../环境/温度.ts', () => ({ readTempParallel: vi.fn(), noTempReading: () => ({ 芯片最高温: null, 发热等级: null }) }));
let dir: string;
const tempReader = vi.mocked(readTempParallel);
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-thermal-detail-'));
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(1_000_000);
  tempReader.mockReset().mockResolvedValue({ 芯片最高温: 71, 发热等级: 0 });
});
afterEach(() => { vi.useRealTimers(); fs.rmSync(dir, { recursive: true, force: true }); });

it('复用机器采样时钟，开始、过程、结束与帧耗时同起点，最高值不是结束值', async () => {
  tempReader.mockResolvedValueOnce({ 芯片最高温: 70, 发热等级: 0 })
    .mockResolvedValueOnce({ 芯片最高温: 91, 发热等级: 2 })
    .mockResolvedValueOnce({ 芯片最高温: 82, 发热等级: 1 });
  const c = new DetailCollector('render:作/温度:视频');
  await c.包(async () => {
    await vi.advanceTimersByTimeAsync(10_000);
    c.frameDone(1);
    await vi.advanceTimersByTimeAsync(2000);
    c.frameDone(2);
  });
  expect(vi.getTimerCount()).toBe(0);
  const { 文件: file, 明细: d } = await c.writeOut([], {}, dir);
  expect(tempReader).toHaveBeenCalledTimes(3);
  expect(d.系统.map(s => [s.秒, s.timePoint, s.芯片最高温, s.发热等级])).toEqual([[0, '开始', 70, 0], [10, '采样', 91, 2], [12, '结束', 82, 1]]);
  expect(d.帧.map(f => f.毫秒)).toEqual([10_000, 2000]);
  expect(d.temperature).toEqual({ 开始: { 芯片最高温: 70, 发热等级: 0 }, 结束: { 芯片最高温: 82, 发热等级: 1 }, peak: { 芯片最高温: 91, 发热等级: 2 } });
  expect(JSON.parse(fs.readFileSync(file!, 'utf8')).温度).toEqual(d.temperature);
  for (const out of [detailReport(d), detailOverview([{ 明细: d }])]) expect(out).toContain('最高芯温 91.0°C，最高发热等级 2');
});

it('不足一个周期的短渲染仍有开始结束，正常等级 0 不会消失', async () => {
  const c = new DetailCollector('render:作/短渲:视频');
  await c.包(async () => { await vi.advanceTimersByTimeAsync(50); c.frameDone(1); });
  const { 明细: d } = await c.writeOut([], {}, dir);
  expect(d.系统.map(s => [s.秒, s.timePoint])).toEqual([[0, '开始'], [0.05, '结束']]);
  expect(d.temperature?.peak).toEqual({ 芯片最高温: 71, 发热等级: 0 });
  expect(detailReport(d)).toContain('最高发热等级 0');
});

it.each(['拒绝', '抛错'])('读数函数%s时渲染照常，null 不冒充零，也不影响写明细', async failKind => {
  if (failKind === '拒绝') tempReader.mockRejectedValue(new Error('无权限'));
  else tempReader.mockImplementation(() => { throw new Error('读不到'); });
  const c = new DetailCollector('render:作/失败退化:视频');
  expect(await c.包(async () => { c.frameDone(1); return '渲完'; })).toBe('渲完');
  const { 文件: file, 明细: d } = await c.writeOut([], {}, dir);
  expect(file).not.toBeNull();
  expect(d.帧).toHaveLength(1);
  expect(d.系统).toHaveLength(2);
  for (const s of d.系统) expect(s).toMatchObject({ 芯片最高温: null, 发热等级: null });
  for (const x of Object.values(d.temperature!)) expect(x).toEqual({ 芯片最高温: null, 发热等级: null });
  expect(detailReport(d)).not.toMatch(/最高芯温|最高发热等级/);
});

it('一项缺失独立保留另一项；旧明细不伪造温度', async () => {
  tempReader.mockResolvedValue({ 芯片最高温: null, 发热等级: 2 });
  const c = new DetailCollector('render:作/部分读数:视频');
  await c.包(async () => {});
  const { 明细: d } = await c.writeOut([], {}, dir);
  expect(d.temperature?.peak).toEqual({ 芯片最高温: null, 发热等级: 2 });
  expect(detailReport(d)).toContain('最高发热等级 2');
  expect(detailReport(d)).not.toContain('最高芯温');
  delete d.temperature;
  expect(detailReport(d)).not.toMatch(/最高芯温|最高发热等级/);
});

it('不收日志时不采样、不写温度，不把未采伪装成读不到', async () => {
  const c = new DetailCollector('bench:作/不收日志:视频');
  c.frameDone(1);
  const { 文件: file, 明细: d } = await c.writeOut([], {}, dir);
  expect(tempReader).not.toHaveBeenCalled();
  expect(d.系统).toEqual([]);
  expect(d.temperature).toBeUndefined();
  expect(JSON.parse(fs.readFileSync(file!, 'utf8'))).not.toHaveProperty('温度');
  expect(detailReport(d)).not.toMatch(/最高芯温|最高发热等级/);
});
