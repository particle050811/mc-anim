import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { 数据路径, 配置 } from '../环境/配置.ts';
import { 读发起者, type 发起者 } from './发起者.ts';
import { 记调度 } from './调度日志.ts';
import { 读JSON, 写JSON, 列文件, 只提示 } from './文件.ts';
import { 登记收尾 } from './收尾.ts';
import { pid换人了, 进程在吗 } from './锁.ts';
import { 取指令, 指令文件 } from './指令.ts';
import { 一分钟负载 } from '../环境/资源.ts';
export type 任务声明 = {
    种?: string;
    作品?: string;
    段?: string;
    帧数?: number;
    /** 帧号摘要：只为认出重复的票，帧多时截短。 */
    帧?: string;
    级别?: string;
    预计秒?: number | null;
    用途?: string;
    项数?: number;
    连贯?: {
        为什么: string;
    };
    不开渲染?: boolean;
    可让路?: boolean;
    需负载?: boolean;
};
export type 调度环境 = {
    锁目录: string;
    日志目录: string;
    调度目录: string;
    本机: string;
    发起者: 发起者;
    现在毫秒: () => number;
};
export type 任务信息 = {
    任务: string;
    起: number;
    心跳: number;
    发起: 发起者;
    声明: 任务声明;
    主机: string;
    票?: string;
    /** 被杀时说得清当时在干嘛；崩溃事件也从在跑文件带出来。 */
    当时?: '排队' | '持锁' | '';
    /** 后台转存（渲/后台转存.ts）做到哪：闸放开后这段还在占 CPU，持锁信息看不出来。 */
    后台?: { 在做: string | null; 排着: number };
};
const 活任务 = new Map<string, ReturnType<typeof 建任务>>();
export const 取调度环境 = (e: Partial<调度环境> = {}): 调度环境 => ({ 锁目录: e.锁目录 ?? 配置('锁目录'),
    日志目录: e.日志目录 ?? (e.锁目录 ? path.join(e.锁目录, 'logs') : 数据路径('run', 'logs', '调度')),
    调度目录: e.调度目录 ?? (e.锁目录 ? path.join(e.锁目录, 'state') : 数据路径('run', '调度')), 本机: e.本机 ?? 配置('主机'),
    发起者: e.发起者 ?? 读发起者(), 现在毫秒: e.现在毫秒 ?? Date.now });
