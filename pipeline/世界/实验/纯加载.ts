// 实验工具（不接 anim）：真浏览器、真区段工人，只把一帧要的区段取到体素块就绪，不建网格、不画，报墙钟和浏览器进程树的 CPU。各包交替，每次新开浏览器（第一趟是冷的，后面几趟工人已预热）。
//   node pipeline/世界/实验/纯加载.ts <清单文件> <轮数> <名=包目录>…
// 文件服务是这里的 Node http，不是 Remotion 的；真渲染里取文件的开销以 anim bench 的 [地形量时] 为准。
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, type Plugin } from 'esbuild';
import { 资产json表 } from '../../资产/node资产.ts';

const [清单文件, 轮数串, ...包们] = process.argv.slice(2);
const 轮数 = Number(轮数串);
const 趟 = 3;
const 这里 = path.dirname(fileURLToPath(import.meta.url));
const 根 = path.resolve(这里, '../../..');
const 资产表 = 资产json表();
const 资产插件: Plugin = {
  name: '资产json',
  setup(b) {
    b.onResolve({ filter: /^asset:/ }, (a) => ({ path: a.path.slice('asset:'.length), namespace: '资产' }));
    b.onLoad({ filter: /.*/, namespace: '资产' }, (a) => ({ contents: fs.readFileSync(资产表[a.path]!, 'utf8'), loader: 'json' }));
  },
};
const 打包 = async (入口: string) => (await build({ entryPoints: [入口], bundle: true, format: 'esm', platform: 'browser', target: 'esnext', write: false, logLevel: 'error', plugins: [资产插件] })).outputFiles[0]!.text;
const 工人js = await 打包(path.join(根, 'engine/voxel/区段工人.ts'));
const 页js = await 打包(path.join(这里, '纯加载页.ts'));
const 清单 = fs.readFileSync(清单文件!, 'utf8').trim();
const 找浏览器 = () => {
  const 目录 = path.join(根, 'node_modules/.remotion/chrome-headless-shell');
  const 出 = execSync(`find ${JSON.stringify(目录)} -type f -name chrome-headless-shell`, { encoding: 'utf8' }).trim().split('\n')[0];
  if (!出) throw new Error(`${目录} 下没有 chrome-headless-shell`);
  return 出;
};
const 浏览器 = 找浏览器();
// 进程树 CPU 秒（ps 的 time 精度 10 毫秒）
const 树CPU = (根pid: number) => {
  const 表 = execSync('ps -axo pid=,ppid=,time=', { encoding: 'utf8' }).trim().split('\n').map((l) => l.trim().split(/\s+/));
  const 秒 = (t: string) => t.split(':').reduce((s, x) => s * 60 + Number(x), 0);
  const 在树 = new Set([根pid]);
  for (let 变 = true; 变; ) {
    变 = false;
    for (const [p, pp] of 表) if (在树.has(Number(pp)) && !在树.has(Number(p))) { 在树.add(Number(p)); 变 = true; }
  }
  return 表.reduce((s, [p, , t]) => s + (在树.has(Number(p)) ? 秒(t!) : 0), 0);
};
type 趟结果 = { 墙钟: number; CPU: number; 取: number; 解压: number; 解码: number; 换: number; 字节: number; 区段: number };
const 跑一次 = (目录: string) =>
  new Promise<趟结果[]>((resolve, reject) => {
    const 包 = JSON.parse(fs.readFileSync(path.join(目录, '包.json'), 'utf8'));
    const 结果: 趟结果[] = [];
    let 起CPU = 0;
    let pid = 0;
    const fds = new Map<string, number>();
    const 用户目录 = fs.mkdtempSync(path.join(os.tmpdir(), '纯加载-'));
    const 服务 = http.createServer((req, res) => {
      const u = new URL(req.url!, 'http://x');
      const 名 = decodeURIComponent(u.pathname);
      if (process.env.PURE_LOAD_DEBUG && !名.startsWith('/包/')) console.error(req.method, 名);
      if (名 === '/') return void res.setHeader('content-type', 'text/html').end('<!doctype html><meta charset="utf-8"><script type="module" src="/页.js"></script>');
      if (名 === '/页.js' || 名 === '/工人.js') return void res.setHeader('content-type', 'text/javascript').end(名 === '/页.js' ? 页js : 工人js);
      if (名 === '/配置') return void res.setHeader('content-type', 'application/json').end(JSON.stringify({ 清单, 趟, 包: { 原点: 包.原点, 状态: 包.状态, 群系: 包.群系 } }));
      if (名 === '/快照') {
        const 块: Buffer[] = [];
        req.on('data', (d) => 块.push(d));
        req.on('end', () => {
          if (u.searchParams.get('名') === '起') 起CPU = 树CPU(pid);
          else 结果.push({ ...JSON.parse(Buffer.concat(块).toString()), CPU: (树CPU(pid) - 起CPU) * 1000 });
          res.end();
        });
        return;
      }
      if (名 === '/完') {
        res.end();
        浏览.kill('SIGKILL');
        服务.close();
        服务.closeAllConnections();
        for (const fd of fds.values()) fs.closeSync(fd);
        浏览.once('exit', () => {
          // 子进程退出比主进程慢，目录还会被写一会儿
          setTimeout(() => {
            fs.rmSync(用户目录, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
            resolve(结果);
          }, 500);
        });
        return;
      }
      if (名.startsWith('/包/')) {
        const f = 名.slice(3);
        if (!fds.has(f)) fds.set(f, fs.openSync(path.join(目录, f), 'r'));
        const m = /bytes=(\d+)-(\d+)/.exec(req.headers.range ?? '')!;
        const 起 = Number(m[1]);
        const 长 = Number(m[2]) - 起 + 1;
        const b = Buffer.alloc(长);
        fs.readSync(fds.get(f)!, b, 0, 长, 起);
        return void res.writeHead(206, { 'content-type': 'application/octet-stream', 'content-length': 长 }).end(b);
      }
      res.writeHead(404).end();
    });
    let 浏览: ReturnType<typeof spawn>;
    服务.listen(0, '127.0.0.1', () => {
      const 端口 = (服务.address() as { port: number }).port;
      浏览 = spawn(浏览器, [`--user-data-dir=${用户目录}`, '--no-first-run', '--disable-gpu', '--remote-debugging-port=0', '--enable-logging=stderr', `http://127.0.0.1:${端口}/`], { stdio: ['ignore', 'ignore', process.env.PURE_LOAD_DEBUG ? 'inherit' : 'ignore'] });
      pid = 浏览.pid!;
      浏览.on('error', reject);
      setTimeout(() => {
        浏览.kill('SIGKILL');
        reject(new Error('超时 60 秒'));
      }, 60000).unref();
    });
  });
const 中位 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const 记 = new Map<string, 趟结果[][]>();
for (let 轮 = 0; 轮 < 轮数; 轮++) {
  const 偏 = 轮 % 包们.length;
  for (const 项 of [...包们.slice(偏), ...包们.slice(0, 偏)]) {
    const [名, 目录] = 项.split('=') as [string, string];
    const r = await 跑一次(目录);
    if (!记.has(名)) 记.set(名, []);
    记.get(名)!.push(r);
    console.log(`${名} 轮${轮 + 1} 负载 ${os.loadavg()[0]!.toFixed(1)}：` + r.map((x) => `墙 ${x.墙钟.toFixed(0)} CPU ${x.CPU.toFixed(0)}`).join(' | '));
  }
}
console.log(`\n${清单.split(',').length} 个区段，${轮数} 轮，每次新开浏览器，毫秒中位。冷 = 第一趟，热 = 第 ${趟} 趟（工人预热，同样的区段重取，没有 HTTP 缓存头）`);
for (const [名, rs] of 记)
  for (const [标, n] of [['冷', 0], ['热', 趟 - 1]] as const) {
    const 取 = (k: keyof 趟结果) => 中位(rs.map((r) => r[n]![k]));
    console.log(`${名} ${标}：墙钟 ${取('墙钟').toFixed(0)}；浏览器 CPU ${取('CPU').toFixed(0)}；取(跨度) ${取('取').toFixed(0)}；解压(跨度) ${取('解压').toFixed(0)}；解码 ${取('解码').toFixed(0)}；换 ${取('换').toFixed(0)}；字节 ${(取('字节') / 1e6).toFixed(2)} MB`);
  }
