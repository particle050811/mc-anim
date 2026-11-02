// 独立留档实验：不改 node_modules，不接生产环境变量，不进指纹；输出全在本目录。
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const dist = path.dirname(require.resolve('@remotion/renderer'));
const mixing = require(path.join(dist, 'assets/inline-audio-mixing.js'));
const raw = mixing.makeInlineAudioMixing;
const renderer = await import('../../pipeline/渲/渲染器.ts');
const production = mixing.makeInlineAudioMixing;
const { 固定混音顺序 } = await import('../../pipeline/渲/混音顺序.ts');
const { 开会话 } = await import('../../pipeline/渲/渲.ts');
const { 选段 } = await import('../../pipeline/清单/清单.ts');
const { 过渲染闸 } = await import('../../pipeline/闸/闸.ts');
const { 段渲染环境, 段现在的地形 } = await import('../../pipeline/渲/地形注入.ts');
const { 等帧超时毫秒 } = await import('../../pipeline/渲/设置.ts');
const { 配置 } = await import('../../pipeline/环境/配置.ts');
const { mulberry32 } = await import('../../engine/core/数学.ts');
const out = import.meta.dirname;
const ffmpeg = 配置('ffmpeg');
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const md5 = (p) => execFileSync(ffmpeg, ['-v','error','-i',p,'-map','0:a','-c','copy','-f','md5','-'],{encoding:'utf8'}).trim();
const pcm = (p) => execFileSync(ffmpeg, ['-v','error','-i',p,'-map','0:a','-f','s16le','-acodec','pcm_s16le','-'], {maxBuffer:128*1024*1024});
const compare = (a,b) => {
  const x=pcm(a),y=pcm(b); let n=0,max=0,first=-1,last=-1;
  for(let i=0;i<Math.min(x.length,y.length);i+=2){const d=Math.abs(x.readInt16LE(i)-y.readInt16LE(i)); if(d){n++;max=Math.max(max,d);if(first<0)first=i/2;last=i/2;}}
  return {样本数:[x.length/2,y.length/2],不同样本数:n,最大差:max,首差秒:first<0?null:first/2/48000,末差秒:last<0?null:last/2/48000,长度相同:x.length===y.length};
};
const shuffle = (items,seed) => {
  const random=mulberry32(seed), result=[...items];
  for(let i=0;i<result.length;){let end=i+1;while(end<result.length&&result[end].startInSamples===result[i].startInSamples)end++;
    for(let j=end-1;j>i;j--){const k=i+Math.floor(random()*(j-i+1));[result[j],result[k]]=[result[k],result[j]];} i=end;
  } return result;
};
const [segment] = await 选段(['6-穿塔斩首领']);
const results=[];
const take = require(path.join(dist,'take-frame.js')), shot=require(path.join(dist,'puppeteer-screenshot.js'));
const origTake=take.takeFrame, origShot=shot.screenshot;
let captures=0,none=0,takes=0;
take.takeFrame=(o)=>{takes++;if(o.imageFormat==='none')none++;return origTake(o);};
shot.screenshot=(...args)=>{captures++;return origShot(...args);};
await 开会话('视频',async h=>{
  const composition=h.组合.find(c=>c.id===segment.键);
  for(const [name,seed,fixed] of [['a1',1,false],['a2',2,false],['b1',1,true],['b2',2,true],['c',null,true]]) {
    const result=await 过渲染闸(async()=>{
      let factories=0,lists=[];captures=0;none=0;takes=0;
      if(seed===null) mixing.makeInlineAudioMixing=(...args)=>{factories++;const m=production(...args);return {...m,getListOfAssets:()=>{const items=m.getListOfAssets();lists=items.map(x=>({start:x.startInSamples,duration:x.durationInSamples,sha:sha(x.outName)}));return items;}};};
      else {
        mixing.makeInlineAudioMixing=(...args)=>{
          factories++;const m=raw(...args);
          return {...m,getListOfAssets:()=>{
            const items=shuffle(m.getListOfAssets(),seed);
            lists=items.map(x=>({start:x.startInSamples,duration:x.durationInSamples,sha:sha(x.outName)}));
            return items;
          }};
        };
        if(fixed)固定混音顺序();
      }
      const output=path.join(out,`${name}.wav`),t=Date.now();
      console.log(`START ${name} ${new Date().toISOString()}`);
      let mark=0;
      await renderer.renderMedia({
        serveUrl:h.serveUrl,composition,outputLocation:output,inputProps:h.参数.inputProps,
        envVariables:段渲染环境(segment.键,段现在的地形(segment)),puppeteerInstance:h.browser,
        chromiumOptions:{gl:h.参数.gl},codec:'wav',audioCodec:h.参数.audioCodec,
        scale:h.参数.scale,concurrency:h.参数.concurrency,enforceAudioTrack:true,
        timeoutInMilliseconds:等帧超时毫秒,overwrite:false,logLevel:'error',
        onProgress:p=>{if(p.renderedFrames>=mark+200){mark=p.renderedFrames;console.log(`${name} frame ${mark} ${(Date.now()-t)/1000}s`);}},
      });
      const seconds=(Date.now()-t)/1000;
      fs.writeFileSync(path.join(out,`${name}-打乱后清单.json`),JSON.stringify(lists,null,2));
      return {name,seed,fixed,output,秒:seconds,工厂调用:factories,takeFrame调用:takes,none调用:none,截图调用:captures,声音条数:lists.length,视频md5:null,音频md5:md5(output)};
    },undefined,{}, {种:'bench',作品:'应力转动',段:segment.键,帧数:segment.段.帧数,用途:'混音生效纯音频对照'});
    results.push(result); console.log('RESULT '+JSON.stringify(result));
    fs.writeFileSync(path.join(out,'音频对照.json'),JSON.stringify(results,null,2));
    if(name==='a2'){
      const diff=compare(results[0].output,result.output);fs.writeFileSync(path.join(out,'负对照差异.json'),JSON.stringify(diff,null,2));
      console.log('NEGATIVE '+JSON.stringify(diff));
      if(!diff.不同样本数)throw new Error('负对照未产生音频差异：按任务要求停止，不宣称修好');
    }
    if(name==='b2'){
      const diff=compare(results[2].output,result.output);fs.writeFileSync(path.join(out,'修后差异.json'),JSON.stringify(diff,null,2));
      console.log('FIXED '+JSON.stringify(diff));
      if(diff.不同样本数||!diff.长度相同)throw new Error('修后仍不一致：停止');
    }
    if(name==='c')fs.writeFileSync(path.join(out,'生产差异.json'),JSON.stringify(compare(results[3].output,result.output),null,2));
  }
});
