// 渲染用的 chrome-headless-shell 放数据根 cache/浏览器/<Remotion 期望版本>/，各 worktree 共用一份。
// Remotion 默认下到 node_modules/.remotion：重装依赖一跑就删，每个 worktree 各下 570 MB，没网时渲染卡在下载（用户 11-06 定挪走）。
// 目录名用 Remotion 的期望版本（如 157.0.8080.0-remotion-v3，带共享内存补丁的构建），升 Remotion 换版本就换目录，旧的留给 bench --browser 做对照。
// 缺了按顺序补：从本检出的 node_modules/.remotion 克隆（版本要对）→ 从国内镜像下（只有 Google 那份构建）→ 让 Remotion 下载到那里再克隆。
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { config, dataPath } from '../环境/配置.ts';
import { codeRoot } from '../环境/路径.ts';
import { runCmd } from '../环境/子进程.ts';
import { ensureBrowser } from './渲染器.ts';

type BrowserFetcherModule = {
  getExpectedVersion: (o: { version: null; chromeMode: 'headless-shell'; platform: string }) => string;
  getPlatform: () => string;
  getRevisionInfo: (mode: 'headless-shell') => { executablePath: string; folderPath: string };
  readVersionFile: (mode: 'headless-shell') => string | null;
};
type ChromeDownloadUrlModule = { getChromeDownloadUrl: (o: { platform: string; version: null; chromeMode: 'headless-shell' }) => string };
type ExtractZipModule = { extractZipArchive: (zip: string, dir: string) => Promise<void> };
// Remotion 没导出这几个函数（包的 exports 也不让按子路径取），按 resolve 出的目录取文件，和渲染器.ts 加载的是同一份 CJS。
// 版本锁死（升 Remotion 要用户点名），升级时 浏览器.test.ts 会先报
const loadFile = <T>(fileName: string): T => {
  const requireFrom = createRequire(path.join(codeRoot(), 'package.json'));
  return requireFrom(path.join(path.dirname(requireFrom.resolve('@remotion/renderer')), 'browser', fileName)) as T;
};
const loadFetcher = () => loadFile<BrowserFetcherModule>('BrowserFetcher.js');

/** Remotion 的下载目录按 cwd 往上找 package.json；anim 可能在数据根、预览夹里跑，这里固定在代码根算 */
const inCodeRoot = <T>(f: () => T): T => {
  const prevCwd = process.cwd();
  process.chdir(codeRoot());
  try {
    return f();
  } finally {
    process.chdir(prevCwd);
  }
};

export const expectedVersion = () => {
  const b = loadFetcher();
  return b.getExpectedVersion({ version: null, chromeMode: 'headless-shell', platform: b.getPlatform() });
};

/** 数据根里这一版的目录、可执行文件（目录里的结构照 Remotion 的 node_modules/.remotion/chrome-headless-shell/<平台>/） */
export const browserLocation = () => {
  const r = inCodeRoot(() => loadFetcher().getRevisionInfo('headless-shell'));
  const browserDir = dataPath('cache', '浏览器', expectedVersion());
  return { 目录: browserDir, exePath: path.join(browserDir, path.relative(r.folderPath, r.executablePath)), sourceDir: r.folderPath, sourceExe: r.executablePath };
};

/** 克隆整个目录（APFS 上是写时复制，不多占盘），先进临时目录再改名，两个渲染同时补也不会半截 */
const cloneInto = (fromPath: string, destPath: string) => {
  const tempDir = `${destPath}.补-${process.pid}`;
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.cpSync(fromPath, tempDir, { recursive: true, mode: fs.constants.COPYFILE_FICLONE, verbatimSymlinks: true });
  try {
    fs.renameSync(tempDir, destPath);
  } catch (e) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (!fs.existsSync(destPath)) throw e;
  }
};

// 国内镜像（用户 11-13「下载源尽量选国内镜像，观众未必有代理」）：Remotion 在 Windows、Intel Mac、glibc 旧于 2.35 的 Linux 上
// 从 storage.googleapis.com 下 Google 的 Chrome for Testing，国内多半连不上；npmmirror 原样镜像了这个桶。
// 只在 Remotion 本来就要下 Google 那份时才走镜像（Apple 芯片 Mac、新 Linux 下的是 Remotion 自己打补丁的构建，镜像上没有，照旧让 Remotion 下）。
// sha256 是 11-13、11-14 下下来核过的（和 Google 那份的 MD5 一致）；表里没有的平台不走镜像，升 Remotion 换了版本也一样，要重新核了补进来
const googleBucket = 'https://storage.googleapis.com/chrome-for-testing-public/';
export const mirrorPackSha: Record<string, string> = {
  '157.0.8080.0/win64/chrome-headless-shell-win64.zip': 'ad0fe78fbe0783035fd71f81cd876a2e81962a40ac7de6b4f7afcbeb00901c11',
  '157.0.8080.0/linux64/chrome-headless-shell-linux64.zip': '4d033a390c5b0532dfacd1fca23b0a0b29342c8b82d89cf29a04be52844756ee',
  '157.0.8080.0/mac-x64/chrome-headless-shell-mac-x64.zip': 'b4a3f7e8aed11e7814fdaf49ddadab0ec3e0c7527f0ffeed5b208d7a856ebf6a',
};

