import {execFileSync} from 'node:child_process';
export type 孤儿进程={pid:number;ppid:number;rss:number;命令:string};
/** Remotion 下载目录 + headless shell + ppid 三项同时满足，不碰 Playwright 或普通 Chrome。 */
export const 找孤儿=(text:string):孤儿进程[]=>text.split('\n').flatMap(l=>{
  const m=/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/.exec(l);if(!m)return[];
  const p={pid:Number(m[1]),ppid:Number(m[2]),rss:Number(m[3]),命令:m[4]!};
  return p.ppid===1&&/\/node_modules\/(?:\.remotion|@remotion)\/[^\s]*chrome-headless-shell/.test(p.命令)&&! /playwright/i.test(p.命令)?[p]:[];
});
export const 读进程=()=>{try{return execFileSync('ps',['-A','-o','pid=,ppid=,rss=,command='],{encoding:'utf8',maxBuffer:8*1024*1024});}catch{return '';}};
export const 清孤儿=(text=读进程(),杀=(pid:number)=>process.kill(pid,'SIGTERM'))=>{
  const 清掉:孤儿进程[]=[];for(const p of 找孤儿(text)){try{杀(p.pid);清掉.push(p);}catch{/* 进程已退出 */}}return 清掉;
};
