// 直接 import 闸、没有路由接异常的脚本：argv 是 锁目录、闸（渲染|放行|批）、写法（顶层 await|未接）。
import os from 'node:os';
import {开闸批,过放行闸,过渲染闸} from '../闸.ts';
const [dir,闸,写法]=process.argv.slice(2) as [string,string,string];
const e={锁目录:dir,本机:os.hostname(),读内存:()=>null,读压力:()=>1,一分钟负载:()=>0,核数:()=>10,清孤儿:()=>[]};
const 跑=async()=>{
  if(闸==='渲染')return 过渲染闸(async()=>{},()=>{},e);
  if(闸==='放行')return 过放行闸(async()=>{},()=>{},e);
  const 批=开闸批({项数:2},e);
  try{await 批.一项({},async()=>{});}finally{批.结束();}
};
if(写法==='顶层')await 跑();else void 跑();
