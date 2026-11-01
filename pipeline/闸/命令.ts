import path from 'node:path';
import {解析参数,用法错误} from '../cli/参数.ts';
import type {命令} from '../cli/命令.ts';
import {取调度环境,type 调度环境} from './任务.ts';
import {读状态,渲染看,一行状态} from './看.ts';
import {读调度} from './调度日志.ts';
import {复盘} from './复盘.ts';
import {估计} from './估计.ts';
import {盯} from './盯.ts';
const 用法='调度 [看|预计|盯|日志|复盘] [--json|--一行]';
export const 跑调度=async(args:string[],env?:调度环境,输出:(s:string)=>void=console.log):Promise<number>=>{
  const p=解析参数(args,{开关:['--json','--一行','--help'],值:['--最长','--任务','--从','--到','--事','--票','--段','--路','--日']});
  if(p.开关.has('--help')){输出('用法：anim '+用法);return 0;}
  const e=env??取调度环境(),[cmd='看',...rest]=p.位置;
  if(cmd==='看'){const s=读状态(e);输出(p.开关.has('--json')?JSON.stringify({...s,机:{...s.机,进程:undefined}}):p.开关.has('--一行')?一行状态(s):渲染看(s));return 0;}
  if(cmd==='预计'){输出(JSON.stringify({选择器:rest[0],纯跑秒:估计({种:'still',段:rest[0]},path.dirname(e.日志目录)),说明:'缺样本显示 null；未知队列按 23 秒下界估计'}));return 0;}
  if(cmd==='盯')return 盯(e,{最长:p.值['--最长']?Number(p.值['--最长']):undefined,任务:p.值['--任务'],输出});
  if(cmd==='日志'||cmd==='复盘'){
    const rows=读调度(e.日志目录).filter(x=>(!p.值['--从']||x.时>=p.值['--从'])&&(!p.值['--到']||x.时<=p.值['--到'])&&(!p.值['--日']||x.时.slice(5,10)===p.值['--日'])&&['事','票','段','路'].every(k=>!p.值['--'+k]||JSON.stringify(k==='段'? (x.声明 as {段?:string})?.段:k==='路'?(x.发起 as {路?:string})?.路:x[k])?.includes(p.值['--'+k]!)));
    输出(cmd==='日志'?rows.map(x=>JSON.stringify(x)).join('\n'):JSON.stringify(复盘(rows),null,2));return 0;
  }
  throw new 用法错误(`不认识的调度命令 ${cmd}`);
};
export const 调度命令:Record<string,命令>={调度:{用法,说明:'看机器、队列、归因日志；按事件叫醒，不自动派发',不记录:true,跑:args=>跑调度(args)}};
