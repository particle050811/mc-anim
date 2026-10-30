// 预生成看守：起专用服务端、临时装上 Chunky、按计划发选区和 chunky start，盯到这一块跑完再关服；卡住、堆满就正常停服再 chunky continue，
// 跑完同一选区再扫一遍补洞（生成过的 Chunky 读盘就跳过，补的是中途被杀、没存进盘的区块）。旧项目 游戏取材/预生成看守.py 按本仓库重写。
// - 每次起服前过资源闸（放行闸：负载、内存够才开）。
// - 盯着（每 60 秒）：堆（jstat 的 OU / OGCMX，老年代占最大堆 ≥ 上限并且这一分钟 Full GC ≥ 2 次，或连着 3 分钟在上限以上）；
//   日志（卡住分钟内一行新日志都没有，先 jstack 存一份再停服续跑：光照线程抛 MissingPaletteEntryException 以后 Chunky 会一直等那几个区块）。
// - Chunky 的任务进度按维度存在 <服务端>/config/chunky/tasks/<命名空间>/<维度>.properties，不分世界：
//   那里有暂停着（cancelled=false）又不是这一块的任务就拒绝，不然会把别人的任务接着跑到这个世界里。
// - 日志目录里：<块>.out（服务端全部输出和看守的话）、<块>.状态.json（阶段、每次起服的起止、停服原因、进度；看守被杀了重跑同一条命令接着来）、
//   <块>.jstat.tsv（每分钟的老年代、Full GC、进度、速度）、<块>.jstack-<时间>.txt（卡住时的线程栈）。
import fs from 'node:fs';
import path from 'node:path';
import { 试跑 } from '../../环境/子进程.ts';
import { 过放行闸 } from '../../闸/闸.ts';
import { java程序, 服务端 } from '../服务端/服务端.ts';
import { 解析启用包, 开服前核对, 排序核对 } from '../服务端/核对.ts';
import { csv文本, type 预生成计划 } from './计划.ts';

export const 进度行 = /\[Chunky\] Task running for (\S+)\. Processed: (\d+) chunks \(([\d.]+)%\).*Rate: ([\d.]+) cps/;
export const 完成行 = /\[Chunky\] Task finished for (\S+)\. Processed: (\d+) chunks \(([\d.]+)%\), Total time: (\S+)/;

export type 进度 = { 区块: number; 百分比: number; 速度: number; 时间: string };
export type 完成 = { 区块: number; 百分比: number; 用时: string; 时间: string };
export type 看守状态 = {
  块: string;
  世界: string;
  存档: string;
  阶段: '主' | '补洞' | '完';
  起服: { 开始: string; 结束?: string; 命令: string[]; 退出码?: number | null; 停服原因?: string | null; 最后进度?: 进度 | null; 完成?: 完成 | null }[];
  完成: Partial<Record<'主' | '补洞', 完成>>;
};

export const 任务文件 = (服务端目录: string, 维度: string) => {
  const [ns, dim] = 维度.split(':') as [string, string];
  return path.join(服务端目录, 'config', 'chunky', 'tasks', ns, `${dim}.properties`);
};
export const 读任务 = (f: string): Record<string, string> => {
  if (!fs.existsSync(f)) return {};
  const o: Record<string, string> = {};
  for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
    const i = l.indexOf('=');
    if (i > 0) o[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  }
  return o;
};
/** 暂停着的任务是不是这一块的（选区中心、半径、图案对得上） */
export const 是这一块 = (t: Record<string, string>, p: 预生成计划) => {
  const 近 = (a: string | undefined, b: number) => a !== undefined && Math.abs(Number(a) - b) < 1e-6;
  // 矩形的 z 半径另存 radius-z（Chunky 1.3 的 TaskLoader）
  const 半径对 = 近(t.radius, p.选区.半边[0]) && (p.选区.形状 === 'square' || 近(t['radius-z'], p.选区.半边[1]));
  return 近(t['center-x'], p.选区.中心[0]) && 近(t['center-z'], p.选区.中心[1]) && 半径对 && t.pattern === p.图案 && (p.图案 !== 'csv' || t.csv === p.csv名);
};

/** 老年代占最大堆的百分比和 Full GC 次数。不用 jstat -gcutil 的 O 列：G1 下它是占「当前分到的」老年代的比例，刚起服时就到八九成 */
export const 读堆 = (pid: number): { 老年代: number; fullGC: number } | null => {
  const 列 = (opt: string) => {
    const r = 试跑([java程序('jstat'), opt, String(pid)]);
    const 行 = r.stdout.trim().split('\n');
    if (行.length < 2) return {};
    const ks = 行[0]!.trim().split(/\s+/), vs = 行[1]!.trim().split(/\s+/);
    return Object.fromEntries(ks.map((k, i) => [k, Number(vs[i])]));
  };
  const gc = 列('-gc'), cap = 列('-gccapacity');
  if (!(gc.OU! >= 0) || !(cap.OGCMX! > 0) || !(gc.FGC! >= 0)) return null;
  return { 老年代: (100 * gc.OU!) / cap.OGCMX!, fullGC: gc.FGC! };
};

