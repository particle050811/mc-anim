import fs from 'node:fs';
import { 全部段 } from '../../pipeline/清单/清单.ts';
const result=[];
for(const s of await 全部段()){
  const cues=s.段.声音??[],groups=new Map();
  for(const cue of cues){const frame=Math.max(0,cue.帧);groups.set(frame,(groups.get(frame)??0)+1);}
  const same=[...groups].filter(([,n])=>n>1);
  if(cues.length>=32&&same.length)result.push({段:s.键,声音条数:cues.length,相同起点组数:same.length,最大同起点条数:Math.max(...same.map(([,n])=>n)),同起点帧:same});
}
fs.writeFileSync(new URL('./声音统计.json',import.meta.url),JSON.stringify(result,null,2));
for(const r of result)console.log(`${r.段}\t${r.声音条数}\t${r.相同起点组数}\t${r.最大同起点条数}`);
