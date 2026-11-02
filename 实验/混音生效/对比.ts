import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import { 配置, 母版目录 } from '../../pipeline/环境/配置.ts';
const out=import.meta.dirname,ffmpeg=配置('ffmpeg'),ffprobe=配置('ffprobe');
const hash=(p,stream)=>execFileSync(ffmpeg,['-v','error','-i',p,'-map',`0:${stream}`,'-c','copy','-f','md5','-'],{encoding:'utf8'}).trim().replace('MD5=','');
const pcm=p=>execFileSync(ffmpeg,['-v','error','-i',p,'-map','0:a','-f','s16le','-acodec','pcm_s16le','-'],{maxBuffer:128*1024*1024});
const compare=(a,b)=>{
 const x=pcm(a),y=pcm(b);let n=0,max=0,first=-1,last=-1,peakX=0,peakY=0;
 for(let i=0;i<Math.min(x.length,y.length);i+=2){const v=x.readInt16LE(i),w=y.readInt16LE(i),d=Math.abs(v-w);peakX=Math.max(peakX,Math.abs(v));peakY=Math.max(peakY,Math.abs(w));if(d){n++;max=Math.max(max,d);if(first<0)first=i/2;last=i/2;}}
 return {样本数:[x.length/2,y.length/2],不同样本数:n,最大差:max,首差秒:first<0?null:first/96000,末差秒:last<0?null:last/96000,峰值:[peakX,peakY],长度相同:x.length===y.length};
};
const master=母版目录('6-穿塔斩首领');
const names={旧:path.join(master,'5e2cea4915e41e66.x264.mkv'),新:path.join(master,'ad695bb669b9a05d.x264.mkv')};
const probe=JSON.parse(fs.readFileSync(path.join(out,'旧入口插桩.json'),'utf8'));
names.旧入口短段=probe.结果.轮[0].输出;
for(const name of ['a1','a2','b1','b2','c'])if(fs.existsSync(path.join(out,`${name}.wav`)))names[name]=path.join(out,`${name}.wav`);
const streams={};
for(const [name,file] of Object.entries(names)){
 const info=JSON.parse(execFileSync(ffprobe,['-v','error','-show_streams','-of','json',file],{encoding:'utf8'}));
 streams[name]={文件:file,视频md5:info.streams.some(s=>s.codec_type==='video')?hash(file,'v'):null,音频md5:hash(file,'a'),轨道:info.streams.map(s=>({类型:s.codec_type,编码:s.codec_name,采样率:s.sample_rate,声道:s.channels,时长:s.duration}))};
}
const diffs={};
for(const [a,b] of [['旧','新'],['a1','a2'],['b1','b2'],['b1','c'],['c','旧'],['c','新']])if(names[a]&&names[b])diffs[`${a}/${b}`]=compare(names[a],names[b]);
const short=pcm(names.旧入口短段);let nonzero=0,peak=0;for(let i=0;i<short.length;i+=2){const v=short.readInt16LE(i);if(v)nonzero++;peak=Math.max(peak,Math.abs(v));}
const lists={};
for(const name of ['a1','a2','b1','b2','c']){const file=path.join(out,`${name}-打乱后清单.json`);if(fs.existsSync(file))lists[name]=JSON.parse(fs.readFileSync(file,'utf8')).map(x=>JSON.stringify(x));}
const materials={};
for(const name of Object.keys(lists)){materials[name]={条数:lists[name].length,与a1内容多重集相同:JSON.stringify([...lists[name]].sort())===JSON.stringify([...lists.a1].sort()),与a1顺序不同位置:lists[name].filter((x,i)=>x!==lists.a1[i]).length};}
const result={streams,diffs,素材对照:materials,旧入口短段PCM:{样本数:short.length/2,非零样本:nonzero,峰值:peak}};
fs.writeFileSync(path.join(out,'最终对比.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
