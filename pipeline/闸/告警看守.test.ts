import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { 渲染看, 读状态, 一行状态, type 调度状态, type 锁信息 } from './看.ts';
import { 判告警, 更新历史, 监测一轮, 读监测, 空历史, type 监测历史 } from './告警.ts';
import { 取调度环境, type 调度环境 } from './任务.ts';
import { 读发起者 } from './发起者.ts';
import { 盯 } from './盯.ts';
import { 读调度, 读新事件, 记调度 } from './调度日志.ts';
import { 改调度 } from './改调度.ts';
import { 列票, 领票, type 票 } from './票.ts';
import { 用法错误 } from '../cli/参数.ts';

let dir: string;
const children: ReturnType<typeof spawn>[] = [];
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-看守-')); });
afterEach(async () => {
  for (const c of children.splice(0)) if (c.exitCode === null && c.signalCode === null) { const p = once(c, 'exit'); c.kill('SIGKILL'); await p; }
  fs.rmSync(dir, { recursive: true, force: true });
});
const 发起 = () => 读发起者({ CLAUDE_CODE_SESSION_ID: 'sess0001' }, [], dir, false);
const 环 = (o: Partial<调度环境> = {}) => 取调度环境({ 锁目录: dir, 本机: os.hostname(), 发起者: 发起(), ...o });
const 基本 = (时 = 1_000_000): 调度状态 => ({ 时, 机: { 负载: 1, 核: 10, 闸: 40, 压力: 1, free: 1e9, 压缩: 1e9, swap: 0, 换出: 0, GPU: 50, 热: 1, 盘: 4e11, 孤儿: 0, 进程: '' }, 票: [], 持锁: [], 在跑: [], 最近: [] });
const 票 = (名: string, 内容: Partial<NonNullable<票['内容']>> = {}): 票 => ({ 名, 文件: '/q/渲染.排队/' + 名, pid: 7, 主机: 'h', 时间: 0, 内容: { v: 1, 任务: 'T1', 起: 0, 声明: { 种: 'render', 段: '6-斩娜迦' }, 发起: 发起(), ...内容 } });
const 持 = (o: Partial<锁信息> = {}): 锁信息 => ({ pid: 9, 票: 'p1', 任务: 'R', 发起: 发起(), 声明: { 种: 'render', 段: '第3段' }, 拿锁时: 0, 心跳: 1, 帧时: 0, 已出帧: 3, 总帧: 100, ...o });
/** 按真实次序走一轮：先更新历史再判，记下通知过的。 */
const 轮 = (h: 监测历史, s: 调度状态) => {
  const n = 更新历史(s, h), a = 判告警(s, s.时, undefined, n);
  for (const x of a) { if (x.类 === '队深') n.高水位 = Math.max(n.高水位, x.值); else n.去重[x.类 + ':' + x.对象] = { 次数: x.次数, 末: s.时 }; }
  return [n, a.map(x => `${x.类}#${x.次数}`)] as const;
};
const 机 = (时: number, 改: Partial<调度状态['机']>) => { const s = 基本(时); Object.assign(s.机, 改); return s; };

it('队列行的约几分只算自己这把锁和同队的票：放行票不等渲染', () => {
  const 时 = 4_000_000, s = 基本(时);
  s.持锁 = [持({ 锁: '渲染', 拿锁时: 时 - 60_000, 声明: { 种: 'render', 预计秒: 3600 } })];
  s.票 = [{ ...票('002-h-8', { 任务: 'R', 声明: { 种: 'still', 预计秒: 30 } }), pid: 8 }, { ...票('003-h-9', { 任务: 'S', 声明: { 种: 'still', 预计秒: 30 } }), pid: 9 }, { ...票('001-h-7', { 任务: 'P', 声明: { 种: 'voice', 预计秒: 30 } }), pid: 7, 文件: '/q/放行.排队/001-h-7' }];
  const 行 = 渲染看(s).split('\n').filter(l => l.startsWith('排队'));
  expect(行[0]).toContain('#8'); expect(行[0]).toContain('约59.0分后');
  expect(行[1]).toContain('#9'); expect(行[1]).toContain('约59.5分后');
  expect(行[2]).toContain('#7'); expect(行[2]).toContain('约0.0分后');
});

