import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {beforeEach,afterEach,expect,it} from 'vitest';
import {openGateBatch,passGate} from './闸.ts';
import {resolveSchedulerEnv} from './任务.ts';
import {writeDirective} from './指令.ts';
let dir:string;beforeEach(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'anim-批-'));});afterEach(()=>fs.rmSync(dir,{recursive:true,force:true}));
it('批短项不逐项交棒，120秒有等待者交棒；连贯不让，指令仍让',async()=>{
  let now=Date.now();const e={...resolveSchedulerEnv({lockDir:dir,nowMs:()=>now}),readMemory:()=>null,readPressure:()=>1};
  const run=async(coherent:boolean)=>{
    const gate=openGateBatch({项数:2,...(coherent?{coherent:{reason:'核对加载历史'}}:{})},e);
    let ticket='';
    await gate.runTask({},async()=>{now+=60_000;ticket=JSON.parse(fs.readFileSync(path.join(dir,'渲染.lock.信息.json'),'utf8')).票;});expect(fs.existsSync(path.join(dir,'渲染.lock'))).toBe(true);
    const name=`${Date.now()+1}-${os.hostname().replace(/[^A-Za-z0-9._-]/g,'_')}-${process.ppid}`;const file=path.join(dir,'渲染.排队',name);fs.writeFileSync(file,String(process.ppid));
    await gate.runTask({},async()=>{now+=60_000;});expect(fs.existsSync(path.join(dir,'渲染.lock'))).toBe(coherent);fs.rmSync(file);gate.结束();return ticket;
  };
  await run(false);await run(true);
  const gate=openGateBatch({coherent:{reason:'只测显式让路'}},e);
  await gate.runTask({},async()=>{const info=JSON.parse(fs.readFileSync(path.join(dir,'渲染.lock.信息.json'),'utf8'));writeDirective(e,info.任务,{action:'让路',reason:'紧急',时:now,untilMs:now+60_000,票:info.票});});expect(fs.existsSync(path.join(dir,'渲染.lock'))).toBe(false);gate.结束();
});
it('重放行等待不持短锁，卡项明确；死的上次放行者不等60秒',async()=>{
  let now=Date.now(),n=0;const msg:string[]=[];const e={lockDir:dir,nowMs:()=>now,readMemory:()=>null,readPressure:()=>1,coreCount:()=>10,load1Min:()=>n<2?100:0,sleep:async(ms:number)=>{expect(fs.existsSync(path.join(dir,'放行.lock'))).toBe(false);n++;now+=ms;}};
  await passGate(async()=>{},s=>msg.push(s),e);expect(msg[0]).toContain('负载');expect(n).toBe(2);
  fs.writeFileSync(path.join(dir,'上次放行.信息.json'),JSON.stringify({秒:Math.floor(now/1000),pid:99999999}));
  const before=n;await passGate(async()=>{},()=>{},e);expect(n).toBe(before);
  expect(fs.readFileSync(path.join(dir,'上次放行'),'utf8')).toMatch(/^\d+\n$/);
});
it('game start 队首先判负载再拿锁，负载等待不冒充内存等待',async()=>{
  const {passRenderGate}=await import('./闸.ts');let load=100;const msg:string[]=[];
  await passRenderGate(async()=>{expect(load).toBe(0);},x=>msg.push(x),{lockDir:dir,readMemory:()=>null,readPressure:()=>1,coreCount:()=>10,load1Min:()=>load,sleep:async()=>{
    expect(fs.existsSync(path.join(dir,'渲染.lock'))).toBe(false);const q=fs.readdirSync(path.join(dir,'渲染.排队'))[0]!;const t=JSON.parse(fs.readFileSync(path.join(dir,'渲染.排队',q),'utf8'));expect(t.卡在).toBe('负载');expect(t.waitMemStart).toBeUndefined();load=0;
  }},{种:'mcai game start',needsLoad:true});expect(msg.some(x=>x.includes('等负载'))).toBe(true);
});
