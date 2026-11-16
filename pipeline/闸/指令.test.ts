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
const fakeMachine=()=>({load:0,cores:10,gate:10,pressure:1,free:0,compressed:0,swap:0,swapOut:0,GPU:0,thermal:0,disk:1e10,orphans:0,processes:''});
const parseParams=(xs:string[]=[])=>parseArgs(xs,{value:['--why','--minutes','--pid','--file','--memory','--max-sec','--yield'],toggles:['--force','--orig-order','--kill-holder','--gate-empty','--undo']});
const setup=()=>{const e=resolveSchedulerEnv({lockDir:dir});const task={task:'task',start:Date.now(),heartbeat:Date.now(),host:e.localHost,initiator:readCaller({},[],dir,false),decl:{kind:'still'}};const t=claimTicket(path.join(dir,'渲染.排队'),e.localHost,task,Date.now());return {e,t};};
it('先后恢复放行取消都写决定+快照，缺原因用法错；旧票拒绝改名',()=>{
  const {e,t}=setup(),o={state:()=>readState(e,fakeMachine,false),output:()=>{},kill:()=>{}};
  expect(()=>changeScheduler('first',t.name,parseParams(),e,o)).toThrow('必须带');
  for(const cmd of ['last','resume','first','release','cancel']){const name=listTickets(path.join(dir,'渲染.排队'))[0]!.name;const startMs=performance.now();changeScheduler(cmd,name,parseParams(['--why','测试']),e,o);expect(performance.now()-startMs).toBeLessThan(3000);}
  const rows=readSchedulerEvents(e.logDir).filter(x=>x.event==='决定');expect(rows).toHaveLength(5);expect(rows.every(x=>x.observed&&x.machine&&x.who)).toBe(true);
  const q=listTickets(path.join(dir,'渲染.排队'))[0]!;fs.writeFileSync(q.file,String(process.pid));expect(()=>changeScheduler('first',q.name,parseParams(['--why','旧票']),e,o)).toThrow('旧票拒绝');
});
it('放行只这一张越队且不删除前面的真活票',async()=>{
  const {e,t}=setup();const old=t.name.replace(/-\d+$/,`-${process.ppid}`);fs.renameSync(t.file,path.join(path.dirname(t.file),old));
  const startMs=performance.now();await passRenderGate(async()=>{},()=>{}, {...e,readMemory:()=>({grandTotal:100,free:5,freePercent:5,swapTotal:0,swapUsed:0}),readPressure:()=>1,sleep:async()=>{
    const mine=listTickets(path.join(dir,'渲染.排队')).find(x=>x.pid===process.pid)!;
    changeScheduler('release',mine.name,parseParams(['--why','低峰值']),e,{state:()=>readState(e,fakeMachine,false),output:()=>{}});
  }});expect(performance.now()-startMs).toBeLessThan(3000);expect(fs.existsSync(path.join(path.dirname(t.file),old))).toBe(true);
});
it('暂缓到期回队尾而不是原位',async()=>{
  let now=Date.now(),loopCount=0;const e=resolveSchedulerEnv({lockDir:dir,nowMs:()=>now});
  await passRenderGate(async()=>{},()=>{}, {...e,memFloor:30,readMemory:()=>loopCount>1?null:{grandTotal:100,free:1,freePercent:1,swapTotal:0,swapUsed:0},readPressure:()=>1,sleep:async()=>{
    loopCount++;const t=listTickets(path.join(dir,'渲染.排队'))[0]!;
    if(loopCount===1){changeScheduler('last',t.name,parseParams(['--why','暂缓','--minutes','0.001']),e,{state:()=>readState(e,fakeMachine,false),output:()=>{}});}
    now+=1000;
  }});expect(readSchedulerEvents(e.logDir).some(x=>x.event==='恢复'&&x.cause==='暂缓到期回队尾')).toBe(true);
});
it('让路不中断当前段，下一张票暂缓；路令排队返回 75',async()=>{
  let now=Date.now(),sleepCount=0;const e=resolveSchedulerEnv({lockDir:dir,nowMs:()=>now}),task=openTask(e,{kind:'render'});
  const env={...e,readMemory:()=>null,readPressure:()=>1,sleep:async()=>{sleepCount++;now+=60_000;}};
  await passRenderGate(async()=>{
    const s=readState(e,fakeMachine,false);changeScheduler('yield',s.lockHolders[0]!.ticket,parseParams(['--why','产出优先','--minutes','1']),e,{state:()=>s,output:()=>{}});
    expect(fs.existsSync(path.join(dir,'渲染.lock'))).toBe(true);
  },()=>{},env,{kind:'render',canYield:true});
  await passRenderGate(async()=>{},()=>{},env);expect(sleepCount).toBeGreaterThan(0);task.endedAt();
  const route={...e,caller:{...e.caller,lane:'一路'}};orderCommand(['一路'],parseParams(['--yield','请让路']),route,()=>{});
  await expect(passRenderGate(async()=>{},()=>{},{...env,caller:route.caller})).rejects.toMatchObject({exitCode:75});
  routeCommand(['open','一路'],parseParams(),e,()=>{});routeCommand(['done','一路'],parseParams(),e,()=>{});expect(readSchedulerEvents(e.logDir).filter(x=>/^路/.test(x.event))).toHaveLength(2);
});
it('等闸空连续30秒，不被段间假空骗过；内存到点124',async()=>{
  let now=0;const e=resolveSchedulerEnv({lockDir:dir,nowMs:()=>now});
  expect(await waitUntil(parseParams(['--gate-empty','--max-sec','90']),e,{sleep:async ms=>{now+=ms;},gateEmpty:()=>now<20_000||now>=30_000})).toBe(0);expect(now).toBe(60_000);
  now=0;expect(await waitUntil(parseParams(['--memory','30','--max-sec','3']),e,{sleep:async ms=>{now+=ms;},freeMemory:()=>20})).toBe(124);
});
it('票已被持有者删掉时改序报错：不复活、不写决定',()=>{
  const {e,t}=setup(),snapshot=readState(e,fakeMachine,false);
  snapshot.ticket[0]!.content!.暂缓至=Date.now()+60_000;
  fs.rmSync(t.file);
  for(const cmd of ['first','last','resume'])expect(()=>changeScheduler(cmd,t.name,parseParams(['--why','测试']),e,{state:()=>snapshot,output:()=>{}})).toThrow('已不在');
  expect(listTickets(path.join(dir,'渲染.排队'))).toHaveLength(0);
  expect(readSchedulerEvents(e.logDir).filter(x=>x.event==='决定')).toHaveLength(0);
});
it('后 先改名再写内容；写票不复活旧路径',()=>{
  const {e,t}=setup();let newName='';
  changeScheduler('last',t.name,parseParams(['--why','测试']),e,{state:()=>readState(e,fakeMachine,false),output:x=>{newName=x;}});
  expect(fs.existsSync(t.file)).toBe(false);
  const q=listTickets(path.join(dir,'渲染.排队'));
  expect(q.map(x=>x.name)).toEqual([newName]);expect(q[0]!.content!.暂缓至).toBeGreaterThan(Date.now());expect(q[0]!.content!.原序).toBe(String(t.time));
  writeTicket(t);expect(fs.existsSync(t.file)).toBe(false);
});

