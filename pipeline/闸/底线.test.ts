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

it('本机名跟配置走：ANIM_HOST 同时进环境和日志', () => {
  const 根 = import.meta.dirname, 脚本 = `import {取调度环境} from ${JSON.stringify(path.join(根, '任务.ts'))};import {记调度,读调度} from ${JSON.stringify(path.join(根, '调度日志.ts'))};const d=${JSON.stringify(dir)};记调度(d,'测',{});console.log(取调度环境({锁目录:d}).本机,读调度(d)[0].主机);`;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', 脚本], { encoding: 'utf8', env: { ...process.env, ANIM_HOST: '测试机' } });
  expect(out.trim()).toBe('测试机 测试机');
});
