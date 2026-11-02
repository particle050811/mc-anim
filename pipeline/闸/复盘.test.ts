// 复盘的归因和日志过滤。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { 解析参数 } from '../cli/参数.ts';
import { 复盘 } from './复盘.ts';
import { 读调度, 记调度, type 调度事件 } from './调度日志.ts';
import { 读发起者 } from './发起者.ts';
import { 取调度环境 } from './任务.ts';
import { 改调度 } from './改调度.ts';
import { 读状态 } from './看.ts';
import { 跑调度 } from './命令.ts';
import { 领票 } from './票.ts';
let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-复盘-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });
const 序列 = () => { const rows: 调度事件[] = []; return { rows, add: (秒: number, 事: string, x: Record<string, unknown> = {}) => { rows.push({ v: 1, 主机: 'h', 时: new Date(秒 * 1000).toISOString(), 事, 锁: '渲染', ...x }); } }; };
const 机 = () => ({ 负载: 2, 核: 10, 闸: 40, 压力: 1, free: 1, 压缩: 1, swap: 0, 换出: 0, GPU: 0, 热: 0, 盘: 1e10, 孤儿: 0, 进程: '' });
const 参数 = (xs: string[]) => 解析参数(xs, { 值: ['--为什么', '--看到', '--决定'], 开关: ['--杀持锁'] });

