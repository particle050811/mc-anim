import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {parseArgs} from '../cli/参数.ts';
import {resolveSchedulerEnv,openTask,cleanCrashed} from './任务.ts';
import {readCaller} from './发起者.ts';
import {changeScheduler,orderCommand,routeCommand} from './改调度.ts';
import {readState,oneLineStatus,renderView} from './看.ts';
import {listTickets,claimTicket,writeTicket,hostSlug} from './票.ts';
import {readSchedulerEvents} from './调度日志.ts';
import {waitUntil} from './等.ts';
import {openGateBatch,passGate,passRenderGate} from './闸.ts';
import {judgeAlerts} from './告警.ts';
import {writeDirective,routeYield,directiveFile,orderFile} from './指令.ts';
import {spawn,spawnSync} from 'node:child_process';
let dir:string;beforeEach(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'anim-指令-'));});afterEach(()=>fs.rmSync(dir,{recursive:true,force:true}));
const fakeMachine=()=>({负载:0,核:10,闸:10,压力:1,free:0,压缩:0,swap:0,换出:0,GPU:0,热:0,盘:1e10,孤儿:0,进程:''});
const parseParams=(xs:string[]=[])=>parseArgs(xs,{值:['--为什么','--分钟','--pid','--文件','--内存','--最长','--让路'],toggles:['--强','--原序','--杀持锁','--闸空','--撤']});
const setup=()=>{const e=resolveSchedulerEnv({lockDir:dir});const task={任务:'task',起:Date.now(),心跳:Date.now(),主机:e.localHost,发起:readCaller({},[],dir,false),声明:{种:'still'}};const t=claimTicket(path.join(dir,'渲染.排队'),e.localHost,task,Date.now());return {e,t};};
it('先后恢复放行取消都写决定+快照，缺原因用法错；旧票拒绝改名',()=>{
  const {e,t}=setup(),o={状态:()=>readState(e,fakeMachine,false),输出:()=>{},kill:()=>{}};
  expect(()=>changeScheduler('先',t.名,parseParams(),e,o)).toThrow('必须带');
  for(const cmd of ['后','恢复','先','放行','取消']){const name=listTickets(path.join(dir,'渲染.排队'))[0]!.名;const startMs=performance.now();changeScheduler(cmd,name,parseParams(['--为什么','测试']),e,o);expect(performance.now()-startMs).toBeLessThan(3000);}
  const rows=readSchedulerEvents(e.logDir).filter(x=>x.事==='决定');expect(rows).toHaveLength(5);expect(rows.every(x=>x.看到&&x.机&&x.谁)).toBe(true);
  const q=listTickets(path.join(dir,'渲染.排队'))[0]!;fs.writeFileSync(q.文件,String(process.pid));expect(()=>changeScheduler('先',q.名,parseParams(['--为什么','旧票']),e,o)).toThrow('旧票拒绝');
});
it('放行只这一张越队且不删除前面的真活票',async()=>{
  const {e,t}=setup();const old=t.名.replace(/-\d+$/,`-${process.ppid}`);fs.renameSync(t.文件,path.join(path.dirname(t.文件),old));
  const startMs=performance.now();await passRenderGate(async()=>{},()=>{}, {...e,readMemory:()=>({总:100,空闲:5,空闲百分比:5,交换区总:0,交换区已用:0}),readPressure:()=>1,sleep:async()=>{
    const mine=listTickets(path.join(dir,'渲染.排队')).find(x=>x.pid===process.pid)!;
    changeScheduler('放行',mine.名,parseParams(['--为什么','低峰值']),e,{状态:()=>readState(e,fakeMachine,false),输出:()=>{}});
  }});expect(performance.now()-startMs).toBeLessThan(3000);expect(fs.existsSync(path.join(path.dirname(t.文件),old))).toBe(true);
});
it('暂缓到期回队尾而不是原位',async()=>{
  let now=Date.now(),loopCount=0;const e=resolveSchedulerEnv({lockDir:dir,nowMs:()=>now});
  await passRenderGate(async()=>{},()=>{}, {...e,memFloor:30,readMemory:()=>loopCount>1?null:{总:100,空闲:1,空闲百分比:1,交换区总:0,交换区已用:0},readPressure:()=>1,sleep:async()=>{
    loopCount++;const t=listTickets(path.join(dir,'渲染.排队'))[0]!;
    if(loopCount===1){changeScheduler('后',t.名,parseParams(['--为什么','暂缓','--分钟','0.001']),e,{状态:()=>readState(e,fakeMachine,false),输出:()=>{}});}
    now+=1000;
  }});expect(readSchedulerEvents(e.logDir).some(x=>x.事==='恢复'&&x.原因==='暂缓到期回队尾')).toBe(true);
});
it('让路不中断当前段，下一张票暂缓；路令排队返回 75',async()=>{
  let now=Date.now(),sleepCount=0;const e=resolveSchedulerEnv({lockDir:dir,nowMs:()=>now}),task=openTask(e,{种:'render'});
  const env={...e,readMemory:()=>null,readPressure:()=>1,sleep:async()=>{sleepCount++;now+=60_000;}};
  await passRenderGate(async()=>{
    const s=readState(e,fakeMachine,false);changeScheduler('让路',s.持锁[0]!.票,parseParams(['--为什么','产出优先','--分钟','1']),e,{状态:()=>s,输出:()=>{}});
    expect(fs.existsSync(path.join(dir,'渲染.lock'))).toBe(true);
  },()=>{},env,{种:'render',可让路:true});
  await passRenderGate(async()=>{},()=>{},env);expect(sleepCount).toBeGreaterThan(0);task.结束();
  const route={...e,caller:{...e.caller,路:'一路'}};orderCommand(['一路'],parseParams(['--让路','请让路']),route,()=>{});
  await expect(passRenderGate(async()=>{},()=>{},{...env,caller:route.caller})).rejects.toMatchObject({退出码:75});
  routeCommand(['开','一路'],parseParams(),e,()=>{});routeCommand(['完','一路'],parseParams(),e,()=>{});expect(readSchedulerEvents(e.logDir).filter(x=>/^路/.test(x.事))).toHaveLength(2);
});
it('等闸空连续30秒，不被段间假空骗过；内存到点124',async()=>{
  let now=0;const e=resolveSchedulerEnv({lockDir:dir,nowMs:()=>now});
  expect(await waitUntil(parseParams(['--闸空','--最长','90']),e,{sleep:async ms=>{now+=ms;},gateEmpty:()=>now<20_000||now>=30_000})).toBe(0);expect(now).toBe(60_000);
  now=0;expect(await waitUntil(parseParams(['--内存','30','--最长','3']),e,{sleep:async ms=>{now+=ms;},freeMemory:()=>20})).toBe(124);
});
it('票已被持有者删掉时改序报错：不复活、不写决定',()=>{
  const {e,t}=setup(),snapshot=readState(e,fakeMachine,false);
  snapshot.票[0]!.内容!.暂缓至=Date.now()+60_000;
  fs.rmSync(t.文件);
  for(const cmd of ['先','后','恢复'])expect(()=>changeScheduler(cmd,t.名,parseParams(['--为什么','测试']),e,{状态:()=>snapshot,输出:()=>{}})).toThrow('已不在');
  expect(listTickets(path.join(dir,'渲染.排队'))).toHaveLength(0);
  expect(readSchedulerEvents(e.logDir).filter(x=>x.事==='决定')).toHaveLength(0);
});
it('后 先改名再写内容；写票不复活旧路径',()=>{
  const {e,t}=setup();let newName='';
  changeScheduler('后',t.名,parseParams(['--为什么','测试']),e,{状态:()=>readState(e,fakeMachine,false),输出:x=>{newName=x;}});
  expect(fs.existsSync(t.文件)).toBe(false);
  const q=listTickets(path.join(dir,'渲染.排队'));
  expect(q.map(x=>x.名)).toEqual([newName]);expect(q[0]!.内容!.暂缓至).toBeGreaterThan(Date.now());expect(q[0]!.内容!.原序).toBe(String(t.时间));
  writeTicket(t);expect(fs.existsSync(t.文件)).toBe(false);
});