const queue=()=>path.join(dir,'渲染.排队');
const makeMemory=(n:number)=>({grandTotal:100,free:n,freePercent:n,swapTotal:0,swapUsed:0});
const leaveTicket=(e:ReturnType<typeof resolveSchedulerEnv>,pid:number,task='别人的')=>{fs.mkdirSync(queue(),{recursive:true});const ticketName=`${String(Date.now()).padStart(15,'0')}-${hostSlug(e.localHost)}-${pid}`;fs.writeFileSync(path.join(queue(),ticketName),JSON.stringify({v:1,task: task,start:Date.now(),initiator:readCaller({},[],dir,false),decl:{kind:'still',segment:'甲段'}}));return ticketName;};
const releaseLock=(pid:number,acquiredAt=Date.now())=>{fs.writeFileSync(path.join(dir,'渲染.lock'),`${pid}\n`);fs.writeFileSync(path.join(dir,'渲染.lock.信息.json'),JSON.stringify({pid,ticket:'锁票',task:'持锁的',initiator:{...readCaller({},[],dir,false),pid},decl:{kind:'render',segment:'乙段'},lockAcquiredAt: acquiredAt,heartbeat:Date.now(),frameTime:Date.now(),framesDone:0}));};
const deadPid=99999997;
const listDecisions=(e:ReturnType<typeof resolveSchedulerEnv>)=>readSchedulerEvents(e.logDir).filter(x=>x.event==='决定');
const cancelEvents=(e:ReturnType<typeof resolveSchedulerEnv>)=>readSchedulerEvents(e.logDir).filter(x=>x.event==='取消');

