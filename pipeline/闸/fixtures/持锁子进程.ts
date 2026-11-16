import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {passRenderGate,registerTempFile} from '../闸.ts';
const dir=process.argv[2]!;
await passRenderGate(async()=>{
  const tmp=path.join(dir,'本次.渲染中.mkv');fs.writeFileSync(tmp,'temp');registerTempFile(tmp);
  console.log('ready');await new Promise(()=>setInterval(()=>{},1000));
},()=>{}, {lockDir:dir,localHost:os.hostname(),memFloor:30,readMemory:()=>null,readPressure:()=>1}, {kind:'fixture',purpose:'实验'});