const queue=()=>path.join(dir,'渲染.排队');
const makeMemory=(n:number)=>({总:100,空闲:n,空闲百分比:n,交换区总:0,交换区已用:0});
const leaveTicket=(e:ReturnType<typeof resolveSchedulerEnv>,pid:number,task='别人的')=>{fs.mkdirSync(queue(),{recursive:true});const ticketName=`${String(Date.now()).padStart(15,'0')}-${hostSlug(e.localHost)}-${pid}`;fs.writeFileSync(path.join(queue(),ticketName),JSON.stringify({v:1,任务: task,起:Date.now(),发起:readCaller({},[],dir,false),声明:{种:'still',段:'甲段'}}));return ticketName;};
const releaseLock=(pid:number,acquiredAt=Date.now())=>{fs.writeFileSync(path.join(dir,'渲染.lock'),`${pid}\n`);fs.writeFileSync(path.join(dir,'渲染.lock.信息.json'),JSON.stringify({pid,票:'锁票',任务:'持锁的',发起:{...readCaller({},[],dir,false),pid},声明:{种:'render',段:'乙段'},拿锁时: acquiredAt,心跳:Date.now(),帧时:Date.now(),已出帧:0}));};
const deadPid=99999997;
const listDecisions=(e:ReturnType<typeof resolveSchedulerEnv>)=>readSchedulerEvents(e.logDir).filter(x=>x.事==='决定');
const cancelEvents=(e:ReturnType<typeof resolveSchedulerEnv>)=>readSchedulerEvents(e.logDir).filter(x=>x.事==='取消');