describe('去重能复位', () => {
  it('压力：抖一下不重新叫醒，持续消失后是新事件；一天没人采样后再到也是新事件', () => {
    let h = 空历史(), a: string[];
    [h, a] = 轮(h, 机(0, { 压力: 2 })); expect(a).toEqual(['内存压力#1']);
    [h, a] = 轮(h, 机(30_000, { 压力: 1 })); expect(a).toEqual([]);
    [h, a] = 轮(h, 机(60_000, { 压力: 2 })); expect(a).toEqual([]);
    for (let t = 90_000; t <= 390_000; t += 30_000) { [h, a] = 轮(h, 机(t, { 压力: 1 })); expect(a).toEqual([]); }
    expect(h.去重).toEqual({});
    [h, a] = 轮(h, 机(420_000, { 压力: 2 })); expect(a).toEqual(['内存压力#1']);
    [h, a] = 轮(h, 机(420_000 + 86_400_000, { 压力: 2 })); expect(a).toEqual(['内存压力#1']);
  });
  it('负载：第一夜三次，第二夜还能醒', () => {
    const 夜 = (起: number, h0: 监测历史) => { let h = h0; const out: string[] = []; for (let m = 0; m <= 15; m++) { const [n, a] = 轮(h, 机(起 + m * 60_000, { 负载: 30 })); h = n; out.push(...a); } return [h, out] as const; };
    const [h1, a1] = 夜(0, 空历史()); expect(a1).toEqual(['负载#1', '负载#2', '负载#3']);
    const [h2] = 轮(h1, 机(16 * 60_000, { 负载: 1 }));
    expect(夜(86_400_000, h2)[1]).toEqual(['负载#1', '负载#2', '负载#3']);
  });
  it('队深高水位在队列清空后复位，不清空时只创新高才醒', () => {
    const 队 = (时: number, n: number) => { const s = 基本(时); s.票 = Array.from({ length: n }, (_, i) => 票('x' + i, { 起: 时, 任务: 'T' + i })); return s; };
    let h = 空历史(), a: string[];
    [h, a] = 轮(h, 队(0, 6)); expect(a).toEqual(['队深#1']);
    [h, a] = 轮(h, 队(30_000, 5)); expect(a).toEqual([]);
    [h, a] = 轮(h, 队(60_000, 0)); expect(a).toEqual([]);
    [h, a] = 轮(h, 队(90_000, 5)); expect(a).toEqual(['队深#1']);
  });
  it('落盘后也复位：不留挡住下一次的认领文件，删了监测文件也不会哑', () => {
    const e = 环(); const 类们 = (s: 调度状态) => 监测一轮(e, s).map(x => x.类);
    expect(类们(机(0, { 压力: 2 }))).toEqual(['内存压力']);
    expect(类们(机(5_000, { 压力: 2 }))).toEqual([]);
    expect(类们(机(400_000, { 压力: 1 }))).toEqual([]);
    expect(读监测(e).去重).toEqual({});
    expect(类们(机(405_000, { 压力: 2 }))).toEqual(['内存压力']);
    expect(fs.existsSync(path.join(e.调度目录, '告警'))).toBe(false);
    fs.rmSync(path.join(e.调度目录, '监测.json'));
    expect(类们(机(410_000, { 压力: 2 }))).toEqual(['内存压力']);
    expect(读调度(e.日志目录).filter(x => x.事 === '告警')).toHaveLength(3);
  });
  it('监测文件是旧格式（去重存数字）时按事件已结束处理', () => {
    const h = { ...空历史(), 去重: { '内存压力:机器': 1 } } as unknown as 监测历史;
    expect(更新历史(机(0, { 压力: 2 }), h).去重).toEqual({});
  });
});

