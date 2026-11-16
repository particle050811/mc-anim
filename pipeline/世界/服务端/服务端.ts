import {gateRecordKilled,signalCodes} from '../../环境/收尾.ts';
// 起取材用的专用服务端（不是客户端）：开服、等就绪、发命令、等日志、正常停服。旧项目 游戏取材/取材服务端.py 按本仓库重写。
// - 存档可以不在服务端目录下：--universe <存档上一级> --world <存档目录名>，服务端目录只当程序和配置用（沙盒.ts 就靠这个）。
// - 端口每次挑一个空闲的（--port）：同一台机器上几个服务端（暮色、主世界、沙盒）可以同时开，不用改 server.properties。
// - 临时模组（预生成的 Chunky）开服前拷进 mods/、停服后删掉；拷了哪些记在 <服务端>/.anim-临时模组.json，上次没删成的下次开服前先删。
// - 停服一律发 stop 等它存完盘（最多 300 秒），不先 kill：没存盘的区块会丢，Chunky 的进度却可能已记过它们，续跑会跳过、留下空洞。
//   本进程收到 Ctrl-C、SIGTERM 也走这一步（先换下资源闸装的「直接退出」）；服务端单独一个进程组，终端的 Ctrl-C 不会同时打到它。
import spawn from 'cross-spawn';
import type { ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { config, isMac, isWindows } from '../../环境/配置.ts';
import { processAlive } from '../../闸/锁.ts';

/** 日志里出现这些就是数据包没读进来（专用服务端读数据包出错会自己退出，这里把原因摆出来） */
export const FATAL_LINES = ['Failed to load datapacks', 'Registry loading errors', 'Failed to load registries', 'Errors in element', 'Unknown registry key in', 'Safe mode active'];
const CRASH_LINE = 'This crash report has been saved to';
const STOP_ERROR_LINE = 'Exception stopping the server';
export const STOP_TIMEOUT_SEC = 300;

/**
 * 中文 Windows 上 JVM 默认编码是 GBK：管道里的中文（数据包名、模组的话）这边按 UTF-8 解成乱码，核对启用包、核对启动日志都对不上；
 * 模组读配置、log4j 写 latest.log 也跟着默认编码走，定成 UTF-8 才和 Mac 一样。JDK 17 的管道跟 file.encoding，JDK 19 起另认 stdout.encoding。
 */
export const ENCODING_ARGS = ['-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-Dstderr.encoding=UTF-8'];

export const javaProgram = (exeName = 'java') => {
  const home = config('java_home');
  return home ? path.join(home, 'bin', isWindows ? `${exeName}.exe` : exeName) : exeName;
};

/** 服务端怎么起：Forge / NeoForge 安装器装出来的看 libraries 里的参数文件，原版看 server.jar */
export const startArgs = (serverDir: string, loaderVersion?: string): string[] => {
  const argsFile = isWindows ? 'win_args.txt' : 'unix_args.txt';
  for (const parts of [['net', 'minecraftforge', 'forge'], ['net', 'neoforged', 'neoforge']]) {
    const d = path.join(serverDir, 'libraries', ...parts);
    if (!fs.existsSync(d)) continue;
    const versions = fs.readdirSync(d).filter((v) => fs.existsSync(path.join(d, v, argsFile)));
    const v = loaderVersion && versions.includes(loaderVersion) ? loaderVersion : versions.length === 1 ? versions[0] : undefined;
    if (!v) throw new Error(`${d} 下${versions.length ? `有 ${versions.join('、')} 几个版本，世界声明的 Forge 要写是哪个` : `没有 ${argsFile}（服务端没装完？）`}`);
    return [`@${path.join('libraries', ...parts, v, argsFile).split(path.sep).join('/')}`, 'nogui'];
  }
  if (fs.existsSync(path.join(serverDir, 'server.jar'))) return ['-jar', 'server.jar', 'nogui'];
  throw new Error(`${serverDir} 认不出是什么服务端（没有 Forge、NeoForge 的 libraries，也没有 server.jar）`);
};

export const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(p));
    });
  });

const tempModRecordPath = (dir: string) => path.join(dir, '.anim-临时模组.json');
const pidFile = (dir: string) => path.join(dir, '.anim-服务端.pid');

/** 删掉上次拷进 mods/ 没来得及删的临时模组 */
export const removeTempMods = (serverDir: string) => {
  const f = tempModRecordPath(serverDir);
  if (!fs.existsSync(f)) return [];
  const names = JSON.parse(fs.readFileSync(f, 'utf8')) as string[];
  for (const n of names) fs.rmSync(path.join(serverDir, 'mods', n), { force: true });
  fs.rmSync(f, { force: true });
  return names;
};

/** 拷临时模组进 mods/；mods/ 里本来就有同名的（人装的）就不拷、停服后也不删 */
const installTempMods = (serverDir: string, jars: readonly string[]) => {
  const copied: string[] = [];
  for (const j of jars) {
    const n = path.basename(j);
    const destPath = path.join(serverDir, 'mods', n);
    if (fs.existsSync(destPath)) continue;
    copied.push(n);
    fs.writeFileSync(tempModRecordPath(serverDir), JSON.stringify(copied));
    fs.copyFileSync(j, destPath, fs.constants.COPYFILE_FICLONE);
  }
  return copied;
};

