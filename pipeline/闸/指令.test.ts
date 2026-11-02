import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {解析参数} from '../cli/参数.ts';
import {取调度环境,开任务,清崩溃} from './任务.ts';
import {读发起者} from './发起者.ts';
import {改调度,令命令,路命令} from './改调度.ts';
import {读状态,一行状态,渲染看} from './看.ts';
import {列票,领票,写票,主机片段} from './票.ts';
import {读调度} from './调度日志.ts';
import {等条件} from './等.ts';
import {开闸批,过放行闸,过渲染闸} from './闸.ts';
import {判告警} from './告警.ts';
import {写指令,路让路,指令文件,令文件} from './指令.ts';
import {spawn,spawnSync} from 'node:child_process';
let dir:string;beforeEach(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'anim-指令-'));});afterEach(()=>fs.rmSync(dir,{recursive:true,force:true}));
const 机=()=>({负载:0,核:10,闸:10,压力:1,free:0,压缩:0,swap:0,换出:0,GPU:0,热:0,盘:1e10,孤儿:0,进程:''});
const 参数=(xs:string[]=[])=>解析参数(xs,{值:['--为什么','--分钟','--pid','--文件','--内存','--最长','--让路'],开关:['--强','--原序','--杀持锁','--闸空','--撤']});
const 设置=()=>{const e=取调度环境({锁目录:dir});const task={任务:'task',起:Date.now(),心跳:Date.now(),主机:e.本机,发起:读发起者({},[],dir,false),声明:{种:'still'}};const t=领票(path.join(dir,'渲染.排队'),e.本机,task,Date.now());return {e,t};};
it('先后恢复放行取消都写决定+快照，缺原因用法错；旧票拒绝改名',()=>{
  const {e,t}=设置(),o={状态:()=>读状态(e,机,false),输出:()=>{},杀:()=>{}};
  expect(()=>改调度('先',t.名,参数(),e,o)).toThrow('必须带');
  for(const cmd of ['后','恢复','先','放行','取消']){const name=列票(path.join(dir,'渲染.排队'))[0]!.名;const 起=performance.now();改调度(cmd,name,参数(['--为什么','测试']),e,o);expect(performance.now()-起).toBeLessThan(3000);}
  const rows=读调度(e.日志目录).filter(x=>x.事==='决定');expect(rows).toHaveLength(5);expect(rows.every(x=>x.看到&&x.机&&x.谁)).toBe(true);
  const q=列票(path.join(dir,'渲染.排队'))[0]!;fs.writeFileSync(q.文件,String(process.pid));expect(()=>改调度('先',q.名,参数(['--为什么','旧票']),e,o)).toThrow('旧票拒绝');
});
it('放行只这一张越队且不删除前面的真活票',async()=>{
  const {e,t}=设置();const old=t.名.replace(/-\d+$/,`-${process.ppid}`);fs.renameSync(t.文件,path.join(path.dirname(t.文件),old));
  const 起=performance.now();await 过渲染闸(async()=>{},()=>{}, {...e,读内存:()=>({总:100,空闲:5,空闲百分比:5,交换区总:0,交换区已用:0}),读压力:()=>1,睡:async()=>{
    const mine=列票(path.join(dir,'渲染.排队')).find(x=>x.pid===process.pid)!;
    改调度('放行',mine.名,参数(['--为什么','低峰值']),e,{状态:()=>读状态(e,机,false),输出:()=>{}});
  }});expect(performance.now()-起).toBeLessThan(3000);expect(fs.existsSync(path.join(path.dirname(t.文件),old))).toBe(true);
});
it('暂缓到期回队尾而不是原位',async()=>{
  let now=Date.now(),轮=0;const e=取调度环境({锁目录:dir,现在毫秒:()=>now});
  await 过渲染闸(async()=>{},()=>{}, {...e,内存下限:30,读内存:()=>轮>1?null:{总:100,空闲:1,空闲百分比:1,交换区总:0,交换区已用:0},读压力:()=>1,睡:async()=>{
    轮++;const t=列票(path.join(dir,'渲染.排队'))[0]!;
    if(轮===1){改调度('后',t.名,参数(['--为什么','暂缓','--分钟','0.001']),e,{状态:()=>读状态(e,机,false),输出:()=>{}});}
    now+=1000;
  }});expect(读调度(e.日志目录).some(x=>x.事==='恢复'&&x.原因==='暂缓到期回队尾')).toBe(true);
});
it('让路不中断当前段，下一张票暂缓；路令排队返回 75',async()=>{
  let now=Date.now(),等=0;const e=取调度环境({锁目录:dir,现在毫秒:()=>now}),task=开任务(e,{种:'render'});
  const env={...e,读内存:()=>null,读压力:()=>1,睡:async()=>{等++;now+=60_000;}};
  await 过渲染闸(async()=>{
    const s=读状态(e,机,false);改调度('让路',s.持锁[0]!.票,参数(['--为什么','产出优先','--分钟','1']),e,{状态:()=>s,输出:()=>{}});
    expect(fs.existsSync(path.join(dir,'渲染.lock'))).toBe(true);
  },()=>{},env,{种:'render',可让路:true});
  await 过渲染闸(async()=>{},()=>{},env);expect(等).toBeGreaterThan(0);task.结束();
  const route={...e,发起者:{...e.发起者,路:'一路'}};令命令(['一路'],参数(['--让路','请让路']),route,()=>{});
  await expect(过渲染闸(async()=>{},()=>{},{...env,发起者:route.发起者})).rejects.toMatchObject({退出码:75});
  路命令(['开','一路'],参数(),e,()=>{});路命令(['完','一路'],参数(),e,()=>{});expect(读调度(e.日志目录).filter(x=>/^路/.test(x.事))).toHaveLength(2);
});
it('等闸空连续30秒，不被段间假空骗过；内存到点124',async()=>{
  let now=0;const e=取调度环境({锁目录:dir,现在毫秒:()=>now});
  expect(await 等条件(参数(['--闸空','--最长','90']),e,{睡:async ms=>{now+=ms;},闸空:()=>now<20_000||now>=30_000})).toBe(0);expect(now).toBe(60_000);
  now=0;expect(await 等条件(参数(['--内存','30','--最长','3']),e,{睡:async ms=>{now+=ms;},内存:()=>20})).toBe(124);
});
it('票已被持有者删掉时改序报错：不复活、不写决定',()=>{
  const {e,t}=设置(),快照=读状态(e,机,false);
  快照.票[0]!.内容!.暂缓至=Date.now()+60_000;
  fs.rmSync(t.文件);
  for(const cmd of ['先','后','恢复'])expect(()=>改调度(cmd,t.名,参数(['--为什么','测试']),e,{状态:()=>快照,输出:()=>{}})).toThrow('已不在');
  expect(列票(path.join(dir,'渲染.排队'))).toHaveLength(0);
  expect(读调度(e.日志目录).filter(x=>x.事==='决定')).toHaveLength(0);
});
it('后 先改名再写内容；写票不复活旧路径',()=>{
  const {e,t}=设置();let 新名='';
  改调度('后',t.名,参数(['--为什么','测试']),e,{状态:()=>读状态(e,机,false),输出:x=>{新名=x;}});
  expect(fs.existsSync(t.文件)).toBe(false);
  const q=列票(path.join(dir,'渲染.排队'));
  expect(q.map(x=>x.名)).toEqual([新名]);expect(q[0]!.内容!.暂缓至).toBeGreaterThan(Date.now());expect(q[0]!.内容!.原序).toBe(String(t.时间));
  写票(t);expect(fs.existsSync(t.文件)).toBe(false);
});

