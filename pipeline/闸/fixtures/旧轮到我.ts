// 冻结旧轮询算法，验证活旧进程和新票共存；不要随实现一起改。
import fs from 'node:fs';
import path from 'node:path';
import {进程在吗} from './旧锁.ts';
const 票过期毫秒 = 60_000;
const 主机名片段 = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, '_');
type 票 = {文件: string; 名: string};
const 解析票 = (名: string) => {
  const m = /^(\d+)-(.+)-(\d+)$/.exec(名);
  return m ? { 时间: Number(m[1]), 主机: m[2]!, pid: Number(m[3]) } : null;
};

const 票还活着 = (dir: string, 名: string, 本机: string) => {
  const t = 解析票(名);
  if (!t) return false;
  if (t.主机 === 主机名片段(本机)) return 进程在吗(t.pid);
  try {
    return Date.now() - fs.statSync(path.join(dir, 名)).mtimeMs < 票过期毫秒;
  } catch {
    return false;
  }
};

/** 排在最前面的活票是不是我的；顺手删掉死票 */
export const 轮到我 = (dir: string, 我的: 票, 本机: string) => {
  const now = new Date();
  fs.utimesSync(我的.文件, now, now); // 别的机器按修改时间判活
  for (const 名 of fs.readdirSync(dir).sort()) {
    if (名 === 我的.名) return true;
    if (票还活着(dir, 名, 本机)) return false;
    fs.rmSync(path.join(dir, 名), { force: true });
  }
  return true;
};