describe('采样断档和读不到', () => {
  it('负载、孤儿隔 6 小时的两次采样不算持续', () => {
    const 六小时 = 6 * 3_600_000;
    let h = 更新历史(机(0, { 负载: 30, 孤儿: 1 }), 空历史());
    h = 更新历史(机(六小时, { 负载: 30, 孤儿: 1 }), h);
    expect(h.负载起).toBe(六小时); expect(h.孤儿轮).toBe(1);
    expect(判告警(机(六小时, { 负载: 30, 孤儿: 1 }), 六小时, undefined, h)).toEqual([]);
  });
  it('持锁者 30 秒一采、定时器略晚，swap 增长照样判得到', () => {
    let h = 空历史();
    for (let i = 0; i <= 7; i++) h = 更新历史(机(i * 30_500, { swap: i === 7 ? 2 ** 30 : 0 }), h);
    expect(判告警(机(7 * 30_500, { swap: 2 ** 30 }), 7 * 30_500, undefined, h).map(x => x.类)).toEqual(['swap增长']);
  });
  it('swap 读不到不入历史，恢复读数不算增长；负载、孤儿读不到不清零也不累加', () => {
    let h = 更新历史(机(0, { swap: null }), 空历史());
    expect(h.swap).toEqual([]);
    h = 更新历史(机(175_000, { swap: 5 * 2 ** 30 }), { ...h, 上次: 170_000 });
    expect(判告警(机(175_000, { swap: 5 * 2 ** 30 }), 175_000, undefined, h)).toEqual([]);
    let g = 更新历史(机(0, { 负载: 30, 孤儿: 1 }), 空历史());
    g = 更新历史(机(30_000, { 负载: null, 孤儿: null }), g);
    expect([g.负载起, g.孤儿轮]).toEqual([0, 1]);
    g = 更新历史(机(60_000, { 负载: 30, 孤儿: 1 }), g);
    expect([g.负载起, g.孤儿轮]).toEqual([0, 2]);
  });
  it('看 和 一行 把读不到的显示成 ?', () => {
    const s = 机(1_000_000, { 负载: null, 孤儿: null, swap: null });
    expect(一行状态(s)).toContain('负载?/10');
    const 看 = 渲染看(s); expect(看).toContain('孤儿Chrome ?'); expect(看).toContain('swap?');
  });
});

