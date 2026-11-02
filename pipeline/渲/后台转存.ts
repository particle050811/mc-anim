// 后台转存（目标：全片母版墙钟接近出帧时间）：一段 CRF1 写好就放开渲染闸让下一段出帧，这段的 派生段签、转存、删 CRF1、删旧 在后台做（后处理.ts），batch 末尾等齐才返回。
// 为什么用子进程不留在本进程：派生段签有同步 ffprobe、灰度帧和逐像素块均值，实测把事件循环堵到半秒（renderMedia 的截图、编码管道都靠它）；明细收集 又在出帧时劫持 console.log，同进程的日志会被吞；子进程杀得干净。
// 每段一个子进程，一次一个（后台队列.ts），环境里去掉祖先持锁变量：下一段可能正持着闸。没进日志的中间状态（在做谁、排着几段）写在 在跑 登记里，anim 调度 看得到。
// 这里不过闸也不看别人的票：后台不占渲染闸，内存不够自己让（后处理.ts 的 等内存够）；macOS 上钳 QoS（后台QoS），出帧才不被挤慢。
import spawn from 'cross-spawn';
import path from 'node:path';
import { 祖先持锁变量 } from '../闸/闸.ts';
import { 登记收尾 } from '../闸/收尾.ts';
import { 只提示 } from '../闸/文件.ts';
import { 取调度环境, 开任务, 有任务 } from '../闸/任务.ts';
import { 记调度 } from '../闸/调度日志.ts';
import { 记阶段, type 阶段记录 } from '../运行记录/阶段.ts';
import type { 运行记录 } from '../运行记录/记录.ts';
import { 作品名 } from '../环境/作品.ts';
import { 后台QoS } from '../环境/子进程.ts';
import { 建后台队列 } from './后台队列.ts';
import type { 后台消息 } from './后台转存入口.ts';
import type { 后处理参数, 后处理结果 } from './后处理.ts';

export type 后台钩子 = {
  阶段: (rs: 阶段记录[]) => void;
  警告: (文本: string) => void;
  等内存: (事: '起' | '止', 字段: Record<string, unknown>) => void;
};
/** null：子进程没交结果就没了（被杀、起不来） */
export type 跑后台 = (p: 后处理参数, h: 后台钩子) => Promise<后处理结果 | null>;

const 默认入口 = path.join(import.meta.dirname, '后台转存入口.ts');

export const 跑后台子进程 = (p: 后处理参数, h: 后台钩子, 入口 = 默认入口): Promise<后处理结果 | null> =>
  new Promise((resolve) => {
    const env = { ...process.env };
    delete env[祖先持锁变量];
    const [命令, ...参数] = 后台QoS([process.execPath, 入口, JSON.stringify(p)]);
    const child = spawn(命令!, 参数, { stdio: ['ignore', 'inherit', 'inherit', 'ipc'], env });
    const 撤 = 登记收尾(() => void child.kill('SIGTERM'));
    let 结果: 后处理结果 | null = null;
    child.on('message', (m) => {
      const x = m as 后台消息;
      if (x.类 === '警告') h.警告(x.文本);
      else if (x.类 === '等内存') h.等内存(x.事, x.字段);
      else {
        h.阶段(x.阶段);
        结果 = x.结果;
      }
    });
    // 起不来时 close 也会来；报一声就够
    child.on('error', (e) => h.警告(`${p.键} 的后台转存起不来（${e.message}）`));
    child.on('close', () => {
      撤();
      resolve(结果);
    });
  });

const 调度记 = (事: string, 字段: Record<string, unknown>) =>
  只提示('调度日志', () => {
    const e = 取调度环境();
    if (有任务(e.锁目录)) 开任务(e, {}).记(事, 字段);
    else 记调度(e.日志目录, 事, 字段, e.现在毫秒());
  });

const 秒 = (起: number) => (Date.now() - 起) / 1000;

/** 一批 render 的后台：渲.ts 用它排段、限流、等齐。阶段记录交回运行记录（阶段表由子进程自己写），调度日志由这边记（子进程没有任务） */
export const 建后台转存 = (o: { 级别: string; 留CRF1: boolean; 记录: Pick<运行记录, '记' | '阶段'>; 跑?: 跑后台 }) => {
  const 队列 = 建后台队列({ 出错: (名, e) => o.记录.记('警告', `${名} 的后台转存出错（${(e as Error).message.split('\n')[0]}），CRF1 留着，用到时再转`) });
  const 跑 = o.跑 ?? 跑后台子进程;
  const 报现状 = () =>
    只提示('在跑登记', () => {
      const e = 取调度环境();
      if (!有任务(e.锁目录)) return;
      const { 在做, 排着 } = 队列.现状();
      开任务(e, {}).记后台(在做 || 排着.length ? { 在做, 排着: 排着.length } : undefined);
    });
  let 排过 = false;
  return {
    /** 排一段；完 在这段后台收工时调（子进程没交结果时是 null，警告这里已报） */
    排: (段: { 键: string; 指纹: string; 标签: string; 续补?: boolean }, 完: (x: 后处理结果 | null) => void | Promise<void>) => {
      排过 = true;
      const 短 = 段.指纹.slice(0, 16);
      const 排于 = Date.now();
      调度记('后台排', { 段: 段.键, 指纹: 短, 续补: 段.续补 ?? false, 排着: 队列.现状().排着.length });
      队列.排({
        名: 段.键,
        做: async () => {
          const 起 = Date.now();
          调度记('后台起', { 段: 段.键, 指纹: 短, 等秒: 秒(排于) });
          报现状();
          let 等内存秒 = 0;
          let x: 后处理结果 | null = null;
          try {
            x = await 跑({ 键: 段.键, 指纹: 段.指纹, 级别: o.级别, 作品: 作品名(), 留CRF1: o.留CRF1, 标签: 段.标签, 续补: 段.续补 }, {
              阶段: (rs) => void o.记录.阶段.push(...rs),
              警告: (s) => o.记录.记('警告', s),
              等内存: (事, 字段) => {
                if (事 === '止') 等内存秒 += Number(字段.秒 ?? 0);
                调度记(`后台等内存${事}`, { 段: 段.键, 指纹: 短, ...字段 });
              },
            });
            if (!x) o.记录.记('警告', `${段.键} 的后台转存中断，CRF1 留着，下次 anim render 或 film 接着补`);
          } finally {
            调度记('后台止', { 段: 段.键, 指纹: 短, 秒: 秒(起), 等内存秒, 结果: x?.结局 ?? '中断' });
            await 完(x);
            报现状();
          }
        },
      });
    },
    /** 排着的满了就等，等了才记 */
    等空位: async (段键: string, 标签: string) => {
      const t = Date.now();
      await 队列.等空位();
      if (Date.now() - t < 100) return;
      记阶段(o.记录.阶段, 标签, '等后台', t, 秒(t));
      调度记('后台满', { 段: 段键, 秒: 秒(t) });
    },
    /** batch 末尾。阶段记在总标签下，看得出后台比出帧落后多少 */
    等齐: async (标签: string) => {
      if (!排过) return;
      const t = Date.now();
      const { 在做, 排着 } = 队列.现状();
      if (在做) console.log(`== 等后台转存：${[在做, ...排着].join('、')}`);
      await 队列.等齐();
      记阶段(o.记录.阶段, 标签, '等后台', t, 秒(t));
      调度记('后台等齐', { 秒: 秒(t) });
    },
  };
};
