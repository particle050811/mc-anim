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
import { 配置, isMac, isWindows } from '../../环境/配置.ts';
import { 进程在吗 } from '../../闸/锁.ts';

/** 日志里出现这些就是数据包没读进来（专用服务端读数据包出错会自己退出，这里把原因摆出来） */
export const 致命行 = ['Failed to load datapacks', 'Registry loading errors', 'Failed to load registries', 'Errors in element', 'Unknown registry key in', 'Safe mode active'];
const 崩溃行 = 'This crash report has been saved to';
const 停服异常行 = 'Exception stopping the server';
export const 停服超时秒 = 300;

export const java程序 = (名 = 'java') => {
  const home = 配置('java_home');
  return home ? path.join(home, 'bin', isWindows ? `${名}.exe` : 名) : 名;
};

/** 服务端怎么起：Forge / NeoForge 安装器装出来的看 libraries 里的参数文件，原版看 server.jar */
export const 启动参数 = (目录: string, 加载器版本?: string): string[] => {
  const 参数文件 = isWindows ? 'win_args.txt' : 'unix_args.txt';
  for (const 前 of [['net', 'minecraftforge', 'forge'], ['net', 'neoforged', 'neoforge']]) {
    const d = path.join(目录, 'libraries', ...前);
    if (!fs.existsSync(d)) continue;
    const 版本们 = fs.readdirSync(d).filter((v) => fs.existsSync(path.join(d, v, 参数文件)));
    const v = 加载器版本 && 版本们.includes(加载器版本) ? 加载器版本 : 版本们.length === 1 ? 版本们[0] : undefined;
    if (!v) throw new Error(`${d} 下${版本们.length ? `有 ${版本们.join('、')} 几个版本，世界声明的 Forge 要写是哪个` : `没有 ${参数文件}（服务端没装完？）`}`);
    return [`@${path.join('libraries', ...前, v, 参数文件).split(path.sep).join('/')}`, 'nogui'];
  }
  if (fs.existsSync(path.join(目录, 'server.jar'))) return ['-jar', 'server.jar', 'nogui'];
  throw new Error(`${目录} 认不出是什么服务端（没有 Forge、NeoForge 的 libraries，也没有 server.jar）`);
};

export const 空闲端口 = () =>
  new Promise<number>((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(p));
    });
  });

const 临时模组记录 = (目录: string) => path.join(目录, '.anim-临时模组.json');
const pid文件 = (目录: string) => path.join(目录, '.anim-服务端.pid');

/** 删掉上次拷进 mods/ 没来得及删的临时模组 */
export const 撤临时模组 = (目录: string) => {
  const f = 临时模组记录(目录);
  if (!fs.existsSync(f)) return [];
  const 名们 = JSON.parse(fs.readFileSync(f, 'utf8')) as string[];
  for (const n of 名们) fs.rmSync(path.join(目录, 'mods', n), { force: true });
  fs.rmSync(f, { force: true });
  return 名们;
};

/** 拷临时模组进 mods/；mods/ 里本来就有同名的（人装的）就不拷、停服后也不删 */
const 装临时模组 = (目录: string, jars: readonly string[]) => {
  const 拷了: string[] = [];
  for (const j of jars) {
    const n = path.basename(j);
    const 到 = path.join(目录, 'mods', n);
    if (fs.existsSync(到)) continue;
    拷了.push(n);
    fs.writeFileSync(临时模组记录(目录), JSON.stringify(拷了));
    fs.copyFileSync(j, 到, fs.constants.COPYFILE_FICLONE);
  }
  return 拷了;
};

export type 服务端选项 = {
  目录: string;
  /** 世界目录（里面有 level.dat） */
  存档: string;
  /** Forge / NeoForge 版本（libraries 里有几个时挑哪个） */
  加载器版本?: string;
  /** java -Xmx；默认 12G（用户 10-04 定：6G 不够，暮色放大预生成到十几万区块老年代就满） */
  堆?: string;
  /** 区块生成的后台线程数（-Dmax.bg.threads，游戏 Util.makeExecutor 认），给同时在跑的渲染留核；不给是核数 − 1 */
  生成线程?: number;
  临时模组?: string[];
  /** 服务端输出的每一行 */
  每行?: (行: string) => void;
  提示?: (s: string) => void;
  就绪超时秒?: number;
};