export type 看守选项 = {
  世界: string;
  维度: string;
  服务端目录: string;
  存档: string;
  加载器版本?: string;
  chunky: string;
  日志目录: string;
  堆?: string;
  生成线程?: number;
  老年代上限?: number;
  卡住分钟?: number;
  不补洞?: boolean;
  不过闸?: boolean;
  重来?: boolean;
  /** 测试用：盯的间隔（默认 60 秒） */
  盯间隔秒?: number;
  说: (s: string) => void;
};

const 现在 = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');

export const 跑一块 = async (p: 预生成计划, o: 看守选项): Promise<看守状态> => {
  fs.mkdirSync(o.日志目录, { recursive: true });
  const 名 = p.块.名;
  const OUT = path.join(o.日志目录, `${名}.out`);
  const STATE = path.join(o.日志目录, `${名}.状态.json`);
  const JSTAT = path.join(o.日志目录, `${名}.jstat.tsv`);
  const 说 = (s: string) => {
    o.说(s);
    fs.appendFileSync(OUT, `[看守 ${现在()}] ${s}\n`);
  };
  const 存 = (s: 看守状态) => {
    fs.writeFileSync(`${STATE}.tmp`, JSON.stringify(s, null, 1));
    fs.renameSync(`${STATE}.tmp`, STATE);
  };
  let st: 看守状态 = !o.重来 && fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : { 块: 名, 世界: o.世界, 存档: o.存档, 阶段: '主', 起服: [], 完成: {} };
  if (st.存档 !== o.存档) throw new Error(`${STATE} 记的是存档 ${st.存档}，这次是 ${o.存档}；要从头来加 --重来`);
  if (st.阶段 === '完') {
    说(`${名} 已经跑完（${STATE}）；要再跑一遍加 --重来`);
    return st;
  }
  const 任务 = 任务文件(o.服务端目录, o.维度);
  if (p.图案 === 'csv') {
    const 到 = path.join(o.服务端目录, 'config', 'chunky', `${p.csv名}.csv`);
    const 文 = csv文本(p.区块!);
    if (!fs.existsSync(到) || fs.readFileSync(到, 'utf8') !== 文) {
      const t = 读任务(任务);
      if (t.cancelled === 'false' && 是这一块(t, p)) throw new Error(`${到} 和这次算的区块列表不一样，可这一块的任务还暂停着：续跑时 Chunky 按条数跳过，换了列表就对不上。先 chunky cancel 或换回原来的列表`);
      fs.mkdirSync(path.dirname(到), { recursive: true });
      fs.writeFileSync(到, 文);
    }
  }
  const 前查 = 开服前核对(o.服务端目录, o.存档);
  if (前查.问题.length) throw new Error(前查.问题.join('\n'));
  const 上限 = o.老年代上限 ?? 90, 卡住毫秒 = (o.卡住分钟 ?? 10) * 60_000, 间隔 = (o.盯间隔秒 ?? 60) * 1000;

  while (st.阶段 !== '完') {
    const t = 读任务(任务);
    const 暂停着 = t.cancelled === 'false';
    if (暂停着 && !是这一块(t, p)) throw new Error(`${任务} 里有暂停着的别的任务（中心 ${t['center-x']}, ${t['center-z']}，图案 ${t.pattern}），先跑完或 chunky cancel`);
    if (!o.不过闸) await 过放行闸(async () => {});
    const 命令 = 暂停着 ? ['chunky continue'] : [...p.步骤.map(([c]) => c), 'chunky start'];
    const 记录: 看守状态['起服'][number] = { 开始: 现在(), 命令 };
    st.起服.push(记录);
    存(st);
    说(`${st.阶段}：起服，${暂停着 ? '续跑' : `选区 ${p.选区.形状} 中心 ${p.选区.中心.join(', ')} 半边 ${p.选区.半边.join(' × ')}，${p.图案}，${p.区块数} 个区块`}`);
    let 最后进度: 进度 | null = null, 完了: 完成 | null = null, 上次打印 = 0;
    const s = await 服务端.起({
      目录: o.服务端目录,
      存档: o.存档,
      加载器版本: o.加载器版本,
      堆: o.堆,
      生成线程: o.生成线程,
      临时模组: [o.chunky],
      提示: 说,
      每行: (l) => {
        fs.appendFileSync(OUT, `${l}\n`);
        const m = 进度行.exec(l);
        if (m && m[1] === o.维度) {
          最后进度 = { 区块: Number(m[2]), 百分比: Number(m[3]), 速度: Number(m[4]), 时间: 现在() };
          if (Date.now() - 上次打印 > 30_000) {
            上次打印 = Date.now();
            o.说(`  ${m[2]} 区块（${m[3]}%），${m[4]} 区块/秒`);
          }
        }
        const f = 完成行.exec(l);
        if (f && f[1] === o.维度) 完了 = { 区块: Number(f[2]), 百分比: Number(f[3]), 用时: f[4]!, 时间: 现在() };
      },
    });
    let 原因: string | null = null;
    try {
      if (前查.要盖.length) {
        s.发('datapack list enabled');
        const 行 = await s.等('data pack(s) enabled', 30);
        const 问题 = 排序核对(o.存档, 前查.要盖, 解析启用包(行 ?? ''));
        if (!行 || 问题.length) throw new Error(行 ? 问题.join('\n') : '/datapack list enabled 30 秒没回');
        说(`数据包 ${前查.要盖.join('、')} 已启用、排在它覆盖的包之上`);
      }
      if (暂停着) {
        s.发('chunky continue');
        if (!(await s.等('Task continuing for', 30))) throw new Error('chunky continue 30 秒没回「Task continuing for」');
      } else {
        for (const [c, 回] of p.步骤) {
          s.发(c);
          if (!(await s.等(回, 30))) throw new Error(`${c} 以后 30 秒内日志里没有「${回}」，选区没改成，停服（不发 chunky start）`);
        }
        s.发('chunky start');
        const 回 = await s.等((l) => l.includes('Task started in') || l.includes('A task was already started'), 30);
        if (!回 || 回.includes('already started')) throw new Error(`chunky start 没开始：${回 ?? '30 秒没回'}`);
      }
      const 等完 = s.等((l) => 完成行.exec(l)?.[1] === o.维度, Infinity);
      let 前FGC: number | null = null, 连着 = 0;
      const 盯 = setInterval(() => {
        if (原因 || !s.在跑) return;
        const 堆 = s.pid ? 读堆(s.pid) : null;
        if (堆) {
          const 增 = 前FGC === null ? 0 : 堆.fullGC - 前FGC;
          前FGC = 堆.fullGC;
          const 进 = 最后进度 as 进度 | null;
          fs.appendFileSync(JSTAT, `${现在()}\t${堆.老年代.toFixed(1)}\t${堆.fullGC}\t${进?.区块 ?? ''}\t${进?.速度 ?? ''}\n`);
          连着 = 堆.老年代 >= 上限 ? 连着 + 1 : 0;
          if (堆.老年代 >= 上限 && (增 >= 2 || 连着 >= 3)) 原因 = `堆满：老年代占最大堆 ${堆.老年代.toFixed(0)}%，这一分钟 Full GC ${增} 次`;
        }
        if (!原因 && Date.now() - s.最后一行时间 > 卡住毫秒) {
          原因 = `卡住：${(卡住毫秒 / 60_000).toFixed(0)} 分钟没有新日志`;
          if (s.pid) {
            const f = path.join(o.日志目录, `${名}.jstack-${现在().replace(/[:-]/g, '')}.txt`);
            fs.writeFileSync(f, 试跑([java程序('jstack'), String(s.pid)]).stdout);
            说(`线程栈存到 ${f}`);
          }
        }
        if (原因) {
          说(`${原因}，正常停服以后续跑`);
          void s.停();
        }
      }, 间隔);
      try {
        await 等完;
      } finally {
        clearInterval(盯);
      }
      if (s.出错) throw s.出错;
    } finally {
      记录.退出码 = await s.停();
      Object.assign(记录, { 结束: 现在(), 停服原因: 原因, 最后进度, 完成: 完了 });
      存(st);
    }
    if (完了) {
      st.完成[st.阶段 as '主' | '补洞'] = 完了;
      const 下: 看守状态['阶段'] = st.阶段 === '主' && !o.不补洞 ? '补洞' : '完';
      说(`${st.阶段}这一遍跑完：${(完了 as 完成).区块} 个区块，用时 ${(完了 as 完成).用时}；下一步 ${下}`);
      st.阶段 = 下;
      存(st);
    } else if (!原因) throw new Error(`服务端退出了但任务没跑完（${STATE}），看 ${OUT} 和服务端 logs/latest.log`);
  }
  说(`${名} 跑完了`);
  return st;
};