export type ServerOptions = {
  目录: string;
  /** 世界目录（里面有 level.dat） */
  save: string;
  /** 建新世界（anim world new）才给：存档还没有 level.dat，由服务端第一次启动时建 */
  allowNewWorld?: boolean;
  /** Forge / NeoForge 版本（libraries 里有几个时挑哪个） */
  loaderVersion?: string;
  /** java -Xmx；默认 12G（用户 10-04 定：6G 不够，暮色放大预生成到十几万区块老年代就满） */
  heap?: string;
  /** 区块生成的后台线程数（-Dmax.bg.threads，游戏 Util.makeExecutor 认），给同时在跑的渲染留核；不给是核数 − 1 */
  genThreads?: number;
  tempMods?: string[];
  /** 服务端输出的每一行 */
  onLine?: (line: string) => void;
  提示?: (s: string) => void;
  readyTimeoutSec?: number;
};

type Waiter = { matches: (line: string) => boolean; deliver: (line: string | null) => void; timer?: NodeJS.Timeout };

export class Server {
  readonly 目录: string;
  readonly port: number;
  private p: ChildProcess;
  private 提示: (s: string) => void;
  private waiters = new Set<Waiter>();
  /** 上一条命令发出以后的日志（等日志先在这里找） */
  private recent: string[] = [];
  private exitCode: number | null | undefined = undefined;
  private exited: Promise<void>;
  private copied: string[];
  private 错: Error | null = null;
  private oldSignals: Map<NodeJS.Signals, NodeJS.SignalsListener[]> = new Map();
  private caffeinate: ChildProcess | null = null;
  lastLineTime = Date.now();

