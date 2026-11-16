// 预生成看守：起专用服务端、临时装上 Chunky、按计划发选区和 chunky start，盯到这一块跑完再关服；卡住、堆满就正常停服再 chunky continue，
// 跑完同一选区再扫一遍补洞（生成过的 Chunky 读盘就跳过，补的是中途被杀、没存进盘的区块）。旧项目 游戏取材/预生成看守.py 按本仓库重写。
// - 每次起服前过资源闸（放行闸：负载、内存够才开）。
// - 盯着（每 60 秒）：堆（jstat 的 OU / OGCMX，老年代占最大堆 ≥ 上限并且这一分钟 Full GC ≥ 2 次，或连着 3 分钟在上限以上）；
//   日志（卡住分钟内一行新日志都没有，先 jstack 存一份再停服续跑：光照线程抛 MissingPaletteEntryException 以后 Chunky 会一直等那几个区块）。
// - Chunky 的任务进度按维度存在 <服务端>/config/chunky/tasks/<命名空间>/<维度>.properties，不分世界：
//   那里有暂停着（cancelled=false）又不是这一块的任务就拒绝，不然会把别人的任务接着跑到这个世界里。
// - 连着几次重启都没有新进度（同一阶段内 Chunky 的 Processed 没超过之前的最高值）就放弃报错，不再无限重启（用户 10-31 定）。
// - 日志目录里：<块>.out（服务端全部输出和看守的话）、<块>.状态.json（阶段、每次起服的起止、停服原因、进度；看守被杀了重跑同一条命令接着来）、
//   <块>.jstat.tsv（每分钟的老年代、Full GC、进度、速度）、<块>.jstack-<时间>.txt（卡住时的线程栈）。
import fs from 'node:fs';
import path from 'node:path';
import { tryRun } from '../../环境/子进程.ts';
import { passGate } from '../../闸/闸.ts';
import { javaProgram, Server } from '../服务端/服务端.ts';
import { parseEnabledPacks, checkBeforeStart, checkOrder } from '../服务端/核对.ts';
import { csvText, type PregenPlan } from './计划.ts';

export const progressLine = /\[Chunky\] Task running for (\S+)\. Processed: (\d+) chunks \(([\d.]+)%\).*Rate: ([\d.]+) cps/;
export const finishLine = /\[Chunky\] Task finished for (\S+)\. Processed: (\d+) chunks \(([\d.]+)%\), Total time: (\S+)/;

export type Progress = { chunks: number; percent: number; speed: number; time: string };
export type CompletedInfo = { chunks: number; percent: number; elapsed: string; time: string };
export type WatchState = {
  tile: string;
  world: string;
  save: string;
  stage: '主' | '补洞' | '完';
  serverStarts: { stage?: '主' | '补洞'; startedAt: string; endedAt?: string; command: string[]; exitCode?: number | null; stopReason?: string | null; lastProgress?: Progress | null; completed?: CompletedInfo | null }[];
  completed: Partial<Record<'主' | '补洞', CompletedInfo>>;
};

type ServerStartRecord = WatchState['serverStarts'][number];

/**
 * 末尾连着几次起服没有新进度。进度 = 同一阶段里 Chunky 的 Processed 比之前每次起服的最高值大（续跑 Chunky 接着数，所以重启后该往上走）；
 * 跑完（有 完成）算有进度。没有阶段字段的旧记录当「主」。
 */
export const consecutiveNoProgress = (records: readonly ServerStartRecord[], stage: '主' | '补洞'): number => {
  let maxChunk = 0, stallCount = 0;
  for (const r of records) {
    if ((r.stage ?? '主') !== stage) continue;
    const lastChunkCount = r.lastProgress?.chunks ?? 0;
    if (r.completed || lastChunkCount > maxChunk) stallCount = 0;
    else if (r.endedAt) stallCount++;
    maxChunk = Math.max(maxChunk, lastChunkCount);
  }
  return stallCount;
};