describe('等谁', () => {
  it('领票和拿锁按任务关联：改序不丢', () => {
    const { rows, add } = 序列();
    add(0, '拿锁', { 票: 'a', 任务: 'A' }); add(1, '领票', { 票: 'b', 任务: 'B' }); add(5, '改序', { 任务: 'B', 票: 'b2', 原序: 'b', 新序: 'b2' }); add(100, '放锁', { 票: 'a', 任务: 'A', 持锁秒: 100 }); add(100, '拿锁', { 票: 'b2', 任务: 'B' });
    expect(复盘(rows).等谁).toEqual({ 'B→A': 99 });
  });
  it('分锁种：放行队列不算到渲染持锁者头上，等的是什么单列', () => {
    const { rows, add } = 序列();
    add(0, '拿锁', { 票: 'a', 任务: 'A' }); add(1, '领票', { 票: 'p', 任务: 'P', 锁: '放行' }); add(2, '放行等起', { 票: 'p', 任务: 'P', 锁: '放行', 卡在: '间隔、负载' }); add(100, '拿锁', { 票: 'p', 任务: 'P', 锁: '放行' }); add(200, '放锁', { 票: 'a', 任务: 'A', 持锁秒: 200 });
    const r = 复盘(rows);
    expect(r.等谁).toEqual({});
    expect(r.未归因.分解).toEqual({ '放行卡在间隔、负载': 99 });
  });
  it('持锁者崩溃：关闭持锁区间，等它的算它，不算当前持锁，占锁算到最后心跳', () => {
    const { rows, add } = 序列();
    add(0, '拿锁', { 票: 'a', 任务: 'A', 声明: { 用途: '产出' } }); add(1, '领票', { 票: 'b', 任务: 'B' });
    add(100, '崩溃', { 任务: 'A', 票: 'a', 心跳: 30_000 }); add(100, '回收死锁', { 票: 'b', 任务: 'B', 原持有者: { pid: 1, 任务: 'A' } }); add(100, '拿锁', { 票: 'b', 任务: 'B' }); add(120, '放锁', { 票: 'b', 任务: 'B', 持锁秒: 20, 声明: { 用途: '产出' } });
    const r = 复盘(rows);
    expect(r.等谁).toEqual({ 'B→A': 99 });
    expect(r.等闸.其中已崩溃者秒).toBe(99);
    expect(r.当前持锁).toEqual([]);
    expect(r.占锁秒).toEqual({ 产出: 50 });
    expect(r.被杀.map(x => x.事)).toEqual(['崩溃']);
  });
  it('只有回收事件也关闭：在跑文件没了时崩溃事件写不出来', () => {
    const { rows, add } = 序列();
    add(0, '拿锁', { 票: 'a', 任务: 'A' }); add(1, '领票', { 票: 'b', 任务: 'B' }); add(50, '回收死锁', { 票: 'b', 任务: 'B', 原持有者: { pid: 1 } }); add(50, '拿锁', { 票: 'b', 任务: 'B' });
    const r = 复盘(rows);
    expect(r.等谁).toEqual({ 'B→A': 49 });
    expect(r.当前持锁.map(x => x.任务)).toEqual(['B']);
  });
  it('旧闸挡路没有持锁记录：列进未归因并点名 pid，发起者分解也看得到', () => {
    const { rows, add } = 序列();
    add(0, '领票', { 票: 'b', 任务: 'B' }); add(0, '排队', { 票: 'b', 任务: 'B', 等谁: 5067 }); add(600, '拿锁', { 票: 'b', 任务: 'B', 等锁秒: 600, 发起: { 来源: '人', 工作区: '主', 路: '' } });
    const r = 复盘(rows);
    expect(r.等谁).toEqual({});
    expect(r.等闸).toMatchObject({ 总秒: 600, 未归因秒: 600 });
    expect(r.未归因.分解).toEqual({ '旧闸 #5067': 600 });
    expect(r.发起等秒).toEqual({ '人:/主/未声明路→未归因': 600 });
  });
  it('没有领票也没有等锁秒：列无等待数据，不静默丢', () => {
    const { rows, add } = 序列();
    add(10, '拿锁', { 票: 'b', 任务: 'B' });
    const r = 复盘(rows);
    expect(r.未归因.无等待数据次).toBe(1);
    expect(r.未归因.明细).toEqual([{ 任务: 'B', 锁: '渲染', 票: 'b', 原因: '无领票' }]);
  });
  it('等锁秒是总量；等内存单算，不进未归因', () => {
    const { rows, add } = 序列();
    add(0, '拿锁', { 票: 'a', 任务: 'A' }); add(10, '放锁', { 票: 'a', 任务: 'A', 持锁秒: 10 }); add(40, '拿锁', { 票: 'b', 任务: 'B', 等锁秒: 35, 等内存秒: 30 });
    const r = 复盘(rows);
    expect(r.等谁).toEqual({ 'B→A': 5 });
    expect(r.等闸).toMatchObject({ 总秒: 35, 持锁者秒: 5, 内存秒: 30, 未归因秒: 0 });
  });
  it('入选只定汇报哪些：领票在窗口外、挡路者不满足过滤，照样归因', () => {
    const { rows, add } = 序列();
    add(0, '拿锁', { 票: 'a', 任务: 'A', 发起: { 路: '别的路' } }); add(1, '领票', { 票: 'b', 任务: 'B', 发起: { 路: '这路' } }); add(100, '放锁', { 票: 'a', 任务: 'A', 持锁秒: 100, 发起: { 路: '别的路' }, 声明: { 用途: '实验' } }); add(100, '拿锁', { 票: 'b', 任务: 'B', 发起: { 路: '这路' } });
    const r = 复盘(rows, { 入选: x => (x.发起 as { 路?: string } | undefined)?.路 === '这路' && Date.parse(x.时) >= 50_000 });
    expect(r.等谁).toEqual({ 'B→A': 99 });
    expect(r.占锁秒).toEqual({});
  });
  it('没拿到锁就没了的等待和还在等的都列出来', () => {
    const { rows, add } = 序列();
    add(1, '领票', { 票: 'k', 任务: 'K' }); add(10, '被杀', { 任务: 'K' }); add(11, '任务止', { 任务: 'K' }); add(20, '领票', { 票: 'w', 任务: 'W' });
    expect(复盘(rows, { 现在: 50_000 }).没等到).toEqual([
      { 任务: 'K', 锁: '渲染', 票: 'k', 起: new Date(1000).toISOString(), 秒: 9, 结局: '被杀' },
      { 任务: 'W', 锁: '渲染', 票: 'w', 起: new Date(20_000).toISOString(), 秒: 30, 结局: '未结束' },
    ]);
  });
  it('等内存起后被杀：按结束事件计入并标未结束', () => {
    const { rows, add } = 序列();
    add(0, '等内存起', { 票: 'b', 任务: 'B' }); add(8760, '被杀', { 任务: 'B' }); add(8760, '任务止', { 任务: 'B' }); add(9000, '等内存起', { 票: 'c', 任务: 'C' });
    const r = 复盘(rows, { 现在: 9100_000 });
    expect(r.等内存).toEqual({ B: 8760, C: 100 });
    expect(r.等内存未结束).toEqual([expect.objectContaining({ 任务: 'B', 结局: '被杀', 秒: 8760 }), expect.objectContaining({ 任务: 'C', 结局: '未结束' })]);
  });
});

describe('告警到决定', () => {
  it('持锁告警对象是 任务/段，#pid 的决定落库带任务 id，配得上；改序不影响', () => {
    const e = 取调度环境({ 锁目录: dir, 发起者: 读发起者({}, [], dir, false) }), q = path.join(dir, '渲染.排队');
    const t = 领票(q, e.本机, { 任务: '任务甲', 起: 0, 心跳: 0, 主机: e.本机, 发起: e.发起者, 声明: { 种: 'still' } }, Date.now());
    记调度(e.日志目录, '告警', { 类: '排队长', 对象: '任务甲', 票: t.名, pid: process.pid });
    const o = { 状态: () => 读状态(e, 机, false), 输出: () => {} };
    改调度('先', `#${process.pid}`, 参数(['--为什么', '插队']), e, o);
    const 决定 = 读调度(e.日志目录).find(x => x.事 === '决定')!;
    expect(决定).toMatchObject({ 任务: '任务甲', 票: t.名, 目标: `#${process.pid}` });
    expect(复盘(读调度(e.日志目录)).告警到决定秒).toHaveLength(1);
  });
  it('升级连发时从最早那条算；配过的不再配；没指向谁的决定不进统计', () => {
    const { rows, add } = 序列();
    add(0, '告警', { 对象: 'T/段', 次数: 1 }); add(60, '告警', { 对象: 'T/段', 次数: 2 }); add(100, '决定', { 任务: 'T', 决定: '取消' }); add(200, '决定', { 任务: 'T', 决定: '又一次' });
    add(300, '告警', { 类: '负载', 对象: '机器' }); add(400, '决定', { 决定: '错开派活' }); add(500, '告警', { 对象: 'U' }); add(600, '决定', { 任务: 'V' }); add(700, '决定', { 目标: '机器', 决定: '记' });
    expect(复盘(rows).告警到决定秒).toEqual([100, 400]);
  });
});

