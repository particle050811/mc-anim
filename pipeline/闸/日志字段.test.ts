// 日志字段按方案第 14 节：真实流程走临时锁目录和注入的读数。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { 解析参数 } from '../cli/参数.ts';
import { 读调度 } from './调度日志.ts';
import { 读发起者 } from './发起者.ts';
import { 取调度环境, 开任务 } from './任务.ts';
import { 改调度 } from './改调度.ts';
import { 读状态 } from './看.ts';
import { 列票, 领票, 写票 } from './票.ts';
import { 过放行闸, 过渲染闸, type 闸环境 } from './闸.ts';
let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-日志字段-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });
const 机 = () => ({ 负载: 2, 核: 10, 闸: 40, 压力: 1, free: 1, 压缩: 1, swap: 0, 换出: 0, GPU: 0, 热: 0, 盘: 1e10, 孤儿: 0, 进程: '不该进日志的进程表' });
const 参数 = (xs: string[]) => 解析参数(xs, { 值: ['--为什么', '--看到', '--决定'], 开关: ['--杀持锁'] });
const 内存 = (n: number) => ({ 总: 100, 空闲: n, 空闲百分比: n, 交换区总: 0, 交换区已用: 0 });
const 闸环 = (x: Partial<闸环境> = {}): Partial<闸环境> => ({ 锁目录: dir, 本机: os.hostname(), 内存下限: 30, 读内存: () => 内存(80), 读压力: () => 1, 一分钟负载: () => 0, 核数: () => 10, 读机器: 机, 清孤儿: () => [], 排队间隔毫秒: 1, ...x });
const 日志 = () => 读调度(path.join(dir, 'logs'));
const 活票 = (任务: string, pid = process.ppid, 序 = '000000000000100') => { const q = path.join(dir, '渲染.排队'), 名 = `${序}-${os.hostname().replace(/[^A-Za-z0-9._-]/g, '_')}-${pid}`; fs.mkdirSync(q, { recursive: true }); fs.writeFileSync(path.join(q, 名), JSON.stringify({ v: 1, 任务, 起: Date.now(), 发起: 读发起者({}, [], dir, false), 声明: { 种: 'still' } })); return 名; };

