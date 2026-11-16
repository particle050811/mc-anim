import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { queueAcquire, passGate, passRenderGate, gateHeartbeat, ancestorLockEnv, type GateEnv } from './闸.ts';
import { readSchedulerEvents } from './调度日志.ts';
import { setOrder } from './票.ts';
let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-底线-')); });
afterEach(() => { fs.rmSync(dir, {recursive:true, force:true}); delete process.env[ancestorLockEnv]; });
const makeMemory = (n: number) => ({grandTotal:100,free:n,freePercent:n,swapTotal:0,swapUsed:0});
it('低内存无锁但有活票；3 分钟告警；压力 4 只有强放行；下一张不继承', async () => {
  let now = Date.now(), pressure = 1, loopCount = 0, prevName = '', task = '', checkNext = false;
  const hints: string[] = [];
  const e: Partial<GateEnv> = { lockDir:dir, localHost:os.hostname(), memFloor:30, readMemory:()=>makeMemory(10), readPressure:()=>pressure,
    nowMs:()=>now, queueIntervalMs:1000, sleep:async () => {
      now += 60_000; loopCount++;
      expect(fs.existsSync(path.join(dir,'渲染.lock'))).toBe(false);
      const names=fs.readdirSync(path.join(dir,'渲染.排队')); expect(names).toHaveLength(1);
      if (checkNext) { expect(names[0]).not.toBe(prevName); e.readMemory=()=>makeMemory(80); return; }
      prevName=names[0]!;
      if (loopCount===3) pressure=4;
      if (loopCount>=4) {
        task=JSON.parse(fs.readFileSync(path.join(dir,'渲染.排队',prevName),'utf8')).task;
        fs.mkdirSync(path.join(dir,'指令'),{recursive:true});
        fs.writeFileSync(path.join(dir,'指令',task+'.json'),JSON.stringify({动作:'放行',strength:loopCount>=5,至:now+60_000,why:'测试'}));
      }
    }};
  await passRenderGate(async()=>{},s=>hints.push(s),e);
  expect(loopCount).toBe(5); expect(hints.filter(x=>x.startsWith('告警'))).toHaveLength(1);
  expect(fs.existsSync(path.join(dir,'指令',task+'.json'))).toBe(false);
  checkNext=true; pressure=1;
  // 第二张使用新的读数函数，不能靠上一张票的授权通过。
  e.sleep=async()=>{ loopCount++; expect(fs.existsSync(path.join(dir,'渲染.lock'))).toBe(false); throw Error('第二张仍在等'); };
  await expect(passRenderGate(async()=>{},()=>{},e)).rejects.toThrow('第二张仍在等');
});
it('同进程嵌套和祖先持锁都立即拒绝', async()=>{
  const e={lockDir:dir,localHost:os.hostname(),readMemory:()=>makeMemory(80),readPressure:()=>1,memFloor:30};
  await passRenderGate(async()=>{await expect(passRenderGate(async()=>{},()=>{},e)).rejects.toThrow('嵌套');},()=>{},e);
  process.env[ancestorLockEnv]=String(process.ppid);
  await expect(passRenderGate(async()=>{},()=>{},e)).rejects.toThrow(`祖先 pid ${process.ppid}`);
});
it('只动文件不判内存和压力', async()=>{
  await passRenderGate(async()=>{},()=>{}, {lockDir:dir,localHost:os.hostname(),readMemory:()=>makeMemory(0),readPressure:()=>4}, {noRender:true});
});

const ticketFiles = () => fs.readdirSync(path.join(dir, '渲染.排队'));
const readTicketContent = () => JSON.parse(fs.readFileSync(path.join(dir, '渲染.排队', ticketFiles()[0]!), 'utf8'));
const eventsNamed = (eventName: string) => readSchedulerEvents(path.join(dir, 'logs')).filter(x => x.event === eventName);
const lockPath = () => path.join(dir, '渲染.lock');
const baseEnv = (): Partial<GateEnv> => ({ lockDir: dir, localHost: os.hostname(), memFloor: 30, readMemory: () => null, readPressure: () => 1, clearOrphans: () => [], sleep: async () => {} });

