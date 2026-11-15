import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { takeLowPriorityArgs } from '../cli/路由.ts';
import { readCaller } from './发起者.ts';
import { openGateBatch } from './闸.ts';
import { resolveSchedulerEnv } from './任务.ts';
import { listTickets, claimTicket, requeueTail, isLowPriorityTicket } from './票.ts';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-低优先-'));
});
afterEach(() => {
  delete process.env.ANIM_PRIORITY;
  fs.rmSync(dir, { recursive: true, force: true });
});

const makeTask = (taskName: string, lowPriority = false) => ({ 任务: taskName, 起: Date.now(), 心跳: Date.now(), 主机: os.hostname(), 发起: readCaller({}, [], dir, false), 声明: { 种: 'render', ...(lowPriority ? { 低优先: true } : {}) } });

it('低优先的票排在全部普通票后面（后领的普通票也在它前面），暂缓票之前；回队尾各回各档', () => {
  const queue = path.join(dir, '渲染.排队');
  const lowPriorityTicket = claimTicket(queue, os.hostname(), makeTask('低', true), Date.now());
  const normal = claimTicket(queue, os.hostname(), makeTask('普'), Date.now());
  expect(lowPriorityTicket.名.startsWith('8')).toBe(true);
  expect(isLowPriorityTicket(lowPriorityTicket)).toBe(true);
  expect(isLowPriorityTicket(normal)).toBe(false);
  expect(listTickets(queue).map((t) => t.ticketContent?.任务)).toEqual(['普', '低']);
  const lowSecond = claimTicket(queue, os.hostname(), makeTask('低二', true), Date.now());
  const lowRequeued = requeueTail(lowPriorityTicket);
  expect(isLowPriorityTicket(lowRequeued)).toBe(true);
  expect(lowRequeued.时间).toBeGreaterThan(lowSecond.时间);
  const normalRequeued = requeueTail(normal);
  expect(isLowPriorityTicket(normalRequeued)).toBe(false);
  expect(listTickets(queue).map((t) => t.ticketContent?.任务)).toEqual(['普', '低二', '低']);
});

it('低优先的批：有普通票在等，项间马上让开（不等满 120 秒）；只有别的低优先票在等时照 120 秒的老规矩', async () => {
  let now = Date.now();
  const e = { ...resolveSchedulerEnv({ lockDir: dir, nowMs: () => now }), readMemory: () => null, readPressure: () => 1 };
  const hostSlug = os.hostname().replace(/[^A-Za-z0-9._-]/g, '_');
  const runWaiting = async (waitingTicket: string) => {
    process.env.ANIM_PRIORITY = 'low';
    const gate = openGateBatch({ 项数: 2 }, e);
    let ticket = '';
    await gate.runTask({}, async () => {
      ticket = JSON.parse(fs.readFileSync(path.join(dir, '渲染.lock.信息.json'), 'utf8')).票;
    });
    expect(ticket.startsWith('8')).toBe(true);
    const file = path.join(dir, '渲染.排队', waitingTicket);
    fs.writeFileSync(file, String(process.ppid));
    await gate.runTask({}, async () => {
      now += 10_000;
    });
    const stillHeld = fs.existsSync(path.join(dir, '渲染.lock'));
    fs.rmSync(file);
    gate.结束();
    return stillHeld;
  };
  expect(await runWaiting(`${String(Date.now() + 1).padStart(15, '0')}-${hostSlug}-${process.ppid}`)).toBe(false);
  expect(await runWaiting(`${800000000000000 + Date.now() + 1}-${hostSlug}-${process.ppid}`)).toBe(true);
});

it('--低优先 是全局参数，-- 之后的不算', () => {
  expect(takeLowPriorityArgs(['render', '--低优先', '2-合照'])).toEqual({ 低优先: true, rest: ['render', '2-合照'] });
  expect(takeLowPriorityArgs(['mcai', '--', '--低优先'])).toEqual({ 低优先: false, rest: ['mcai', '--', '--低优先'] });
});
