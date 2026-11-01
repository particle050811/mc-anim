import path from 'node:path';
import {读JSON,写JSON} from './文件.ts';
import type {调度环境} from './任务.ts';
export type 指令={动作:string;为什么:string;时:number;至?:number;强?:boolean;票?:string;任务?:string};
export const 指令文件=(e:调度环境,id:string)=>path.join(e.锁目录,'指令',encodeURIComponent(id)+'.json');
export const 取指令=(e:调度环境,id:string)=>读JSON<指令>(指令文件(e,id));
export const 写指令=(e:调度环境,id:string,c:指令)=>写JSON(指令文件(e,id),c);
export const 令文件=(e:调度环境,路:string)=>path.join(e.调度目录,'令',encodeURIComponent(路));
export const 路让路=(e:调度环境)=>{
  const x=读JSON<{令:string;至:number}>(令文件(e,e.发起者.路));return e.发起者.路&&x&&x.至>e.现在毫秒()&&x.令.includes('让路')?x.令:null;
};
export const 让路退出码=75;
export class 调度让路 extends Error {退出码=让路退出码;}
