// GPU 位容量 1；用户 11-01 定：等内存不持锁，人工放行只作用一票。
// 30%、负载核×0.8、60 秒是 Agent 选的阈值，不冒称用户定值。
import fs from 'node:fs';
import path from 'node:path';
import {AsyncLocalStorage} from 'node:async_hooks';
import {配置} from '../环境/配置.ts';
import {内存够渲染,读内存,读压力,读数说明,核数,一分钟负载,type 内存读数} from '../环境/资源.ts';
import {持有者,试拿,放,锁文件,进程在吗} from './锁.ts';
import {登记收尾} from './收尾.ts';
import {取调度环境,开任务,有任务,清崩溃,type 调度环境,type 任务声明} from './任务.ts';
import {领票,列票,票活着,type 票,回队尾} from './票.ts';
import {写JSON,读JSON} from './文件.ts';
import {清孤儿} from './孤儿.ts';
import {估计} from './估计.ts';
export type {任务声明} from './任务.ts';
export {闸记被杀,登记临时文件} from './收尾.ts';
export const 祖先持锁变量='MCAI_RENDER_LOCK_PID';
const 持锁上下文=new AsyncLocalStorage<锁柄>();
const 串行=new Map<string,Promise<void>>();
const 睡=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
export type 闸环境=调度环境&{内存下限:number;读内存:()=>内存读数|null;读压力:()=>number|null;一分钟负载:()=>number|null;核数:()=>number;睡:(ms:number)=>Promise<void>;排队间隔毫秒?:number;清孤儿:()=>unknown[]};
export const 取环境=(e:Partial<闸环境>={}):闸环境=>({...取调度环境(e),内存下限:e.内存下限??Number(配置('渲染内存下限')),读内存:e.读内存??读内存,读压力:e.读压力??读压力,
  一分钟负载:e.一分钟负载??一分钟负载,核数:e.核数??核数,睡:e.睡??睡,排队间隔毫秒:e.排队间隔毫秒??1000,
  // 注入锁目录的调用必须显式注入进程清理，测试不能碰真 Chrome。
  清孤儿:e.清孤儿??(e.锁目录?()=>[]:清孤儿)});