describe('日志字段', () => {
  it('领票、拿锁、放锁带 队 和 机（不带进程表），拿锁带等内存秒和被越次数', async () => {
    await 过渲染闸(async () => {}, () => {}, 闸环(), { 种: 'still' });
    const rows = 日志(), 取 = (事: string) => rows.find(x => x.事 === 事)!;
    for (const 事 of ['领票', '拿锁', '放锁']) {
      expect(取(事).队).toMatchObject({ 深度: 0, 前面: [] });
      expect(取(事).机).toMatchObject({ 负载: 2, 闸: 40 });
      expect(JSON.stringify(取(事))).not.toContain('不该进日志');
    }
    expect(取('拿锁')).toMatchObject({ 等内存秒: 0, 被越次数: 0, 等锁秒: expect.any(Number) });
    expect(取('放锁').队).toMatchObject({ 持锁: process.pid });
  });
  it('等内存：起止带机，拿锁累计等内存秒', async () => {
    let now = Date.now(), 空闲 = 10;
    await 过渲染闸(async () => {}, () => {}, 闸环({ 现在毫秒: () => now, 读内存: () => 内存(空闲), 睡: async () => { now += 60_000; if (now > Date.now() + 200_000) 空闲 = 80; } }), { 种: 'still' });
    const rows = 日志(), 起 = rows.find(x => x.事 === '等内存起')!, 止 = rows.find(x => x.事 === '等内存止')!;
    expect(起).toMatchObject({ 锁: '渲染', 机: { 闸: 40 } });
    expect(止).toMatchObject({ 锁: '渲染', 机: { 闸: 40 } });
    expect(止.秒).toBeGreaterThan(0);
    expect(rows.find(x => x.事 === '拿锁')!.等内存秒).toBe(止.秒);
  });
  it('放行闸的拿锁和放行事件带锁种、等内存秒和读数', async () => {
    let now = Date.now(), 空闲 = 10;
    await 过放行闸(async () => {}, () => {}, 闸环({ 现在毫秒: () => now, 读内存: () => 内存(空闲), 睡: async () => { now += 60_000; 空闲 = 80; } }), { 种: 'bake' });
    const rows = 日志(), 拿 = rows.find(x => x.事 === '拿锁')!, 放行 = rows.find(x => x.事 === '放行')!;
    expect(rows.find(x => x.事 === '放行等起')).toMatchObject({ 锁: '放行', 卡在: '内存' });
    expect(拿.等内存秒).toBe(60);
    expect(放行).toMatchObject({ 锁: '放行', 机: { 负载: 0, 闸: 80, 压力: 1 } });
  });
  it('已被越有写入者：先 给越过的票加一，暂缓和后面的不算；计数写进拿锁', async () => {
    const e = 取调度环境({ 锁目录: dir, 发起者: 读发起者({}, [], dir, false) }), q = path.join(dir, '渲染.排队');
    const 票 = (任务: string) => 领票(q, e.本机, { 任务, 起: 0, 心跳: 0, 主机: e.本机, 发起: e.发起者, 声明: { 种: 'still' } }, Date.now());
    票('甲'); 票('乙');
    const c = 票('丙');
    票('丁');
    const 读 = (任务: string) => 列票(q).find(x => x.内容?.任务 === 任务)!.内容!;
    改调度('先', c.名, 参数(['--为什么', '插队']), e, { 状态: () => 读状态(e, 机, false), 输出: () => {} });
    expect([读('甲').已被越, 读('乙').已被越, 读('丙').已被越, 读('丁').已被越]).toEqual([1, 1, undefined, undefined]);
    for (const x of 列票(q)) fs.rmSync(x.文件);
    fs.writeFileSync(path.join(dir, '渲染.lock'), `${process.ppid}\n`);
    await 过渲染闸(async () => {}, () => {}, 闸环({ 睡: async () => {
      const 我 = 列票(q)[0]!;
      我.内容!.已被越 = 2; 写票(我);
      fs.rmSync(path.join(dir, '渲染.lock'), { force: true });
    } }), { 种: 'still' });
    expect(日志().find(x => x.事 === '拿锁')!.被越次数).toBe(2);
  });
  it('放行越队拿锁时，前面的活票也记被越', async () => {
    const 前 = 活票('前面的'), q = path.join(dir, '渲染.排队');
    const e = 取调度环境({ 锁目录: dir, 发起者: 读发起者({}, [], dir, false) });
    await 过渲染闸(async () => {
      expect(JSON.parse(fs.readFileSync(path.join(q, 前), 'utf8')).已被越).toBe(1);
    }, () => {}, 闸环({ 睡: async () => {
      const 我 = 列票(q).find(x => x.名 !== 前)!;
      改调度('放行', 我.名, 参数(['--为什么', '急']), e, { 状态: () => 读状态(e, 机, false), 输出: () => {} });
    } }), { 种: 'still' });
  });
  it('被杀说清当时持锁还是排队、已跑几秒、取消几秒内退出；限时杀说已跑', async () => {
    const fixture = path.join(import.meta.dirname, 'fixtures/持锁子进程.ts');
    const 起 = (env: Record<string, string> = {}) => spawn(process.execPath, [fixture, dir], { stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, ...env } });
    const 就绪 = (c: ReturnType<typeof 起>) => new Promise<void>((ok, no) => { c.stdout!.on('data', d => { if (String(d).includes('ready')) ok(); }); c.once('exit', () => no(Error('子进程提前退出'))); });
    const 持 = 起();
    await 就绪(持);
    const 等 = 起();
    for (let i = 0; i < 200 && !日志().some(x => x.事 === '排队' && (x.发起 as { pid?: number }).pid === 等.pid); i++) await new Promise(r => setTimeout(r, 20));
    const 等退 = once(等, 'exit'); 等.kill('SIGTERM'); await 等退;
    const 任务 = JSON.parse(fs.readFileSync(path.join(dir, '渲染.lock.信息.json'), 'utf8')).任务;
    fs.mkdirSync(path.join(dir, '指令'), { recursive: true });
    fs.writeFileSync(path.join(dir, '指令', 任务 + '.json'), JSON.stringify({ 动作: '取消', 为什么: '测试', 时: Date.now() - 2000 }));
    const 持退 = once(持, 'exit'); 持.kill('SIGTERM'); await 持退;
    const 杀 = 日志().filter(x => x.事 === '被杀');
    const 甲 = 杀.find(x => (x.发起 as { pid?: number }).pid === 等.pid)!, 乙 = 杀.find(x => (x.发起 as { pid?: number }).pid === 持.pid)!;
    expect(甲).toMatchObject({ 当时: '排队', 已跑秒: expect.any(Number), 机: { 负载: expect.any(Number) } });
    expect(甲.取消后秒).toBeUndefined();
    expect(乙).toMatchObject({ 当时: '持锁', 为什么: '测试' });
    expect(乙.取消后秒).toBeGreaterThanOrEqual(2);
    const 限 = 起({ ANIM_TIME_LIMIT: '1' });
    const [码] = await once(限, 'exit');
    expect(码).toBe(124);
    expect(日志().find(x => x.事 === '限时杀')).toMatchObject({ 限时: 1, 已跑秒: expect.any(Number) });
  }, 20_000);
  it('任务止带错误摘要', async () => {
    const e = 取调度环境({ 锁目录: dir, 发起者: 读发起者({}, [], dir, false) });
    开任务(e, { 种: 'render' }, () => {}).结束(1, undefined, '段不存在');
    expect(日志().find(x => x.事 === '任务止')).toMatchObject({ 退出码: 1, 错误: '段不存在' });
  });
});