const 建任务 = (e: 调度环境, 声明: 任务声明, 结束回调?: (码: number) => void) => {
    const now = e.现在毫秒();
    const info: 任务信息 = { 任务: `${now.toString(36)}-${process.pid}-${randomUUID().slice(0, 8)}`, 起: now, 心跳: now, 发起: e.发起者, 声明, 主机: e.本机 };
    const file = path.join(e.锁目录, '在跑', info.任务 + '.json');
    const 存 = () => 只提示('在跑登记', () => 写JSON(file, info));
    存();
    const 记 = (事: string, 字段: Record<string, unknown> = {}) => 记调度(e.日志目录, 事, { 任务: info.任务, 发起: info.发起, 声明: info.声明, ...字段 }, e.现在毫秒());
    记('任务起');
    只提示('盯未挂记录', () => 检查盯(e, info));
    let 完 = false;
    const 结束 = (码 = 0, 信号?: string, 错误?: string) => {
        if (完)
            return;
        完 = true;
        clearInterval(timer);
        撤();
        const 指令 = 取指令(e, info.任务), 取消 = 指令?.动作 === '取消' ? 指令 : undefined, 现在 = e.现在毫秒();
        if (信号) {
            if (取消)
                console.error(`被调度取消：${取消.为什么}，不要原样重发`);
            记('被杀', { 信号, 退出码: 码, 为什么: 取消?.为什么, 票: info.票, 当时: info.当时 || '其他', 已跑秒: (现在 - info.起) / 1000, 取消后秒: 取消?.时 ? (现在 - 取消.时) / 1000 : undefined, 机: { 负载: 一分钟负载() } });
        }
        记('任务止', { 票: info.票, 退出码: 码, 信号, 错误, 秒: (现在 - info.起) / 1000 });
        只提示('耗时记录', () => {
            if (结束回调)
                结束回调(码);
            else {
                const 表 = path.join(e.日志目录, '..', '耗时.tsv');
                fs.mkdirSync(path.dirname(表), { recursive: true });
                const 行 = [new Date(info.起).toISOString(), `脚本 ${声明.种 ?? '过闸'}`, ((e.现在毫秒() - info.起) / 1000).toFixed(1), 码, e.本机, info.发起.命令].join('\t') + '\n';
                fs.appendFileSync(表, 行);
            }
        });
        只提示('在跑登记', () => {
            fs.rmSync(file, { force: true });
            fs.rmSync(指令文件(e, info.任务), { force: true });
        });
        活任务.delete(e.锁目录);
    };
    const 撤 = 登记收尾(结束);
    const timer = setInterval(() => { info.心跳 = e.现在毫秒(); 存(); }, 30000);
    timer.unref();
    return { info, 记, 结束, 更新: (声明: 任务声明, 票?: string, 当时 = info.当时) => { info.声明 = 声明; info.票 = 票; info.当时 = 当时; 存(); }, 记后台: (后台: 任务信息['后台']) => { info.后台 = 后台; 存(); } };
};
export const 开任务 = (e: 调度环境, 声明: 任务声明, 结束?: (码: number) => void) => {
    let t = 活任务.get(e.锁目录);
    if (!t) {
        t = 建任务(e, 声明, 结束);
        活任务.set(e.锁目录, t);
    }
    return t;
};
export const 检查盯 = (e: 调度环境, 任务: 任务信息) => {
    const dir = path.join(e.调度目录, '盯');
    if (列文件(dir).some(n => { const x = 读JSON<{
        pid: number;
        会话: string;
    }>(path.join(dir, n)); return x && 进程在吗(x.pid) && x.会话 === e.发起者.会话; }))
        return;
    const f = path.join(e.调度目录, `未挂-${e.发起者.会话 || process.pid}.json`);
    const 旧 = 读JSON<{
        时: number;
    }>(f);
    if (旧 && e.现在毫秒() - 旧.时 < 600000)
        return;
    写JSON(f, { 时: e.现在毫秒() });
    console.error('!! 盯未挂：请主 Agent 挂 anim 调度 盯；任务照常排队');
    记调度(e.日志目录, '盯未挂', { 任务: 任务.任务, 发起: e.发起者 }, e.现在毫秒());
};
/** unlink 的胜者才记崩溃，多个等待者不会重复归因；跨主机不按本机 pid 猜死。 */
export const 清崩溃 = (e: 调度环境, 活 = (pid: number, 心跳: number) => 进程在吗(pid) && !pid换人了(pid, 心跳)) => {
    for (const 名 of 列文件(path.join(e.锁目录, '在跑'))) {
        const file = path.join(e.锁目录, '在跑', 名), t = 读JSON<任务信息>(file);
        if (!t || t.主机 !== e.本机 || 活(t.发起.pid, t.心跳))
            continue;
        try {
            fs.unlinkSync(file);
        }
        catch {
            continue;
        }
        记调度(e.日志目录, '崩溃', t, e.现在毫秒());
    }
};
export const 有任务 = (锁目录: string) => 活任务.has(锁目录);
/** CPU 后处理不占 GPU 锁；单独脚本也能登记，路由已有任务时只换可见阶段。 */
export const 登记CPU = async<T>(声明:任务声明,fn:()=>Promise<T>,环境:Partial<调度环境>={}):Promise<T> => {
    const e=取调度环境(环境),自建=!有任务(e.锁目录),t=开任务(e,声明),旧=t.info.声明;
    t.更新(声明);let code=1;
    try{const r=await fn();code=0;return r;}finally{if(自建)t.结束(code);else t.更新(旧);}
};
