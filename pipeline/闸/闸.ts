// 资源闸：重任务开跑前过这道闸。规则照旧项目 参考模型库/工具/资源闸.py（用户 10-04、10-05 定）：
//   渲染：渲染之间一个一个来（抢同一块 GPU），拿到「渲染」锁后只等内存够，不看负载；
//   放行：别的重任务等 1 分钟负载低于核数 × 0.8、空闲内存不低于下限，两次放行至少隔 60 秒（「上次放行」文件和旧项目共用）。
// 新加排队票：sr 的等待者在 <锁目录>/<名>.排队/ 里按先来后到排，轮到自己才去抢锁，批量渲染不再插队（全局记忆 10-05「渲染锁靠抢、不排队」）。
// 旧项目的工具不认票，照旧直接抢；票只管 sr 之间的先后。
import fs from 'node:fs';
import path from 'node:path';
import { 配置 } from '../环境/配置.ts';
import { 内存够渲染, 读内存, 读数说明, 核数, 一分钟负载 } from '../环境/资源.ts';
import { 持有者, 试拿, 放, 锁文件, 进程在吗 } from './锁.ts';

const 票过期毫秒 = 60_000;
const 放行间隔秒 = 60;
const 负载上限比 = 0.8;

/** 子孙进程知道祖先已经拿着渲染锁（和旧资源闸同名） */
export const 祖先持锁变量 = 'MCAI_RENDER_LOCK_PID';

const 睡 = (ms: number) => new Promise((r) => setTimeout(r, ms));
const 主机名片段 = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, '_');

// 进程退出（含 Ctrl-C）时放掉还拿着的锁、删掉自己的票
const 收尾 = new Set<() => void>();
let 装了退出钩子 = false;
const 登记收尾 = (fn: () => void) => {
  收尾.add(fn);
  if (!装了退出钩子) {
    装了退出钩子 = true;
    process.on('exit', () => {
      for (const f of 收尾) f();
    });
    for (const sig of ['SIGINT', 'SIGTERM'] as const) process.once(sig, () => process.exit(130));
  }
  return () => 收尾.delete(fn);
};

type 票 = { 文件: string; 名: string };

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

const 领票 = (dir: string, 本机: string): 票 => {
  fs.mkdirSync(dir, { recursive: true });
  const 名 = `${String(Date.now()).padStart(15, '0')}-${主机名片段(本机)}-${process.pid}`;
  const 文件 = path.join(dir, 名);
  fs.writeFileSync(文件, `${process.pid}\n`, 'utf8');
  return { 文件, 名 };
};

/** 排在最前面的活票是不是我的；顺手删掉死票 */
const 轮到我 = (dir: string, 我的: 票, 本机: string) => {
  const now = new Date();
  fs.utimesSync(我的.文件, now, now); // 别的机器按修改时间判活
  for (const 名 of fs.readdirSync(dir).sort()) {
    if (名 === 我的.名) return true;
    if (票还活着(dir, 名, 本机)) return false;
    fs.rmSync(path.join(dir, 名), { force: true });
  }
  return true;
};

export type 锁柄 = { 文件: string; 放: () => void };

/** 排队拿一把锁：按票的先后，轮到了才抢；抢不到（旧项目的工具拿着）就接着等 */
export const 排队拿 = async (名: string, opts: { 锁目录?: string; 本机?: string; 间隔毫秒?: number; 等待提示?: (持有者: string) => void } = {}): Promise<锁柄> => {
  const 锁目录 = opts.锁目录 ?? 配置('锁目录');
  const 本机 = opts.本机 ?? 配置('主机');
  const 间隔 = opts.间隔毫秒 ?? 3000;
  const file = 锁文件(锁目录, 名);
  const 票目录 = path.join(锁目录, `${名}.排队`);
  const 我的票 = 领票(票目录, 本机);
  const 删票 = () => fs.rmSync(我的票.文件, { force: true });
  const 撤 = 登记收尾(删票);
  let 上回 = '';
  try {
    for (;;) {
      if (轮到我(票目录, 我的票, 本机) && 试拿(file, 本机)) break;
      // 换了持有者再说一遍（旧项目的工具不认票，锁放开时可能被它抢先）
      const 现在 = fs.existsSync(file) ? `锁在 pid ${持有者(file) ?? '?'} 手里` : '前面还有人排队';
      if (现在 !== 上回 && opts.等待提示) opts.等待提示(现在);
      上回 = 现在;
      await 睡(间隔);
    }
  } finally {
    删票();
    撤();
  }
  const 撤锁 = 登记收尾(() => 放(file));
  return {
    文件: file,
    放: () => {
      放(file);
      撤锁();
    },
  };
};

/** 过渲染闸跑 fn：排队拿「渲染」锁，再等内存够（取不到内存读数的系统直接跑，和旧资源闸一样） */
export const 过渲染闸 = async <T>(fn: () => Promise<T>, 提示: (s: string) => void = (s) => console.error(`== 资源闸：${s}`)): Promise<T> => {
  const 柄 = await 排队拿('渲染', { 等待提示: (s) => 提示(`渲染排队（${s}）`) });
  try {
    const 下限 = Number(配置('渲染内存下限'));
    let 说过 = false;
    for (let m = 读内存(); m && !内存够渲染(m, 下限); m = 读内存()) {
      if (!说过) 提示(`渲染等内存（${读数说明(m)}，下限 ${下限}%）`);
      说过 = true;
      await 睡(10_000);
    }
    const m = 读内存();
    提示(`放行渲染${m ? `（${读数说明(m)}）` : ''}`);
    process.env[祖先持锁变量] = String(process.pid);
    return await fn();
  } finally {
    delete process.env[祖先持锁变量];
    柄.放();
  }
};

/** 过放行闸：等负载和内存都够、离上次放行满 60 秒，记下放行时间就放锁，fn 不占锁 */
export const 过放行闸 = async <T>(fn: () => Promise<T>, 提示: (s: string) => void = (s) => console.error(`== 资源闸：${s}`)): Promise<T> => {
  const 柄 = await 排队拿('放行', { 等待提示: (s) => 提示(`放行排队（${s}）`) });
  const 上次文件 = path.join(配置('锁目录'), '上次放行');
  try {
    const 下限 = Number(配置('渲染内存下限'));
    let 说过 = false;
    for (;;) {
      let 上次 = 0;
      try {
        上次 = Number(fs.readFileSync(上次文件, 'utf8').trim()) || 0;
      } catch {
        // 没放行过
      }
      const m = 读内存();
      const load = 一分钟负载();
      const 够 = Date.now() / 1000 - 上次 >= 放行间隔秒 && (load === null || load < 核数() * 负载上限比) && (!m || m.空闲百分比 >= 下限);
      if (够) break;
      if (!说过) 提示(`等资源（1 分钟负载 ${load?.toFixed(2) ?? '无'}，上限 ${核数()}×${负载上限比}${m ? '；' + 读数说明(m) : ''}）`);
      说过 = true;
      await 睡(10_000);
    }
    fs.writeFileSync(上次文件, `${Math.floor(Date.now() / 1000)}\n`, 'utf8');
  } finally {
    柄.放();
  }
  return fn();
};