/** 这台机器该从镜像下哪个包；不走镜像返回 null */
export const mirrorPack = (mirrorRoot = config('浏览器镜像')) => {
  if (!mirrorRoot) return null;
  const b = loadFetcher();
  const originalUrl = loadFile<ChromeDownloadUrlModule>('get-chrome-download-url.js').getChromeDownloadUrl({ platform: b.getPlatform(), version: null, chromeMode: 'headless-shell' });
  if (!originalUrl.startsWith(googleBucket)) return null;
  const pkgKey = originalUrl.slice(googleBucket.length);
  const sha = mirrorPackSha[pkgKey];
  return sha ? { url: `${mirrorRoot.replace(/\/+$/, '')}/${pkgKey}`, sha, 原: originalUrl } : null;
};

const fileSha = (f: string) =>
  new Promise<string>((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(f).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });

/** 从镜像下、核 sha256、解进数据根；成了返回 true，不成说一句原因返回 false（接着让 Remotion 下） */
const fillFromMirror = async (browserLoc: ReturnType<typeof browserLocation>): Promise<boolean> => {
  const mirror = mirrorPack();
  if (!mirror) return false;
  const zip = `${browserLoc.目录}.zip.下载中`;
  const tempDir = `${browserLoc.目录}.补-${process.pid}`;
  fs.mkdirSync(path.dirname(browserLoc.目录), { recursive: true });
  try {
    console.error(`数据根没有渲染用的浏览器（${expectedVersion()}），从国内镜像下（约 110～125 MB）：${mirror.url}`);
    // -C - 断点续传，和 assets pull 一样；镜像上没有（404）就别重试了
    await runCmd(['curl', '-fL', '-#', '--retry', '3', '--retry-all-errors', '--connect-timeout', '20', '-C', '-', '-o', zip, mirror.url]);
    const actualSha = await fileSha(zip);
    if (actualSha !== mirror.sha) {
      fs.rmSync(zip, { force: true });
      console.error(`镜像下下来的 sha256 是 ${actualSha.slice(0, 12)}，应为 ${mirror.sha.slice(0, 12)}，改让 Remotion 从 ${mirror.原} 下`);
      return false;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
    await loadFile<ExtractZipModule>('extract-zip-archive.js').extractZipArchive(zip, tempDir);
    const exePath = path.join(tempDir, path.relative(browserLoc.目录, browserLoc.exePath));
    if (!fs.existsSync(exePath)) throw new Error(`解开以后没有 ${exePath}`);
    if (process.platform !== 'win32') fs.chmodSync(exePath, 0o755);
    try {
      fs.renameSync(tempDir, browserLoc.目录);
    } catch (e) {
      if (!fs.existsSync(browserLoc.exePath)) throw e;
    }
    fs.rmSync(zip, { force: true });
    console.error(`渲染用的浏览器已放进数据根：${browserLoc.目录}`);
    return true;
  } catch (e) {
    console.error(`国内镜像没下成（${(e as Error).message.split('\n')[0]}），改让 Remotion 从 ${mirror.原} 下（国外，最好走代理）`);
    return false;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
};

let preparedPath: string | undefined;
/** 渲染前调：返回数据根里的可执行文件路径，缺了就补 */
export const prepareBrowser = async (): Promise<string> => {
  if (preparedPath && fs.existsSync(preparedPath)) return preparedPath;
  const browserLoc = browserLocation();
  if (fs.existsSync(browserLoc.exePath)) return (preparedPath = browserLoc.exePath);
  const localMatches = () => fs.existsSync(browserLoc.sourceExe) && inCodeRoot(() => loadFetcher().readVersionFile('headless-shell')) === expectedVersion();
  if (!localMatches() && (await fillFromMirror(browserLoc)) && fs.existsSync(browserLoc.exePath)) return (preparedPath = browserLoc.exePath);
  if (!localMatches()) {
    console.error(`数据根没有渲染用的浏览器（${expectedVersion()}），本检出 node_modules/.remotion 里也没有，让 Remotion 下载（约 570 MB）…`);
    const prevCwd = process.cwd();
    process.chdir(codeRoot());
    try {
      await ensureBrowser({ chromeMode: 'headless-shell', logLevel: 'info' });
    } catch (e) {
      throw new Error(`浏览器下载失败：${(e as Error).message}\n国外的下载源，最好开代理（设 HTTPS_PROXY）再跑；或者从别的检出或机器把 ${browserLoc.目录} 整个拷过来（目录名要一样）`);
    } finally {
      process.chdir(prevCwd);
    }
    if (!localMatches()) throw new Error(`Remotion 下载完 ${browserLoc.sourceExe} 还是不对（版本应为 ${expectedVersion()}）`);
  }
  cloneInto(browserLoc.sourceDir, browserLoc.目录);
  if (!fs.existsSync(browserLoc.exePath)) throw new Error(`克隆以后 ${browserLoc.exePath} 不在`);
  console.error(`渲染用的浏览器已放进数据根：${browserLoc.目录}`);
  return (preparedPath = browserLoc.exePath);
};
