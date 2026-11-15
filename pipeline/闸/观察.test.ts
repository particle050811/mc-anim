import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {beforeEach,afterEach,expect,it} from 'vitest';
import {renderView,type SchedulerState} from './看.ts';
import {judgeAlerts,emptyHistory,updateHistory,recordAlerts,readMonitor} from './告警.ts';
import {resolveSchedulerEnv} from './任务.ts';
import {readCaller} from './发起者.ts';
import {watchSched} from './盯.ts';
import {estimate} from './估计.ts';
import {review} from './复盘.ts';
import {readMachineSnapshotParallel} from './机器.ts';
import {parseVmStat} from '../环境/资源.ts';
import {readSchedulerEvents,recordSchedulerEvent,type SchedulerEvent} from './调度日志.ts';
let dir:string;
beforeEach(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'anim-观察-'));});afterEach(()=>fs.rmSync(dir,{recursive:true,force:true}));
const baseState=():SchedulerState=>({时:1_000_000,机:{负载:1,核:10,闸:40,压力:1,free:1e9,压缩:1e9,swap:0,swapOut:0,GPU:50,热:1,disk:4e11,orphans:0,psOutput:''},票:[],lockHolders:[],running:[],recentEvents:[]});
const addTickets=(s:SchedulerState,n:number)=>{for(let i=0;i<n;i++)s.票.push({名:'00100000'+i+'-host-'+i,文件:'/temp/渲染.排队/'+i,pid:i,主机:'host',时间:0,ticketContent:{v:1,任务:'task'+i,起:0,声明:{种:'still',段:'6-斩娜迦'},发起:readCaller({},[],dir,false)}});};
it('20 张票折叠在 10 行/1.2KB 内',()=>{const s=baseState();addTickets(s,20);const text=renderView(s);expect(text.split('\n').length).toBeLessThanOrEqual(10);expect(Buffer.byteLength(text)).toBeLessThanOrEqual(1200);expect(text).toContain('另17张');});
it.each([['10-22',146],['11-01 15:51',21],['11-01 夜',144]])('%s 旧事故回放：锁外等内存 3 分钟通知且跨重挂去重',(_,minutes)=>{
  const s=baseState();s.时=minutes*60_000;addTickets(s,1);s.票[0]!.ticketContent!.waitMemStart=0;
  const e=resolveSchedulerEnv({lockDir:dir});let h=emptyHistory();const alarms=judgeAlerts(s,s.时,undefined,h);expect(alarms.some(x=>x.类==='等内存')).toBe(true);recordAlerts(e,s,h,alarms);h=readMonitor(e);expect(judgeAlerts(s,s.时,undefined,h)).toHaveLength(0);
});
it('CPU 无队列也告警，孤儿依赖历史，swap 光涨没人变慢不报，队深只创新高',()=>{
  const s=baseState();s.时=0;s.机.负载=30;let h=updateHistory(s,emptyHistory());for(const t of [30,60,90,120,150])h=updateHistory({...s,时:t*1000},h);s.时=180_000;s.机.swap=2**30;s.机.orphans=1;h=updateHistory(s,h);h=updateHistory(s,h);
  const kinds=judgeAlerts(s,s.时,undefined,h).map(x=>x.类);expect(kinds).toEqual(expect.arrayContaining(['负载','孤儿Chrome']));expect(kinds).not.toContain('swap增长');
  addTickets(s,4);h.highWater=4;expect(judgeAlerts(s,s.时,undefined,h).some(x=>x.类==='队深')).toBe(false);
});
it('盯无事件 0 输出，到点 124；父死退出；重挂不重报',async()=>{
  let now=0;const e=resolveSchedulerEnv({lockDir:dir,nowMs:()=>now,caller:readCaller({},[],dir,false)});const outputLines:string[]=[];
  const o={maxSec:10,输出:(s:string)=>outputLines.push(s),读:()=>({...baseState(),时:now}),sleep:async(ms:number)=>{now+=ms;},parentAlive:()=>true};
  expect(await watchSched(e,o)).toBe(124);expect(outputLines).toEqual([]);
  expect(await watchSched(e,{...o,parentAlive:()=>false})).toBe(0);
  now=0;const s=baseState();s.机.压力=4;expect(await watchSched(e,{...o,读:()=>({...s,时:now})})).toBe(0);expect(outputLines.length).toBe(1);
  expect(await watchSched(e,{...o,读:()=>({...s,时:now})})).toBe(124);expect(outputLines.length).toBe(1);
});
it('still 估计用明细首帧和纯跑，不把排队加进去',()=>{
  fs.mkdirSync(path.join(dir,'渲染明细'));fs.writeFileSync(path.join(dir,'渲染明细','one.json'),JSON.stringify({标签:'still:作/段:视频',总秒:900,小结:{帧数:2,首帧毫秒:10_000,中位毫秒:2000}}));
  expect(estimate({种:'still',段:'段',帧数:3},dir)).toBe(14);
});
it('复盘 fixture 回答持锁、谁等谁、内存、被杀/决定、实验比例和告警延迟',()=>{
  const base={v:1,主机:'host'},rows:SchedulerEvent[]=[];const add=(n:number,eventName:string,x:Record<string,unknown>)=>rows.push({...base,时:new Date(n*1000).toISOString(),事: eventName,...x});
  add(0,'拿锁',{票:'a',任务:'A'});add(1,'领票',{票:'b',任务:'B'});add(5,'告警',{对象:'b'});add(10,'决定',{票:'b',决定:'取消',为什么:'实验让产出',谁:'主'});add(11,'被杀',{任务:'A'});add(12,'放锁',{票:'a',任务:'A',持锁秒:12,声明:{用途:'实验'}});add(13,'等内存止',{票:'b',秒:3});add(14,'拿锁',{票:'b',任务:'B'});add(18,'放锁',{票:'b',任务:'B',持锁秒:4,声明:{用途:'产出'}});add(19,'清死票',{票:'a'});add(20,'拿锁',{票:'c',任务:'C'});
  const r=review(rows);expect(r.currentHolds[0]?.任务).toBe('C');expect(r.waitingOn['B→A']).toBe(11);expect(r.memWaitSec.b).toBe(3);expect(r.killed).toHaveLength(1);expect(r.decisions).toHaveLength(1);expect(r.experimentShare).toBe(.75);expect(r.alertToDecisionSec).toEqual([5]);expect(r.reclaims).toHaveLength(1);
});
it('资源闸 import 闭包没有 Remotion',()=>{
  const seen=new Set<string>();const walk=(file:string)=>{if(seen.has(file))return;seen.add(file);const text=fs.readFileSync(file,'utf8');
    for(const m of text.matchAll(/(?:from\s+|import\s*\()['"]([^'"]+)['"]/g)){const target=m[1]!;expect(target).not.toMatch(/(?:^|\/)remotion|@remotion/);if(target.startsWith('.')&&/\.[cm]?tsx?$/.test(target))walk(path.resolve(path.dirname(file),target));}
  };for(const f of fs.readdirSync(import.meta.dirname).filter(f=>f.endsWith('.ts')&&!f.endsWith('.test.ts')))walk(path.join(import.meta.dirname,f));
});
it('无帧、持锁死亡、持锁超时和连贯批都有 fixture，升级最多三次',()=>{
  const s=baseState();s.时=2_000_000;addTickets(s,1);
  const holdLock=(dead:boolean)=>({pid:1,票:'x',任务:'x',拿锁时:0,心跳:s.时,帧时:0,已出帧:0,总帧:100,死: dead,声明:{coherent:{reason:'测连贯'},预计秒:60},发起:readCaller({},[],dir,false)});
  s.lockHolders=[holdLock(false)];const a=judgeAlerts(s,s.时);expect(a.map(x=>x.类)).toEqual(expect.arrayContaining(['无帧','持锁超时','连贯批']));expect(a.every(x=>x.次数<=3)).toBe(true);
  s.lockHolders=[holdLock(true)];expect(judgeAlerts(s,s.时).filter(x=>x.target.startsWith('x/')).map(x=>x.类)).toEqual(['持锁者死']);
});
it('等待者已写的告警能由后来挂上的盯消费，不能只更新去重表而漏叫醒',async()=>{
  const e=resolveSchedulerEnv({lockDir:dir,caller:readCaller({},[],dir,false)}),s=baseState();s.时=Date.now();s.机.压力=4;
  const h=emptyHistory();recordAlerts(e,s,h,judgeAlerts(s,s.时,undefined,h));const out:string[]=[];
  expect(await watchSched(e,{读:()=>s,parentAlive:()=>true,输出:x=>out.push(x)})).toBe(0);expect(out[0]).toContain('内存压力');
});

it.skipIf(process.platform !== 'darwin')('查看并行采样保持闸口径、缺读数不伪造零，六项同时发起',async()=>{
  const vm='Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages free: 200000.\nPages inactive: 100000.\nPages speculative: 2000.\nPages purgeable: 1000.\nPages occupied by compressor: 300.\nSwapouts: 400.';
  const started:string[]=[],resolvers:Array<()=>void>=[];
  const pending=readMachineSnapshotParallel(async(cmd,args)=>{started.push(cmd+' '+args.join(' '));await new Promise<void>(r=>resolvers.push(r));return cmd==='vm_stat'?vm:args.includes('vm.swapusage')?'total = 2048.00M used = 1024.00M':args.includes('kern.memorystatus_vm_pressure_level')?'4':cmd==='ioreg'?'"Device Utilization %" = 93':'';},async()=>({芯片最高温:72.5,发热等级:1}));
  expect(started).toHaveLength(5);for(const f of resolvers)f();const s=await pending;
  expect(s.闸).toBe(Math.round(parseVmStat(vm,os.totalmem())/os.totalmem()*100));expect(s.free).toBe(200000*16384);expect(s.压缩).toBe(300*16384);expect(s.swap).toBe(2**30);expect(s.压力).toBe(4);expect(s.GPU).toBe(93);expect(s.热).toBe(1);
  const empty=await readMachineSnapshotParallel(async()=> '',async()=>({芯片最高温:null,发热等级:null}));expect([empty.闸,empty.压力,empty.free,empty.swap,empty.GPU,empty.热,empty.orphans]).toEqual([null,null,null,null,null,null,null]);
});

it('盯把快照与补读日志的同一任务止合并为一次通知',async()=>{
  const e=resolveSchedulerEnv({lockDir:dir}),s=baseState();s.时=Date.now();recordSchedulerEvent(e.logDir,'任务止',{任务:'结束任务'},s.时);s.recentEvents=readSchedulerEvents(e.logDir);const out:string[]=[];
  expect(await watchSched(e,{任务:'结束任务',读:()=>s,parentAlive:()=>true,输出:x=>out.push(x)})).toBe(0);
  expect(out).toHaveLength(1);expect(out[0]!.match(/任务止/g)).toHaveLength(1);
});
it('估计：声明了级别只认同级；明细和阶段表没样本时 render 回退耗时表，still 不回退',()=>{
  fs.mkdirSync(path.join(dir,'渲染明细'));fs.writeFileSync(path.join(dir,'渲染明细','one.json'),JSON.stringify({标签:'render:作/段:预览',小结:{帧数:2,首帧毫秒:10_000,中位毫秒:1000}}));
  expect(estimate({种:'render',段:'段',帧数:2,级别:'预览'},dir)).toBe(11);
  expect(estimate({种:'render',段:'段',帧数:2,级别:'视频'},dir)).toBeNull();
  fs.writeFileSync(path.join(dir,'耗时.tsv'),'开始（UTC）\t标签\t秒\t退出码\t主机\t命令\nt\trender:作/段:视频\t500.0\t0\th\tc\nt\trender:作/段:视频\t900.0\t1\th\tc\nt\tstill:作/段:视频\t700.0\t0\th\tc\n');
  expect(estimate({种:'render',段:'段',帧数:2,级别:'视频'},dir)).toBe(500);
  expect(estimate({种:'still',段:'段',帧数:1,级别:'视频'},dir)).toBeNull();
});
it('队列行：关键标记在前不被截，超预算只截段和路名；重复按帧号和级别认',()=>{
  const s=baseState();addTickets(s,3);s.票.forEach((t,i)=>{t.pid=100+i;});const [a,b,c]=s.票.map(t=>t.ticketContent!) as [NonNullable<typeof s.票[0]['ticketContent']>,NonNullable<typeof s.票[0]['ticketContent']>,NonNullable<typeof s.票[0]['ticketContent']>];
  const stillDecl={种:'still',作品:'作',段:'6-规矩风矢',级别:'视频',帧:'0',帧数:1,预计秒:24};
  a.声明=stillDecl;a.stuckOn='内存';a.发起={...a.发起,路:'很长'.repeat(30)};
  b.声明={...stillDecl,帧:'100'};c.声明={...stillDecl};c.deferredUntilMs=9e15;
  const lines=renderView(s).split('\n').filter(x=>x.startsWith('排队'));
  expect(lines[0]).toMatch(/^排队1 #100 等内存 等.+约.+后 still 6-规矩风矢 很长/);expect(lines[0]!.endsWith('…')).toBe(true);
  expect(lines[1]).not.toContain('重复');
  expect(lines[2]).toMatch(/^排队3 #102 重复#100 暂缓 /);
  c.声明={...stillDecl,级别:'预览'};expect(renderView(s)).not.toContain('重复');
});
