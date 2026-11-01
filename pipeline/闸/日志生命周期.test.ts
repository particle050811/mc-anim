import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {afterEach,beforeEach,expect,it} from 'vitest';
import {过渲染闸} from './闸.ts';
import {读调度,记调度} from './调度日志.ts';
import {读发起者} from './发起者.ts';
import {清崩溃,取调度环境} from './任务.ts';
import {找孤儿,清孤儿} from './孤儿.ts';
let dir:string;
const children:ReturnType<typeof spawn>[]=[];
beforeEach(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'anim-日志-'));});
afterEach(async()=>{for(const c of children.splice(0)){if(c.exitCode===null&&c.signalCode===null){const p=once(c,'exit');c.kill('SIGKILL');await p;}}fs.rmSync(dir,{recursive:true,force:true});});
const 起=async()=>{const c=spawn(process.execPath,[path.join(import.meta.dirname,'fixtures/持锁子进程.ts'),dir],{stdio:['ignore','pipe','pipe']});children.push(c);let err='';c.stderr!.on('data',d=>err+=d);await new Promise<void>((resolve,reject)=>{c.stdout!.on('data',d=>{if(String(d).includes('ready'))resolve();});c.once('exit',()=>reject(Error(err)));});return {c,错误:()=>err};};
it('SIGKILL 持有者 3 秒内回收，原持有者和崩溃只写一次',async()=>{
  const {c}=await 起();const dead=once(c,'exit');c.kill('SIGKILL');await dead;
  const t=performance.now();await 过渲染闸(async()=>{},()=>{}, {锁目录:dir,读内存:()=>null,读压力:()=>1,清孤儿:()=>[]});
  expect(performance.now()-t).toBeLessThan(3000);
  const e=取调度环境({锁目录:dir});清崩溃(e);清崩溃(e);
  const events=读调度(path.join(dir,'logs'));expect(events.filter(x=>x.事==='崩溃')).toHaveLength(1);
  expect(JSON.stringify(events.find(x=>x.事==='回收死锁'))).toContain(String(c.pid));
});
it.each([['SIGTERM',143],['SIGHUP',129]] as const)('%s 清票放锁清临时文件并记耗时 %s',async(sig,code)=>{
  const {c,错误}=await 起();const task=JSON.parse(fs.readFileSync(path.join(dir,'渲染.lock.信息.json'),'utf8')).任务;
  fs.mkdirSync(path.join(dir,'指令'),{recursive:true});fs.writeFileSync(path.join(dir,'指令',task+'.json'),JSON.stringify({动作:'取消',为什么:'测试不重发'}));
  const end=once(c,'exit');c.kill(sig);const [退出码]=await end;expect(退出码).toBe(code);
  expect(错误()).toContain('被调度取消：测试不重发，不要原样重发');
  expect(fs.existsSync(path.join(dir,'渲染.lock'))).toBe(false);
  expect(fs.readdirSync(path.join(dir,'渲染.排队'))).toHaveLength(0);
  expect(fs.existsSync(path.join(dir,'本次.渲染中.mkv'))).toBe(false);
  expect(读调度(path.join(dir,'logs')).filter(x=>x.事==='被杀')).toHaveLength(1);
  expect(fs.readFileSync(path.join(dir,'耗时.tsv'),'utf8')).toContain(`\t${code}\t`);
});
it('8 进程各 1000 行 O_APPEND 全部可解析',async()=>{
  const module=path.join(import.meta.dirname,'调度日志.ts');
  await Promise.all(Array.from({length:8},async(_,i)=>{const c=spawn(process.execPath,['--input-type=module','-e',`import {记调度} from ${JSON.stringify(module)};for(let n=0;n<1000;n++)记调度(${JSON.stringify(dir)},'测试',{i:${i},n});`]);children.push(c);expect((await once(c,'exit'))[0]).toBe(0);}));
  const rows=读调度(dir);expect(rows).toHaveLength(8000);expect(new Set(rows.map(x=>`${x.i}-${x.n}`)).size).toBe(8000);
});
it('白名单及命令遮密，不泄漏 token 类变量',()=>{
  const 发起=读发起者({CODEX_THREAD_ID:'abcdefgh999',CLAUDE_CODE_SESSION_ID:'claude',SECRET_TOKEN:'fake-env-secret',ANIM_ROUTE:'测试'},['node','script','--token','fake-argv-secret','password=fake-password'],dir,false);
  记调度(dir,'任务起',{发起,API_KEY:'fake-key'});
  const text=JSON.stringify(读调度(dir));expect(text).not.toMatch(/fake-env-secret|fake-argv-secret|fake-password|fake-key/);expect(发起.来源).toBe('codex');
});
it('孤儿清理只命中 Remotion headless 路径，不碰 Playwright',()=>{
  const ps='111 1 900 /x/node_modules/.remotion/chrome-headless-shell/mac-arm64/chrome-headless-shell\n112 2 900 /x/node_modules/.remotion/chrome-headless-shell/mac-arm64/chrome-headless-shell\n113 1 900 /x/ms-playwright/chrome-headless-shell';
  expect(找孤儿(ps).map(x=>x.pid)).toEqual([111]);const killed:number[]=[];清孤儿(ps,pid=>{killed.push(pid);return true;});expect(killed).toEqual([111]);
});