it('死锁 + 低内存 + 队首：不看准入就回收并清孤儿，3 秒内', async () => {
  const deadPid = spawnSync(process.execPath, ['-e', '0']).pid!;
  fs.writeFileSync(lockPath(), `${deadPid}\n`);
  let cleanCount = 0, free = 10, firstRoundSec = -1;
  const startMs = performance.now(), hints: string[] = [];
  await passRenderGate(async () => {}, s => hints.push(s), { ...baseEnv(), readMemory: () => makeMemory(free), clearOrphans: () => { cleanCount++; return []; }, sleep: async () => {
    firstRoundSec = (performance.now() - startMs) / 1000;
    expect(fs.existsSync(lockPath())).toBe(false);
    expect(cleanCount).toBe(1);
    expect(readTicketContent().stuckOn).toBe('内存');
    free = 80;
  } }, { kind: 'still' });
  expect(firstRoundSec).toBeGreaterThanOrEqual(0);
  expect(firstRoundSec).toBeLessThan(3);
  expect(JSON.stringify(eventsNamed('回收死锁'))).toContain(String(deadPid));
  expect(hints.join('\n')).not.toContain(`锁在 pid ${deadPid}`);
});

it('排在后面的等待者也回收死锁，不靠队首', async () => {
  fs.writeFileSync(lockPath(), `${spawnSync(process.execPath, ['-e', '0']).pid!}\n`);
  fs.mkdirSync(path.join(dir, '渲染.排队'));
  const frontTicketFile = path.join(dir, '渲染.排队', `000000000000001-${os.hostname().replace(/[^A-Za-z0-9._-]/g, '_')}-${process.ppid}`);
  fs.writeFileSync(frontTicketFile, String(process.ppid));
  let cleanCount = 0;
  await passRenderGate(async () => {}, () => {}, { ...baseEnv(), clearOrphans: () => { cleanCount++; return []; }, sleep: async () => {
    expect(fs.existsSync(lockPath())).toBe(false);
    expect(cleanCount).toBe(1);
    fs.rmSync(frontTicketFile);
  } }, { kind: 'still' });
});

it('锁在活进程手里不算等内存：票不写字段、不告警；锁空才起算，再被占就结束', async () => {
  fs.writeFileSync(lockPath(), `${process.ppid}\n`);
  let now = Date.now(), loopCount = 0, free = 10;
  const hints: string[] = [], hasAlarm = () => hints.some(x => x.startsWith('告警'));
  await passRenderGate(async () => {}, s => hints.push(s), { ...baseEnv(), readMemory: () => makeMemory(free), nowMs: () => now, sleep: async () => {
    loopCount++;
    const c = readTicketContent();
    if (loopCount <= 5) {
      expect(c.等内存起).toBeUndefined();
      expect(c.stuckOn).toBeUndefined();
      expect(hasAlarm()).toBe(false);
      expect(eventsNamed('告警').filter(x => x.type === '等内存')).toEqual([]);
    }
    if (loopCount === 5) fs.rmSync(lockPath());
    if (loopCount === 6) {
      expect(c.等内存起).toBe(now);
      expect(c.stuckOn).toBe('内存');
      fs.writeFileSync(lockPath(), `${process.ppid}\n`);
    }
    if (loopCount === 7) {
      expect(c.等内存起).toBeUndefined();
      expect(c.stuckOn).toBeUndefined();
      fs.rmSync(lockPath());
    }
    if (loopCount === 10) expect(hasAlarm()).toBe(false);
    if (loopCount === 11) expect(hasAlarm()).toBe(true);
    if (loopCount === 12) free = 80;
    now += 60_000;
  } }, { kind: 'still' });
  expect(loopCount).toBe(12);
  expect(hints).toContain(`渲染排队（锁在 pid ${process.ppid} 手里）`);
  expect(eventsNamed('等内存起')).toHaveLength(2);
  expect(eventsNamed('等内存止')).toHaveLength(2);
});