type 等待者 = { 找: (行: string) => boolean; 好: (行: string | null) => void; 时限?: NodeJS.Timeout };

export class 服务端 {
  readonly 目录: string;
  readonly 端口: number;
  private p: ChildProcess;
  private 提示: (s: string) => void;
  private 等们 = new Set<等待者>();
  /** 上一条命令发出以后的日志（等日志先在这里找） */
  private 近来: string[] = [];
  private 退出码: number | null | undefined = undefined;
  private 退出了: Promise<void>;
  private 拷了: string[];
  private 错: Error | null = null;
  private 旧信号: Map<NodeJS.Signals, NodeJS.SignalsListener[]> = new Map();
  private caffeinate: ChildProcess | null = null;
  最后一行时间 = Date.now();

  private constructor(o: 服务端选项, 端口: number, 参数: string[], 拷了: string[]) {
    this.目录 = o.目录;
    this.端口 = 端口;
    this.提示 = o.提示 ?? ((s) => console.log(`== ${s}`));
    this.拷了 = 拷了;
    this.p = spawn(java程序(), 参数, { cwd: o.目录, stdio: ['pipe', 'pipe', 'pipe'], detached: !isWindows });
    fs.writeFileSync(pid文件(o.目录), `${this.p.pid}\n`);
    if (isMac && this.p.pid) {
      // 跑得久，Mac 合盖、闲置睡眠会把它挂起；caffeinate -w 跟着服务端退出
      this.caffeinate = spawn('caffeinate', ['-i', '-w', String(this.p.pid)], { stdio: 'ignore' });
      this.caffeinate.on('error', () => {});
    }
    let 余 = '';
    const 收 = (d: Buffer) => {
      余 += d.toString('utf8');
      const 行们 = 余.split('\n');
      余 = 行们.pop()!;
      for (const l of 行们) this.收行(l.replace(/\r$/, ''), o.每行);
    };
    this.p.stdout!.on('data', 收);
    this.p.stderr!.on('data', 收);
    this.退出了 = new Promise((resolve) =>
      this.p.on('close', (code) => {
        this.退出码 = code;
        fs.rmSync(pid文件(o.目录), { force: true });
        for (const w of this.等们) w.好(null);
        this.等们.clear();
        resolve();
      }),
    );
    this.p.on('error', (e) => {
      this.错 = e;
    });
    // 收到 Ctrl-C、SIGTERM 先正常停服再退出：资源闸装的处理是直接 process.exit，服务端开着的这段时间先换下来
    for (const sig of ['SIGINT', 'SIGTERM'] as const) {
      this.旧信号.set(sig, process.listeners(sig) as NodeJS.SignalsListener[]);
      process.removeAllListeners(sig);
      process.once(sig, () => {
        this.提示(`收到 ${sig}，停服`);
        void this.停().finally(() => process.exit(130));
      });
    }
  }

  /** 开服并等到就绪（日志出现 Done (）；起不来就抛错（服务端已停） */
  static async 起(o: 服务端选项): Promise<服务端> {
    if (!fs.existsSync(path.join(o.存档, 'level.dat'))) throw new Error(`${o.存档} 不是世界（没有 level.dat）；不让服务端悄悄建一个新世界`);
    const eula = path.join(o.目录, 'eula.txt');
    if (!fs.existsSync(eula) || !/^\s*eula\s*=\s*true\s*$/m.test(fs.readFileSync(eula, 'utf8'))) throw new Error(`${eula} 没写 eula=true：要人读过 Minecraft EULA 后自己改，anim 不替人同意`);
    const 旧pid = fs.existsSync(pid文件(o.目录)) ? Number(fs.readFileSync(pid文件(o.目录), 'utf8')) : 0;
    if (旧pid && 进程在吗(旧pid)) throw new Error(`${o.目录} 上次起的服务端（pid ${旧pid}）还在跑；等它退出，或确认不是它再删 ${pid文件(o.目录)}`);
    const 撤了 = 撤临时模组(o.目录);
    if (撤了.length) (o.提示 ?? console.log)(`上次没删的临时模组先删了：${撤了.join('、')}`);
    const 端口 = await 空闲端口();
    const 参数 = [
      `-Xmx${o.堆 ?? '12G'}`,
      ...(o.生成线程 ? [`-Dmax.bg.threads=${o.生成线程}`] : []),
      ...启动参数(o.目录, o.加载器版本),
      '--universe',
      path.dirname(path.resolve(o.存档)),
      '--world',
      path.basename(o.存档),
      '--port',
      String(端口),
    ];
    const 拷了 = 装临时模组(o.目录, o.临时模组 ?? []);
    const s = new 服务端(o, 端口, 参数, 拷了);
    s.提示(`开服：${o.目录}，世界 ${o.存档}，端口 ${端口}${拷了.length ? `，临时模组 ${拷了.join('、')}` : ''}`);
    const 就绪 = await s.等('Done (', o.就绪超时秒 ?? 600, { 不显示: true });
    if (!就绪) {
      await s.停();
      throw s.错 ?? new Error(`服务端没起来${s.退出码 !== undefined ? `（退出码 ${s.退出码}）` : `（${o.就绪超时秒 ?? 600} 秒没就绪）`}，看 ${path.join(o.目录, 'logs', 'latest.log')}`);
    }
    s.提示('服务端就绪');
    return s;
  }