export const taskFile = (serverDir: string, dimension: string) => {
  const [ns, dim] = dimension.split(':') as [string, string];
  return path.join(serverDir, 'config', 'chunky', 'tasks', ns, `${dim}.properties`);
};
export const readTasks = (f: string): Record<string, string> => {
  if (!fs.existsSync(f)) return {};
  const o: Record<string, string> = {};
  for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
    const i = l.indexOf('=');
    if (i > 0) o[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  }
  return o;
};
/** 暂停着的任务是不是这一块的（选区中心、半径、图案对得上） */
export const isThisBlock = (t: Record<string, string>, p: PregenPlan) => {
  const nearEq = (a: string | undefined, b: number) => a !== undefined && Math.abs(Number(a) - b) < 1e-6;
  // 矩形的 z 半径另存 radius-z（Chunky 1.3 的 TaskLoader）
  const radiusMatch = nearEq(t.radius, p.selection.halfSide[0]) && (p.selection.shape === 'square' || nearEq(t['radius-z'], p.selection.halfSide[1]));
  return nearEq(t['center-x'], p.selection.center[0]) && nearEq(t['center-z'], p.selection.center[1]) && radiusMatch && t.pattern === p.pattern && (p.pattern !== 'csv' || t.csv === p.csvName);
};

/** 老年代占最大堆的百分比和 Full GC 次数。不用 jstat -gcutil 的 O 列：G1 下它是占「当前分到的」老年代的比例，刚起服时就到八九成 */
export const readHeap = (pid: number): { oldGen: number; fullGC: number } | null => {
  const colOption = (opt: string) => {
    const r = tryRun([javaProgram('jstat'), opt, String(pid)]);
    const lines = r.stdout.trim().split('\n');
    if (lines.length < 2) return {};
    const ks = lines[0]!.trim().split(/\s+/), vs = lines[1]!.trim().split(/\s+/);
    return Object.fromEntries(ks.map((k, i) => [k, Number(vs[i])]));
  };
  const gc = colOption('-gc'), cap = colOption('-gccapacity');
  if (!(gc.OU! >= 0) || !(cap.OGCMX! > 0) || !(gc.FGC! >= 0)) return null;
  return { oldGen: (100 * gc.OU!) / cap.OGCMX!, fullGC: gc.FGC! };
};

export type WatchOptions = {
  world: string;
  dimension: string;
  serverDir: string;
  save: string;
  loaderVersion?: string;
  chunky: string;
  logDir: string;
  heap?: string;
  genThreads?: number;
  oldGenLimit?: number;
  stuckMinutes?: number;
  skipHoleFill?: boolean;
  skipGate?: boolean;
  fromScratch?: boolean;
  /** 连着这么多次重启都没有新进度就放弃（默认 3） */
  maxNoProgressRestarts?: number;
  /** 测试用：盯的间隔（默认 60 秒） */
  watchIntervalSec?: number;
  说: (s: string) => void;
};

const nowIso = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');