it('票被旧内容盖掉，票主人下一轮补回；旧内容写回的残留标记也清掉', async () => {
  let loopCount = 0, startMs = 0, free = 10;
  const editTicket = (mutate: (c: Record<string, unknown>) => void) => { const c = readTicketContent(); mutate(c); fs.writeFileSync(path.join(dir, '渲染.排队', ticketFiles()[0]!), JSON.stringify(c)); };
  await passRenderGate(async () => {}, () => {}, { ...baseEnv(), readMemory: () => makeMemory(free), sleep: async () => {
    loopCount++;
    if (loopCount === 1) { startMs = readTicketContent().等内存起; expect(startMs).toBeGreaterThan(0); editTicket(c => { delete c.等内存起; delete c.stuckOn; }); }
    if (loopCount === 2) { expect(readTicketContent()).toMatchObject({ 等内存起: startMs, stuckOn: '内存' }); fs.writeFileSync(lockPath(), `${process.ppid}\n`); }
    if (loopCount === 3) { expect(readTicketContent().stuckOn).toBeUndefined(); editTicket(c => { c.等内存起 = 1; c.stuckOn = '内存'; }); }
    if (loopCount === 4) { expect(readTicketContent().stuckOn).toBeUndefined(); expect(readTicketContent().等内存起).toBeUndefined(); fs.rmSync(lockPath()); free = 80; }
  } }, { kind: 'still' });
  expect(loopCount).toBe(4);
});

it('放行闸的票态同样补回，等内存秒按原起点算', async () => {
  let loopCount = 0, startMs = 0, now = Date.now();
  const queue = path.join(dir, '放行.排队'), readFirstQueued = () => { const f = path.join(queue, fs.readdirSync(queue)[0]!); return [f, JSON.parse(fs.readFileSync(f, 'utf8'))] as const; };
  await passGate(async () => {}, () => {}, { ...baseEnv(), nowMs: () => now, coreCount: () => 10, load1Min: () => 0, readMemory: () => makeMemory(loopCount < 2 ? 10 : 80), sleep: async () => {
    loopCount++;
    const [f, c] = readFirstQueued();
    if (loopCount === 1) { startMs = c.等内存起; expect(startMs).toBe(now); delete c.等内存起; delete c.stuckOn; fs.writeFileSync(f, JSON.stringify(c)); now += 60_000; }
    if (loopCount === 2) expect(c).toMatchObject({ 等内存起: startMs, stuckOn: '内存' });
  } }, { kind: 'voice' });
  expect(eventsNamed('等内存起')).toHaveLength(1);
  expect(eventsNamed('等内存止')).toMatchObject([{ sec: 60 }]);
});

it('监控全写不了也只提示：渲染跑完、锁照放、下一次能拿', async () => {
  fs.mkdirSync(path.join(dir, '渲染.lock.信息.json', '占位'), { recursive: true });
  fs.writeFileSync(path.join(dir, '在跑'), '');
  fs.writeFileSync(path.join(dir, 'state'), '');
  fs.mkdirSync(path.join(dir, '耗时.tsv'));
  let now = Date.now(), sampleCount = 0;
  const e: Partial<GateEnv> = { ...baseEnv(), nowMs: () => now, readMachine: () => { sampleCount++; throw Error('采样炸了'); } };
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  try {
    const r = await passRenderGate(async () => {
      now += 30_000;
      vi.advanceTimersByTime(30_000);
      now += 30_000;
      gateHeartbeat(1);
      return 'ok';
    }, () => {}, e, { kind: 'still' });
    expect(r).toBe('ok');
    // 监测 2 次，领票、拿锁、放锁的日志读数 3 次，全炸了也不影响。
    expect(sampleCount).toBe(5);
    expect(fs.existsSync(lockPath())).toBe(false);
    expect(ticketFiles()).toEqual([]);
    const said = errorSpy.mock.calls.flat().join('\n');
    for (const kindLabel of ['信息文件', '监测', '在跑登记', '耗时记录']) expect(said).toContain(`!! ${kindLabel}失败`);
    expect(await passRenderGate(async () => '二', () => {}, e, { kind: 'still' })).toBe('二');
  } finally {
    vi.useRealTimers();
    errorSpy.mockRestore();
  }
});

