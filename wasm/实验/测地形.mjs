import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {解区段} from '../../engine/voxel/区段解码.ts';
import {读模型} from '../../engine/voxel/区段模型.ts';
import {学模型} from '../../pipeline/世界/烘焙/模型.ts';
import {模型字节} from '../../engine/voxel/区段模型.ts';
import {压区段, 到列优先} from '../../pipeline/世界/烘焙/区段编码.ts';
import {解区段 as 上下解} from '../../out/三轮地形/上下半境.ts';
import {解区段 as 迟解} from '../../out/三轮地形/迟建字面树.ts';
import {压区段 as 上下压} from '../../out/三轮地形/上下半编码.ts';

import {解区段 as 引用解} from '../../out/三轮地形/整列引用.ts';
const names=['主世界-116/5c8a6378419e','暮色放大-1752-扩展/c42d60d01992'];
const modes=['上下半境','共用色板','迟建字面树','整列引用','按世界重训'];
const count=5461,header=16+count*8;
const temp=()=>execFileSync('./anim',['调度','--一行'],{encoding:'utf8'}).trim();
const tag=process.argv[2];assert(modes.includes(tag));
const output=[];
for(const name of names){
 const dir=path.join(process.argv[3],name),model=读模型(fs.readFileSync(path.join(dir,'模型.bin'))), bins=Array.from({length:7},()=>[]);
 const files=fs.readdirSync(dir).filter(f=>f.endsWith('.块')).sort();
 for(const file of files){const fd=fs.openSync(path.join(dir,file),'r'),buf=Buffer.alloc(header);try{assert.equal(fs.readSync(fd,buf,0,header,0),header);}finally{fs.closeSync(fd);}assert.equal(buf.readUInt32LE(4),3);
  let slot=0;const [tx,ty]=file.split('.').map(Number);for(let L=0;L<7;L++){const edge=64>>L;for(let j=0;j<edge;j++)for(let i=0;i<edge;i++,slot++){const off=buf.readUInt32LE(16+slot*8),len=buf.readUInt32LE(20+slot*8);if(len)bins[L].push({file,off,len,id:{L,i:tx*edge+i,j:ty*edge+j}});}}}
 let seed=31841;const shuffle=(arr)=>{for(let k=arr.length-1;k>0;k--){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const j=seed%(k+1);[arr[k],arr[j]]=[arr[j],arr[k]];}return arr;};
 const read=(s)=>{const raw=Buffer.alloc(s.len),fd=fs.openSync(path.join(dir,s.file),'r');try{assert.equal(fs.readSync(fd,raw,0,s.len,s.off),s.len);}finally{fs.closeSync(fd);}return {...s,raw};};
 const test=[],train=[];for(const bin of bins){shuffle(bin);const n=Math.min(Math.floor(bin.length/2),96);test.push(...bin.slice(0,n).map(read));train.push(...bin.slice(n,n+Math.min(384,bin.length-n)).map(read));}shuffle(test);
 const entries=new Map();for(const {raw} of train){const end=6+4*raw.readUInt16LE(4);for(let p=6;p<end;p+=4){const key=raw.readUInt32LE(p);entries.set(key,1+(entries.get(key)??0));}}
 const keys=[...entries.keys()].sort((a,b)=>entries.get(b)-entries.get(a)||a-b).slice(0,254), rev=new Map(keys.map((key,k)=>[key,k])), dictionary=Buffer.alloc(2+4*keys.length);dictionary.writeUInt16LE(keys.length);keys.forEach((key,k)=>dictionary.writeUInt32LE(key,2+k*4));
 const dictRead=Array.from({length:dictionary.readUInt16LE()},(_,k)=>dictionary.readUInt32LE(2+4*k));
 const pack=(raw)=>{const keyEnd=6+4*raw.readUInt16LE(4),tmp=Buffer.alloc(keyEnd*2);let p=0;for(let k=6;k<keyEnd;k+=4){const key=raw.readUInt32LE(k),v=rev.get(key);tmp[p++]=v??255;if(v===undefined){tmp.writeUInt32LE(key,p);p+=4;}}return Buffer.concat([raw.subarray(0,6),tmp.subarray(0,p),raw.subarray(keyEnd)]);};
 const unpack=(raw)=>{const end=6+4*raw.readUInt16LE(4),head=Buffer.allocUnsafe(end);raw.copy(head,0,0,6);let p=6;for(let k=6;k<end;k+=4){const rank=raw[p++],v=rank===255?raw.readUInt32LE(p):dictRead[rank];if(rank===255)p+=4;head.writeUInt32LE(v,k);}return Buffer.concat([head,raw.subarray(p)]);};
 const 新模型=tag==='按世界重训'?学模型(function*(){for(const s of train)yield 解区段(s.raw,s.id,model);}):model;
 const next=(raw,id)=>tag==='整列引用'?引用解(raw,id,model):tag==='按世界重训'?解区段(raw,id,新模型):tag==='共用色板'?解区段(unpack(raw),id,model):tag==='迟建字面树'?迟解(raw,id,model):上下解(raw,id,model);
 let cells=0,bytesA=0,bytesB=0;for(const s of test){const old=解区段(s.raw,s.id,model);s.b=tag==='共用色板'?pack(s.raw):(tag==='迟建字面树'||tag==='整列引用')?s.raw:tag==='按世界重训'?压区段(old,新模型):上下压(old,model);const actual=next(s.b,s.id);assert.equal(old.kBottom,actual.kBottom);assert.equal(old.nz,actual.nz);assert.deepEqual(old.palette,actual.palette);assert.deepEqual(到列优先(old),到列优先(actual));cells+=old.nz*1156;bytesA+=s.raw.length;bytesB+=s.b.length;}
 const rounds=[];for(const variant of ['A','B','B','A']){const from=temp();const start=performance.now();let sum=0;for(let rep=0;rep<8;rep++)for(const s of test){const result=variant==='A'?解区段(s.raw,s.id,model):next(s.b,s.id);sum+=result.paletteIndex.length;}const ms=performance.now()-start;rounds.push({variant,ms,sum,from,to:temp()});}
 assert(rounds.every(r=>r.sum===rounds[0].sum));output.push({name,tag,train:train.length,n:test.length,byLevel:bins.map((b)=>Math.min(Math.floor(b.length/2),96)),bytesA,bytesB,extra:tag==='共用色板'?dictionary.length:tag==='按世界重训'?模型字节(新模型).length-模型字节(model).length:0,cells,rounds});
}
console.log(JSON.stringify(output,null,2));