  private 收行(l: string, 每行?: (行: string) => void) {
    this.最后一行时间 = Date.now();
    this.近来.push(l);
    if (this.近来.length > 5000) this.近来.splice(0, 2500);
    每行?.(l);
    if (l.includes(崩溃行)) this.错 ??= new Error(`服务端崩溃了：${l.trim()}`);
    else if (致命行.some((k) => l.includes(k))) this.错 ??= new Error(`数据包没读进来（${l.trim()}），原因看服务端日志`);
    if (this.错) {
      for (const w of this.等们) w.好(null);
      this.等们.clear();
      return;
    }
    for (const w of [...this.等们])
      if (w.找(l)) {
        this.等们.delete(w);
        w.好(l);
      }
  }

  get pid() {
    return this.p.pid;
  }
  get 在跑() {
    return this.退出码 === undefined;
  }
  get 出错() {
    return this.错;
  }

  /** 发一条控制台命令（不带 /），从这里起重新收「上一条命令以后的日志」 */
  发(命令: string) {
    if (!this.在跑) throw new Error(`服务端已经退出，发不了 ${命令}`);
    this.近来 = [];
    this.p.stdin!.write(`${命令}\n`);
  }

  /** 上一条命令以后的日志 */
  近来日志() {
    return [...this.近来];
  }

  /** 等日志出现一句话（先在上一条命令以后的日志里找）；超时、服务端退出、出错返回 null。超时秒 Infinity = 一直等 */
  等(找: string | RegExp | ((行: string) => boolean), 超时秒: number, o: { 不显示?: boolean; 只看新的?: boolean } = {}): Promise<string | null> {
    const f = typeof 找 === 'function' ? 找 : typeof 找 === 'string' ? (l: string) => l.includes(找) : (l: string) => 找.test(l);
    if (!o.只看新的) {
      const 有 = this.近来.find(f);
      if (有) return Promise.resolve(有);
    }
    if (!this.在跑 || this.错) return Promise.resolve(null);
    return new Promise((resolve) => {
      const w: 等待者 = { 找: f, 好: (l) => (clearTimeout(w.时限), resolve(l)) };
      if (Number.isFinite(超时秒)) w.时限 = setTimeout(() => (this.等们.delete(w), resolve(null)), 超时秒 * 1000);
      this.等们.add(w);
    });
  }

  /** 正常停服：发 stop、等存完盘退出（最多 300 秒，存盘本身抛异常就不等了），最后撤临时模组、换回信号处理 */
  async 停() {
    if (this.在跑) {
      this.提示(`停服：等它存完盘退出，最多 ${停服超时秒} 秒`);
      try {
        this.p.stdin!.write('stop\n');
      } catch {
        // 管道已经断了
      }
      const 卡住 = this.等(停服异常行, 停服超时秒, { 只看新的: true });
      await Promise.race([this.退出了, 卡住]);
      if (this.在跑) {
        this.提示('服务端没有自己退出，强杀');
        this.p.kill('SIGKILL');
        await this.退出了;
      }
    }
    for (const n of this.拷了) fs.rmSync(path.join(this.目录, 'mods', n), { force: true });
    fs.rmSync(临时模组记录(this.目录), { force: true });
    this.caffeinate?.kill();
    for (const [sig, 旧] of this.旧信号) {
      process.removeAllListeners(sig);
      for (const f of 旧) process.on(sig, f);
    }
    this.旧信号.clear();
    return this.退出码;
  }
}