describe('日志过滤', () => {
  const 环 = () => 取调度环境({ 锁目录: dir, 发起者: 读发起者({}, [], dir, false), 现在毫秒: () => Date.parse('2026-11-01T12:00:00Z') });
  const 跑 = async (e: ReturnType<typeof 环>, ...args: string[]) => { const out: string[] = []; await 跑调度(args, e, s => out.push(s)); return out.join('\n'); };
  const 行数 = (s: string) => s ? s.split('\n').length : 0;
  it('--路 同时查事件顶层的 路 和 发起.路', async () => {
    const e = 环();
    await 跑(e, '路', '开', '纹理核对'); await 跑(e, '令', '纹理核对', '--让路', '产出优先');
    记调度(e.日志目录, '拿锁', { 任务: 'T', 发起: { 路: '纹理核对' } });
    记调度(e.日志目录, '拿锁', { 任务: 'U', 发起: { 路: '别的' } });
    expect(行数(await 跑(e, '日志', '--路', '纹理核对'))).toBe(3);
  });
  it('--从 --到 按时刻比：只给日期的 --到 含当天；月-日和 --日 同格式；写错报用法错误', async () => {
    const e = 环();
    for (const t of ['2026-10-31T23:59:00Z', '2026-11-01T08:00:00Z', '2026-11-02T00:00:00Z']) 记调度(e.日志目录, '测试', {}, Date.parse(t));
    expect(行数(await 跑(e, '日志', '--到', '2026-11-01'))).toBe(2);
    expect(行数(await 跑(e, '日志', '--从', '2026-11-01'))).toBe(2);
    expect(行数(await 跑(e, '日志', '--从', '11-01', '--到', '11-01'))).toBe(1);
    expect(行数(await 跑(e, '日志', '--从', '2026-11-01T08:00:00Z', '--到', '2026-11-01T08:00:00Z'))).toBe(1);
    expect(行数(await 跑(e, '日志', '--到', '2026-11-01T16:00:00+08:00'))).toBe(2);
    expect(行数(await 跑(e, '日志', '--日', '11-01'))).toBe(1);
    for (const [k, v] of [['--到', '乱写'], ['--从', '乱写'], ['--从', '2026-13-45'], ['--日', '11-1']] as const)
      await expect(跑(e, '日志', k, v)).rejects.toThrow(k);
  });
  it('复盘 --日：前一天的领票也配得上；不在窗口里就没有当前持锁；持锁者已死不算', async () => {
    const e = 环();
    const 记 = (t: string, 事: string, x: Record<string, unknown>) => 记调度(e.日志目录, 事, { 锁: '渲染', ...x }, Date.parse(t));
    记('2026-10-31T23:59:00Z', '拿锁', { 票: 'a', 任务: 'A' }); 记('2026-10-31T23:59:30Z', '领票', { 票: 'b', 任务: 'B' }); 记('2026-11-01T00:01:00Z', '放锁', { 票: 'a', 任务: 'A', 持锁秒: 120 }); 记('2026-11-01T00:01:00Z', '拿锁', { 票: 'b', 任务: 'B' });
    const r = JSON.parse(await 跑(e, '复盘', '--日', '11-01'));
    expect(r.等谁).toEqual({ 'B→A': 90 });
    fs.writeFileSync(path.join(dir, '渲染.lock'), `${process.pid}\n`);
    fs.writeFileSync(path.join(dir, '渲染.lock.信息.json'), JSON.stringify({ pid: process.pid, 票: 'b', 任务: 'B', 发起: e.发起者, 声明: {}, 拿锁时: Date.now(), 心跳: Date.now(), 帧时: Date.now(), 已出帧: 0 }));
    expect(JSON.parse(await 跑(e, '复盘')).当前持锁.map((x: { 任务: string }) => x.任务)).toEqual(['B']);
    expect(JSON.parse(await 跑(e, '复盘', '--日', '10-31')).当前持锁).toEqual([]);
    fs.writeFileSync(path.join(dir, '渲染.lock'), '99999998\n');
    expect(JSON.parse(await 跑(e, '复盘')).当前持锁).toEqual([]);
  });
});
