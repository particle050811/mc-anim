// 渲染用的 chrome-headless-shell 放数据根 cache/浏览器/<Remotion 期望版本>/，各 worktree 共用一份。
// Remotion 默认下到 node_modules/.remotion：重装依赖一跑就删，每个 worktree 各下 570 MB，没网时渲染卡在下载（用户 11-06 定挪走）。
// 目录名用 Remotion 的期望版本（如 157.0.8080.0-remotion-v3，带共享内存补丁的构建），升 Remotion 换版本就换目录，旧的留给 bench --浏览器 做对照。
// 缺了按顺序补：从本检出的 node_modules/.remotion 克隆（版本要对）→ 让 Remotion 下载到那里再克隆。
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { 数据路径 } from '../环境/配置.ts';
import { 代码根 } from '../环境/路径.ts';
import { ensureBrowser } from './渲染器.ts';

type 取浏览器 = {
  getExpectedVersion: (o: { version: null; chromeMode: 'headless-shell'; platform: string }) => string;
  getPlatform: () => string;
  getRevisionInfo: (mode: 'headless-shell') => { executablePath: string; folderPath: string };
  readVersionFile: (mode: 'headless-shell') => string | null;
};
// Remotion 没导出这几个函数（包的 exports 也不让按子路径取），按 resolve 出的目录取文件，和渲染器.ts 加载的是同一份 CJS。
// 版本锁死（升 Remotion 要用户点名），升级时 浏览器.test.ts 会先报
const 取 = () => {
  const 要 = createRequire(path.join(代码根(), 'package.json'));
  return 要(path.join(path.dirname(要.resolve('@remotion/renderer')), 'browser', 'BrowserFetcher.js')) as 取浏览器;
};

/** Remotion 的下载目录按 cwd 往上找 package.json；anim 可能在数据根、预览夹里跑，这里固定在代码根算 */
const 在代码根 = <T>(f: () => T): T => {
  const 原 = process.cwd();
  process.chdir(代码根());
  try {
    return f();
  } finally {
    process.chdir(原);
  }
};

export const 期望版本 = () => {
  const b = 取();
  return b.getExpectedVersion({ version: null, chromeMode: 'headless-shell', platform: b.getPlatform() });
};

/** 数据根里这一版的目录、可执行文件（目录里的结构照 Remotion 的 node_modules/.remotion/chrome-headless-shell/<平台>/） */
export const 浏览器位置 = () => {
  const r = 在代码根(() => 取().getRevisionInfo('headless-shell'));
  const 目录 = 数据路径('cache', '浏览器', 期望版本());
  return { 目录, 可执行: path.join(目录, path.relative(r.folderPath, r.executablePath)), 来源目录: r.folderPath, 来源可执行: r.executablePath };
};

/** 克隆整个目录（APFS 上是写时复制，不多占盘），先进临时目录再改名，两个渲染同时补也不会半截 */
const 克隆进 = (从: string, 到: string) => {
  const 临时 = `${到}.补-${process.pid}`;
  fs.rmSync(临时, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(到), { recursive: true });
  fs.cpSync(从, 临时, { recursive: true, mode: fs.constants.COPYFILE_FICLONE, verbatimSymlinks: true });
  try {
    fs.renameSync(临时, 到);
  } catch (e) {
    fs.rmSync(临时, { recursive: true, force: true });
    if (!fs.existsSync(到)) throw e;
  }
};

let 已备: string | undefined;
/** 渲染前调：返回数据根里的可执行文件路径，缺了就补 */
export const 备浏览器 = async (): Promise<string> => {
  if (已备 && fs.existsSync(已备)) return 已备;
  const 位 = 浏览器位置();
  if (fs.existsSync(位.可执行)) return (已备 = 位.可执行);
  const 本地对 = () => fs.existsSync(位.来源可执行) && 在代码根(() => 取().readVersionFile('headless-shell')) === 期望版本();
  if (!本地对()) {
    console.error(`数据根没有渲染用的浏览器（${期望版本()}），本检出 node_modules/.remotion 里也没有，让 Remotion 下载（约 570 MB）…`);
    const 原 = process.cwd();
    process.chdir(代码根());
    try {
      await ensureBrowser({ chromeMode: 'headless-shell', logLevel: 'info' });
    } catch (e) {
      throw new Error(`浏览器下载失败：${(e as Error).message}\n可以从别的检出或机器把 ${位.目录} 整个拷过来（目录名要一样）`);
    } finally {
      process.chdir(原);
    }
    if (!本地对()) throw new Error(`Remotion 下载完 ${位.来源可执行} 还是不对（版本应为 ${期望版本()}）`);
  }
  克隆进(位.来源目录, 位.目录);
  if (!fs.existsSync(位.可执行)) throw new Error(`克隆以后 ${位.可执行} 不在`);
  console.error(`渲染用的浏览器已放进数据根：${位.目录}`);
  return (已备 = 位.可执行);
};
