import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
export const 读JSON = <T>(file: string): T | null => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) as T; } catch { return null; } };
/** 临时文件不放票目录：旧轮询会把不认识的名字当死票删除。 */
export const 写JSON = (file: string, value: unknown) => {
  fs.mkdirSync(path.dirname(file), {recursive:true});
  const tmp = path.join(path.dirname(path.dirname(file)), `.anim-${process.pid}-${randomUUID()}.tmp`);
  try { fs.writeFileSync(tmp, JSON.stringify(value)+'\n'); fs.renameSync(tmp,file); }
  finally { fs.rmSync(tmp,{force:true}); }
};
export const 列文件 = (dir: string) => { try {return fs.readdirSync(dir);} catch {return [];} };