describe('告警对象', () => {
  const 等秒 = 400_000;
  it('排队票改序不换对象：同一事件不重复叫醒', () => {
    const s1 = 基本(等秒); s1.票 = [票('0001-h-7', { 声明: { 种: 'still' } })];
    const [h, a] = 轮(空历史(), s1); expect(a).toEqual(['小任务等待#1']);
    const s2 = 基本(等秒 + 5000); s2.票 = [票('0000-h-7', { 声明: { 种: 'still' } })];
    expect(轮(h, s2)[1]).toEqual([]);
  });
  it('已暂缓的票不告警、不算队深，到期没人处理的也不抢着报', () => {
    const s = 基本(等秒 * 10); s.票 = [1, 2, 3, 4].map(i => 票('9' + i, { 任务: 'T' + i, 暂缓至: 等秒 * 11 })); s.票[0]!.内容!.等内存起 = 0;
    expect(判告警(s, s.时)).toEqual([]);
    s.票[0]!.内容!.暂缓至 = 1;
    expect(判告警(s, s.时)).toEqual([]);
  });
  it('暂缓和恢复走真命令：恢复后等待重新起算', () => {
    const e = 环(), q = path.join(dir, '渲染.排队');
    const t = 领票(q, e.本机, { 任务: 'T1', 起: 0, 心跳: 0, 发起: e.发起者, 声明: { 种: 'still' }, 主机: e.本机 }, Date.now() - 等秒);
    const 假机 = () => 基本().机, 态 = () => 读状态(e, 假机, false), 参 = (值: Record<string, string>) => ({ 位置: [], 值, 开关: new Set<string>(), 多值: {} });
    expect(判告警(态(), Date.now()).map(x => `${x.类}:${x.对象}`)).toEqual(['小任务等待:T1']);
    改调度('后', t.名, 参({ '--为什么': '让产出先' }), e, { 状态: 态, 输出: () => {} });
    expect(判告警(态(), Date.now())).toEqual([]);
    const 暂缓名 = 列票(q)[0]!.名;
    改调度('恢复', 暂缓名, 参({ '--为什么': '产出完了' }), e, { 状态: 态, 输出: () => {} });
    expect(列票(q)[0]!.内容!.暂缓至).toBeUndefined();
    expect(判告警(态(), Date.now())).toEqual([]);
  });
  it('多段 render：前一段的无帧告警不吞后面段', () => {
    const 时1 = 400_000, s1 = 基本(时1); s1.持锁 = [持({ 拿锁时: 时1 - 360_000, 帧时: 时1 - 360_000 })];
    const [h, a1] = 轮(空历史(), s1); expect(a1).toEqual(['无帧#1']);
    const 时2 = 时1 + 30_000, s2 = 基本(时2); s2.持锁 = [持({ 票: 'p2', 声明: { 种: 'render', 段: '第17段' }, 拿锁时: 时2 - 360_000, 帧时: 时2 - 360_000 })];
    expect(轮(h, s2)[1]).toEqual(['无帧#1']);
  });
  it('没声明段的持锁按票区分', () => {
    const 时 = 400_000, 态 = (票名: string) => { const s = 基本(时); s.持锁 = [持({ 票: 票名, 声明: { 种: '批' }, 拿锁时: 时 - 360_000, 帧时: 时 - 360_000 })]; return s; };
    const [h, a] = 轮(空历史(), 态('a')); expect(a).toEqual(['无帧#1']);
    expect(轮(h, 态('b'))[1]).toEqual(['无帧#1']);
  });
  it('still 只有预计缺失才算小任务', () => {
    const 判 = (声明: NonNullable<票['内容']>['声明'], 等: number) => { const s = 基本(等 * 1000); s.票 = [票('a', { 声明 })]; return 判告警(s, s.时).map(x => x.类); };
    expect(判({ 种: 'still' }, 301)).toEqual(['小任务等待']);
    expect(判({ 种: 'still', 预计秒: null }, 301)).toEqual(['小任务等待']);
    expect(判({ 种: 'still', 预计秒: 300 }, 400)).toEqual([]);
    expect(判({ 种: 'still', 预计秒: 300 }, 901)).toEqual(['排队长']);
    expect(判({ 种: 'render', 预计秒: 30 }, 301)).toEqual(['小任务等待']);
    expect(判({ 种: 'render' }, 301)).toEqual([]);
  });
});

