import fs from 'node:fs';
import path from 'node:path';
import {写JSON,读JSON} from './文件.ts';
import {进程在吗} from './锁.ts';
import {读状态,一行状态,type 调度状态} from './看.ts';
import {读监测,更新历史,判告警,记录告警} from './告警.ts';
import type {调度环境} from './任务.ts';
export const 到点退出码=124;
export const 盯=async(e:调度环境,o:{最长?:number;任务?:string;输出?:(s:string)=>void;读?:()=>调度状态;睡?:(ms:number)=>Promise<void>;父活?:()=>boolean}={})=>{
  const 起=e.现在毫秒(),父=process.ppid,live=path.join(e.调度目录,'盯',process.pid+'.json');
  写JSON(live,{pid:process.pid,会话:e.发起者.会话,起});
  const cursor=path.join(e.调度目录,`游标-${e.发起者.会话||'人'}.json`);
  const 已读=读JSON<Record<string,boolean>>(cursor)??{};
  let h=读监测(e);
  try{while((o.父活??(()=>process.ppid===父&&进程在吗(父)))()){
    if(e.现在毫秒()-起>=(o.最长??1740)*1000)return 到点退出码;
    const s=(o.读??(()=>读状态(e)))();h=更新历史(s,h);const alerts=判告警(s,s.时,undefined,h);记录告警(e,s,h,alerts);
    const events=s.最近.filter(x=>(['路完','路败'].includes(x.事)&&((x.发起 as {会话?:string})?.会话===e.发起者.会话))||(o.任务&&x.事==='任务止'&&(x.任务===o.任务||x.票===o.任务)));
    const ev=events.find(x=>!已读[x.时+x.事+x.任务+String(x.路)]);
    if(alerts.length||ev){if(ev)已读[ev.时+ev.事+ev.任务+String(ev.路)]=true;写JSON(cursor,已读);(o.输出??console.log)(`${alerts.map(x=>`${x.类} ${x.对象}`).join('；')||ev?.事} | ${一行状态(s)}`);return 0;}
    await(o.睡??(ms=>new Promise(r=>setTimeout(r,ms))))(5000);
  }return 0;}finally{fs.rmSync(live,{force:true});}
};