  private constructor(o: ServerOptions, port: number, params: string[], copied: string[]) {
    this.目录 = o.目录;
    this.port = port;
    this.提示 = o.提示 ?? ((s) => console.log(`== ${s}`));
    this.copied = copied;
    this.p = spawn(javaProgram(), params, { cwd: o.目录, stdio: ['pipe', 'pipe', 'pipe'], detached: !isWindows });
    fs.writeFileSync(pidFile(o.目录), `${this.p.pid}\n`);
    if (isMac && this.p.pid) {
      // 跑得久，Mac 合盖、闲置睡眠会把它挂起；caffeinate -w 跟着服务端退出
      this.caffeinate = spawn('caffeinate', ['-i', '-w', String(this.p.pid)], { stdio: 'ignore' });
      this.caffeinate.on('error', () => {});
    }
    let leftover = '';
    const onData = (d: Buffer) => {
      leftover += d.toString('utf8');
      const lines = leftover.split('\n');
      leftover = lines.pop()!;
      for (const l of lines) this.receiveLine(l.replace(/\r$/, ''), o.onLine);
    };
    this.p.stdout!.on('data', onData);
    this.p.stderr!.on('data', onData);
    this.exited = new Promise((resolve) =>
      this.p.on('close', (code) => {
        this.exitCode = code;
        fs.rmSync(pidFile(o.目录), { force: true });
        for (const w of this.waiters) w.deliver(null);
        this.waiters.clear();
        resolve();
      }),
    );
    this.p.on('error', (e) => {
      this.错 = e;
    });
    // 收到 Ctrl-C、SIGTERM 先正常停服再退出：资源闸装的处理是直接 process.exit，服务端开着的这段时间先换下来
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
      this.oldSignals.set(sig, process.listeners(sig) as NodeJS.SignalsListener[]);
      process.removeAllListeners(sig);
      process.once(sig, () => {
        this.提示(`收到 ${sig}，停服`);
        void this.停().finally(() => {gateRecordKilled(sig);process.exit(signalCodes[sig]);});
      });
    }
  }

  /** 开服并等到就绪（日志出现 Done (）；起不来就抛错（服务端已停） */
  static async start(o: ServerOptions): Promise<Server> {
    if (!o.allowNewWorld && !fs.existsSync(path.join(o.save, 'level.dat'))) throw new Error(`${o.save} 不是世界（没有 level.dat）；不让服务端悄悄建一个新世界`);
    const eula = path.join(o.目录, 'eula.txt');
    if (!fs.existsSync(eula) || !/^\s*eula\s*=\s*true\s*$/m.test(fs.readFileSync(eula, 'utf8'))) throw new Error(`${eula} 没写 eula=true：要人读过 Minecraft EULA 后自己改，anim 不替人同意`);
    const oldPid = fs.existsSync(pidFile(o.目录)) ? Number(fs.readFileSync(pidFile(o.目录), 'utf8')) : 0;
    if (oldPid && processAlive(oldPid)) throw new Error(`${o.目录} 上次起的服务端（pid ${oldPid}）还在跑；等它退出，或确认不是它再删 ${pidFile(o.目录)}`);
    const removed = removeTempMods(o.目录);
    if (removed.length) (o.提示 ?? console.log)(`上次没删的临时模组先删了：${removed.join('、')}`);
    const port = await freePort();
    const params = [
      `-Xmx${o.heap ?? '12G'}`,
      ...ENCODING_ARGS,
      ...(o.genThreads ? [`-Dmax.bg.threads=${o.genThreads}`] : []),
      ...startArgs(o.目录, o.loaderVersion),
      // 存档就在服务端目录下时不给 --universe：Forge 的 Main 见到 universe 等于服务端目录会报「Invalid world directory…the same directory as your universe」不起服
      ...(fs.realpathSync(path.dirname(path.resolve(o.save))) === fs.realpathSync(o.目录) ? [] : ['--universe', path.dirname(path.resolve(o.save))]),
      '--world',
      path.basename(o.save),
      '--port',
      String(port),
    ];
    const copied = installTempMods(o.目录, o.tempMods ?? []);
    const s = new Server(o, port, params, copied);
    s.提示(`开服：${o.目录}，世界 ${o.save}，端口 ${port}${copied.length ? `，临时模组 ${copied.join('、')}` : ''}`);
    const isReady = await s.waits('Done (', o.readyTimeoutSec ?? 600, { quiet: true });
    if (!isReady) {
      await s.停();
      throw s.错 ?? new Error(`服务端没起来${s.exitCode !== undefined ? `（退出码 ${s.exitCode}）` : `（${o.readyTimeoutSec ?? 600} 秒没就绪）`}，看 ${path.join(o.目录, 'logs', 'latest.log')}`);
    }
    s.提示('服务端就绪');
    return s;
  }

  private receiveLine(l: string, onLine?: (line: string) => void) {
    this.lastLineTime = Date.now();
    this.recent.push(l);
    if (this.recent.length > 5000) this.recent.splice(0, 2500);
    onLine?.(l);
    if (l.includes(CRASH_LINE)) this.错 ??= new Error(`服务端崩溃了：${l.trim()}`);
    else if (FATAL_LINES.some((k) => l.includes(k))) this.错 ??= new Error(`数据包没读进来（${l.trim()}），原因看服务端日志`);
    if (this.错) {
      for (const w of this.waiters) w.deliver(null);
      this.waiters.clear();
      return;
    }
    for (const w of [...this.waiters])
      if (w.matches(l)) {
        this.waiters.delete(w);
        w.deliver(l);
      }
  }

  get pid() {
    return this.p.pid;
  }
  get running() {
    return this.exitCode === undefined;
  }
  get error() {
    return this.错;
  }

  /** 发一条控制台命令（不带 /），从这里起重新收「上一条命令以后的日志」 */
  发(command: string) {
    if (!this.running) throw new Error(`服务端已经退出，发不了 ${command}`);
    this.recent = [];
    this.p.stdin!.write(`${command}\n`);
  }

  /** 上一条命令以后的日志 */
  recentLogs() {
    return [...this.recent];
  }

  /** 等日志出现一句话（先在上一条命令以后的日志里找）；超时、服务端退出、出错返回 null。超时秒 Infinity = 一直等 */
  waits(pattern: string | RegExp | ((line: string) => boolean), timeoutSec: number, o: { quiet?: boolean; onlyNew?: boolean } = {}): Promise<string | null> {
    const f = typeof pattern === 'function' ? pattern : typeof pattern === 'string' ? (l: string) => l.includes(pattern) : (l: string) => pattern.test(l);
    if (!o.onlyNew) {
      const recentMatch = this.recent.find(f);
      if (recentMatch) return Promise.resolve(recentMatch);
    }
    if (!this.running || this.错) return Promise.resolve(null);
    return new Promise((resolve) => {
      const w: Waiter = { matches: f, deliver: (l) => (clearTimeout(w.timer), resolve(l)) };
      if (Number.isFinite(timeoutSec)) w.timer = setTimeout(() => (this.waiters.delete(w), resolve(null)), timeoutSec * 1000);
      this.waiters.add(w);
    });
  }

  /** 正常停服：发 stop、等存完盘退出（最多 300 秒，存盘本身抛异常就不等了），最后撤临时模组、换回信号处理 */
  async 停() {
    if (this.running) {
      this.提示(`停服：等它存完盘退出，最多 ${STOP_TIMEOUT_SEC} 秒`);
      try {
        this.p.stdin!.write('stop\n');
      } catch {
        // 管道已经断了
      }
      const stuck = this.waits(STOP_ERROR_LINE, STOP_TIMEOUT_SEC, { onlyNew: true });
      await Promise.race([this.exited, stuck]);
      if (this.running) {
        this.提示('服务端没有自己退出，强杀');
        this.p.kill('SIGKILL');
        await this.exited;
      }
    }
    for (const n of this.copied) fs.rmSync(path.join(this.目录, 'mods', n), { force: true });
    fs.rmSync(tempModRecordPath(this.目录), { force: true });
    this.caffeinate?.kill();
    for (const [sig, prevHandlers] of this.oldSignals) {
      process.removeAllListeners(sig);
      for (const f of prevHandlers) process.on(sig, f);
    }
    this.oldSignals.clear();
    return this.exitCode;
  }
}
