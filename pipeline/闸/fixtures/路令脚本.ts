// 直接 import 闸、没有路由接异常的脚本：argv 是 锁目录、闸（渲染|放行|批）、写法（顶层 await|未接）。
import os from 'node:os';
import {openGateBatch,passGate,passRenderGate} from '../闸.ts';
const [dir,gateName,callStyle]=process.argv.slice(2) as [string,string,string];
const e={lockDir:dir,localHost:os.hostname(),readMemory:()=>null,readPressure:()=>1,load1Min:()=>0,coreCount:()=>10,clearOrphans:()=>[]};
const run=async()=>{
  if(gateName==='渲染')return passRenderGate(async()=>{},()=>{},e);
  if(gateName==='放行')return passGate(async()=>{},()=>{},e);
  const gate=openGateBatch({项数:2},e);
  try{await gate.runTask({},async()=>{});}finally{gate.结束();}
};
if(callStyle==='顶层')await run();else void run();
