import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { 读机器快照, 读机器快照并行, type 机器快照 } from './机器.ts';
import { 一行状态, 渲染看, 读状态, type 调度状态 } from './看.ts';
import { 判告警, 监测一轮 } from './告警.ts';
import { 盯 } from './盯.ts';
import { 取调度环境 } from './任务.ts';
import { 过渲染闸 } from './闸.ts';
import { 读调度 } from './调度日志.ts';

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-thermal-gate-')); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
const 机 = (等级: number | null = 0): 机器快照 => ({ 负载: 1, 核: 10, 闸: 80, 压力: 1, free: 1e9, 压缩: 0, swap: 0, 换出: 0, GPU: 0, 热: 等级, 芯片最高温: 83.2, 发热等级: 等级, 盘: 1e11, 孤儿: 0, 进程: '' });
const 状态 = (等级: number | null): 调度状态 => ({ 时: 0, 机: 机(等级), 票: [], 持锁: [], 在跑: [], 最近: [] });

it('一行和完整视图展示芯温和零级，缺读数不显示，旧快照仍能读', () => {
  for (const 格式 of [一行状态, 渲染看]) {
    expect(格式(状态(0))).toContain('芯温83.2°C 热0');
    const s = 状态(null); s.机.芯片最高温 = null;
    expect(格式(s)).not.toMatch(/芯温|热/);
    delete s.机.芯片最高温; delete s.机.发热等级;
    expect(格式(s)).not.toMatch(/芯温|热/);
  }
  expect(JSON.parse(JSON.stringify(状态(2))).机).toMatchObject({ 芯片最高温: 83.2, 发热等级: 2 });
});

it.each([null, 0, 1, 2, 3, 4])('发热等级 %s：仅 ≥3 告警，温度高本身不告警', 等级 => {
  const s = 状态(等级); s.机.芯片最高温 = 110;
  const 报 = 判告警(s, 0).filter(x => x.类 === '发热');
  expect(报).toHaveLength(等级 !== null && 等级 >= 3 ? 1 : 0);
  if (报.length) expect(报[0]).toMatchObject({ 对象: '机器', 阈值: 3, 值: 等级 });
});

it('2 不叫醒，3 叫醒一次，重挂及升到 4 仍按现有公式去重', async () => {
  let now = 0, 等级 = 2;
  const e = 取调度环境({ 锁目录: dir, 现在毫秒: () => now }), 输出: string[] = [];
  const opts = { 最长: 10, 父活: () => true, 输出: (s: string) => 输出.push(s), 读: () => ({ ...状态(等级), 时: now }), 睡: async (ms: number) => { now += ms; } };
  expect(await 盯(e, opts)).toBe(124);
  expect(输出).toHaveLength(0);
  等级 = 3;
  expect(await 盯(e, opts)).toBe(0);
  expect(输出[0]).toContain('发热 机器');
  expect(await 盯(e, opts)).toBe(124);
  expect(输出).toHaveLength(1);
  等级 = 4;
  expect(await 盯(e, opts)).toBe(124);
  expect(输出).toHaveLength(1);
  expect(读调度(e.日志目录).filter(x => x.事 === '告警')).toHaveLength(1);
});

it.each([180, 300, 600])('五次独立渲染间隔 %s 秒，每次升到 2 再回落都不叫醒', async 间隔 => {
  let now = 0, 开始 = 0;
  const e = 取调度环境({ 锁目录: dir, 现在毫秒: () => now }), 输出: string[] = [];
  const opts = { 最长: 600, 父活: () => true, 输出: (s: string) => 输出.push(s), 读: () => ({ ...状态(now - 开始 < 186_000 ? 0 : 2), 时: now }), 睡: async (ms: number) => { now += ms; } };
  for (let 次 = 0; 次 < 5; 次++) {
    开始 = now;
    expect(await 盯(e, opts)).toBe(124);
    now = 开始 + 626_000;
    监测一轮(e, { ...状态(1), 时: now });
    now = 开始 + 665_000;
    监测一轮(e, { ...状态(0), 时: now });
    now = 开始 + (600 + 间隔) * 1000;
  }
  expect(输出).toHaveLength(0);
  expect(读调度(e.日志目录).filter(x => x.事 === '告警')).toHaveLength(0);
});

it('恒为 2，采样中断 6 分钟再挂盯也不叫醒', async () => {
  let now = 0;
  const e = 取调度环境({ 锁目录: dir, 现在毫秒: () => now }), 输出: string[] = [];
  const opts = { 最长: 10, 父活: () => true, 输出: (s: string) => 输出.push(s), 读: () => ({ ...状态(2), 时: now }), 睡: async (ms: number) => { now += ms; } };
  expect(await 盯(e, opts)).toBe(124);
  now += 360_000;
  expect(await 盯(e, opts)).toBe(124);
  expect(输出).toHaveLength(0);
  expect(读调度(e.日志目录).filter(x => x.事 === '告警')).toHaveLength(0);
});

it('高温不挡渲染，领票拿锁放锁都留下两项机器读数', async () => {
  const m = 机(4), fn = vi.fn(async () => '已渲');
  const e = 取调度环境({ 锁目录: dir });
  expect(await 过渲染闸(fn, () => {}, { ...e, 读机器: () => m, 读内存: () => null, 读压力: () => 1, 一分钟负载: () => 0, 核数: () => 10 }, { 种: 'render' })).toBe('已渲');
  expect(fn).toHaveBeenCalledOnce();
  const rows = 读调度(e.日志目录).filter(x => ['领票', '拿锁', '放锁'].includes(x.事));
  expect(rows).toHaveLength(3);
  for (const row of rows) expect(row.机).toMatchObject({ 芯片最高温: 83.2, 发热等级: 4 });
});

it('把温度读数函数换成失败，同步及异步调度和渲染闸照常', async () => {
  const 失败 = () => { throw new Error('读不到传感器'); };
  const m = 读机器快照(失败);
  expect(m).toMatchObject({ 芯片最高温: null, 发热等级: null });
  const p = await 读机器快照并行(async () => '', async () => 失败());
  expect(p).toMatchObject({ 芯片最高温: null, 发热等级: null });
  const e = 取调度环境({ 锁目录: dir }), s = 读状态(e, () => m);
  expect(一行状态(s)).not.toMatch(/芯温|热/);
  expect(await 过渲染闸(async () => '正常', () => {}, { ...e, 读机器: () => m, 读内存: () => null, 读压力: () => 1, 一分钟负载: () => 0 }, { 种: 'render' })).toBe('正常');
});