describe('盯', () => {
  const 跑 = async (e: 调度环境, o: Parameters<typeof 盯>[1] = {}) => {
    const out: string[] = [];
    const code = await 盯(e, { 最长: 0.05, 读: () => 基本(Date.now()), 父活: () => true, 输出: x => out.push(x), 睡: () => new Promise<void>(r => setTimeout(r, 10)), ...o });
    return { code, out };
  };
  /** 先挂一次定下游标，后面的事都算没挂时写入的。 */
  const 定游标 = async (e: 调度环境) => { expect((await 跑(e)).code).toBe(124); };
  const 告警 = (e: 调度环境, 类: string, 时 = Date.now()) => 记调度(e.日志目录, '告警', { 类, 对象: '机器', 次数: 1 }, 时);

  it('告警被挤出尾部也不丢', async () => {
    const e = 环(); await 定游标(e); 告警(e, '内存压力');
    for (let i = 0; i < 60; i++) 记调度(e.日志目录, '汇报', { 看到: 'x'.repeat(900) });
    const r = await 跑(e); expect(r.code).toBe(0); expect(r.out[0]).toContain('内存压力');
    expect((await 跑(e)).code).toBe(124);
  });
  it('跨月：上月末的告警在新月有新行后还读得到，游标跟到新月', async () => {
    const e = 环(); 记调度(e.日志目录, '汇报', {}, Date.parse('2026-10-31T23:00:00Z'));
    fs.mkdirSync(e.调度目录, { recursive: true });
    fs.writeFileSync(path.join(e.调度目录, '游标-sess0001.json'), JSON.stringify(读新事件(e.日志目录).末));
    告警(e, '负载', Date.parse('2026-10-31T23:59:50Z')); 记调度(e.日志目录, '汇报', {}, Date.parse('2026-11-01T00:00:01Z'));
    const r = await 跑(e); expect(r.out[0]).toContain('10-31T23:59:50Z 负载');
    expect(JSON.parse(fs.readFileSync(path.join(e.调度目录, '游标-sess0001.json'), 'utf8')).月).toBe('2026-11');
  });
  it('半行不读：写到一半的末行留到下一次', () => {
    const e = 环(); 告警(e, 'a');
    const f = path.join(e.日志目录, fs.readdirSync(e.日志目录)[0]!), 全 = fs.statSync(f).size;
    fs.appendFileSync(f, '{"事":"告');
    const r = 读新事件(e.日志目录); expect(r.行).toHaveLength(1); expect(r.末.偏移).toBe(全);
    expect(读新事件(e.日志目录, r.末).行).toHaveLength(0);
  });
  it('一轮多于 3 条：说还有几条和最重的，重挂接着报，一条不吞', async () => {
    const e = 环(); await 定游标(e);
    for (const 类 of ['小任务等待', '排队长', '负载', '持锁者死', '内存压力']) 告警(e, 类);
    const a = await 跑(e); expect(a.out[0]).toContain('小任务等待'); expect(a.out[0]).toContain('另2件未报（最重 持锁者死）');
    expect(a.out[0]).not.toContain('内存压力 ');
    const b = await 跑(e); expect(b.code).toBe(0); expect(b.out[0]).toContain('持锁者死'); expect(b.out[0]).toContain('内存压力'); expect(b.out[0]).not.toContain('未报');
    expect((await 跑(e)).code).toBe(124);
  });
  it('崩溃、回收死锁都叫醒；普通事件不叫醒但游标前进', async () => {
    const e = 环(); await 定游标(e);
    记调度(e.日志目录, '任务起', { 任务: 'X' }); expect((await 跑(e)).code).toBe(124);
    记调度(e.日志目录, '崩溃', { 任务: 'X', 发起: { pid: 123 }, 声明: { 段: '6-斩娜迦' } });
    expect((await 跑(e)).out[0]).toContain('崩溃 #123 6-斩娜迦');
    记调度(e.日志目录, '回收死锁', { 任务: 'Y', 原持有者: { pid: 123 } });
    expect((await 跑(e)).out[0]).toContain('回收死锁 #123');
  });
  it('别的会话的路完不叫醒，同会话的叫醒', async () => {
    const e = 环(); await 定游标(e);
    记调度(e.日志目录, '路完', { 路: '别人的', 发起: { 会话: 'other' } }); expect((await 跑(e)).code).toBe(124);
    记调度(e.日志目录, '路败', { 路: '我的', 发起: { 会话: 'sess0001' } }); expect((await 跑(e)).out[0]).toContain('路败 我的');
  });
  it('新会话第一次挂：三天前别的会话的告警不算新事件，30 分钟内的算，输出带时间', async () => {
    const e = 环(), now = Date.now();
    告警(e, '持锁者死', now - 3 * 86_400_000); expect((await 跑(e)).code).toBe(124);
    const e2 = 环({ 发起者: 读发起者({ CLAUDE_CODE_SESSION_ID: 'sess0002' }, [], dir, false) });
    告警(e, '内存压力', now - 60_000);
    const r = await 跑(e2); expect(r.code).toBe(0); expect(r.out[0]).toContain('内存压力');
    expect(r.out[0]).toContain(new Date(now - 60_000).toISOString().slice(5, 19) + 'Z');
    expect(r.out[0]).not.toContain('持锁者死');
  });
  it('--任务：#pid、任务 id、任意历史票名都认；任务已结束立刻报', async () => {
    const e = 环(), 记 = (事: string, x: Record<string, unknown>) => 记调度(e.日志目录, 事, { 任务: 'T7', 发起: { pid: 777 }, ...x });
    记('任务起', {}); 记('领票', { 票: '0001-h-777' }); 记('改序', { 票: '0000-h-777', 原序: '0001-h-777', 新序: '0000-h-777' }); 记('领票', { 票: '0002-h-777' });
    for (const 名 of ['#777', '777', 'T7', '0001-h-777', '0000-h-777', '0002-h-777']) expect((await 跑(e, { 任务: 名 })).code, 名).toBe(124);
    记('任务止', { 票: '0002-h-777', 退出码: 0 });
    for (const 名 of ['#777', 'T7', '0001-h-777']) { const r = await 跑(e, { 任务: 名 }); expect(r.code, 名).toBe(0); expect(r.out[0]).toContain('任务止 #777'); expect(r.out[0]).toContain('退出码0'); }
  });
  it('--任务 目标被 SIGKILL 时按崩溃醒，只醒一次', async () => {
    const e = 环(); 记调度(e.日志目录, '任务起', { 任务: 'K', 发起: { pid: 55 } }); await 定游标(e);
    记调度(e.日志目录, '崩溃', { 任务: 'K', 发起: { pid: 55 } });
    const r = await 跑(e, { 任务: 'K' }); expect(r.code).toBe(0); expect(r.out[0]!.match(/崩溃/g)).toHaveLength(1);
  });
  it('--任务 只等自己的任务：无关告警不退出、不消费，全局 盯 照样醒；它也不算挂了看守', async () => {
    const e = 环(); await 定游标(e);
    记调度(e.日志目录, '任务起', { 任务: 'X', 发起: { pid: 111 } }); 告警(e, '持锁者死');
    const r = await 跑(e, { 任务: 'X', 睡: async () => { expect(fs.readdirSync(path.join(e.调度目录, '盯'))).toEqual([]); await new Promise(r => setTimeout(r, 10)); } });
    expect(r).toEqual({ code: 124, out: [] });
    const g = await 跑(e); expect(g.code).toBe(0); expect(g.out[0]).toContain('持锁者死');
  });
  it('--任务 匹配不到报用法错误，不默默等到点', async () => {
    const e = 环(); 记调度(e.日志目录, '任务起', { 任务: 'K', 发起: { pid: 55 } });
    await expect(跑(e, { 任务: '#56' })).rejects.toBeInstanceOf(用法错误);
    await expect(跑(e, { 任务: '没有这张票' })).rejects.toBeInstanceOf(用法错误);
  });
  it('全局那只先读过任务止，--任务 那只照样醒', async () => {
    const e = 环(); 记调度(e.日志目录, '任务起', { 任务: 'K', 发起: { pid: 55 } });
    const 醒 = 跑(e, { 任务: 'K', 最长: 2 }); await 定游标(e);
    记调度(e.日志目录, '任务止', { 任务: 'K', 发起: { pid: 55 } }); await 定游标(e);
    expect((await 醒).code).toBe(0);
  });
  it('看 的告警行带时间，被汇报挤过 16 KB 还在', () => {
    const e = 环(), 时 = Date.now(); 记调度(e.日志目录, '告警', { 类: '内存压力', 对象: '机器', 次数: 1 }, 时);
    for (let i = 0; i < 60; i++) 记调度(e.日志目录, '汇报', { 看到: 'x'.repeat(900) });
    const s = 读状态(e, () => 基本().机, false);
    expect(渲染看(s)).toContain(`告警 ${new Date(时).toISOString().slice(5, 19)}Z 内存压力 机器`);
    expect(s.最近.every(x => x.事 === '告警' || x.事 === '决定')).toBe(true);
  });
  it('读调度 的尾部能跨月', () => {
    const e = 环(); 记调度(e.日志目录, '甲', {}, Date.parse('2026-10-31T23:59:50Z')); 记调度(e.日志目录, '乙', {}, Date.parse('2026-11-01T00:00:01Z'));
    expect(读调度(e.日志目录, 4096).map(x => x.事)).toEqual(['甲', '乙']);
    expect(读调度(e.日志目录).map(x => x.事)).toEqual(['甲', '乙']);
  });

  const 跑子盯 = (标: string) => {
    const 模块 = (n: string) => JSON.stringify(path.join(import.meta.dirname, n));
    const 脚本 = `import {盯} from ${模块('盯.ts')};import {取调度环境} from ${模块('任务.ts')};import {读发起者} from ${模块('发起者.ts')};
const e=取调度环境({锁目录:${JSON.stringify(dir)},发起者:读发起者({CLAUDE_CODE_SESSION_ID:'sess0001'},[],${JSON.stringify(dir)},false)});
const 机={负载:1,核:10,闸:40,压力:1,free:1,压缩:1,swap:0,换出:0,GPU:1,热:1,盘:1,孤儿:0,进程:''};
console.log('ready');
process.exitCode=await 盯(e,{最长:4,父活:()=>true,读:()=>({时:Date.now(),机,持锁:[],票:[],在跑:[],最近:[]}),睡:()=>new Promise(r=>setTimeout(r,20)),输出:s=>console.log(${JSON.stringify(标)}+s)});`;
    const c = spawn(process.execPath, ['--input-type=module', '-e', 脚本], { stdio: ['ignore', 'pipe', 'inherit'] });
    children.push(c);
    let out = ''; c.stdout!.on('data', d => { out += d; });
    return { c, 出: () => out, 就绪: new Promise<void>(r => { c.stdout!.on('data', d => { if (String(d).includes('ready')) r(); }); }), 完: once(c, 'exit') };
  };
  it('同会话两只真进程：一条告警只醒一只，另一只到点；游标不被覆盖', async () => {
    const e = 环(); await 定游标(e);
    const a = 跑子盯('甲:'), b = 跑子盯('乙:');
    await Promise.all([a.就绪, b.就绪]); await new Promise(r => setTimeout(r, 300));
    告警(e, '持锁者死');
    const [[ca], [cb]] = await Promise.all([a.完, b.完]);
    const 醒 = [a.出(), b.出()].filter(x => x.includes('持锁者死'));
    expect(醒).toHaveLength(1); expect([ca, cb].sort()).toEqual([0, 124]);
    expect((await 跑(e)).code).toBe(124);
  }, 15000);
  it('持锁者真被 SIGKILL：没有等待者时，盯 靠崩溃和持锁者死叫醒', async () => {
    const c = spawn(process.execPath, [path.join(import.meta.dirname, 'fixtures/持锁子进程.ts'), dir], { stdio: ['ignore', 'pipe', 'inherit'] }); children.push(c);
    await new Promise<void>(r => { c.stdout!.on('data', d => { if (String(d).includes('ready')) r(); }); });
    const e = 环(); await 跑(e, { 读: () => 读状态(e, () => 基本().机) });
    const 醒 = 跑(e, { 最长: 8, 读: () => 读状态(e, () => 基本().机) });
    const dead = once(c, 'exit'); c.kill('SIGKILL'); await dead;
    const r = await 醒; expect(r.code).toBe(0); expect(r.out[0]).toMatch(/崩溃|持锁者死/); expect(r.out[0]).toContain(`#${c.pid}`);
  }, 20000);
});