it('放行按任务 id 存：放行后再改序仍越过内存，用掉就没了',async()=>{
  const e=resolveSchedulerEnv({lockDir:dir}),o={state:()=>readState(e,fakeMachine,false),output:()=>{}};let loopCount=0;
  await passRenderGate(async()=>{},()=>{}, {...e,readMemory:()=>makeMemory(5),readPressure:()=>1,sleep:async()=>{
    if(++loopCount>3)throw Error('改序后授权丢了');
    if(loopCount===1){changeScheduler('release',listTickets(queue())[0]!.name,parseParams(['--why','峰值小']),e,o);changeScheduler('first',listTickets(queue())[0]!.name,parseParams(['--why','调序']),e,o);}
  }});
  expect(loopCount).toBe(1);expect(fs.readdirSync(path.join(dir,'指令'))).toEqual([]);
  expect(readSchedulerEvents(e.logDir).some(x=>x.event==='单票放行')).toBe(true);
});
it('放行闸的授权同样跟任务走：改序后越过负载',async()=>{
  const e=resolveSchedulerEnv({lockDir:dir}),o={state:()=>readState(e,fakeMachine,false),output:()=>{}},q=path.join(dir,'放行.排队');let loopCount=0;
  await passGate(async()=>{},()=>{}, {...e,readMemory:()=>null,readPressure:()=>1,coreCount:()=>10,load1Min:()=>100,sleep:async()=>{
    if(++loopCount>3)throw Error('改序后授权丢了');
    if(loopCount===1){changeScheduler('release',listTickets(q)[0]!.name,parseParams(['--why','负载是别的']),e,o);changeScheduler('last',listTickets(q)[0]!.name,parseParams(['--why','调序']),e,o);}
  }});
  expect(loopCount).toBe(1);expect(fs.readdirSync(path.join(dir,'指令'))).toEqual([]);
});
it('放行到期作废：写事件一次、回到内存判断',async()=>{
  let now=Date.now(),loopCount=0,free=5;const e=resolveSchedulerEnv({lockDir:dir,nowMs:()=>now}),o={state:()=>readState(e,fakeMachine,false),output:()=>{}};
  releaseLock(process.ppid);const errorSpy=vi.spyOn(console,'error').mockImplementation(()=>{});
  await passRenderGate(async()=>{},()=>{}, {...e,readMemory:()=>makeMemory(free),readPressure:()=>1,sleep:async()=>{
    loopCount++;
    if(loopCount===1){changeScheduler('release',listTickets(queue())[0]!.name,parseParams(['--why','当时够','--minutes','1']),e,o);now+=120_000;fs.rmSync(path.join(dir,'渲染.lock'));}
    if(loopCount===4)free=80;
    if(loopCount>6)throw Error('内存够了还没过');
  }});
  expect(loopCount).toBe(4);expect(readSchedulerEvents(e.logDir).filter(x=>x.event==='放行过期')).toHaveLength(1);
  expect(errorSpy.mock.calls.flat().join('\n')).toContain('放行授权已过期（当时够）');errorSpy.mockRestore();
  expect(fs.readdirSync(path.join(dir,'指令'))).toEqual([]);
});
it('拿锁后用掉放行时不删别的指令：让路还要留给下一段',async()=>{
  const e=resolveSchedulerEnv({lockDir:dir});let task='';
  await passRenderGate(async()=>{task=readState(e,fakeMachine,false).lockHolders[0]!.task;writeDirective(e,task,{动作:'让路',why:'下一段再说',timestamp:Date.now(),至:Date.now()+60_000,ticket:'旧票',task: task});
    expect(fs.existsSync(directiveFile(e,task))).toBe(true);},()=>{}, {...e,readMemory:()=>null,readPressure:()=>1},{kind:'render',canYield:true});
});
it('只有在跑登记、没有票和锁的任务不算目标',()=>{
  const e=resolveSchedulerEnv({lockDir:dir}),o={state:()=>readState(e,fakeMachine,false),output:()=>{},kill:vi.fn(),processStartTime:()=>0};
  const runningDir=path.join(dir,'在跑'),id='在跑任务-1';fs.mkdirSync(runningDir,{recursive:true});
  fs.writeFileSync(path.join(runningDir,`${id}.json`),JSON.stringify({task:id,start:Date.now(),heartbeat:Date.now(),host:e.localHost,initiator:{...e.caller,pid:process.ppid},decl:{kind:'render',canYield:true}}));
  expect(()=>changeScheduler('cancel',`#${process.ppid}`,parseParams(['--why','只有登记']),e,o)).toThrow('目标不存在');
  expect(()=>changeScheduler('yield',id,parseParams(['--why','只有登记']),e,o)).toThrow('目标不存在');
});
it('取消：死票、死锁不发信号，决定记真实结果，不写取消事件',()=>{
  const e=resolveSchedulerEnv({lockDir:dir}),o=(kill:(...a:unknown[])=>void,lines:string[]=[])=>({state:()=>readState(e,fakeMachine,false),output:(x:string)=>{lines.push(x);},kill});
  const killSpy=vi.fn(),lines:string[]=[];
  const ticketName=leaveTicket(e,deadPid);changeScheduler('cancel',ticketName,parseParams(['--why','死票']),e,o(killSpy,lines));
  expect(lines[0]).toContain('未发信号');expect(fs.existsSync(path.join(queue(),ticketName))).toBe(true);fs.rmSync(path.join(queue(),ticketName));
  releaseLock(deadPid+1);changeScheduler('cancel',`#${deadPid+1}`,parseParams(['--why','死锁','--kill-holder','--force']),e,o(killSpy,lines));
  expect(killSpy).not.toHaveBeenCalled();expect(lines[1]).toContain('留下的锁由下一个等待者回收');
  expect(listDecisions(e).map(x=>String(x.result))).toEqual([expect.stringContaining('未发信号'),expect.stringContaining('未发信号')]);expect(cancelEvents(e)).toHaveLength(0);
});
it.skipIf(process.platform==='win32')('取消：pid 已换人（真进程，启动晚于声称的时刻）不发信号，下一个等待者回收',async()=>{
  const e=resolveSchedulerEnv({lockDir:dir}),c=spawn('sleep',['30']);
  try{
    const killSpy=vi.fn(),lines:string[]=[],o={state:()=>readState(e,fakeMachine,false),output:(x:string)=>{lines.push(x);},kill: killSpy};
    // 锁文件是新的：判死的余量没过，只有取消这道严格核对拦得住。
    releaseLock(c.pid!,Date.now()-3600_000);
    changeScheduler('cancel',`#${c.pid}`,parseParams(['--why','超时了','--kill-holder','--force']),e,o);
    expect(lines.at(-1)).toContain('已换人');expect(lines.at(-1)).toContain('留下的锁由下一个等待者回收');
    fs.rmSync(path.join(dir,'渲染.lock'));fs.rmSync(path.join(dir,'渲染.lock.信息.json'));
    const ticketName=leaveTicket(e,c.pid!);const f=path.join(queue(),ticketName),ticketContent=JSON.parse(fs.readFileSync(f,'utf8'));fs.writeFileSync(f,JSON.stringify({...ticketContent,start:Date.now()-3600_000}));
    changeScheduler('cancel',ticketName,parseParams(['--why','超时了']),e,o);
    expect(lines.at(-1)).toContain('晚于领票');expect(lines.at(-1)).toContain('留下的票由下一个等待者回收');
    expect(killSpy).not.toHaveBeenCalled();expect(listDecisions(e).every(x=>String(x.result).includes('已换人'))).toBe(true);expect(listDecisions(e)).toHaveLength(2);expect(cancelEvents(e)).toHaveLength(0);
    fs.rmSync(f);
    // 锁也老了：算死，排队的下一个回收；复用它的进程不受影响。
    releaseLock(c.pid!,Date.now()-3600_000);const oldDate=new Date(Date.now()-3600_000);fs.utimesSync(path.join(dir,'渲染.lock'),oldDate,oldDate);
    expect(readState(e,fakeMachine,false).lockHolders[0]!.死).toBe(true);
    changeScheduler('cancel',`#${c.pid}`,parseParams(['--why','超时了','--kill-holder']),e,o);expect(lines.at(-1)).toContain('进程已不在');
    await passRenderGate(async()=>{},()=>{},{...e,readMemory:()=>null,readPressure:()=>1,readMachine:fakeMachine,clearOrphans:()=>[]},{kind:'still'});
    expect(fs.existsSync(path.join(dir,'渲染.lock'))).toBe(false);expect(readSchedulerEvents(e.logDir).some(x=>x.event==='回收死锁')).toBe(true);
    expect(killSpy).not.toHaveBeenCalled();expect(c.exitCode).toBe(null);
    // 真正的持有者：启动早于拿锁
    releaseLock(c.pid!,Date.now()+2000);changeScheduler('cancel',`#${c.pid}`,parseParams(['--why','真要停','--kill-holder']),e,o);
    expect(killSpy).toHaveBeenCalledWith(c.pid,'SIGTERM');expect(listDecisions(e).at(-1)!.result).toBe('已发 SIGTERM');expect(cancelEvents(e)).toHaveLength(1);
    expect(fs.existsSync(directiveFile(e,'持锁的'))).toBe(true);
  }finally{c.kill('SIGKILL');}
});
it.skipIf(process.platform==='win32')('在跑文件的 pid 被复用：心跳老了算崩溃，一条',()=>{
  const e=resolveSchedulerEnv({lockDir:dir}),c=spawn('sleep',['30']),f=path.join(dir,'在跑','甲.json');
  try{
    const writeBeat=(heartbeat:number)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify({task:'甲',host:e.localHost,start:heartbeat,heartbeat: heartbeat,initiator:{pid:c.pid},decl:{}}));};
    writeBeat(Date.now());cleanCrashed(e);expect(fs.existsSync(f)).toBe(true);
    writeBeat(Date.now()-600_000);cleanCrashed(e);cleanCrashed(e);expect(fs.existsSync(f)).toBe(false);
    expect(readSchedulerEvents(e.logDir).filter(x=>x.event==='崩溃')).toHaveLength(1);
  }finally{c.kill('SIGKILL');}
});
it('放行：快照之后票主人已拿锁删票，不留授权给同任务下一段，决定如实',()=>{
  const {e,t}=setup(),snapshot=readState(e,fakeMachine,false);
  fs.rmSync(t.file);
  expect(()=>changeScheduler('release',t.name,parseParams(['--why','峰值小']),e,{state:()=>snapshot,output:()=>{}})).toThrow('已不在');
  expect(fs.existsSync(directiveFile(e,'task'))).toBe(false);
  expect(listDecisions(e).at(-1)!.result).toContain('未放行');
});
it('改序用改名后重读的内容：快照之后票主人写的 等内存起、卡在 不被盖掉',()=>{
  const {e,t}=setup(),o=(snapshot:ReturnType<typeof readState>)=>({state:()=>snapshot,output:()=>{}});
  for(const cmd of ['first','last']){
    const ticket=listTickets(queue())[0]!;
    delete ticket.content!.stuckOn;delete ticket.content!.等内存起;writeTicket(ticket);
    const snapshot=readState(e,fakeMachine,false);
    ticket.content!.stuckOn='内存';ticket.content!.等内存起=123;writeTicket(ticket);
    changeScheduler(cmd,ticket.name,parseParams(['--why','调']),e,o(snapshot));
    expect(listTickets(queue())[0]!.content).toMatchObject({stuckOn:'内存',等内存起:123});
  }
  expect(t.name).not.toBe(listTickets(queue())[0]!.name);
});
it('取消：Windows 上 SIGTERM 是立即终止，如实说',()=>{
  const {e,t}=setup(),lines:string[]=[];
  changeScheduler('cancel',t.name,parseParams(['--why','不要了']),e,{state:()=>readState(e,fakeMachine,false),output:(x:string)=>{lines.push(x);},kill:()=>{},Windows:true});
  expect(lines[0]).toContain('立即终止');expect(lines[0]).toContain('票等下一个等待者回收');
});
it('取消：信号时目标刚退出、无权限都如实说；没有 ps 只警告',()=>{
  const e=resolveSchedulerEnv({lockDir:dir}),ticketName=leaveTicket(e,process.ppid),lines:string[]=[];
  const o=(code:string)=>({state:()=>readState(e,fakeMachine,false),output:(x:string)=>{lines.push(x);},kill:()=>{throw Object.assign(Error(`kill ${code}`),{code});}});
  changeScheduler('cancel',ticketName,parseParams(['--why','刚退出']),e,o('ESRCH'));
  expect(lines[0]).toContain('未发信号');expect(listDecisions(e)[0]!.result).toContain('未发信号');expect(fs.existsSync(directiveFile(e,'别人的'))).toBe(false);
  expect(()=>changeScheduler('cancel',ticketName,parseParams(['--why','没权限']),e,o('EPERM'))).toThrow('信号失败：SIGTERM');
  expect(listDecisions(e)[1]!.result).toContain('EPERM');expect(cancelEvents(e)).toHaveLength(0);expect(fs.existsSync(directiveFile(e,'别人的'))).toBe(false);
  const errorSpy=vi.spyOn(console,'error').mockImplementation(()=>{}),killSpy=vi.fn();
  changeScheduler('cancel',ticketName,parseParams(['--why','没 ps']),e,{state:()=>readState(e,fakeMachine,false),output:()=>{},kill: killSpy,processStartTime:()=>null});
  expect(killSpy).toHaveBeenCalled();expect(errorSpy.mock.calls.flat().join()).toContain('读不到进程启动时刻');errorSpy.mockRestore();
});
it('写全名取消持锁者的残留票也要 --kill-holder；死目标不接受别的改调度',()=>{
  const e=resolveSchedulerEnv({lockDir:dir}),killSpy=vi.fn(),o={state:()=>readState(e,fakeMachine,false),output:()=>{},kill: killSpy};
  releaseLock(process.ppid);const ticketName=leaveTicket(e,process.ppid);
  expect(()=>changeScheduler('cancel',ticketName,parseParams(['--why','清残留']),e,o)).toThrow('--kill-holder');expect(killSpy).not.toHaveBeenCalled();
  fs.rmSync(path.join(queue(),ticketName));const deadTicket=leaveTicket(e,deadPid);
  for(const cmd of ['first','last','resume','release'])expect(()=>changeScheduler(cmd,deadTicket,parseParams(['--why','死票']),e,o)).toThrow('进程已不在');
  expect(fs.existsSync(path.join(queue(),deadTicket))).toBe(true);
});
it('读路径：死票死锁单独标记、不算占用、不当排队告警；异机锁不算死',async()=>{
  const e=resolveSchedulerEnv({lockDir:dir});leaveTicket(e,deadPid);releaseLock(deadPid+1);
  const s=readState(e,fakeMachine,false);expect(s.ticket[0]!.死).toBe(true);expect(s.lockHolders[0]!.死).toBe(true);
  expect(oneLineStatus(s)).toContain(`持锁#${deadPid+1}死 排队0 死票1`);
  const view=renderView(s);expect(view).toContain(`持锁 #${deadPid+1} 死 render`);expect(view).toContain(`排队1 #${deadPid} 死 等`);expect(view).toContain(' still');
  const alarmKinds=judgeAlerts(s,s.timestamp+3600_000).map(x=>x.type);expect(alarmKinds).toContain('持锁者死');expect(alarmKinds).not.toContain('排队长');expect(alarmKinds).not.toContain('小任务等待');
  let now=0;const schedClock=resolveSchedulerEnv({lockDir:dir,nowMs:()=>now}),hint=vi.fn();
  expect(await waitUntil(parseParams(['--gate-empty','--max-sec','90']),schedClock,{sleep:async ms=>{now+=ms;},提示: hint})).toBe(0);expect(now).toBe(30_000);expect(hint).not.toHaveBeenCalled();
  fs.writeFileSync(path.join(dir,`渲染.lock.${deadPid+1}.主机`),'另一台\n');
  expect(readState(e,fakeMachine,false).lockHolders[0]!.死).toBe(false);
});
it('等闸空到点说卡在谁',async()=>{
  let now=0;const e=resolveSchedulerEnv({lockDir:dir,nowMs:()=>now}),messages:string[]=[],sleep=async(ms:number)=>{now+=ms;};
  expect(await waitUntil(parseParams(['--gate-empty','--max-sec','2']),e,{sleep,提示:x=>{messages.push(x);}})).toBe(124);expect(messages[0]).toContain('没连续空满 30 秒');
  releaseLock(process.ppid);leaveTicket(e,process.ppid);now=0;
  expect(await waitUntil(parseParams(['--gate-empty','--max-sec','2']),e,{sleep,提示:x=>{messages.push(x);}})).toBe(124);
  expect(messages[1]).toContain(`卡在 持锁 #${process.ppid} render 乙段`);expect(messages[1]).toContain(`排队 #${process.ppid} still 甲段`);
});
it('批按项数算可让路：一项的直说不能让路，多项的能让',async()=>{
  const e={...resolveSchedulerEnv({lockDir:dir}),readMemory:()=>null,readPressure:()=>1};
  const tryItems=async(itemCount:number)=>{const gate=openGateBatch({itemCount: itemCount},e);try{await gate.runTask({},async()=>{const s=readState(e,fakeMachine,false);changeScheduler('yield',s.lockHolders[0]!.ticket,parseParams(['--why','产出优先']),e,{state:()=>s,output:()=>{}});});}finally{gate.endedAt();}};
  await expect(tryItems(1)).rejects.toThrow('不能让路');await expect(tryItems(2)).resolves.toBeUndefined();
});
it('路令看动作字段不猜文本，能撤；撤了同路照常拿锁',async()=>{
  const e=resolveSchedulerEnv({lockDir:dir}),route={...e,caller:{...e.caller,lane:'一路'}},lines:string[]=[],o=(x:string)=>{lines.push(x);};
  for(const a of [[],['一路'],['一路','让路'],['一路','--yield','x','--undo']])expect(()=>orderCommand(a.filter(x=>!x.startsWith('--')&&x!=='x'),parseParams(a.filter(x=>x.startsWith('--')||x==='x')),route,o)).toThrow('用法');
  fs.mkdirSync(path.dirname(orderFile(e,'一路')),{recursive:true});fs.writeFileSync(orderFile(e,'一路'),JSON.stringify({order:'请让路',至:Date.now()+60_000}));expect(routeYield(route)).toBeNull();
  orderCommand(['一路'],parseParams(['--yield','不用猜']),route,o);expect(routeYield(route)).toBe('不用猜');
  orderCommand(['一路'],parseParams(['--undo']),route,o);expect(routeYield(route)).toBeNull();expect(lines[1]).toContain('已撤');
  orderCommand(['一路'],parseParams(['--undo']),route,o);expect(lines[2]).toContain('无事可撤');
  await passRenderGate(async()=>{},()=>{}, {...route,readMemory:()=>null,readPressure:()=>1});
  expect(readSchedulerEvents(e.logDir).filter(x=>x.event==='令').map(x=>x.动作)).toEqual(['让路','撤','撤']);
});
it.each([['渲染','顶层'],['渲染','未接'],['放行','顶层'],['批','顶层']])('直接 import 闸的脚本（%s，%s）路令也退 75，日志一致，不打调用栈',(gateName,callStyle)=>{
  const e=resolveSchedulerEnv({lockDir:dir});orderCommand(['甲路'],parseParams(['--yield','先交产出']),e,()=>{});
  const runRoute=(lane:string)=>spawnSync(process.execPath,[path.join(import.meta.dirname,'fixtures/路令脚本.ts'),dir,gateName,callStyle],{encoding:'utf8',env:{...process.env,ANIM_ROUTE:lane}});
  const r=runRoute('甲路');expect(r.status).toBe(75);expect(r.stderr).toContain('退出 75，不算失败');expect(r.stderr).not.toMatch(/^\s+at /m);
  expect(readSchedulerEvents(e.logDir).filter(x=>x.event==='任务止').map(x=>x.exitCode)).toEqual([75]);
  expect(runRoute('乙路').status).toBe(0);
},30_000);
it('恢复：--orig-order 没有原序报错、没暂缓的不动；先和后都能回原序',()=>{
  const e=resolveSchedulerEnv({lockDir:dir}),o={state:()=>readState(e,fakeMachine,false),output:()=>{}};
  const makeTask=(n:string)=>({task:n,start:Date.now(),heartbeat:Date.now(),host:e.localHost,initiator:readCaller({},[],dir,false),decl:{kind:'still'}});
  for(const n of ['A','B','C'])claimTicket(queue(),e.localHost,makeTask(n),Date.now());
  const queueOrderIndex=()=>listTickets(queue()).map(x=>x.content!.task),ticketNameOf=(n:string)=>listTickets(queue()).find(x=>x.content!.task===n)!.name;
  expect(()=>changeScheduler('resume',ticketNameOf('B'),parseParams(['--why','x','--orig-order']),e,o)).toThrow('没有原序');
  expect(()=>changeScheduler('resume',ticketNameOf('A'),parseParams(['--why','x']),e,o)).toThrow('没在暂缓');
  expect(queueOrderIndex()).toEqual(['A','B','C']);expect(listDecisions(e)).toHaveLength(0);
  for(const cmd of ['first','last']){
    changeScheduler(cmd,ticketNameOf('B'),parseParams(['--why','调']),e,o);expect(queueOrderIndex()).toEqual(cmd==='first'?['B','A','C']:['A','C','B']);
    changeScheduler('resume',ticketNameOf('B'),parseParams(['--why','回','--orig-order']),e,o);expect(queueOrderIndex()).toEqual(['A','B','C']);
  }
  changeScheduler('last',ticketNameOf('A'),parseParams(['--why','调']),e,o);changeScheduler('resume',ticketNameOf('A'),parseParams(['--why','回']),e,o);expect(queueOrderIndex()).toEqual(['B','C','A']);
});
it('快路径的全局参数和帮助走完整路由，和别的命令一致',()=>{
  const main=path.join(import.meta.dirname,'../cli/main.ts'),env={...process.env,ANIM_DATA:dir,ANIM_DEBUG:''};
  const runSched=(...a:string[])=>spawnSync(process.execPath,[main,'sched',...a],{encoding:'utf8',env:env});
  for(const a of [['-h'],['--help'],['--debug','--help'],['show','-h']]){const r=runSched(...a);expect(r.status).toBe(0);expect(r.stdout).toContain('用法：anim sched');}
  const badSelect=runSched('estimate','段','--work','没有这部作品');expect(badSelect.status).toBe(2);expect(badSelect.stderr).toContain('没有这部作品');
  const badUsage=runSched('不存在的动作');expect(badUsage.status).toBe(2);expect(badUsage.stderr).toContain('用法：anim sched');
  const routeResult=runSched('不存在的动作','--debug');expect(routeResult.status).toBe(2);expect(routeResult.stderr).toContain('用法：anim sched');
},120_000);
it('领票打印前面几张和约几分；没人挡不打印；暂缓提示带原因',async()=>{
  const e=resolveSchedulerEnv({lockDir:dir}),queue=path.join(dir,'渲染.排队'),makeMemory=()=>({grandTotal:100,free:80,freePercent:80,swapTotal:0,swapUsed:0});
  const schedEnv={...e,readMemory:makeMemory,readPressure:()=>1,readMachine:fakeMachine,clearOrphans:()=>[]};
  const messages:string[]=[];await passRenderGate(async()=>{},s=>messages.push(s),schedEnv);expect(messages.join()).not.toContain('前面');
  const first=claimTicket(queue,e.localHost,{task:'前',start:Date.now(),heartbeat:Date.now(),host:e.localHost,initiator:readCaller({},[],dir,false),decl:{kind:'still',estimatedSec:90}},Date.now());
  const newTicketName=`${first.name.split('-')[0]}-${hostSlug(e.localHost)}-${process.ppid}`;fs.renameSync(first.file,path.join(queue,newTicketName));
  const hints:string[]=[];
  await passRenderGate(async()=>{},s=>hints.push(s),{...schedEnv,sleep:async()=>{fs.rmSync(path.join(queue,newTicketName),{force:true});}});
  expect(hints[0]).toBe('渲染排队（前面 1 张，约1.5 分）');
  const deferred:string[]=[];let loopCount=0;fs.writeFileSync(path.join(queue,newTicketName),'{}');
  await passRenderGate(async()=>{},s=>deferred.push(s),{...schedEnv,sleep:async()=>{if(++loopCount===1){changeScheduler('last',listTickets(queue).find(x=>x.pid===process.pid)!.name,parseParams(['--why','让产出先走','--minutes','0.001']),e,{state:()=>readState(e,fakeMachine,false),output:()=>{}});fs.rmSync(path.join(queue,newTicketName));}await new Promise(r=>setTimeout(r,20));}});
  expect(deferred.some(x=>/暂缓至 \S+：让产出先走/.test(x))).toBe(true);
});