it('领票抛错也交棒：同进程下一次不挂', async () => {
  const q = path.join(dir, '渲染.排队');
  fs.writeFileSync(q, '');
  await expect(passRenderGate(async () => {}, () => {}, baseEnv(), { kind: 'still' })).rejects.toThrow();
  fs.rmSync(q);
  expect(await passRenderGate(async () => 'ok', () => {}, baseEnv(), { kind: 'still' })).toBe('ok');
});

it('拿到锁后抛错也放锁、删票、交棒', async () => {
  await expect(queueAcquire('渲染', { ...baseEnv(), decl: { kind: 'still' }, recheckInLock: () => { throw Error('复核炸了'); } })).rejects.toThrow('复核炸了');
  expect(fs.existsSync(lockPath())).toBe(false);
  expect(ticketFiles()).toEqual([]);
  const handle = await queueAcquire('渲染', { ...baseEnv(), decl: { kind: 'still' } });
  handle.放();
  expect(fs.existsSync(lockPath())).toBe(false);
});

it('本机名跟配置走：ANIM_HOST 同时进环境和日志', () => {
  const testDir = import.meta.dirname, scriptSource = `import {resolveSchedulerEnv} from ${JSON.stringify(path.join(testDir, '任务.ts'))};import {recordSchedulerEvent,readSchedulerEvents} from ${JSON.stringify(path.join(testDir, '调度日志.ts'))};const d=${JSON.stringify(dir)};recordSchedulerEvent(d,'测',{});console.log(resolveSchedulerEnv({lockDir:d}).localHost,readSchedulerEvents(d)[0].host);`;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', scriptSource], { encoding: 'utf8', env: { ...process.env, ANIM_HOST: '测试机' } });
  expect(out.trim()).toBe('测试机 测试机');
});

it('票在拿锁前一刻被改名：拿锁后按任务清掉，不留残留活票', async () => {
  const handle = await queueAcquire('渲染', { ...baseEnv(), decl: { kind: 'render' }, canAdmit: t => { setOrder(t, String(t.time - 1)); return true; } });
  expect(ticketFiles()).toEqual([]);
  handle.放();
  expect(ticketFiles()).toEqual([]);
  expect(fs.existsSync(lockPath())).toBe(false);
});

it('持锁期间撞出来的同任务票，放锁前再清一次', async () => {
  const handle = await queueAcquire('渲染', { ...baseEnv(), decl: { kind: 'render' } });
  const leftover = path.join(dir, '渲染.排队', `000000000000001-${os.hostname().replace(/[^A-Za-z0-9._-]/g, '_')}-${process.pid}`);
  fs.writeFileSync(leftover, JSON.stringify({ v: 1, task: handle.task, start: 0, initiator: {}, decl: {} }));
  handle.放();
  expect(ticketFiles()).toEqual([]);
});

it('写旧路径和改名撞上出两张票时，留改名后的那张', async () => {
  let loopCount = 0, newName = '';
  await passRenderGate(async () => {}, () => {}, { ...baseEnv(), readMemory: () => makeMemory(loopCount < 2 ? 10 : 80), sleep: async () => {
    loopCount++;
    if (loopCount === 1) {
      const queuedName = ticketFiles()[0]!, oldPath = path.join(dir, '渲染.排队', queuedName), content = fs.readFileSync(oldPath, 'utf8');
      newName = queuedName.replace(/^\d+/, m => String(Number(m) + 1).padStart(15, '0'));
      fs.renameSync(oldPath, path.join(dir, '渲染.排队', newName));
      fs.writeFileSync(oldPath, content);
    }
    if (loopCount === 2) expect(ticketFiles()).toEqual([newName]);
  } }, { kind: 'still' });
  expect(loopCount).toBe(2);
});