const 队=()=>path.join(dir,'渲染.排队');
const 内存=(n:number)=>({总:100,空闲:n,空闲百分比:n,交换区总:0,交换区已用:0});
const 放票=(e:ReturnType<typeof 取调度环境>,pid:number,任务='别人的')=>{fs.mkdirSync(队(),{recursive:true});const 名=`${String(Date.now()).padStart(15,'0')}-${主机片段(e.本机)}-${pid}`;fs.writeFileSync(path.join(队(),名),JSON.stringify({v:1,任务,起:Date.now(),发起:读发起者({},[],dir,false),声明:{种:'still',段:'甲段'}}));return 名;};
const 放锁=(pid:number,拿锁时=Date.now())=>{fs.writeFileSync(path.join(dir,'渲染.lock'),`${pid}\n`);fs.writeFileSync(path.join(dir,'渲染.lock.信息.json'),JSON.stringify({pid,票:'锁票',任务:'持锁的',发起:{...读发起者({},[],dir,false),pid},声明:{种:'render',段:'乙段'},拿锁时,心跳:Date.now(),帧时:Date.now(),已出帧:0}));};
const 死pid=99999997;
const 决定=(e:ReturnType<typeof 取调度环境>)=>读调度(e.日志目录).filter(x=>x.事==='决定');
const 取消事件=(e:ReturnType<typeof 取调度环境>)=>读调度(e.日志目录).filter(x=>x.事==='取消');

