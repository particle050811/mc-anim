import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {beforeEach,afterEach,expect,it} from 'vitest';
import {开闸批,过放行闸} from './闸.ts';
import {取调度环境} from './任务.ts';
import {写指令} from './指令.ts';
let dir:string;beforeEach(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'anim-批-'));});afterEach(()=>fs.rmSync(dir,{recursive:true,force:true}));
it('批短项不逐项交棒，120秒有等待者交棒；连贯不让，指令仍让',async()=>{
  let now=Date.now();const e={...取调度环境({锁目录:dir,现在毫秒:()=>now}),读内存:()=>null,读压力:()=>1};
  const run=async(连贯:boolean)=>{
    const 批=开闸批({项数:2,...(连贯?{连贯:{为什么:'核对加载历史'}}:{})},e);
    let ticket='';
    await 批.一项({},async()=>{now+=60_000;ticket=JSON.parse(fs.readFileSync(path.join(dir,'渲染.lock.信息.json'),'utf8')).票;});expect(fs.existsSync(path.join(dir,'渲染.lock'))).toBe(true);
    const name=`${Date.now()+1}-${os.hostname().replace(/[^A-Za-z0-9._-]/g,'_')}-${process.ppid}`;const file=path.join(dir,'渲染.排队',name);fs.writeFileSync(file,String(process.ppid));
    await 批.一项({},async()=>{now+=60_000;});expect(fs.existsSync(path.join(dir,'渲染.lock'))).toBe(连贯);fs.rmSync(file);批.结束();return ticket;
  };
  await run(false);await run(true);
  const 批=开闸批({连贯:{为什么:'只测显式让路'}},e);
  await 批.一项({},async()=>{const info=JSON.parse(fs.readFileSync(path.join(dir,'渲染.lock.信息.json'),'utf8'));写指令(e,info.任务,{动作:'让路',为什么:'紧急',时:now,至:now+60_000,票:info.票});});expect(fs.existsSync(path.join(dir,'渲染.lock'))).toBe(false);批.结束();
});
it('重放行等待不持短锁，卡项明确；死的上次放行者不等60秒',async()=>{
  let now=Date.now(),n=0;const msg:string[]=[];const e={锁目录:dir,现在毫秒:()=>now,读内存:()=>null,读压力:()=>1,核数:()=>10,一分钟负载:()=>n<2?100:0,睡:async(ms:number)=>{expect(fs.existsSync(path.join(dir,'放行.lock'))).toBe(false);n++;now+=ms;}};
  await 过放行闸(async()=>{},s=>msg.push(s),e);expect(msg[0]).toContain('负载');expect(n).toBe(2);
  fs.writeFileSync(path.join(dir,'上次放行.信息.json'),JSON.stringify({秒:Math.floor(now/1000),pid:99999999}));
  const 前=n;await 过放行闸(async()=>{},()=>{},e);expect(n).toBe(前);
  expect(fs.readFileSync(path.join(dir,'上次放行'),'utf8')).toMatch(/^\d+\n$/);
});
