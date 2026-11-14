// 渲染用的 chrome-headless-shell 放数据根 cache/浏览器/<Remotion 期望版本>/，各 worktree 共用一份。
// Remotion 默认下到 node_modules/.remotion：重装依赖一跑就删，每个 worktree 各下 570 MB，没网时渲染卡在下载（用户 11-06 定挪走）。
// 目录名用 Remotion 的期望版本（如 157.0.8080.0-remotion-v3，带共享内存补丁的构建），升 Remotion 换版本就换目录，旧的留给 bench --浏览器 做对照。
// 缺了按顺序补：从本检出的 node_modules/.remotion 克隆（版本要对）→ 从国内镜像下（只有 Google 那份构建）→ 让 Remotion 下载到那里再克隆。
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { 配置, 数据路径 } from '../环境/配置.ts';
import { 代码根 } from '../环境/路径.ts';
import { 跑 } from '../环境/子进程.ts';
import { ensureBrowser } from './渲染器.ts';

type 取浏览器 = {
  getExpectedVersion: (o: { version: null; chromeMode: 'headless-shell'; platform: string }) => string;
  getPlatform: () => string;
  getRevisionInfo: (mode: 'headless-shell') => { executablePath: string; folderPath: string };
  readVersionFile: (mode: 'headless-shell') => string | null;
};
type 取地址 = { getChromeDownloadUrl: (o: { platform: string; version: null; chromeMode: 'headless-shell' }) => string };
type 取解压 = { extractZipArchive: (zip: string, dir: string) => Promise<void> };
// Remotion 没导出这几个函数（包的 exports 也不让按子路径取），按 resolve 出的目录取文件，和渲染器.ts 加载的是同一份 CJS。
// 版本锁死（升 Remotion 要用户点名），升级时 浏览器.test.ts 会先报
const 取文件 = <T>(名: string): T => {
  const 要 = createRequire(path.join(代码根(), 'package.json'));
  return 要(path.join(path.dirname(要.resolve('@remotion/renderer')), 'browser', 名)) as T;
};
const 取 = () => 取文件<取浏览器>('BrowserFetcher.js');

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

// 国内镜像（用户 11-13「下载源尽量选国内镜像，观众未必有代理」）：Remotion 在 Windows、Intel Mac、glibc 旧于 2.35 的 Linux 上
// 从 storage.googleapis.com 下 Google 的 Chrome for Testing，国内多半连不上；npmmirror 原样镜像了这个桶。
// 只在 Remotion 本来就要下 Google 那份时才走镜像（Apple 芯片 Mac、新 Linux 下的是 Remotion 自己打补丁的构建，镜像上没有，照旧让 Remotion 下）。
// sha256 是 11-13、11-14 下下来核过的（和 Google 那份的 MD5 一致）；表里没有的平台不走镜像，升 Remotion 换了版本也一样，要重新核了补进来
const 谷歌桶 = 'https://storage.googleapis.com/chrome-for-testing-public/';
export const 镜像包sha: Record<string, string> = {
  '157.0.8080.0/win64/chrome-headless-shell-win64.zip': 'ad0fe78fbe0783035fd71f81cd876a2e81962a40ac7de6b4f7afcbeb00901c11',
  '157.0.8080.0/linux64/chrome-headless-shell-linux64.zip': '4d033a390c5b0532dfacd1fca23b0a0b29342c8b82d89cf29a04be52844756ee',
  '157.0.8080.0/mac-x64/chrome-headless-shell-mac-x64.zip': 'b4a3f7e8aed11e7814fdaf49ddadab0ec3e0c7527f0ffeed5b208d7a856ebf6a',
};

/** 这台机器该从镜像下哪个包；不走镜像返回 null */
export const 镜像包 = (镜像根 = 配置('浏览器镜像')) => {
  if (!镜像根) return null;
  const b = 取();
  const 原 = 取文件<取地址>('get-chrome-download-url.js').getChromeDownloadUrl({ platform: b.getPlatform(), version: null, chromeMode: 'headless-shell' });
  if (!原.startsWith(谷歌桶)) return null;
  const 键 = 原.slice(谷歌桶.length);
  const sha = 镜像包sha[键];
  return sha ? { url: `${镜像根.replace(/\/+$/, '')}/${键}`, sha, 原 } : null;
};

