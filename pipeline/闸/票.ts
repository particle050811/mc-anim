import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { 进程在吗 } from './锁.ts';
import { 读JSON, 写JSON, 列文件 } from './文件.ts';
import type { 任务信息, 任务声明 } from './任务.ts';
import type { 发起者 } from './发起者.ts';
export type 票内容 = {
    v: 1;
    任务: string;
    起: number;
    发起: 发起者;
    声明: 任务声明;
    原序?: string;
    暂缓至?: number;
    等内存起?: number;
    卡在?: string;
    已被越?: number;
};
export type 票 = {
    文件: string;
    名: string;
    pid: number;
    主机: string;
    时间: number;
    内容: 票内容 | null;
};
export const 主机片段 = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, '_');
export const 解析票 = (名: string) => { const m = /^(\d+)-(.+)-(\d+)$/.exec(名); return m ? { 时间: Number(m[1]), 主机: m[2]!, pid: Number(m[3]) } : null; };
export const 列票 = (dir: string): 票[] => 列文件(dir).sort().flatMap(名 => { const x = 解析票(名); if (!x)
    return []; const 文件 = path.join(dir, 名), 内容 = 读JSON<票内容>(文件); return [{ ...x, 文件, 名, 内容: 内容?.v === 1 ? 内容 : null }]; });
let 序 = 0;
export const 领票 = (dir: string, 本机: string, 任务: 任务信息, now: number): 票 => {
    fs.mkdirSync(dir, { recursive: true });
    序 = Math.max(Date.now(), 序 + 1);
    const 名 = `${String(序).padStart(15, '0')}-${主机片段(本机)}-${process.pid}`;
    const 内容: 票内容 = { v: 1, 任务: 任务.任务, 起: now, 发起: 任务.发起, 声明: 任务.声明 };
    const 文件 = path.join(dir, 名);
    写JSON(文件, 内容);
    return { 名, 文件, 内容, pid: process.pid, 主机: 主机片段(本机), 时间: 序 };
};
export const 票活着 = (t: 票, 本机: string) => {
    if (t.主机 === 主机片段(本机))
        return 进程在吗(t.pid) && (()=>{try{return fs.statSync(t.文件).mtimeMs>=Date.now()-os.uptime()*1000;}catch{return false;}})();
    try {
        return Date.now() - fs.statSync(t.文件).mtimeMs < 60000;
    }
    catch {
        return false;
    }
};
export const 改序 = (t: 票, 序: string) => {
    if (!t.内容)
        throw Error('旧票拒绝改名：旧代码不能重新找票；只能等或取消');
    const 名 = `${序.padStart(15, '0')}-${t.主机}-${t.pid}`, 文件 = path.join(path.dirname(t.文件), 名);
    fs.renameSync(t.文件, 文件);
    return { ...t, 名, 文件, 时间: Number(序) };
};
export const 回队尾 = (t: 票, 原序 = false) => 改序(t, 原序 && t.内容?.原序 ? t.内容.原序 : String(Math.max(Date.now(), ...列票(path.dirname(t.文件)).filter(x => !x.名.startsWith('9')).map(x => x.时间)) + 1));
