import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {解析参数} from '../cli/参数.ts';
import {取调度环境,开任务} from './任务.ts';
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
  const route={...e,发起者:{...e.发起者,路:'一路'}};令命令(['一路','请让路'],route);
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
it.skipIf(process.platform==='win32')('取消：pid 已换人（真进程，启动晚于声称的时刻）不发信号',async()=>{
  const e=取调度环境({锁目录:dir}),c=spawn('sleep',['30']);
  try{
    const 杀=vi.fn(),o={状态:()=>读状态(e,机,false),输出:()=>{},杀};
    放锁(c.pid!,Date.now()-3600_000);
    expect(()=>改调度('取消',`#${c.pid}`,参数(['--为什么','超时了','--杀持锁','--强']),e,o)).toThrow('已换人');
    fs.rmSync(path.join(dir,'渲染.lock'));fs.rmSync(path.join(dir,'渲染.lock.信息.json'));
    const 名=放票(e,c.pid!);const f=path.join(队(),名),内容=JSON.parse(fs.readFileSync(f,'utf8'));fs.writeFileSync(f,JSON.stringify({...内容,起:Date.now()-3600_000}));
    expect(()=>改调度('取消',名,参数(['--为什么','超时了']),e,o)).toThrow('晚于领票');
    expect(杀).not.toHaveBeenCalled();expect(决定(e).every(x=>String(x.结果).includes('已换人'))).toBe(true);expect(决定(e)).toHaveLength(2);expect(取消事件(e)).toHaveLength(0);
    // 真正的持有者：启动早于拿锁
    fs.rmSync(f);放锁(c.pid!,Date.now()+2000);改调度('取消',`#${c.pid}`,参数(['--为什么','真要停','--杀持锁']),e,o);
    expect(杀).toHaveBeenCalledWith(c.pid,'SIGTERM');expect(决定(e).at(-1)!.结果).toBe('已发 SIGTERM');expect(取消事件(e)).toHaveLength(1);
    expect(fs.existsSync(指令文件(e,'持锁的'))).toBe(true);
  }finally{c.kill('SIGKILL');}
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
  const 看=渲染看(s);expect(看).toContain(`持锁 #${死pid+1} 死 render`);expect(看).toContain(`排队1 #${死pid} 死 still`);
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