const 文件sha = (f: string) =>
  new Promise<string>((好, 坏) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(f).on('data', (d) => h.update(d)).on('end', () => 好(h.digest('hex'))).on('error', 坏);
  });

/** 从镜像下、核 sha256、解进数据根；成了返回 true，不成说一句原因返回 false（接着让 Remotion 下） */
const 从镜像补 = async (位: ReturnType<typeof 浏览器位置>): Promise<boolean> => {
  const 包 = 镜像包();
  if (!包) return false;
  const zip = `${位.目录}.zip.下载中`;
  const 临时 = `${位.目录}.补-${process.pid}`;
  fs.mkdirSync(path.dirname(位.目录), { recursive: true });
  try {
    console.error(`数据根没有渲染用的浏览器（${期望版本()}），从国内镜像下（约 110～125 MB）：${包.url}`);
    // -C - 断点续传，和 assets pull 一样；镜像上没有（404）就别重试了
    await 跑(['curl', '-fL', '-#', '--retry', '3', '--retry-all-errors', '--connect-timeout', '20', '-C', '-', '-o', zip, 包.url]);
    const 实 = await 文件sha(zip);
    if (实 !== 包.sha) {
      fs.rmSync(zip, { force: true });
      console.error(`镜像下下来的 sha256 是 ${实.slice(0, 12)}，应为 ${包.sha.slice(0, 12)}，改让 Remotion 从 ${包.原} 下`);
      return false;
    }
    fs.rmSync(临时, { recursive: true, force: true });
    await 取文件<取解压>('extract-zip-archive.js').extractZipArchive(zip, 临时);
    const 可执行 = path.join(临时, path.relative(位.目录, 位.可执行));
    if (!fs.existsSync(可执行)) throw new Error(`解开以后没有 ${可执行}`);
    if (process.platform !== 'win32') fs.chmodSync(可执行, 0o755);
    try {
      fs.renameSync(临时, 位.目录);
    } catch (e) {
      if (!fs.existsSync(位.可执行)) throw e;
    }
    fs.rmSync(zip, { force: true });
    console.error(`渲染用的浏览器已放进数据根：${位.目录}`);
    return true;
  } catch (e) {
    console.error(`国内镜像没下成（${(e as Error).message.split('\n')[0]}），改让 Remotion 从 ${包.原} 下（国外，最好走代理）`);
    return false;
  } finally {
    fs.rmSync(临时, { recursive: true, force: true });
  }
};

let 已备: string | undefined;
/** 渲染前调：返回数据根里的可执行文件路径，缺了就补 */
export const 备浏览器 = async (): Promise<string> => {
  if (已备 && fs.existsSync(已备)) return 已备;
  const 位 = 浏览器位置();
  if (fs.existsSync(位.可执行)) return (已备 = 位.可执行);
  const 本地对 = () => fs.existsSync(位.来源可执行) && 在代码根(() => 取().readVersionFile('headless-shell')) === 期望版本();
  if (!本地对() && (await 从镜像补(位)) && fs.existsSync(位.可执行)) return (已备 = 位.可执行);
  if (!本地对()) {
    console.error(`数据根没有渲染用的浏览器（${期望版本()}），本检出 node_modules/.remotion 里也没有，让 Remotion 下载（约 570 MB）…`);
    const 原 = process.cwd();
    process.chdir(代码根());
    try {
      await ensureBrowser({ chromeMode: 'headless-shell', logLevel: 'info' });
    } catch (e) {
      throw new Error(`浏览器下载失败：${(e as Error).message}\n国外的下载源，最好开代理（设 HTTPS_PROXY）再跑；或者从别的检出或机器把 ${位.目录} 整个拷过来（目录名要一样）`);
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