export type 锁柄={文件:string;票:string;任务:string;声明:任务声明;拿锁时:number;放:(结果?:string)=>void;心跳:(帧?:number)=>void};
type 排队选项=Partial<闸环境>&{间隔毫秒?:number;等待提示?:(s:string)=>void;准入?:(票:票)=>boolean;越队?:(票:票)=>boolean;声明?:任务声明};
export const 读单票放行=(dir:string,票:string)=>{const c=读JSON<{动作:string;强?:boolean}>(path.join(dir,'指令',票+'.json'));return c?.动作==='放行'?c:null;};
export const 排队拿=async(名:string,opts:排队选项={}):Promise<锁柄>=>{
  const e=取环境(opts),key=path.join(e.锁目录,名),前=串行.get(key)??Promise.resolve();
  let 交棒!:()=>void;const 完=new Promise<void>(r=>{交棒=r;});串行.set(key,完);await 前;
  const 自建=!有任务(e.锁目录),声明=opts.声明??{种:process.argv[2]??'脚本',用途:process.env.ANIM_PURPOSE??'未声明'};
  声明.种??=process.argv[2]??'脚本';声明.用途??=process.env.ANIM_PURPOSE??'未声明';声明.预计秒??=估计(声明,path.dirname(e.日志目录));
  const task=开任务(e,声明),file=锁文件(e.锁目录,名),dir=path.join(e.锁目录,名+'.排队');
  let t=领票(dir,e.本机,{...task.info,声明},e.现在毫秒());task.更新(声明,t.名);
  const 起=e.现在毫秒();let 原等待='',拿锁时=0,完了=false;
  const 记=(事:string,字段:Record<string,unknown>={})=>task.记(事,{票:t.名,锁:名,声明,...字段});
  const 清=()=>{for(const p of e.清孤儿())记('清孤儿',{进程:p});};
  const 删票=()=>{fs.rmSync(t.文件,{force:true});};
  const 撤票=登记收尾(()=>删票());
  const 交接=()=>{交棒();if(串行.get(key)===完)串行.delete(key);};
  记('领票',{队:{前面:列票(dir).filter(x=>x.名<t.名).slice(0,3).map(x=>x.名),深度:列票(dir).length,持锁:持有者(file)}});
  try {
    for(;;){
      清崩溃(e);
      const 找=列票(dir).find(x=>x.内容?.任务===task.info.任务&&x.pid===process.pid);
      if(找)t=找;else{const 原=t.名;t=领票(dir,e.本机,{...task.info,声明},e.现在毫秒());记('票丢失',{原名:原,新名:t.名});}
      if(t.内容?.暂缓至&&t.内容.暂缓至<=e.现在毫秒()){
        t=回队尾(t);delete t.内容!.暂缓至;写JSON(t.文件,t.内容);记('恢复',{原因:'暂缓到期回队尾'});
      }
      try{fs.utimesSync(t.文件,new Date(),new Date());}catch{continue;}
      const 活:票[]=[];
      for(const q of 列票(dir)){
        if(票活着(q,e.本机))活.push(q);
        else {try{fs.unlinkSync(q.文件);记('清死票',{原信息:q});清();}catch{/* 另一读者先回收 */}}
      }
      const 越=opts.越队?.(t)??false;
      const 暂缓=Boolean(t.内容?.暂缓至&&t.内容.暂缓至>e.现在毫秒());
      if((越||(!暂缓&&活[0]?.名===t.名))&&(opts.准入?.(t)??true)&&试拿(file,e.本机,pid=>{
        记('回收死锁',{原持有者:读JSON(file+'.信息.json')??{pid}});清();
      }))break;
      const 等待=暂缓?`暂缓至 ${new Date(t.内容!.暂缓至!).toISOString()}`:fs.existsSync(file)?`锁在 pid ${持有者(file)??'?'} 手里`:'前面还有人排队或等资源';
      if(等待!==原等待){opts.等待提示?.(等待);记('排队',{等谁:持有者(file),前面:活.slice(0,3).map(x=>x.名),状态:等待});原等待=等待;}
      await e.睡(opts.间隔毫秒??e.排队间隔毫秒??1000);
    }
    拿锁时=e.现在毫秒();task.更新(声明,t.名);记('拿锁',{等锁秒:(拿锁时-起)/1000});
  }catch(err){删票();撤票();交接();if(自建)task.结束(1);throw err;}
  删票();撤票();
  const 信息文件=file+'.信息.json';let 最近写=0,已出帧=0,帧时=拿锁时;
  const 心跳=(帧?:number)=>{if(帧!==undefined&&帧!==已出帧){已出帧=帧;帧时=e.现在毫秒();}if(最近写&&e.现在毫秒()-最近写<5000)return;
    最近写=e.现在毫秒();写JSON(信息文件,{pid:process.pid,任务:task.info.任务,票:t.名,发起:task.info.发起,声明,拿锁时,心跳:最近写,帧时,已出帧,总帧:声明.帧数});};
  心跳();const 限时=Number(process.env.ANIM_TIME_LIMIT);const 限时器=名==='渲染'&&限时>0?setTimeout(()=>{记('限时杀',{限时});process.exit(124);},限时*1000):undefined;限时器?.unref();const timer=setInterval(()=>心跳(),30_000);timer.unref();
  const 撤锁=登记收尾((_,sig)=>释放(sig?'被杀':'退出'));
  const 释放=(结果='成')=>{if(完了)return;完了=true;clearInterval(timer);clearTimeout(限时器);撤锁();
    记('放锁',{持锁秒:(e.现在毫秒()-拿锁时)/1000,结果,已出帧});
    if(持有者(file)===process.pid)fs.rmSync(信息文件,{force:true});放(file);交接();if(自建&&!['被杀','退出'].includes(结果))task.结束(结果==='成'?0:1);
  };
  return {文件:file,票:t.名,任务:task.info.任务,声明,拿锁时,放:释放,心跳};
};
export const 闸心跳=(帧?:number)=>持锁上下文.getStore()?.心跳(帧);
export const 当前票=()=>持锁上下文.getStore()?.票;
const 检查重入=()=>{if(持锁上下文.getStore())throw Error('禁止嵌套过闸：当前调用已经持有渲染锁');const pid=Number(process.env[祖先持锁变量]);if(pid&&pid!==process.pid&&进程在吗(pid))throw Error(`祖先 pid ${pid} 持有渲染锁，子进程不能再次过闸`);};
export const 过渲染闸=async<T>(fn:()=>Promise<T>,提示:(s:string)=>void=s=>console.error(`== 资源闸：${s}`),环境:Partial<闸环境>={},声明:任务声明={}):Promise<T>=>{
  检查重入();const e=取环境(环境);let 说过=false,告警过=false,等起:number|undefined,票名='';
  const 柄=await 排队拿('渲染',{...e,声明,等待提示:s=>提示(`渲染排队（${s}）`),越队:t=>Boolean(读单票放行(e.锁目录,t.名)),准入:t=>{
    票名=t.名;if(声明.不开渲染)return true;const m=e.读内存(),压力=e.读压力(),授权=读单票放行(e.锁目录,t.名);
    const task=开任务(e,声明);
    const 够=(压力!==4||授权?.强)&&(授权||!m||内存够渲染(m,e.内存下限));
    if(够){if(等起!==undefined)task.记('等内存止',{票:t.名,秒:(e.现在毫秒()-等起)/1000});if(授权)task.记('单票放行',{票:t.名,压力,读数:m,强:授权.强});return true;}
    等起??=e.现在毫秒();
    if(!说过){提示(`渲染等内存（${m?读数说明(m):'无读数'}，下限 ${e.内存下限}%，压力 ${压力??'?'}）`);task.记('等内存起',{票:t.名,读数:m,压力,阈值:e.内存下限});t.内容!.等内存起=等起;t.内容!.卡在='内存';写JSON(t.文件,t.内容);}
    说过=true;if(!告警过&&e.现在毫秒()-等起>=180_000){提示(`告警：等内存已满 3 分钟，票 ${t.名}；锁未占用，请主 Agent 决定`);task.记('告警',{类:'等内存',对象:t.名,阈值:180,值:(e.现在毫秒()-等起)/1000});告警过=true;}return false;
  }});
  let 结果='成';try{提示('放行渲染');fs.rmSync(path.join(e.锁目录,'指令',票名+'.json'),{force:true});process.env[祖先持锁变量]=String(process.pid);return await 持锁上下文.run(柄,fn);}catch(err){结果='异常';throw err;}finally{delete process.env[祖先持锁变量];柄.放(结果);}
};
/** 放行闸仍默认重；后续在拿短锁前判断资源。 */
export const 过放行闸=async<T>(fn:()=>Promise<T>,提示:(s:string)=>void=s=>console.error(`== 资源闸：${s}`),环境:Partial<闸环境>={},声明:任务声明={}):Promise<T>=>{
  const e=取环境(环境),柄=await 排队拿('放行',{...e,声明,等待提示:s=>提示(`放行排队（${s}）`)}),上次文件=path.join(e.锁目录,'上次放行');
  let 说过=false;
  try{for(;;){let 上次=0;try{上次=Number(fs.readFileSync(上次文件,'utf8').trim())||0;}catch{/* 首次 */}
    const m=e.读内存(),load=e.一分钟负载();if(e.现在毫秒()/1000-上次>=60&&(load===null||load<e.核数()*0.8)&&(!m||m.空闲百分比>=e.内存下限))break;
    if(!说过)提示(`等资源（1 分钟负载 ${load}，内存 ${m?.空闲百分比}%）`);说过=true;await e.睡(10_000);
  }fs.writeFileSync(上次文件,`${Math.floor(e.现在毫秒()/1000)}\n`);}finally{柄.放();}return fn();
};
export const 懒放行闸=(过闸:(fn:()=>Promise<void>)=>Promise<void>=过放行闸)=>{let p:Promise<void>|undefined;return()=>p??=过闸(async()=>{});};
