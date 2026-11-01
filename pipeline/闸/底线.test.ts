import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { 排队拿, 过渲染闸, 闸心跳, 祖先持锁变量, type 闸环境 } from './闸.ts';
import { 读调度 } from './调度日志.ts';
import { 改序 } from './票.ts';
import { 轮到我 as 旧轮到我 } from './fixtures/旧轮到我.ts';
import { 试拿 as 旧试拿 } from './fixtures/旧锁.ts';
import { 试拿, 放 } from './锁.ts';
let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-底线-')); });
afterEach(() => { fs.rmSync(dir, {recursive:true, force:true}); delete process.env[祖先持锁变量]; });
const 内存 = (n: number) => ({总:100,空闲:n,空闲百分比:n,交换区总:0,交换区已用:0});
it('低内存无锁但有活票；3 分钟告警；压力 4 只有强放行；下一张不继承', async () => {
  let now = Date.now(), 压力 = 1, 轮 = 0, 名 = '', 下一张 = false;
  const 提示: string[] = [];
  const e: Partial<闸环境> = { 锁目录:dir, 本机:os.hostname(), 内存下限:30, 读内存:()=>内存(10), 读压力:()=>压力,
    现在毫秒:()=>now, 排队间隔毫秒:1000, 睡:async () => {
      now += 60_000; 轮++;
      expect(fs.existsSync(path.join(dir,'渲染.lock'))).toBe(false);
      const names=fs.readdirSync(path.join(dir,'渲染.排队')); expect(names).toHaveLength(1);
      if (下一张) { expect(names[0]).not.toBe(名); e.读内存=()=>内存(80); return; }
      名=names[0]!;
      if (轮===3) 压力=4;
      if (轮>=4) {
        fs.mkdirSync(path.join(dir,'指令'),{recursive:true});
        fs.writeFileSync(path.join(dir,'指令',名+'.json'),JSON.stringify({动作:'放行',强:轮>=5}));
      }
    }};
  await 过渲染闸(async()=>{},s=>提示.push(s),e);
  expect(轮).toBe(5); expect(提示.filter(x=>x.startsWith('告警'))).toHaveLength(1);
  expect(fs.existsSync(path.join(dir,'指令',名+'.json'))).toBe(false);
  下一张=true; 压力=1;
  // 第二张使用新的读数函数，不能靠上一张票的授权通过。
  e.睡=async()=>{ 轮++; expect(fs.existsSync(path.join(dir,'渲染.lock'))).toBe(false); throw Error('第二张仍在等'); };
  await expect(过渲染闸(async()=>{},()=>{},e)).rejects.toThrow('第二张仍在等');
});
it('同进程嵌套和祖先持锁都立即拒绝', async()=>{
  const e={锁目录:dir,本机:os.hostname(),读内存:()=>内存(80),读压力:()=>1,内存下限:30};
  await 过渲染闸(async()=>{await expect(过渲染闸(async()=>{},()=>{},e)).rejects.toThrow('嵌套');},()=>{},e);
  process.env[祖先持锁变量]=String(process.ppid);
  await expect(过渲染闸(async()=>{},()=>{},e)).rejects.toThrow(`祖先 pid ${process.ppid}`);
});
it('只动文件不判内存和压力', async()=>{
  await 过渲染闸(async()=>{},()=>{}, {锁目录:dir,本机:os.hostname(),读内存:()=>内存(0),读压力:()=>4}, {不开渲染:true});
});
it('冻结旧轮到我和试拿认新票 JSON、纯 pid 锁及尾部暂缓票',()=>{
  const q=path.join(dir,'渲染.排队');fs.mkdirSync(q);
  const host=os.hostname().replace(/[^A-Za-z0-9._-]/g,'_');
  const 新=`001000000000000-${host}-${process.pid}`, 旧=`002000000000000-${host}-${process.pid}`;
  fs.writeFileSync(path.join(q,新),JSON.stringify({v:1,声明:{种:'still'}}));
  fs.writeFileSync(path.join(q,旧),String(process.pid));
  expect(旧轮到我(q,{文件:path.join(q,旧),名:旧},os.hostname())).toBe(false);
  fs.renameSync(path.join(q,新),path.join(q,新.replace(/^0/,'9')));
  expect(旧轮到我(q,{文件:path.join(q,旧),名:旧},os.hostname())).toBe(true);
  const file=path.join(dir,'渲染.lock'); expect(试拿(file,os.hostname())).toBe(true);
  expect(旧试拿(file,os.hostname())).toBe(false); 放(file);
});