export const runBlock = async (p: PregenPlan, o: WatchOptions): Promise<WatchState> => {
  fs.mkdirSync(o.logDir, { recursive: true });
  const chunkName = p.tile.name;
  const OUT = path.join(o.logDir, `${chunkName}.out`);
  const STATE = path.join(o.logDir, `${chunkName}.状态.json`);
  const JSTAT = path.join(o.logDir, `${chunkName}.jstat.tsv`);
  const log = (s: string) => {
    o.说(s);
    fs.appendFileSync(OUT, `[看守 ${nowIso()}] ${s}\n`);
  };
  const saveState = (s: WatchState) => {
    fs.writeFileSync(`${STATE}.tmp`, JSON.stringify(s, null, 1));
    fs.renameSync(`${STATE}.tmp`, STATE);
  };
  let st: WatchState = !o.fromScratch && fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : { tile: chunkName, world: o.world, save: o.save, stage: '主', serverStarts: [], completed: {} };
  if (st.save !== o.save) throw new Error(`${STATE} 记的是存档 ${st.save}，这次是 ${o.save}；要从头来加 --from-scratch`);
  if (st.stage === '完') {
    log(`${chunkName} 已经跑完（${STATE}）；要再跑一遍加 --from-scratch`);
    return st;
  }
  const taskPath = taskFile(o.serverDir, o.dimension);
  if (p.pattern === 'csv') {
    const destPath = path.join(o.serverDir, 'config', 'chunky', `${p.csvName}.csv`);
    const csv = csvText(p.chunks!);
    if (!fs.existsSync(destPath) || fs.readFileSync(destPath, 'utf8') !== csv) {
      const t = readTasks(taskPath);
      if (t.cancelled === 'false' && isThisBlock(t, p)) throw new Error(`${destPath} 和这次算的区块列表不一样，可这一块的任务还暂停着：续跑时 Chunky 按条数跳过，换了列表就对不上。先 chunky cancel 或换回原来的列表`);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.writeFileSync(destPath, csv);
    }
  }
  const preCheck = checkBeforeStart(o.serverDir, o.save);
  if (preCheck.issues.length) throw new Error(preCheck.issues.join('\n'));
  const noProgressLimit = o.maxNoProgressRestarts ?? 3;
  const limit = o.oldGenLimit ?? 90, stuckMs = (o.stuckMinutes ?? 10) * 60_000, intervalMs = (o.watchIntervalSec ?? 60) * 1000;

  while (st.stage !== '完') {
    const t = readTasks(taskPath);
    const paused = t.cancelled === 'false';
    if (paused && !isThisBlock(t, p)) throw new Error(`${taskPath} 里有暂停着的别的任务（中心 ${t['center-x']}, ${t['center-z']}，图案 ${t.pattern}），先跑完或 chunky cancel`);
    if (!o.skipGate) await passGate(async () => {});
    const commands = paused ? ['chunky continue'] : [...p.steps.map(([c]) => c), 'chunky start'];
    const startRecord: ServerStartRecord = { stage: st.stage, startedAt: nowIso(), command: commands };
    st.serverStarts.push(startRecord);
    saveState(st);
    log(`${st.stage}：起服，${paused ? '续跑' : `选区 ${p.selection.shape} 中心 ${p.selection.center.join(', ')} 半边 ${p.selection.halfSide.join(' × ')}，${p.pattern}，${p.chunkCount} 个区块`}`);
    let lastProgress: Progress | null = null, completion: CompletedInfo | null = null, lastPrintMs = 0;
    const s = await Server.start({
      目录: o.serverDir,
      save: o.save,
      loaderVersion: o.loaderVersion,
      heap: o.heap,
      genThreads: o.genThreads,
      tempMods: [o.chunky],
      提示: log,
      onLine: (l) => {
        fs.appendFileSync(OUT, `${l}\n`);
        const m = progressLine.exec(l);
        if (m && m[1] === o.dimension) {
          lastProgress = { chunks: Number(m[2]), percent: Number(m[3]), speed: Number(m[4]), time: nowIso() };
          if (Date.now() - lastPrintMs > 30_000) {
            lastPrintMs = Date.now();
            o.说(`  ${m[2]} 区块（${m[3]}%），${m[4]} 区块/秒`);
          }
        }
        const f = finishLine.exec(l);
        if (f && f[1] === o.dimension) completion = { chunks: Number(f[2]), percent: Number(f[3]), elapsed: f[4]!, time: nowIso() };
      },
    });
    let reason: string | null = null;
    try {
      if (preCheck.overrides.length) {
        s.发('datapack list enabled');
        const line = await s.waits('data pack(s) enabled', 30);
        const issues = checkOrder(o.save, preCheck.overrides, parseEnabledPacks(line ?? ''));
        if (!line || issues.length) throw new Error(line ? issues.join('\n') : '/datapack list enabled 30 秒没回');
        log(`数据包 ${preCheck.overrides.join('、')} 已启用、排在它覆盖的包之上`);
      }
      if (paused) {
        s.发('chunky continue');
        if (!(await s.waits('Task continuing for', 30))) throw new Error('chunky continue 30 秒没回「Task continuing for」');
      } else {
        for (const [c, expectLog] of p.steps) {
          s.发(c);
          if (!(await s.waits(expectLog, 30))) throw new Error(`${c} 以后 30 秒内日志里没有「${expectLog}」，选区没改成，停服（不发 chunky start）`);
        }
        s.发('chunky start');
        const matchedLine = await s.waits((l) => l.includes('Task started in') || l.includes('A task was already started'), 30);
        if (!matchedLine || matchedLine.includes('already started')) throw new Error(`chunky start 没开始：${matchedLine ?? '30 秒没回'}`);
      }
      const waitDone = s.waits((l) => finishLine.exec(l)?.[1] === o.dimension, Infinity);
      let prevFullGc: number | null = null, consecutiveHigh = 0;
      const watchTimer = setInterval(() => {
        if (reason || !s.running) return;
        const heapUsage = s.pid ? readHeap(s.pid) : null;
        if (heapUsage) {
          const gcDelta = prevFullGc === null ? 0 : heapUsage.fullGC - prevFullGc;
          prevFullGc = heapUsage.fullGC;
          const progress = lastProgress as Progress | null;
          fs.appendFileSync(JSTAT, `${nowIso()}\t${heapUsage.oldGen.toFixed(1)}\t${heapUsage.fullGC}\t${progress?.chunks ?? ''}\t${progress?.speed ?? ''}\n`);
          consecutiveHigh = heapUsage.oldGen >= limit ? consecutiveHigh + 1 : 0;
          if (heapUsage.oldGen >= limit && (gcDelta >= 2 || consecutiveHigh >= 3)) reason = `堆满：老年代占最大堆 ${heapUsage.oldGen.toFixed(0)}%，这一分钟 Full GC ${gcDelta} 次`;
        }
        if (!reason && Date.now() - s.lastLineTime > stuckMs) {
          reason = `卡住：${(stuckMs / 60_000).toFixed(0)} 分钟没有新日志`;
          if (s.pid) {
            const f = path.join(o.logDir, `${chunkName}.jstack-${nowIso().replace(/[:-]/g, '')}.txt`);
            fs.writeFileSync(f, tryRun([javaProgram('jstack'), String(s.pid)]).stdout);
            log(`线程栈存到 ${f}`);
          }
        }
        if (reason) {
          log(`${reason}，正常停服以后续跑`);
          void s.停();
        }
      }, intervalMs);
      try {
        await waitDone;
      } finally {
        clearInterval(watchTimer);
      }
      if (s.error) throw s.error;
    } finally {
      startRecord.exitCode = await s.停();
      Object.assign(startRecord, { endedAt: nowIso(), stopReason: reason, lastProgress: lastProgress, completed: completion });
      saveState(st);
    }
    if (completion) {
      st.completed[st.stage as '主' | '补洞'] = completion;
      const nextStage: WatchState['stage'] = st.stage === '主' && !o.skipHoleFill ? '补洞' : '完';
      log(`${st.stage}这一遍跑完：${(completion as CompletedInfo).chunks} 个区块，用时 ${(completion as CompletedInfo).elapsed}；下一步 ${nextStage}`);
      st.stage = nextStage;
      saveState(st);
    } else if (!reason) throw new Error(`服务端退出了但任务没跑完（${STATE}），看 ${OUT} 和服务端 logs/latest.log`);
    else {
      const stallCount = consecutiveNoProgress(st.serverStarts, st.stage);
      if (stallCount >= noProgressLimit) {
        const stoppedAt = Math.max(0, ...st.serverStarts.filter((r) => (r.stage ?? '主') === st.stage).map((r) => r.lastProgress?.chunks ?? 0));
        throw new Error(
          `${chunkName} 的「${st.stage}」阶段连着 ${stallCount} 次重启都没有新进度（Chunky 停在 ${stoppedAt} 个区块，最近原因：${st.serverStarts.slice(-stallCount).map((r) => r.stopReason ?? '?').join('；')}），放弃，不再重启。` +
            `看 ${OUT}、${JSTAT} 和 jstack 文件找原因；排查完重跑同一条命令接着来（只再试一次，再没进度又会停），--max-stalled-restarts <n> 可调`,
        );
      }
    }
  }
  log(`${chunkName} 跑完了`);
  return st;
};