it('放行按任务 id 存：放行后再改序仍越过内存，用掉就没了',async()=>{
  const e=resolveSchedulerEnv({lockDir:dir}),o={状态:()=>readState(e,fakeMachine,false),输出:()=>{}};let loopCount=0;
  await passRenderGate(async()=>{},()=>{}, {...e,readMemory:()=>makeMemory(5),readPressure:()=>1,sleep:async()=>{
    if(++loopCount>3)throw Error('改序后授权丢了');
    if(loopCount===1){changeScheduler('放行',listTickets(queue())[0]!.名,parseParams(['--为什么','峰值小']),e,o);changeScheduler('先',listTickets(queue())[0]!.名,parseParams(['--为什么','调序']),e,o);}
  }});
  expect(loopCount).toBe(1);expect(fs.readdirSync(path.join(dir,'指令'))).toEqual([]);
  expect(readSchedulerEvents(e.logDir).some(x=>x.事==='单票放行')).toBe(true);
});
it('放行闸的授权同样跟任务走：改序后越过负载',async()=>{
  const e=resolveSchedulerEnv({lockDir:dir}),o={状态:()=>readState(e,fakeMachine,false),输出:()=>{}},q=path.join(dir,'放行.排队');let loopCount=0;
  await passGate(async()=>{},()=>{}, {...e,readMemory:()=>null,readPressure:()=>1,coreCount:()=>10,load1Min:()=>100,sleep:async()=>{
    if(++loopCount>3)throw Error('改序后授权丢了');
    if(loopCount===1){changeScheduler('放行',listTickets(q)[0]!.名,parseParams(['--为什么','负载是别的']),e,o);changeScheduler('后',listTickets(q)[0]!.名,parseParams(['--为什么','调序']),e,o);}
  }});
  expect(loopCount).toBe(1);expect(fs.readdirSync(path.join(dir,'指令'))).toEqual([]);
});
it('放行到期作废：写事件一次、回到内存判断',async()=>{
  let now=Date.now(),loopCount=0,free=5;const e=resolveSchedulerEnv({lockDir:dir,nowMs:()=>now}),o={状态:()=>readState(e,fakeMachine,false),输出:()=>{}};
  releaseLock(process.ppid);const errorSpy=vi.spyOn(console,'error').mockImplementation(()=>{});
  await passRenderGate(async()=>{},()=>{}, {...e,readMemory:()=>makeMemory(free),readPressure:()=>1,sleep:async()=>{
    loopCount++;
    if(loopCount===1){changeScheduler('放行',listTickets(queue())[0]!.名,parseParams(['--为什么','当时够','--分钟','1']),e,o);now+=120_000;fs.rmSync(path.join(dir,'渲染.lock'));}
    if(loopCount===4)free=80;
    if(loopCount>6)throw Error('内存够了还没过');
  }});
  expect(loopCount).toBe(4);expect(readSchedulerEvents(e.logDir).filter(x=>x.事==='放行过期')).toHaveLength(1);
  expect(errorSpy.mock.calls.flat().join('\n')).toContain('放行授权已过期（当时够）');errorSpy.mockRestore();
  expect(fs.readdirSync(path.join(dir,'指令'))).toEqual([]);
});
it('拿锁后用掉放行时不删别的指令：让路还要留给下一段',async()=>{
  const e=resolveSchedulerEnv({lockDir:dir});let task='';
  await passRenderGate(async()=>{task=readState(e,fakeMachine,false).持锁[0]!.任务;writeDirective(e,task,{动作:'让路',为什么:'下一段再说',时:Date.now(),至:Date.now()+60_000,票:'旧票',任务: task});
    expect(fs.existsSync(directiveFile(e,task))).toBe(true);},()=>{}, {...e,readMemory:()=>null,readPressure:()=>1},{种:'render',可让路:true});
});
it('只有在跑登记、没有票和锁的任务不算目标',()=>{
  const e=resolveSchedulerEnv({lockDir:dir}),o={状态:()=>readState(e,fakeMachine,false),输出:()=>{},kill:vi.fn(),processStartTime:()=>0};
  const runningDir=path.join(dir,'在跑'),id='在跑任务-1';fs.mkdirSync(runningDir,{recursive:true});
  fs.writeFileSync(path.join(runningDir,`${id}.json`),JSON.stringify({任务:id,起:Date.now(),心跳:Date.now(),主机:e.localHost,发起:{...e.caller,pid:process.ppid},声明:{种:'render',可让路:true}}));
  expect(()=>changeScheduler('取消',`#${process.ppid}`,parseParams(['--为什么','只有登记']),e,o)).toThrow('目标不存在');
  expect(()=>changeScheduler('让路',id,parseParams(['--为什么','只有登记']),e,o)).toThrow('目标不存在');
});
it('取消：死票、死锁不发信号，决定记真实结果，不写取消事件',()=>{
  const e=resolveSchedulerEnv({lockDir:dir}),o=(kill:(...a:unknown[])=>void,lines:string[]=[])=>({状态:()=>readState(e,fakeMachine,false),输出:(x:string)=>{lines.push(x);},kill});
  const killSpy=vi.fn(),lines:string[]=[];
  const ticketName=leaveTicket(e,deadPid);changeScheduler('取消',ticketName,parseParams(['--为什么','死票']),e,o(killSpy,lines));
  expect(lines[0]).toContain('未发信号');expect(fs.existsSync(path.join(queue(),ticketName))).toBe(true);fs.rmSync(path.join(queue(),ticketName));
  releaseLock(deadPid+1);changeScheduler('取消',`#${deadPid+1}`,parseParams(['--为什么','死锁','--杀持锁','--强']),e,o(killSpy,lines));
  expect(killSpy).not.toHaveBeenCalled();expect(lines[1]).toContain('留下的锁由下一个等待者回收');
  expect(listDecisions(e).map(x=>String(x.结果))).toEqual([expect.stringContaining('未发信号'),expect.stringContaining('未发信号')]);expect(cancelEvents(e)).toHaveLength(0);
});
it.skipIf(process.platform==='win32')('取消：pid 已换人（真进程，启动晚于声称的时刻）不发信号，下一个等待者回收',async()=>{
  const e=resolveSchedulerEnv({lockDir:dir}),c=spawn('sleep',['30']);
  try{
    const killSpy=vi.fn(),lines:string[]=[],o={状态:()=>readState(e,fakeMachine,false),输出:(x:string)=>{lines.push(x);},kill: killSpy};
    // 锁文件是新的：判死的余量没过，只有取消这道严格核对拦得住。
    releaseLock(c.pid!,Date.now()-3600_000);
    changeScheduler('取消',`#${c.pid}`,parseParams(['--为什么','超时了','--杀持锁','--强']),e,o);
    expect(lines.at(-1)).toContain('已换人');expect(lines.at(-1)).toContain('留下的锁由下一个等待者回收');
    fs.rmSync(path.join(dir,'渲染.lock'));fs.rmSync(path.join(dir,'渲染.lock.信息.json'));
    const ticketName=leaveTicket(e,c.pid!);const f=path.join(queue(),ticketName),ticketContent=JSON.parse(fs.readFileSync(f,'utf8'));fs.writeFileSync(f,JSON.stringify({...ticketContent,起:Date.now()-3600_000}));
    changeScheduler('取消',ticketName,parseParams(['--为什么','超时了']),e,o);
    expect(lines.at(-1)).toContain('晚于领票');expect(lines.at(-1)).toContain('留下的票由下一个等待者回收');
    expect(killSpy).not.toHaveBeenCalled();expect(listDecisions(e).every(x=>String(x.结果).includes('已换人'))).toBe(true);expect(listDecisions(e)).toHaveLength(2);expect(cancelEvents(e)).toHaveLength(0);
    fs.rmSync(f);
    // 锁也老了：算死，排队的下一个回收；复用它的进程不受影响。
    releaseLock(c.pid!,Date.now()-3600_000);const oldDate=new Date(Date.now()-3600_000);fs.utimesSync(path.join(dir,'渲染.lock'),oldDate,oldDate);
    expect(readState(e,fakeMachine,false).持锁[0]!.死).toBe(true);
    changeScheduler('取消',`#${c.pid}`,parseParams(['--为什么','超时了','--杀持锁']),e,o);expect(lines.at(-1)).toContain('进程已不在');
    await passRenderGate(async()=>{},()=>{},{...e,readMemory:()=>null,readPressure:()=>1,readMachine:fakeMachine,clearOrphans:()=>[]},{种:'still'});
    expect(fs.existsSync(path.join(dir,'渲染.lock'))).toBe(false);expect(readSchedulerEvents(e.logDir).some(x=>x.事==='回收死锁')).toBe(true);
    expect(killSpy).not.toHaveBeenCalled();expect(c.exitCode).toBe(null);
    // 真正的持有者：启动早于拿锁
    releaseLock(c.pid!,Date.now()+2000);changeScheduler('取消',`#${c.pid}`,parseParams(['--为什么','真要停','--杀持锁']),e,o);
    expect(killSpy).toHaveBeenCalledWith(c.pid,'SIGTERM');expect(listDecisions(e).at(-1)!.结果).toBe('已发 SIGTERM');expect(cancelEvents(e)).toHaveLength(1);
    expect(fs.existsSync(directiveFile(e,'持锁的'))).toBe(true);
  }finally{c.kill('SIGKILL');}
});
it.skipIf(process.platform==='win32')('在跑文件的 pid 被复用：心跳老了算崩溃，一条',()=>{
  const e=resolveSchedulerEnv({lockDir:dir}),c=spawn('sleep',['30']),f=path.join(dir,'在跑','甲.json');
  try{
    const writeBeat=(heartbeat:number)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify({任务:'甲',主机:e.localHost,起:heartbeat,心跳: heartbeat,发起:{pid:c.pid},声明:{}}));};
    writeBeat(Date.now());cleanCrashed(e);expect(fs.existsSync(f)).toBe(true);
    writeBeat(Date.now()-600_000);cleanCrashed(e);cleanCrashed(e);expect(fs.existsSync(f)).toBe(false);
    expect(readSchedulerEvents(e.logDir).filter(x=>x.事==='崩溃')).toHaveLength(1);
  }finally{c.kill('SIGKILL');}
});
it('放行：快照之后票主人已拿锁删票，不留授权给同任务下一段，决定如实',()=>{
  const {e,t}=setup(),snapshot=readState(e,fakeMachine,false);
  fs.rmSync(t.文件);
  expect(()=>changeScheduler('放行',t.名,parseParams(['--为什么','峰值小']),e,{状态:()=>snapshot,输出:()=>{}})).toThrow('已不在');
  expect(fs.existsSync(directiveFile(e,'task'))).toBe(false);
  expect(listDecisions(e).at(-1)!.结果).toContain('未放行');
});
it('改序用改名后重读的内容：快照之后票主人写的 等内存起、卡在 不被盖掉',()=>{
  const {e,t}=setup(),o=(snapshot:ReturnType<typeof readState>)=>({状态:()=>snapshot,输出:()=>{}});
  for(const cmd of ['先','后']){
    const ticket=listTickets(queue())[0]!;
    delete ticket.内容!.卡在;delete ticket.内容!.等内存起;writeTicket(ticket);
    const snapshot=readState(e,fakeMachine,false);
    ticket.内容!.卡在='内存';ticket.内容!.等内存起=123;writeTicket(ticket);
    changeScheduler(cmd,ticket.名,parseParams(['--为什么','调']),e,o(snapshot));
    expect(listTickets(queue())[0]!.内容).toMatchObject({卡在:'内存',等内存起:123});
  }
  expect(t.名).not.toBe(listTickets(queue())[0]!.名);
});
it('取消：Windows 上 SIGTERM 是立即终止，如实说',()=>{
  const {e,t}=setup(),lines:string[]=[];
  changeScheduler('取消',t.名,parseParams(['--为什么','不要了']),e,{状态:()=>readState(e,fakeMachine,false),输出:(x:string)=>{lines.push(x);},kill:()=>{},Windows:true});
  expect(lines[0]).toContain('立即终止');expect(lines[0]).toContain('票等下一个等待者回收');
});
it('取消：信号时目标刚退出、无权限都如实说；没有 ps 只警告',()=>{
  const e=resolveSchedulerEnv({lockDir:dir}),ticketName=leaveTicket(e,process.ppid),lines:string[]=[];
  const o=(code:string)=>({状态:()=>readState(e,fakeMachine,false),输出:(x:string)=>{lines.push(x);},kill:()=>{throw Object.assign(Error(`kill ${code}`),{code});}});
  changeScheduler('取消',ticketName,parseParams(['--为什么','刚退出']),e,o('ESRCH'));
  expect(lines[0]).toContain('未发信号');expect(listDecisions(e)[0]!.结果).toContain('未发信号');expect(fs.existsSync(directiveFile(e,'别人的'))).toBe(false);
  expect(()=>changeScheduler('取消',ticketName,parseParams(['--为什么','没权限']),e,o('EPERM'))).toThrow('信号失败：SIGTERM');
  expect(listDecisions(e)[1]!.结果).toContain('EPERM');expect(cancelEvents(e)).toHaveLength(0);expect(fs.existsSync(directiveFile(e,'别人的'))).toBe(false);
  const errorSpy=vi.spyOn(console,'error').mockImplementation(()=>{}),killSpy=vi.fn();
  changeScheduler('取消',ticketName,parseParams(['--为什么','没 ps']),e,{状态:()=>readState(e,fakeMachine,false),输出:()=>{},kill: killSpy,processStartTime:()=>null});
  expect(killSpy).toHaveBeenCalled();expect(errorSpy.mock.calls.flat().join()).toContain('读不到进程启动时刻');errorSpy.mockRestore();
});
it('写全名取消持锁者的残留票也要 --杀持锁；死目标不接受别的改调度',()=>{
  const e=resolveSchedulerEnv({lockDir:dir}),killSpy=vi.fn(),o={状态:()=>readState(e,fakeMachine,false),输出:()=>{},kill: killSpy};
  releaseLock(process.ppid);const ticketName=leaveTicket(e,process.ppid);
  expect(()=>changeScheduler('取消',ticketName,parseParams(['--为什么','清残留']),e,o)).toThrow('杀持锁');expect(killSpy).not.toHaveBeenCalled();
  fs.rmSync(path.join(queue(),ticketName));const deadTicket=leaveTicket(e,deadPid);
  for(const cmd of ['先','后','恢复','放行'])expect(()=>changeScheduler(cmd,deadTicket,parseParams(['--为什么','死票']),e,o)).toThrow('进程已不在');
  expect(fs.existsSync(path.join(queue(),deadTicket))).toBe(true);
});
it('读路径：死票死锁单独标记、不算占用、不当排队告警；异机锁不算死',async()=>{
  const e=resolveSchedulerEnv({lockDir:dir});leaveTicket(e,deadPid);releaseLock(deadPid+1);
  const s=readState(e,fakeMachine,false);expect(s.票[0]!.死).toBe(true);expect(s.持锁[0]!.死).toBe(true);
  expect(oneLineStatus(s)).toContain(`持锁#${deadPid+1}死 排队0 死票1`);
  const view=renderView(s);expect(view).toContain(`持锁 #${deadPid+1} 死 render`);expect(view).toContain(`排队1 #${deadPid} 死 等`);expect(view).toContain(' still');
  const alarmKinds=judgeAlerts(s,s.时+3600_000).map(x=>x.类);expect(alarmKinds).toContain('持锁者死');expect(alarmKinds).not.toContain('排队长');expect(alarmKinds).not.toContain('小任务等待');
  let now=0;const schedClock=resolveSchedulerEnv({lockDir:dir,nowMs:()=>now}),hint=vi.fn();
  expect(await waitUntil(parseParams(['--闸空','--最长','90']),schedClock,{sleep:async ms=>{now+=ms;},提示: hint})).toBe(0);expect(now).toBe(30_000);expect(hint).not.toHaveBeenCalled();
  fs.writeFileSync(path.join(dir,`渲染.lock.${deadPid+1}.主机`),'另一台\n');
  expect(readState(e,fakeMachine,false).持锁[0]!.死).toBe(false);
});
it('等闸空到点说卡在谁',async()=>{
  let now=0;const e=resolveSchedulerEnv({lockDir:dir,nowMs:()=>now}),messages:string[]=[],sleep=async(ms:number)=>{now+=ms;};
  expect(await waitUntil(parseParams(['--闸空','--最长','2']),e,{sleep,提示:x=>{messages.push(x);}})).toBe(124);expect(messages[0]).toContain('没连续空满 30 秒');
  releaseLock(process.ppid);leaveTicket(e,process.ppid);now=0;
  expect(await waitUntil(parseParams(['--闸空','--最长','2']),e,{sleep,提示:x=>{messages.push(x);}})).toBe(124);
  expect(messages[1]).toContain(`卡在 持锁 #${process.ppid} render 乙段`);expect(messages[1]).toContain(`排队 #${process.ppid} still 甲段`);
});
it('批按项数算可让路：一项的直说不能让路，多项的能让',async()=>{
  const e={...resolveSchedulerEnv({lockDir:dir}),readMemory:()=>null,readPressure:()=>1};
  const tryItems=async(itemCount:number)=>{const gate=openGateBatch({项数: itemCount},e);try{await gate.runTask({},async()=>{const s=readState(e,fakeMachine,false);changeScheduler('让路',s.持锁[0]!.票,parseParams(['--为什么','产出优先']),e,{状态:()=>s,输出:()=>{}});});}finally{gate.结束();}};
  await expect(tryItems(1)).rejects.toThrow('不能让路');await expect(tryItems(2)).resolves.toBeUndefined();
});
it('路令看动作字段不猜文本，能撤；撤了同路照常拿锁',async()=>{
  const e=resolveSchedulerEnv({lockDir:dir}),route={...e,caller:{...e.caller,路:'一路'}},lines:string[]=[],o=(x:string)=>{lines.push(x);};
  for(const a of [[],['一路'],['一路','让路'],['一路','--让路','x','--撤']])expect(()=>orderCommand(a.filter(x=>!x.startsWith('--')&&x!=='x'),parseParams(a.filter(x=>x.startsWith('--')||x==='x')),route,o)).toThrow('用法');
  fs.mkdirSync(path.dirname(orderFile(e,'一路')),{recursive:true});fs.writeFileSync(orderFile(e,'一路'),JSON.stringify({order:'请让路',至:Date.now()+60_000}));expect(routeYield(route)).toBeNull();
  orderCommand(['一路'],parseParams(['--让路','不用猜']),route,o);expect(routeYield(route)).toBe('不用猜');
  orderCommand(['一路'],parseParams(['--撤']),route,o);expect(routeYield(route)).toBeNull();expect(lines[1]).toContain('已撤');
  orderCommand(['一路'],parseParams(['--撤']),route,o);expect(lines[2]).toContain('无事可撤');
  await passRenderGate(async()=>{},()=>{}, {...route,readMemory:()=>null,readPressure:()=>1});
  expect(readSchedulerEvents(e.logDir).filter(x=>x.事==='令').map(x=>x.动作)).toEqual(['让路','撤','撤']);
});
it.each([['渲染','顶层'],['渲染','未接'],['放行','顶层'],['批','顶层']])('直接 import 闸的脚本（%s，%s）路令也退 75，日志一致，不打调用栈',(gateName,callStyle)=>{
  const e=resolveSchedulerEnv({lockDir:dir});orderCommand(['甲路'],parseParams(['--让路','先交产出']),e,()=>{});
  const runRoute=(lane:string)=>spawnSync(process.execPath,[path.join(import.meta.dirname,'fixtures/路令脚本.ts'),dir,gateName,callStyle],{encoding:'utf8',env:{...process.env,ANIM_ROUTE:lane}});
  const r=runRoute('甲路');expect(r.status).toBe(75);expect(r.stderr).toContain('退出 75，不算失败');expect(r.stderr).not.toMatch(/^\s+at /m);
  expect(readSchedulerEvents(e.logDir).filter(x=>x.事==='任务止').map(x=>x.退出码)).toEqual([75]);
  expect(runRoute('乙路').status).toBe(0);
},30_000);
it('恢复：--原序 没有原序报错、没暂缓的不动；先和后都能回原序',()=>{
  const e=resolveSchedulerEnv({lockDir:dir}),o={状态:()=>readState(e,fakeMachine,false),输出:()=>{}};
  const makeTask=(n:string)=>({任务:n,起:Date.now(),心跳:Date.now(),主机:e.localHost,发起:readCaller({},[],dir,false),声明:{种:'still'}});
  for(const n of ['A','B','C'])claimTicket(queue(),e.localHost,makeTask(n),Date.now());
  const queueOrderIndex=()=>listTickets(queue()).map(x=>x.内容!.任务),ticketNameOf=(n:string)=>listTickets(queue()).find(x=>x.内容!.任务===n)!.名;
  expect(()=>changeScheduler('恢复',ticketNameOf('B'),parseParams(['--为什么','x','--原序']),e,o)).toThrow('没有原序');
  expect(()=>changeScheduler('恢复',ticketNameOf('A'),parseParams(['--为什么','x']),e,o)).toThrow('没在暂缓');
  expect(queueOrderIndex()).toEqual(['A','B','C']);expect(listDecisions(e)).toHaveLength(0);
  for(const cmd of ['先','后']){
    changeScheduler(cmd,ticketNameOf('B'),parseParams(['--为什么','调']),e,o);expect(queueOrderIndex()).toEqual(cmd==='先'?['B','A','C']:['A','C','B']);
    changeScheduler('恢复',ticketNameOf('B'),parseParams(['--为什么','回','--原序']),e,o);expect(queueOrderIndex()).toEqual(['A','B','C']);
  }
  changeScheduler('后',ticketNameOf('A'),parseParams(['--为什么','调']),e,o);changeScheduler('恢复',ticketNameOf('A'),parseParams(['--为什么','回']),e,o);expect(queueOrderIndex()).toEqual(['B','C','A']);
});
it('快路径的全局参数和帮助走完整路由，和别的命令一致',()=>{
  const main=path.join(import.meta.dirname,'../cli/main.ts'),env={...process.env,ANIM_DATA:dir,ANIM_DEBUG:''};
  const runSched=(...a:string[])=>spawnSync(process.execPath,[main,'调度',...a],{encoding:'utf8',env:env});
  for(const a of [['-h'],['--help'],['--调试','--help'],['看','-h']]){const r=runSched(...a);expect(r.status).toBe(0);expect(r.stdout).toContain('用法：anim 调度');}
  const badSelect=runSched('预计','段','--作品','没有这部作品');expect(badSelect.status).toBe(2);expect(badSelect.stderr).toContain('没有这部作品');
  const badUsage=runSched('不存在的动作');expect(badUsage.status).toBe(2);expect(badUsage.stderr).toContain('用法：anim 调度');
  const routeResult=runSched('不存在的动作','--调试');expect(routeResult.status).toBe(2);expect(routeResult.stderr).toContain('用法：anim 调度');
},120_000);
it('领票打印前面几张和约几分；没人挡不打印；暂缓提示带原因',async()=>{
  const e=resolveSchedulerEnv({lockDir:dir}),queue=path.join(dir,'渲染.排队'),makeMemory=()=>({总:100,空闲:80,空闲百分比:80,交换区总:0,交换区已用:0});
  const schedEnv={...e,readMemory:makeMemory,readPressure:()=>1,readMachine:fakeMachine,clearOrphans:()=>[]};
  const messages:string[]=[];await passRenderGate(async()=>{},s=>messages.push(s),schedEnv);expect(messages.join()).not.toContain('前面');
  const first=claimTicket(queue,e.localHost,{任务:'前',起:Date.now(),心跳:Date.now(),主机:e.localHost,发起:readCaller({},[],dir,false),声明:{种:'still',预计秒:90}},Date.now());
  const newTicketName=`${first.名.split('-')[0]}-${hostSlug(e.localHost)}-${process.ppid}`;fs.renameSync(first.文件,path.join(queue,newTicketName));
  const hints:string[]=[];
  await passRenderGate(async()=>{},s=>hints.push(s),{...schedEnv,sleep:async()=>{fs.rmSync(path.join(queue,newTicketName),{force:true});}});
  expect(hints[0]).toBe('渲染排队（前面 1 张，约1.5 分）');
  const deferred:string[]=[];let loopCount=0;fs.writeFileSync(path.join(queue,newTicketName),'{}');
  await passRenderGate(async()=>{},s=>deferred.push(s),{...schedEnv,sleep:async()=>{if(++loopCount===1){changeScheduler('后',listTickets(queue).find(x=>x.pid===process.pid)!.名,parseParams(['--为什么','让产出先走','--分钟','0.001']),e,{状态:()=>readState(e,fakeMachine,false),输出:()=>{}});fs.rmSync(path.join(queue,newTicketName));}await new Promise(r=>setTimeout(r,20));}});
  expect(deferred.some(x=>/暂缓至 \S+：让产出先走/.test(x))).toBe(true);
});