const 票们 = () => fs.readdirSync(path.join(dir, '渲染.排队'));
const 票内容 = () => JSON.parse(fs.readFileSync(path.join(dir, '渲染.排队', 票们()[0]!), 'utf8'));
const 事件 = (事: string) => 读调度(path.join(dir, 'logs')).filter(x => x.事 === 事);
const 锁 = () => path.join(dir, '渲染.lock');
const 基本 = (): Partial<闸环境> => ({ 锁目录: dir, 本机: os.hostname(), 内存下限: 30, 读内存: () => null, 读压力: () => 1, 清孤儿: () => [], 睡: async () => {} });

it('死锁 + 低内存 + 队首：不看准入就回收并清孤儿，3 秒内', async () => {
  const 死 = spawnSync(process.execPath, ['-e', '0']).pid!;
  fs.writeFileSync(锁(), `${死}\n`);
  let 清 = 0, 空闲 = 10, 首轮秒 = -1;
  const 起 = performance.now(), 提示: string[] = [];
  await 过渲染闸(async () => {}, s => 提示.push(s), { ...基本(), 读内存: () => 内存(空闲), 清孤儿: () => { 清++; return []; }, 睡: async () => {
    首轮秒 = (performance.now() - 起) / 1000;
    expect(fs.existsSync(锁())).toBe(false);
    expect(清).toBe(1);
    expect(票内容().卡在).toBe('内存');
    空闲 = 80;
  } }, { 种: 'still' });
  expect(首轮秒).toBeGreaterThanOrEqual(0);
  expect(首轮秒).toBeLessThan(3);
  expect(JSON.stringify(事件('回收死锁'))).toContain(String(死));
  expect(提示.join('\n')).not.toContain(`锁在 pid ${死}`);
});

it('排在后面的等待者也回收死锁，不靠队首', async () => {
  fs.writeFileSync(锁(), `${spawnSync(process.execPath, ['-e', '0']).pid!}\n`);
  fs.mkdirSync(path.join(dir, '渲染.排队'));
  const 前票 = path.join(dir, '渲染.排队', `000000000000001-${os.hostname().replace(/[^A-Za-z0-9._-]/g, '_')}-${process.ppid}`);
  fs.writeFileSync(前票, String(process.ppid));
  let 清 = 0;
  await 过渲染闸(async () => {}, () => {}, { ...基本(), 清孤儿: () => { 清++; return []; }, 睡: async () => {
    expect(fs.existsSync(锁())).toBe(false);
    expect(清).toBe(1);
    fs.rmSync(前票);
  } }, { 种: 'still' });
});

it('锁在活进程手里不算等内存：票不写字段、不告警；锁空才起算，再被占就结束', async () => {
  fs.writeFileSync(锁(), `${process.ppid}\n`);
  let now = Date.now(), 轮 = 0, 空闲 = 10;
  const 提示: string[] = [], 告警过 = () => 提示.some(x => x.startsWith('告警'));
  await 过渲染闸(async () => {}, s => 提示.push(s), { ...基本(), 读内存: () => 内存(空闲), 现在毫秒: () => now, 睡: async () => {
    轮++;
    const c = 票内容();
    if (轮 <= 5) {
      expect(c.等内存起).toBeUndefined();
      expect(c.卡在).toBeUndefined();
      expect(告警过()).toBe(false);
      expect(事件('告警').filter(x => x.类 === '等内存')).toEqual([]);
    }
    if (轮 === 5) fs.rmSync(锁());
    if (轮 === 6) {
      expect(c.等内存起).toBe(now);
      expect(c.卡在).toBe('内存');
      fs.writeFileSync(锁(), `${process.ppid}\n`);
    }
    if (轮 === 7) {
      expect(c.等内存起).toBeUndefined();
      expect(c.卡在).toBeUndefined();
      fs.rmSync(锁());
    }
    if (轮 === 10) expect(告警过()).toBe(false);
    if (轮 === 11) expect(告警过()).toBe(true);
    if (轮 === 12) 空闲 = 80;
    now += 60_000;
  } }, { 种: 'still' });
  expect(轮).toBe(12);
  expect(提示).toContain(`渲染排队（锁在 pid ${process.ppid} 手里）`);
  expect(事件('等内存起')).toHaveLength(2);
  expect(事件('等内存止')).toHaveLength(2);
});

