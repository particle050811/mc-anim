import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {过渲染闸,登记临时文件} from '../闸.ts';
const dir=process.argv[2]!;
await 过渲染闸(async()=>{
  const tmp=path.join(dir,'本次.渲染中.mkv');fs.writeFileSync(tmp,'temp');登记临时文件(tmp);
  console.log('ready');await new Promise(()=>setInterval(()=>{},1000));
},()=>{}, {锁目录:dir,本机:os.hostname(),内存下限:30,读内存:()=>null,读压力:()=>1}, {种:'fixture',用途:'实验'});