it('放行按任务 id 存：放行后再改序仍越过内存，用掉就没了',async()=>{
  const e=取调度环境({锁目录:dir}),o={状态:()=>读状态(e,机,false),输出:()=>{}};let 轮=0;
  await 过渲染闸(async()=>{},()=>{}, {...e,读内存:()=>内存(5),读压力:()=>1,睡:async()=>{
    if(++轮>3)throw Error('改序后授权丢了');
    if(轮===1){改调度('放行',列票(队())[0]!.名,参数(['--为什么','峰值小']),e,o);改调度('先',列票(队())[0]!.名,参数(['--为什么','调序']),e,o);}
  }});
  expect(轮).toBe(1);expect(fs.readdirSync(path.join(dir,'指令'))).toEqual([]);
  expect(读调度(e.日志目录).some(x=>x.事==='单票放行')).toBe(true);
});
it('放行闸的授权同样跟任务走：改序后越过负载',async()=>{
  const e=取调度环境({锁目录:dir}),o={状态:()=>读状态(e,机,false),输出:()=>{}},q=path.join(dir,'放行.排队');let 轮=0;
  await 过放行闸(async()=>{},()=>{}, {...e,读内存:()=>null,读压力:()=>1,核数:()=>10,一分钟负载:()=>100,睡:async()=>{
    if(++轮>3)throw Error('改序后授权丢了');
    if(轮===1){改调度('放行',列票(q)[0]!.名,参数(['--为什么','负载是别的']),e,o);改调度('后',列票(q)[0]!.名,参数(['--为什么','调序']),e,o);}
  }});
  expect(轮).toBe(1);expect(fs.readdirSync(path.join(dir,'指令'))).toEqual([]);
});
it('放行到期作废：写事件一次、回到内存判断',async()=>{
  let now=Date.now(),轮=0,空闲=5;const e=取调度环境({锁目录:dir,现在毫秒:()=>now}),o={状态:()=>读状态(e,机,false),输出:()=>{}};
  放锁(process.ppid);const 错=vi.spyOn(console,'error').mockImplementation(()=>{});
  await 过渲染闸(async()=>{},()=>{}, {...e,读内存:()=>内存(空闲),读压力:()=>1,睡:async()=>{
    轮++;
    if(轮===1){改调度('放行',列票(队())[0]!.名,参数(['--为什么','当时够','--分钟','1']),e,o);now+=120_000;fs.rmSync(path.join(dir,'渲染.lock'));}
    if(轮===4)空闲=80;
    if(轮>6)throw Error('内存够了还没过');
  }});
  expect(轮).toBe(4);expect(读调度(e.日志目录).filter(x=>x.事==='放行过期')).toHaveLength(1);
  expect(错.mock.calls.flat().join('\n')).toContain('放行授权已过期（当时够）');错.mockRestore();
  expect(fs.readdirSync(path.join(dir,'指令'))).toEqual([]);
});
it('拿锁后用掉放行时不删别的指令：让路还要留给下一段',async()=>{
  const e=取调度环境({锁目录:dir});let 任务='';
  await 过渲染闸(async()=>{任务=读状态(e,机,false).持锁[0]!.任务;写指令(e,任务,{动作:'让路',为什么:'下一段再说',时:Date.now(),至:Date.now()+60_000,票:'旧票',任务});
    expect(fs.existsSync(指令文件(e,任务))).toBe(true);},()=>{}, {...e,读内存:()=>null,读压力:()=>1},{种:'render',可让路:true});
});
it('取消：死票、死锁不发信号，决定记真实结果，不写取消事件',()=>{
  const e=取调度环境({锁目录:dir}),o=(杀:(...a:unknown[])=>void,出:string[]=[])=>({状态:()=>读状态(e,机,false),输出:(x:string)=>{出.push(x);},杀});
  const 杀=vi.fn(),出:string[]=[];
  const 名=放票(e,死pid);改调度('取消',名,参数(['--为什么','死票']),e,o(杀,出));
  expect(出[0]).toContain('未发信号');expect(fs.existsSync(path.join(队(),名))).toBe(true);fs.rmSync(path.join(队(),名));
  放锁(死pid+1);改调度('取消',`#${死pid+1}`,参数(['--为什么','死锁','--杀持锁','--强']),e,o(杀,出));
  expect(杀).not.toHaveBeenCalled();expect(出[1]).toContain('留下的锁由下一个等待者回收');
  expect(决定(e).map(x=>String(x.结果))).toEqual([expect.stringContaining('未发信号'),expect.stringContaining('未发信号')]);expect(取消事件(e)).toHaveLength(0);
});
it.skipIf(process.platform==='win32')('取消：pid 已换人（真进程，启动晚于声称的时刻）不发信号，下一个等待者回收',async()=>{
  const e=取调度环境({锁目录:dir}),c=spawn('sleep',['30']);
  try{
    const 杀=vi.fn(),出:string[]=[],o={状态:()=>读状态(e,机,false),输出:(x:string)=>{出.push(x);},杀};
    // 锁文件是新的：判死的余量没过，只有取消这道严格核对拦得住。
    放锁(c.pid!,Date.now()-3600_000);
    改调度('取消',`#${c.pid}`,参数(['--为什么','超时了','--杀持锁','--强']),e,o);
    expect(出.at(-1)).toContain('已换人');expect(出.at(-1)).toContain('留下的锁由下一个等待者回收');
    fs.rmSync(path.join(dir,'渲染.lock'));fs.rmSync(path.join(dir,'渲染.lock.信息.json'));
    const 名=放票(e,c.pid!);const f=path.join(队(),名),内容=JSON.parse(fs.readFileSync(f,'utf8'));fs.writeFileSync(f,JSON.stringify({...内容,起:Date.now()-3600_000}));
    改调度('取消',名,参数(['--为什么','超时了']),e,o);
    expect(出.at(-1)).toContain('晚于领票');expect(出.at(-1)).toContain('留下的票由下一个等待者回收');
    expect(杀).not.toHaveBeenCalled();expect(决定(e).every(x=>String(x.结果).includes('已换人'))).toBe(true);expect(决定(e)).toHaveLength(2);expect(取消事件(e)).toHaveLength(0);
    fs.rmSync(f);
    // 锁也老了：算死，排队的下一个回收；复用它的进程不受影响。
    放锁(c.pid!,Date.now()-3600_000);const 老=new Date(Date.now()-3600_000);fs.utimesSync(path.join(dir,'渲染.lock'),老,老);
    expect(读状态(e,机,false).持锁[0]!.死).toBe(true);
    改调度('取消',`#${c.pid}`,参数(['--为什么','超时了','--杀持锁']),e,o);expect(出.at(-1)).toContain('进程已不在');
    await 过渲染闸(async()=>{},()=>{},{...e,读内存:()=>null,读压力:()=>1,读机器:机,清孤儿:()=>[]},{种:'still'});
    expect(fs.existsSync(path.join(dir,'渲染.lock'))).toBe(false);expect(读调度(e.日志目录).some(x=>x.事==='回收死锁')).toBe(true);
    expect(杀).not.toHaveBeenCalled();expect(c.exitCode).toBe(null);
    // 真正的持有者：启动早于拿锁
    放锁(c.pid!,Date.now()+2000);改调度('取消',`#${c.pid}`,参数(['--为什么','真要停','--杀持锁']),e,o);
    expect(杀).toHaveBeenCalledWith(c.pid,'SIGTERM');expect(决定(e).at(-1)!.结果).toBe('已发 SIGTERM');expect(取消事件(e)).toHaveLength(1);
    expect(fs.existsSync(指令文件(e,'持锁的'))).toBe(true);
  }finally{c.kill('SIGKILL');}
});
it.skipIf(process.platform==='win32')('在跑文件的 pid 被复用：心跳老了算崩溃，一条',()=>{
  const e=取调度环境({锁目录:dir}),c=spawn('sleep',['30']),f=path.join(dir,'在跑','甲.json');
  try{
    const 记=(心跳:number)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify({任务:'甲',主机:e.本机,起:心跳,心跳,发起:{pid:c.pid},声明:{}}));};
    记(Date.now());清崩溃(e);expect(fs.existsSync(f)).toBe(true);
    记(Date.now()-600_000);清崩溃(e);清崩溃(e);expect(fs.existsSync(f)).toBe(false);
    expect(读调度(e.日志目录).filter(x=>x.事==='崩溃')).toHaveLength(1);
  }finally{c.kill('SIGKILL');}
});
it('放行：快照之后票主人已拿锁删票，不留授权给同任务下一段，决定如实',()=>{
  const {e,t}=设置(),快照=读状态(e,机,false);
  fs.rmSync(t.文件);
  expect(()=>改调度('放行',t.名,参数(['--为什么','峰值小']),e,{状态:()=>快照,输出:()=>{}})).toThrow('已不在');
  expect(fs.existsSync(指令文件(e,'task'))).toBe(false);
  expect(决定(e).at(-1)!.结果).toContain('未放行');
});
it('改序用改名后重读的内容：快照之后票主人写的 等内存起、卡在 不被盖掉',()=>{
  const {e,t}=设置(),o=(快照:ReturnType<typeof 读状态>)=>({状态:()=>快照,输出:()=>{}});
  for(const cmd of ['先','后']){
    const 现=列票(队())[0]!;
    delete 现.内容!.卡在;delete 现.内容!.等内存起;写票(现);
    const 留底=读状态(e,机,false);
    现.内容!.卡在='内存';现.内容!.等内存起=123;写票(现);
    改调度(cmd,现.名,参数(['--为什么','调']),e,o(留底));
    expect(列票(队())[0]!.内容).toMatchObject({卡在:'内存',等内存起:123});
  }
  expect(t.名).not.toBe(列票(队())[0]!.名);
});
it('取消：Windows 上 SIGTERM 是立即终止，如实说',()=>{
  const {e,t}=设置(),出:string[]=[];
  改调度('取消',t.名,参数(['--为什么','不要了']),e,{状态:()=>读状态(e,机,false),输出:(x:string)=>{出.push(x);},杀:()=>{},Windows:true});
  expect(出[0]).toContain('立即终止');expect(出[0]).toContain('票等下一个等待者回收');
});
it('取消：信号时目标刚退出、无权限都如实说；没有 ps 只警告',()=>{
  const e=取调度环境({锁目录:dir}),名=放票(e,process.ppid),出:string[]=[];
  const o=(code:string)=>({状态:()=>读状态(e,机,false),输出:(x:string)=>{出.push(x);},杀:()=>{throw Object.assign(Error(`kill ${code}`),{code});}});
  改调度('取消',名,参数(['--为什么','刚退出']),e,o('ESRCH'));
  expect(出[0]).toContain('未发信号');expect(决定(e)[0]!.结果).toContain('未发信号');expect(fs.existsSync(指令文件(e,'别人的'))).toBe(false);
  expect(()=>改调度('取消',名,参数(['--为什么','没权限']),e,o('EPERM'))).toThrow('信号失败：SIGTERM');
  expect(决定(e)[1]!.结果).toContain('EPERM');expect(取消事件(e)).toHaveLength(0);expect(fs.existsSync(指令文件(e,'别人的'))).toBe(false);
  const 错=vi.spyOn(console,'error').mockImplementation(()=>{}),杀=vi.fn();
  改调度('取消',名,参数(['--为什么','没 ps']),e,{状态:()=>读状态(e,机,false),输出:()=>{},杀,进程起于:()=>null});
  expect(杀).toHaveBeenCalled();expect(错.mock.calls.flat().join()).toContain('读不到进程启动时刻');错.mockRestore();
});
it('写全名取消持锁者的残留票也要 --杀持锁；死目标不接受别的改调度',()=>{
  const e=取调度环境({锁目录:dir}),杀=vi.fn(),o={状态:()=>读状态(e,机,false),输出:()=>{},杀};
  放锁(process.ppid);const 名=放票(e,process.ppid);
  expect(()=>改调度('取消',名,参数(['--为什么','清残留']),e,o)).toThrow('杀持锁');expect(杀).not.toHaveBeenCalled();
  fs.rmSync(path.join(队(),名));const 死票=放票(e,死pid);
  for(const cmd of ['先','后','恢复','放行'])expect(()=>改调度(cmd,死票,参数(['--为什么','死票']),e,o)).toThrow('进程已不在');
  expect(fs.existsSync(path.join(队(),死票))).toBe(true);
});
it('读路径：死票死锁单独标记、不算占用、不当排队告警；异机锁不算死',async()=>{
  const e=取调度环境({锁目录:dir});放票(e,死pid);放锁(死pid+1);
  const s=读状态(e,机,false);expect(s.票[0]!.死).toBe(true);expect(s.持锁[0]!.死).toBe(true);
  expect(一行状态(s)).toContain(`持锁#${死pid+1}死 排队0 死票1`);
  const 看=渲染看(s);expect(看).toContain(`持锁 #${死pid+1} 死 render`);expect(看).toContain(`排队1 #${死pid} 死 等`);expect(看).toContain(' still');
  const 类=判告警(s,s.时+3600_000).map(x=>x.类);expect(类).toContain('持锁者死');expect(类).not.toContain('排队长');expect(类).not.toContain('小任务等待');
  let now=0;const 时钟=取调度环境({锁目录:dir,现在毫秒:()=>now}),提示=vi.fn();
  expect(await 等条件(参数(['--闸空','--最长','90']),时钟,{睡:async ms=>{now+=ms;},提示})).toBe(0);expect(now).toBe(30_000);expect(提示).not.toHaveBeenCalled();
  fs.writeFileSync(path.join(dir,`渲染.lock.${死pid+1}.主机`),'另一台\n');
  expect(读状态(e,机,false).持锁[0]!.死).toBe(false);
});
it('等闸空到点说卡在谁',async()=>{
  let now=0;const e=取调度环境({锁目录:dir,现在毫秒:()=>now}),说:string[]=[],睡=async(ms:number)=>{now+=ms;};
  expect(await 等条件(参数(['--闸空','--最长','2']),e,{睡,提示:x=>{说.push(x);}})).toBe(124);expect(说[0]).toContain('没连续空满 30 秒');
  放锁(process.ppid);放票(e,process.ppid);now=0;
  expect(await 等条件(参数(['--闸空','--最长','2']),e,{睡,提示:x=>{说.push(x);}})).toBe(124);
  expect(说[1]).toContain(`卡在 持锁 #${process.ppid} render 乙段`);expect(说[1]).toContain(`排队 #${process.ppid} still 甲段`);
});
it('等闸空：批的后台还在转就不算空（限流时没有票和锁），到点说卡在谁；后台的进程没了不算',async()=>{
  let now=0;const e=取调度环境({锁目录:dir,现在毫秒:()=>now}),说:string[]=[],睡=async(ms:number)=>{now+=ms;};
  const 在跑=path.join(dir,'在跑');fs.mkdirSync(在跑,{recursive:true});
  const 写在跑=(pid:number)=>fs.writeFileSync(path.join(在跑,`t${pid}.json`),JSON.stringify({任务:`t${pid}`,起:0,心跳:Date.now(),主机:e.本机,发起:{...e.发起者,pid},声明:{种:'render'},后台:{在做:'甲',排着:1,起于:0}}));
  写在跑(process.ppid);
  expect(await 等条件(参数(['--闸空','--最长','40']),e,{睡,提示:x=>{说.push(x);}})).toBe(124);
  expect(说[0]).toContain(`卡在 后台 #${process.ppid} 甲 排1`);
  fs.rmSync(path.join(在跑,`t${process.ppid}.json`));写在跑(死pid);now=0;
  expect(await 等条件(参数(['--闸空','--最长','40']),e,{睡,提示:x=>{说.push(x);}})).toBe(0);
});
it('批按项数算可让路：一项的直说不能让路，多项的能让',async()=>{
  const e={...取调度环境({锁目录:dir}),读内存:()=>null,读压力:()=>1};
  const 试=async(项数:number)=>{const 批=开闸批({项数},e);try{await 批.一项({},async()=>{const s=读状态(e,机,false);改调度('让路',s.持锁[0]!.票,参数(['--为什么','产出优先']),e,{状态:()=>s,输出:()=>{}});});}finally{批.结束();}};
  await expect(试(1)).rejects.toThrow('不能让路');await expect(试(2)).resolves.toBeUndefined();
});
it('路令看动作字段不猜文本，能撤；撤了同路照常拿锁',async()=>{
  const e=取调度环境({锁目录:dir}),route={...e,发起者:{...e.发起者,路:'一路'}},出:string[]=[],o=(x:string)=>{出.push(x);};
  for(const a of [[],['一路'],['一路','让路'],['一路','--让路','x','--撤']])expect(()=>令命令(a.filter(x=>!x.startsWith('--')&&x!=='x'),参数(a.filter(x=>x.startsWith('--')||x==='x')),route,o)).toThrow('用法');
  fs.mkdirSync(path.dirname(令文件(e,'一路')),{recursive:true});fs.writeFileSync(令文件(e,'一路'),JSON.stringify({令:'请让路',至:Date.now()+60_000}));expect(路让路(route)).toBeNull();
  令命令(['一路'],参数(['--让路','不用猜']),route,o);expect(路让路(route)).toBe('不用猜');
  令命令(['一路'],参数(['--撤']),route,o);expect(路让路(route)).toBeNull();expect(出[1]).toContain('已撤');
  令命令(['一路'],参数(['--撤']),route,o);expect(出[2]).toContain('无事可撤');
  await 过渲染闸(async()=>{},()=>{}, {...route,读内存:()=>null,读压力:()=>1});
  expect(读调度(e.日志目录).filter(x=>x.事==='令').map(x=>x.动作)).toEqual(['让路','撤','撤']);
});
it.each([['渲染','顶层'],['渲染','未接'],['放行','顶层'],['批','顶层']])('直接 import 闸的脚本（%s，%s）路令也退 75，日志一致，不打调用栈',(闸,写法)=>{
  const e=取调度环境({锁目录:dir});令命令(['甲路'],参数(['--让路','先交产出']),e,()=>{});
  const 跑=(路:string)=>spawnSync(process.execPath,[path.join(import.meta.dirname,'fixtures/路令脚本.ts'),dir,闸,写法],{encoding:'utf8',env:{...process.env,ANIM_ROUTE:路}});
  const r=跑('甲路');expect(r.status).toBe(75);expect(r.stderr).toContain('退出 75，不算失败');expect(r.stderr).not.toMatch(/^\s+at /m);
  expect(读调度(e.日志目录).filter(x=>x.事==='任务止').map(x=>x.退出码)).toEqual([75]);
  expect(跑('乙路').status).toBe(0);
},30_000);
it('恢复：--原序 没有原序报错、没暂缓的不动；先和后都能回原序',()=>{
  const e=取调度环境({锁目录:dir}),o={状态:()=>读状态(e,机,false),输出:()=>{}};
  const 任务=(n:string)=>({任务:n,起:Date.now(),心跳:Date.now(),主机:e.本机,发起:读发起者({},[],dir,false),声明:{种:'still'}});
  for(const n of ['A','B','C'])领票(队(),e.本机,任务(n),Date.now());
  const 序=()=>列票(队()).map(x=>x.内容!.任务),名=(n:string)=>列票(队()).find(x=>x.内容!.任务===n)!.名;
  expect(()=>改调度('恢复',名('B'),参数(['--为什么','x','--原序']),e,o)).toThrow('没有原序');
  expect(()=>改调度('恢复',名('A'),参数(['--为什么','x']),e,o)).toThrow('没在暂缓');
  expect(序()).toEqual(['A','B','C']);expect(决定(e)).toHaveLength(0);
  for(const cmd of ['先','后']){
    改调度(cmd,名('B'),参数(['--为什么','调']),e,o);expect(序()).toEqual(cmd==='先'?['B','A','C']:['A','C','B']);
    改调度('恢复',名('B'),参数(['--为什么','回','--原序']),e,o);expect(序()).toEqual(['A','B','C']);
  }
  改调度('后',名('A'),参数(['--为什么','调']),e,o);改调度('恢复',名('A'),参数(['--为什么','回']),e,o);expect(序()).toEqual(['B','C','A']);
});
it('快路径的全局参数和帮助走完整路由，和别的命令一致',()=>{
  const main=path.join(import.meta.dirname,'../cli/main.ts'),环境={...process.env,ANIM_DATA:dir,ANIM_DEBUG:''};
  const 跑=(...a:string[])=>spawnSync(process.execPath,[main,'调度',...a],{encoding:'utf8',env:环境});
  for(const a of [['-h'],['--help'],['--调试','--help'],['看','-h']]){const r=跑(...a);expect(r.status).toBe(0);expect(r.stdout).toContain('用法：anim 调度');}
  const 选错=跑('预计','段','--作品','没有这部作品');expect(选错.status).toBe(2);expect(选错.stderr).toContain('没有这部作品');
  const 用错=跑('不存在的动作');expect(用错.status).toBe(2);expect(用错.stderr).toContain('用法：anim 调度');
  const 走路由=跑('不存在的动作','--调试');expect(走路由.status).toBe(2);expect(走路由.stderr).toContain('用法：anim 调度');
},120_000);
it('领票打印前面几张和约几分；没人挡不打印；暂缓提示带原因',async()=>{
  const e=取调度环境({锁目录:dir}),队=path.join(dir,'渲染.排队'),内存=()=>({总:100,空闲:80,空闲百分比:80,交换区总:0,交换区已用:0});
  const 环={...e,读内存:内存,读压力:()=>1,读机器:机,清孤儿:()=>[]};
  const 无人:string[]=[];await 过渲染闸(async()=>{},s=>无人.push(s),环);expect(无人.join()).not.toContain('前面');
  const 前=领票(队,e.本机,{任务:'前',起:Date.now(),心跳:Date.now(),主机:e.本机,发起:读发起者({},[],dir,false),声明:{种:'still',预计秒:90}},Date.now());
  const 名=`${前.名.split('-')[0]}-${主机片段(e.本机)}-${process.ppid}`;fs.renameSync(前.文件,path.join(队,名));
  const 提示:string[]=[];
  await 过渲染闸(async()=>{},s=>提示.push(s),{...环,睡:async()=>{fs.rmSync(path.join(队,名),{force:true});}});
  expect(提示[0]).toBe('渲染排队（前面 1 张，约1.5 分）');
  const 暂缓:string[]=[];let 轮=0;fs.writeFileSync(path.join(队,名),'{}');
  await 过渲染闸(async()=>{},s=>暂缓.push(s),{...环,睡:async()=>{if(++轮===1){改调度('后',列票(队).find(x=>x.pid===process.pid)!.名,参数(['--为什么','让产出先走','--分钟','0.001']),e,{状态:()=>读状态(e,机,false),输出:()=>{}});fs.rmSync(path.join(队,名));}await new Promise(r=>setTimeout(r,20));}});
  expect(暂缓.some(x=>/暂缓至 \S+：让产出先走/.test(x))).toBe(true);
});
it('见到旧票旧锁写事件，一小时一条；刚建还没信息文件的锁可能是新闸，不算',()=>{
  let now=Date.now();const e=取调度环境({锁目录:dir,现在毫秒:()=>now}),事=()=>读调度(e.日志目录).filter(x=>x.事==='见到旧协议');
  fs.writeFileSync(path.join(dir,'渲染.lock'),`${process.ppid}\n`);
  读状态(e,机,false);expect(事()).toHaveLength(0);
  now+=11_000;读状态(e,机,false);expect(事()).toHaveLength(1);expect(事()[0]!.旧锁).toEqual([process.ppid]);
  now+=60_000;读状态(e,机,false);expect(事()).toHaveLength(1);
  fs.rmSync(path.join(dir,'渲染.lock'));fs.mkdirSync(path.join(dir,'渲染.排队'));const 旧票=`000000000000100-${主机片段(e.本机)}-${process.ppid}`;fs.writeFileSync(path.join(dir,'渲染.排队',旧票),String(process.ppid));
  now+=3_600_000;读状态(e,机,false);expect(事()).toHaveLength(2);expect(事()[1]!.旧票).toEqual([旧票]);
  fs.rmSync(path.join(dir,'渲染.排队',旧票));
  设置();now+=7_200_000;读状态(e,机,false);expect(事()).toHaveLength(2);
});