it('监控全写不了也只提示：渲染跑完、锁照放、下一次能拿', async () => {
  fs.mkdirSync(path.join(dir, '渲染.lock.信息.json', '占位'), { recursive: true });
  fs.writeFileSync(path.join(dir, '在跑'), '');
  fs.writeFileSync(path.join(dir, 'state'), '');
  fs.mkdirSync(path.join(dir, '耗时.tsv'));
  let now = Date.now(), 采样 = 0;
  const e: Partial<闸环境> = { ...基本(), 现在毫秒: () => now, 读机器: () => { 采样++; throw Error('采样炸了'); } };
  const 说 = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  try {
    const r = await 过渲染闸(async () => {
      now += 30_000;
      vi.advanceTimersByTime(30_000);
      now += 30_000;
      闸心跳(1);
      return 'ok';
    }, () => {}, e, { 种: 'still' });
    expect(r).toBe('ok');
    expect(采样).toBe(2);
    expect(fs.existsSync(锁())).toBe(false);
    expect(票们()).toEqual([]);
    const 说的 = 说.mock.calls.flat().join('\n');
    for (const 名 of ['信息文件', '监测', '在跑登记', '耗时记录']) expect(说的).toContain(`!! ${名}失败`);
    expect(await 过渲染闸(async () => '二', () => {}, e, { 种: 'still' })).toBe('二');
  } finally {
    vi.useRealTimers();
    说.mockRestore();
  }
});

it('领票抛错也交棒：同进程下一次不挂', async () => {
  const q = path.join(dir, '渲染.排队');
  fs.writeFileSync(q, '');
  await expect(过渲染闸(async () => {}, () => {}, 基本(), { 种: 'still' })).rejects.toThrow();
  fs.rmSync(q);
  expect(await 过渲染闸(async () => 'ok', () => {}, 基本(), { 种: 'still' })).toBe('ok');
});

it('拿到锁后抛错也放锁、删票、交棒', async () => {
  await expect(排队拿('渲染', { ...基本(), 声明: { 种: 'still' }, 锁内复核: () => { throw Error('复核炸了'); } })).rejects.toThrow('复核炸了');
  expect(fs.existsSync(锁())).toBe(false);
  expect(票们()).toEqual([]);
  const 柄 = await 排队拿('渲染', { ...基本(), 声明: { 种: 'still' } });
  柄.放();
  expect(fs.existsSync(锁())).toBe(false);
});

it('本机名跟配置走：ANIM_HOST 同时进环境和日志', () => {
  const 根 = import.meta.dirname, 脚本 = `import {取调度环境} from ${JSON.stringify(path.join(根, '任务.ts'))};import {记调度,读调度} from ${JSON.stringify(path.join(根, '调度日志.ts'))};const d=${JSON.stringify(dir)};记调度(d,'测',{});console.log(取调度环境({锁目录:d}).本机,读调度(d)[0].主机);`;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', 脚本], { encoding: 'utf8', env: { ...process.env, ANIM_HOST: '测试机' } });
  expect(out.trim()).toBe('测试机 测试机');
});

it('票在拿锁前一刻被改名：拿锁后按任务清掉，不留残留活票', async () => {
  const 柄 = await 排队拿('渲染', { ...基本(), 声明: { 种: 'render' }, 准入: t => { 改序(t, String(t.时间 - 1)); return true; } });
  expect(票们()).toEqual([]);
  柄.放();
  expect(票们()).toEqual([]);
  expect(fs.existsSync(锁())).toBe(false);
});

it('持锁期间撞出来的同任务票，放锁前再清一次', async () => {
  const 柄 = await 排队拿('渲染', { ...基本(), 声明: { 种: 'render' } });
  const 残留 = path.join(dir, '渲染.排队', `000000000000001-${os.hostname().replace(/[^A-Za-z0-9._-]/g, '_')}-${process.pid}`);
  fs.writeFileSync(残留, JSON.stringify({ v: 1, 任务: 柄.任务, 起: 0, 发起: {}, 声明: {} }));
  柄.放();
  expect(票们()).toEqual([]);
});

it('写旧路径和改名撞上出两张票时，留改名后的那张', async () => {
  let 轮 = 0, 新名 = '';
  await 过渲染闸(async () => {}, () => {}, { ...基本(), 读内存: () => 内存(轮 < 2 ? 10 : 80), 睡: async () => {
    轮++;
    if (轮 === 1) {
      const 旧名 = 票们()[0]!, 旧 = path.join(dir, '渲染.排队', 旧名), 内容 = fs.readFileSync(旧, 'utf8');
      新名 = 旧名.replace(/^\d+/, m => String(Number(m) + 1).padStart(15, '0'));
      fs.renameSync(旧, path.join(dir, '渲染.排队', 新名));
      fs.writeFileSync(旧, 内容);
    }
    if (轮 === 2) expect(票们()).toEqual([新名]);
  } }, { 种: 'still' });
  expect(轮).toBe(2);
});
